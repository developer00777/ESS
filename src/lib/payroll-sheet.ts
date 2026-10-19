/**
 * A payroll sheet as it will be downloaded: the portal's computed rows with
 * Finance's manual edits applied (Payroll → Preview). Pure, so the preview,
 * the CSV and the .xlsx all come from the same function.
 */

export type CellValue = string | number | null;

/** A sheet as the portal computes it. `keys[i]` identifies `rows[i]`. */
export interface BaseSheet {
	header: string[];
	rows: CellValue[][];
	keys: string[];
}

export interface CellOverride {
	rowKey: string;
	column: string;
	value: string | null;
	original?: string | null;
	by?: string | null;
	at?: string | null;
}

/** Marker columns for whole-row edits. */
export const REMOVED_COLUMN = '__removed__';
export const ADDED_COLUMN = '__added__';

export interface FinalCell {
	value: CellValue;
	/** What the portal computes for this cell now; null on an added row. */
	computed: CellValue;
	edited: boolean;
	by?: string | null;
	at?: string | null;
}

export interface FinalRow {
	key: string;
	cells: FinalCell[];
	added: boolean;
	removed: boolean;
	/** A block heading or spacer row (Stop Salary): never edited. */
	locked: boolean;
}

export interface FinalSheet {
	header: string[];
	rows: FinalRow[];
	/** Cells edited, rows added and rows removed. */
	editCount: number;
}

const isLockedKey = (key: string) => key.startsWith('__');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, '');
const SERIAL = new Set(['sl', 'slno', 'sno', 's#']);

/** Text stored for an edit, back to the value a spreadsheet should hold. */
export function parseCellValue(text: string | null): CellValue {
	if (text === null) return null;
	const t = text.trim();
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	return text;
}

export function cellText(v: CellValue): string {
	return v === null || v === undefined ? '' : String(v);
}

export function applyOverrides(base: BaseSheet, overrides: CellOverride[]): FinalSheet {
	const byRow = new Map<string, Map<string, CellOverride>>();
	for (const o of overrides) {
		if (!byRow.has(o.rowKey)) byRow.set(o.rowKey, new Map());
		byRow.get(o.rowKey)!.set(o.column, o);
	}
	let editCount = 0;
	const build = (key: string, computed: CellValue[], added: boolean): FinalRow => {
		const edits = byRow.get(key);
		const removed = Boolean(edits?.get(REMOVED_COLUMN)?.value);
		if (removed || added) editCount++;
		const cells = base.header.map((col, i) => {
			const o = edits?.get(col);
			const c = computed[i] ?? null;
			if (o) {
				if (!added) editCount++;
				return { value: parseCellValue(o.value), computed: c, edited: !added, by: o.by, at: o.at };
			}
			return { value: c, computed: c, edited: false };
		});
		return { key, cells, added, removed, locked: isLockedKey(key) };
	};

	const rows = base.rows.map((r, i) => build(base.keys[i], r, false));
	// Rows Finance added, in the order they were added.
	const addedKeys = overrides
		.filter((o) => o.column === ADDED_COLUMN && o.value)
		.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
		.map((o) => o.rowKey);
	for (const key of addedKeys) rows.push(build(key, base.header.map(() => null), true));

	renumber(base.header, rows);
	return { header: base.header, rows, editCount };
}

/**
 * Serial numbers (Sl, S.No, S. #) count the rows that will be downloaded, so
 * removing or adding a row keeps them 1, 2, 3… A block heading restarts them,
 * as on HR's Stop Salary sheet. An edited serial cell is left as typed.
 */
function renumber(header: string[], rows: FinalRow[]) {
	if (!header.length || !SERIAL.has(norm(header[0]))) return;
	let n = 0;
	for (const r of rows) {
		if (r.locked) {
			n = 0;
			continue;
		}
		if (r.removed) continue;
		n++;
		const cell = r.cells[0];
		if (!cell.edited) {
			cell.value = n;
			if (!r.added) cell.computed = n;
		}
	}
}

/** The rows that go into the file: removed rows dropped, edits applied. */
export function exportRows(sheet: FinalSheet): CellValue[][] {
	return sheet.rows.filter((r) => !r.removed).map((r) => r.cells.map((c) => c.value));
}
