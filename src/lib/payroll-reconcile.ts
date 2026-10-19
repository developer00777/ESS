/**
 * The payroll A/B check: HR's manually made report against the portal's own
 * computation, employee by employee and cell by cell. Pure — the server side
 * ($lib/server/payroll-reconcile.ts) reads the uploaded file into records and
 * builds the portal's records from the same sheets the downloads use.
 */

export type SheetId = 'tracker' | 'leave-balance' | 'hr-comments' | 'to-be-paid' | 'lop' | 'stop-salary';
export type ValueKind = 'number' | 'date' | 'text' | 'code';

/** One sheet's rows by employee code; each row maps a column id to its value. */
export interface SheetRecords {
	rows: Map<string, Map<string, unknown>>;
	names: Map<string, string>;
}

export interface Mismatch {
	code: string;
	name: string;
	column: string;
	label: string;
	portal: string;
	manual: string;
	/** Supporting values, e.g. the hours behind a day code. */
	detail?: string;
}

export interface ColumnStat {
	column: string;
	label: string;
	compared: number;
	mismatched: number;
}

export interface SheetComparison {
	sheet: SheetId;
	compared: number;
	matched: number;
	onlyInPortal: { code: string; name: string }[];
	onlyInManual: { code: string; name: string }[];
	columns: ColumnStat[];
	mismatches: Mismatch[];
	/** True when more mismatches existed than were kept. */
	truncated: boolean;
}

/** Header text → a stable column id: lower case, letters and digits only. */
export function columnId(header: unknown): string {
	return String(header ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

const CODE_IDS = new Set(['empcode', 'employeeid', 'empid', 'employeecode']);
export const isCodeColumn = (id: string) => CODE_IDS.has(id);

export function normCode(v: unknown): string {
	return String(v ?? '')
		.trim()
		.toUpperCase()
		.replace(/\s+/g, '');
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** Any date a spreadsheet may hold → 'YYYY-MM-DD', or '' when blank or unreadable. */
export function normDate(v: unknown): string {
	if (v === null || v === undefined || v === '') return '';
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
	if (typeof v === 'number' && v > 20000 && v < 80000) {
		// An Excel serial day number.
		const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
		return normDate(d);
	}
	const s = String(v).trim();
	let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{4})$/);
	if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
	m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`; // dd/mm/yyyy, as HR writes
	return s.toLowerCase();
}

export function normNumber(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return 0;
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	const s = String(v).replace(/[,\s]|days?/gi, '');
	if (s === '' || s === '-') return 0;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

const CODE_SYNONYM: Record<string, string> = { HO: 'HD', L: 'LV' };
export function normDayCode(v: unknown): string {
	const c = String(v ?? '').trim().toUpperCase();
	return CODE_SYNONYM[c] ?? c;
}

export function normText(v: unknown): string {
	return String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export function valuesMatch(kind: ValueKind, portal: unknown, manual: unknown): boolean {
	switch (kind) {
		case 'number': {
			const a = normNumber(portal);
			const b = normNumber(manual);
			return a !== null && b !== null ? Math.abs(a - b) < 0.011 : normText(portal) === normText(manual);
		}
		case 'date':
			return normDate(portal) === normDate(manual);
		case 'code':
			return normDayCode(portal) === normDayCode(manual);
		default:
			return normText(portal) === normText(manual);
	}
}

/** What a mismatch shows: the value as the reader knows it. */
export function display(kind: ValueKind, v: unknown): string {
	if (v === null || v === undefined || v === '') return '';
	if (kind === 'date') {
		const d = normDate(v);
		return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : String(v);
	}
	if (kind === 'number') {
		const n = normNumber(v);
		return n === null ? String(v) : String(Math.round(n * 100) / 100);
	}
	return String(v);
}

export interface ColumnSpec {
	id: string;
	label: string;
	kind: ValueKind;
}

const MAX_MISMATCHES = 2500;

/**
 * Compares two sheets' records on the given columns. A column counts only
 * when the manual sheet has it. Who is on the sheet is compared too: each
 * employee present on one side only is one mismatched cell.
 */
export function compareSheet(
	sheet: SheetId,
	portal: SheetRecords,
	manual: SheetRecords,
	columns: ColumnSpec[],
	manualColumns: Set<string>,
	detailFor?: (code: string, column: string) => string | undefined
): SheetComparison {
	const used = columns.filter((c) => manualColumns.has(c.id));
	const stats = new Map(used.map((c) => [c.id, { column: c.id, label: c.label, compared: 0, mismatched: 0 }]));
	const mismatches: Mismatch[] = [];
	let compared = 0;
	let matched = 0;
	let truncated = false;

	const onlyInPortal = [...portal.rows.keys()].filter((c) => !manual.rows.has(c)).map((code) => ({ code, name: portal.names.get(code) ?? '' }));
	const onlyInManual = [...manual.rows.keys()].filter((c) => !portal.rows.has(c)).map((code) => ({ code, name: manual.names.get(code) ?? '' }));
	const both = [...portal.rows.keys()].filter((c) => manual.rows.has(c));
	compared += both.length + onlyInPortal.length + onlyInManual.length;
	matched += both.length;

	for (const code of both.sort()) {
		const p = portal.rows.get(code)!;
		const m = manual.rows.get(code)!;
		for (const col of used) {
			const pv = p.get(col.id);
			const mv = m.get(col.id);
			const st = stats.get(col.id)!;
			st.compared++;
			compared++;
			if (valuesMatch(col.kind, pv, mv)) {
				matched++;
				continue;
			}
			st.mismatched++;
			if (mismatches.length >= MAX_MISMATCHES) {
				truncated = true;
				continue;
			}
			mismatches.push({
				code,
				name: portal.names.get(code) || manual.names.get(code) || '',
				column: col.id,
				label: col.label,
				portal: display(col.kind, pv),
				manual: display(col.kind, mv),
				detail: detailFor?.(code, col.id)
			});
		}
	}
	return { sheet, compared, matched, onlyInPortal, onlyInManual, columns: [...stats.values()], mismatches, truncated };
}

export const percent = (matched: number, compared: number) => (compared ? Math.round((matched / compared) * 1000) / 10 : 100);
