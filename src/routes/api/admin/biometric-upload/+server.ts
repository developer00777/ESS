import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { parseBiometricSheet, BiometricSheetError } from '$lib/server/biometric-sheet';
import { resolveBiometricDays } from '$lib/server/biometric-apply';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // a year of punches for a few hundred staff

/**
 * Previews a manually uploaded biometric report — Super Admin and Admin (HR).
 *
 * Parses the workbook, matches every employee code and reports what applying it
 * would change, without writing anything. The uploader confirms on screen and
 * POSTs the same file to ./apply.
 *
 * Nothing is staged server-side between the two calls: the file is re-parsed on
 * apply. Attendance rows are small and the parse is cheap, and re-parsing removes
 * the window where a staged preview is applied after the underlying data moved.
 */
export const POST: RequestHandler = async (event) => {
	requireRole(event, ['super_admin', 'admin']);

	const form = await event.request.formData();
	const file = form.get('file');
	const suppliedDate = form.get('date');

	if (!(file instanceof File)) throw error(400, 'file is required');
	if (file.size === 0) throw error(400, 'That file is empty');
	if (file.size > MAX_UPLOAD_BYTES) throw error(400, 'File too large (max 15MB)');

	const date = typeof suppliedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate)
		? suppliedDate
		: null;

	const buffer = Buffer.from(await file.arrayBuffer());

	let parsed;
	try {
		parsed = await parseBiometricSheet(buffer, { filename: file.name, suppliedDate: date });
	} catch (err) {
		// The parser's messages are written for the uploader — pass them through
		// rather than replacing them with a generic 400.
		if (err instanceof BiometricSheetError) throw error(400, err.message);
		throw err;
	}

	const summary = await resolveBiometricDays(parsed.days);

	return json({
		filename: file.name,
		sheetName: parsed.sheetName,
		layout: parsed.layout,
		dateSource: parsed.dateSource,
		unmappedHeaders: parsed.unmappedHeaders,
		skippedRows: parsed.skippedRows,
		rowCount: summary.days.length,
		matchedCount: summary.matchedCount,
		unmatchedCount: summary.unmatchedCount,
		createCount: summary.createCount,
		updateCount: summary.updateCount,
		noChangeCount: summary.noChangeCount,
		unmatchedCodes: summary.unmatchedCodes,
		dateRange: summary.dateRange,
		days: summary.days.map((d) => ({
			empCode: d.empCode,
			employeeName: d.employeeName,
			matchedName: d.matchedName,
			matched: d.userId !== null,
			date: d.date,
			inTime: d.inTime,
			outTime: d.outTime,
			crossesMidnight: d.crossesMidnight,
			effect: d.effect,
			existingIn: d.existing?.checkInAt?.toISOString() ?? null,
			existingOut: d.existing?.checkOutAt?.toISOString() ?? null,
			sourceRow: d.sourceRow,
			notes: d.notes
		}))
	});
};
