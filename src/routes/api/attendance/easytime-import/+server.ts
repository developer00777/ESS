import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	attendance,
	attendanceImports,
	devicePunches,
	employeeProfiles
} from '$lib/server/db/schema';
import {
	verifyImportToken,
	parseEasyTimeExport,
	normalizeEmpCode,
	type ParsedPunch
} from '$lib/server/easytime-import';
import { and, eq, inArray } from 'drizzle-orm';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Receives a scheduled EasyTime Pro export file and applies it to attendance.
 *
 * A job on the EasyTime Pro machine POSTs the exported .txt/.csv here — either
 * as `multipart/form-data` with a `file` field, or as a raw text body. Auth is
 * the shared token from attendance_import_tokens, sent as `Authorization:
 * Bearer <token>` or `?token=`.
 *
 * {emp_code} is the join key: it must match employee_profiles.employee_code.
 * Punches whose code matches nothing are still stored (unmatched) so HR can fix
 * the employee's code and re-post the same file — applying is idempotent.
 */
export const POST: RequestHandler = async (event) => {
	const url = event.url;
	const authHeader = event.request.headers.get('authorization');
	const bearer = authHeader?.toLowerCase().startsWith('bearer ')
		? authHeader.slice(7).trim()
		: null;
	const token = bearer ?? url.searchParams.get('token');

	const tokenId = await verifyImportToken(token);
	if (!tokenId) throw error(401, 'invalid or missing token');

	const contentType = event.request.headers.get('content-type') ?? '';
	let body: string;
	let filename: string | null = null;

	if (contentType.includes('multipart/form-data')) {
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) throw error(400, 'file field is required');
		if (file.size > MAX_UPLOAD_BYTES) throw error(400, 'File too large (max 10MB)');
		filename = file.name;
		body = await file.text();
	} else {
		body = await event.request.text();
		filename = url.searchParams.get('filename');
		if (body.length > MAX_UPLOAD_BYTES) throw error(400, 'Body too large (max 10MB)');
	}

	if (!body.trim()) throw error(400, 'Empty file');

	const punches = parseEasyTimeExport(body);
	if (punches.length === 0) {
		throw error(400, 'No valid punch rows found — check the Data Template column order');
	}

	// Resolve every distinct emp_code in one query.
	const codes = [...new Set(punches.map((p) => normalizeEmpCode(p.empCode)))];
	const profiles = await db
		.select({ userId: employeeProfiles.userId, employeeCode: employeeProfiles.employeeCode })
		.from(employeeProfiles)
		.where(inArray(employeeProfiles.employeeCode, codes));

	const userByCode = new Map(
		profiles
			.filter((p): p is { userId: string; employeeCode: string } => Boolean(p.employeeCode))
			.map((p) => [normalizeEmpCode(p.employeeCode), p.userId])
	);

	let matched = 0;
	let unmatched = 0;

	const [importRow] = await db
		.insert(attendanceImports)
		.values({
			tokenId,
			filename,
			rowCount: punches.length,
			matchedCount: 0,
			unmatchedCount: 0
		})
		.returning();

	// Group by (user, date) so a day's punches resolve to one attendance row:
	// earliest punch is check-in, latest is check-out.
	for (const punch of punches) {
		const userId = userByCode.get(normalizeEmpCode(punch.empCode)) ?? null;
		let attendanceId: string | null = null;

		if (userId) {
			attendanceId = await applyPunch(userId, punch);
			matched += 1;
		} else {
			unmatched += 1;
		}

		await db.insert(devicePunches).values({
			importId: importRow.id,
			empCode: punch.empCode,
			firstName: punch.firstName,
			lastName: punch.lastName,
			deptCode: punch.deptCode,
			deptName: punch.deptName,
			punchedAt: punch.punchedAt,
			verifyType: punch.verifyType,
			punchState: punch.punchState,
			direction: punch.direction,
			workCode: punch.workCode,
			cardNumber: punch.cardNumber,
			areaName: punch.areaName,
			terminalAlias: punch.terminalAlias,
			terminalSn: punch.terminalSn,
			temperature: punch.temperature,
			maskFlag: punch.maskFlag,
			rawLine: punch.rawLine,
			matchedUserId: userId,
			attendanceId
		});
	}

	await db
		.update(attendanceImports)
		.set({ matchedCount: matched, unmatchedCount: unmatched })
		.where(eq(attendanceImports.id, importRow.id));

	const unmatchedCodes = [
		...new Set(
			punches
				.filter((p) => !userByCode.has(normalizeEmpCode(p.empCode)))
				.map((p) => p.empCode)
		)
	];

	return json({
		importId: importRow.id,
		rowCount: punches.length,
		matchedCount: matched,
		unmatchedCount: unmatched,
		unmatchedEmpCodes: unmatchedCodes
	});
};

/**
 * Applies one punch to the employee's attendance row for that date.
 * Idempotent by design: check-in only ever moves earlier, check-out only ever
 * moves later, so re-posting the same file changes nothing.
 */
async function applyPunch(userId: string, punch: ParsedPunch): Promise<string> {
	// The device's own date field — not derived from punchedAt, which would shift
	// an early night-shift punch (01:30 IST) onto the previous day.
	const dateStr = punch.punchDate;

	const [existing] = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, userId), eq(attendance.date, dateStr)))
		.limit(1);

	// Explicit device state wins; when the device didn't say, the first punch of
	// the day is the check-in and anything later is the check-out.
	let isCheckIn: boolean;
	if (punch.direction === 'in') isCheckIn = true;
	else if (punch.direction === 'out') isCheckIn = false;
	else isCheckIn = !existing?.checkInAt;

	if (!existing) {
		const [created] = await db
			.insert(attendance)
			.values({
				userId,
				date: dateStr,
				checkInAt: isCheckIn ? punch.punchedAt : null,
				checkOutAt: isCheckIn ? null : punch.punchedAt,
				source: 'biometric'
			})
			.returning();
		return created.id;
	}

	const patch: Partial<typeof attendance.$inferInsert> = { source: 'biometric' };
	if (isCheckIn) {
		if (!existing.checkInAt || punch.punchedAt < existing.checkInAt) {
			patch.checkInAt = punch.punchedAt;
		}
	} else if (!existing.checkOutAt || punch.punchedAt > existing.checkOutAt) {
		patch.checkOutAt = punch.punchedAt;
	}

	const [updated] = await db
		.update(attendance)
		.set(patch)
		.where(eq(attendance.id, existing.id))
		.returning();
	return updated.id;
}
