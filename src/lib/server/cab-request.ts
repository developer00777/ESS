import { error } from '@sveltejs/kit';
import { parseCabSheet, CabSheetError, type CabSheetResult } from './cab-sheet';
import { planDay, PlannerError } from '$lib/cabs/plan';
import { parseClock } from '$lib/cabs/clock';
import { parsePin } from '$lib/cabs/geo';
import { cellBoundary } from '$lib/cabs/hex';
import { DEFAULT_SETTINGS, type DayPlan, type PlannerSettings } from '$lib/cabs/types';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const NUMERIC: (keyof PlannerSettings)[] = ['maxMergeWaitMin', 'maxRideMin', 'serviceRadiusKm', 'roadFactor', 'daySpeedKmh', 'nightSpeedKmh', 'stopMin'];

export interface PlannedUpload {
	filename: string;
	sheet: Omit<CabSheetResult, 'riders' | 'cabs' | 'oneOffs' | 'settings'>;
	plan: DayPlan;
	hexes: { cell: string; boundary: [number, number][]; riderIds: string[] }[];
}

function pageOverrides(raw: FormDataEntryValue | null): Partial<PlannerSettings> {
	if (typeof raw !== 'string' || !raw.trim()) return {};
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw);
	} catch {
		throw error(400, 'Settings could not be read');
	}
	const out: Partial<PlannerSettings> = {};
	if (typeof body.office === 'string' && body.office.trim()) {
		const p = parsePin(body.office);
		if (!p.pin) throw error(400, `Office pin: ${p.issue}`);
		out.office = p.pin;
	}
	for (const key of ['nightStart', 'nightEnd'] as const) {
		if (typeof body[key] === 'string' && body[key]) {
			const t = parseClock(body[key]);
			if (!t) throw error(400, `${key === 'nightStart' ? 'Night starts' : 'Night ends'}: time not understood`);
			out[key] = t;
		}
	}
	for (const key of NUMERIC) {
		const v = body[key];
		if (v === '' || v === null || v === undefined) continue;
		const n = Number(v);
		if (!Number.isFinite(n) || n <= 0) throw error(400, `${key} must be a positive number`);
		(out as Record<string, number>)[key] = n;
	}
	return out;
}

export async function planFromUpload(form: FormData): Promise<PlannedUpload> {
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'file is required');
	if (file.size === 0) throw error(400, 'That file is empty');
	if (file.size > MAX_UPLOAD_BYTES) throw error(400, 'File too large (max 5MB)');

	const rawDate = form.get('date');
	const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

	let parsed: CabSheetResult;
	try {
		parsed = await parseCabSheet(Buffer.from(await file.arrayBuffer()));
	} catch (err) {
		if (err instanceof CabSheetError) throw error(400, err.message);
		throw err;
	}

	const settings: PlannerSettings = { ...DEFAULT_SETTINGS, ...parsed.settings, ...pageOverrides(form.get('settings')) };

	let plan: DayPlan;
	try {
		plan = planDay({ riders: parsed.riders, cabs: parsed.cabs, oneOffs: parsed.oneOffs, settings, date });
	} catch (err) {
		if (err instanceof PlannerError) throw error(400, err.message);
		throw err;
	}

	const byCell = new Map<string, string[]>();
	for (const [riderId, cell] of Object.entries(plan.cells)) byCell.set(cell, [...(byCell.get(cell) ?? []), riderId]);

	return {
		filename: file.name,
		sheet: { tabs: parsed.tabs, skippedRows: parsed.skippedRows, unmappedHeaders: parsed.unmappedHeaders },
		plan,
		hexes: [...byCell.entries()].map(([cell, riderIds]) => ({ cell, boundary: cellBoundary(cell), riderIds }))
	};
}
