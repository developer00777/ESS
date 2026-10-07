import { json, error } from '@sveltejs/kit';
import type { RequestEvent, RequestHandler } from './$types';
import {
	verifyImportToken,
	parseEasyTimeExport,
	parseEasyTimeRecords,
	type ParsedPunch
} from '$lib/server/easytime-import';
import { ingestPunches, loadFeedStatus, MAX_FEED_RECORDS } from '$lib/server/easytime-ingest';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Receives EasyTime Pro punches and applies them to attendance.
 *
 * A job on the EasyTime Pro machine POSTs the exported .txt/.csv here — either
 * as `multipart/form-data` with a `file` field, or as a raw text body — and the
 * Chrome bridge POSTs `{ punches: [...] }` as JSON read from EasyTime's
 * transactions API. Auth is the shared token from attendance_import_tokens,
 * sent as `Authorization: Bearer <token>` or `?token=`.
 *
 * {emp_code} is the join key: it must match employee_profiles.employee_code.
 * Punches whose code matches nothing are still stored (unmatched) so HR can fix
 * the employee's code and re-post the same file — applying is idempotent.
 */
export const POST: RequestHandler = async (event) => {
	const tokenId = await readToken(event);

	const contentType = event.request.headers.get('content-type') ?? '';
	let punches: ParsedPunch[];
	let filename: string | null = null;

	if (contentType.includes('application/json')) {
		const text = await event.request.text();
		if (text.length > MAX_UPLOAD_BYTES) throw error(400, 'Body too large (max 10MB)');

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			throw error(400, 'Body is not valid JSON');
		}

		const records = (body as { punches?: unknown } | null)?.punches;
		if (!Array.isArray(records)) throw error(400, 'punches must be an array');
		if (records.length > MAX_FEED_RECORDS) {
			throw error(413, `Too many punches in one request (max ${MAX_FEED_RECORDS})`);
		}

		const agent = (body as { agent?: unknown }).agent;
		filename = typeof agent === 'string' ? agent.slice(0, 120) : null;

		punches = parseEasyTimeRecords(records);
		if (punches.length === 0) {
			throw error(400, 'No valid punch records — each needs emp_code and punch_time');
		}
	} else {
		let body: string;

		if (contentType.includes('multipart/form-data')) {
			const form = await event.request.formData();
			const file = form.get('file');
			if (!(file instanceof File)) throw error(400, 'file field is required');
			if (file.size > MAX_UPLOAD_BYTES) throw error(400, 'File too large (max 10MB)');
			filename = file.name;
			body = await file.text();
		} else {
			body = await event.request.text();
			filename = event.url.searchParams.get('filename');
			if (body.length > MAX_UPLOAD_BYTES) throw error(400, 'Body too large (max 10MB)');
		}

		if (!body.trim()) throw error(400, 'Empty file');

		punches = parseEasyTimeExport(body);
		if (punches.length === 0) {
			throw error(400, 'No valid punch rows found — check the Data Template column order');
		}
	}

	return json(await ingestPunches(punches, { tokenId, filename }));
};

export const GET: RequestHandler = async (event) => {
	const tokenId = await readToken(event);
	return json(await loadFeedStatus(tokenId));
};

async function readToken(event: RequestEvent): Promise<string> {
	const authHeader = event.request.headers.get('authorization');
	const bearer = authHeader?.toLowerCase().startsWith('bearer ')
		? authHeader.slice(7).trim()
		: null;
	const token = bearer ?? event.url.searchParams.get('token');

	const tokenId = await verifyImportToken(token);
	if (!tokenId) throw error(401, 'invalid or missing token');
	return tokenId;
}
