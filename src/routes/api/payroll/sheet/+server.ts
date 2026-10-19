import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCap } from '$lib/server/capabilities';
import { loadPayroll } from '$lib/server/payroll';
import { finalSheet, SHEETS, SHEET_TITLES, type SheetKey } from '$lib/server/payroll-export';
import { applyEdit, editCounts, loadOverrides, type EditOp } from '$lib/server/payroll-overrides';

const CYCLE = /^\d{4}-(0[1-9]|1[0-2])$/;
const sheetOf = (v: unknown): SheetKey => {
	if (typeof v !== 'string' || !(SHEETS as readonly string[]).includes(v)) throw error(400, 'Unknown sheet');
	return v as SheetKey;
};

/**
 * Payroll → Preview: one sheet exactly as it will download — computed, with
 * Finance's manual edits applied and marked. "See payroll" may look; editing
 * (PUT) needs "Edit payroll".
 */
export const GET: RequestHandler = async (event) => {
	requireCap(event, 'payroll.view');
	const cycle = event.url.searchParams.get('cycle') ?? '';
	if (!CYCLE.test(cycle)) throw error(400, 'cycle must be YYYY-MM');
	const sheet = sheetOf(event.url.searchParams.get('sheet'));
	const [report, overrides] = await Promise.all([loadPayroll(cycle), loadOverrides(cycle)]);
	return json({
		cycle,
		sheet,
		title: SHEET_TITLES[sheet],
		...finalSheet(report, sheet, overrides[sheet] ?? []),
		editCounts: editCounts(overrides)
	});
};

export const PUT: RequestHandler = async (event) => {
	const actor = requireCap(event, 'payroll.manage');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) throw error(400, 'Expected a JSON body');
	const cycle = String(body.cycle ?? '');
	if (!CYCLE.test(cycle)) throw error(400, 'cycle must be YYYY-MM');
	const sheet = sheetOf(body.sheet);

	const str = (k: string, max: number) => {
		const v = body[k];
		if (typeof v !== 'string' || !v || v.length > max) throw error(400, `${k} is required`);
		return v;
	};
	// Many cell edits at once — "use the manual values" from the A/B check.
	if (body.op === 'batch') {
		const list = Array.isArray(body.edits) ? body.edits : [];
		if (!list.length || list.length > 2000) throw error(400, 'edits must hold 1 to 2000 cell edits');
		for (const e of list as Record<string, unknown>[]) {
			const rowKey = String(e.rowKey ?? '');
			const column = String(e.column ?? '');
			if (!rowKey || rowKey.startsWith('__') || rowKey.length > 96 || !column || column.length > 200) throw error(400, 'Each edit needs a rowKey and column');
		}
		for (const e of list as Record<string, unknown>[]) {
			await applyEdit(
				cycle,
				sheet,
				{ op: 'set', rowKey: String(e.rowKey), column: String(e.column), value: String(e.value ?? '').slice(0, 500), original: e.original == null ? null : String(e.original).slice(0, 500) },
				actor.id
			);
		}
		return json({ ok: true, count: list.length });
	}

	let edit: EditOp;
	switch (body.op) {
		case 'set': {
			const value = typeof body.value === 'string' ? body.value.slice(0, 500) : '';
			const original = typeof body.original === 'string' ? body.original.slice(0, 500) : null;
			edit = { op: 'set', rowKey: str('rowKey', 96), column: str('column', 200), value, original };
			break;
		}
		case 'clear':
			edit = { op: 'clear', rowKey: str('rowKey', 96), column: str('column', 200) };
			break;
		case 'remove':
		case 'restore':
			edit = { op: body.op, rowKey: str('rowKey', 96) };
			break;
		case 'add':
			edit = { op: 'add' };
			break;
		default:
			throw error(400, 'op must be set, clear, remove, restore or add');
	}
	if ('rowKey' in edit && edit.rowKey.startsWith('__')) throw error(400, 'That row cannot be edited');
	return json(await applyEdit(cycle, sheet, edit, actor.id));
};
