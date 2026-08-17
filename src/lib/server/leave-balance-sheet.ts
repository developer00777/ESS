/**
 * Parses an HR leave-balance sheet: employee code + a leave balance per type.
 *
 * HR keeps these figures in a spreadsheet because the portal cannot derive them.
 * Monthly accrual is computed from the published policy, but prior years'
 * carry-forward lives in HRone, so the opening balances have to be told to the
 * portal rather than calculated by it.
 *
 * Two layouts are accepted, because both are what HR actually sends:
 *
 *   Wide     one row per employee, one column per leave type — the shape you get
 *            when someone exports a balance report.
 *              Employee Code, EL, SL, CL
 *              CIPL001,       12, 6,  4
 *
 *   Long     one row per employee/type pair, which is what a hand-built sheet
 *            or a system export tends to look like.
 *              Employee Code, Leave Type, Balance
 *              CIPL001,       EL,         12
 *
 * The layout is detected rather than configured: asking HR to declare it is a
 * setting they will get wrong, and the header row already says which it is.
 */

import ExcelJS from 'exceljs';
import { normalizeEmpCode } from '$lib/server/easytime-import';

export class LeaveBalanceSheetError extends Error {}

export interface ParsedBalance {
	empCode: string;
	/** The leave-type token exactly as the sheet wrote it, for reporting back. */
	leaveTypeToken: string;
	days: number;
	/** 1-based row in the sheet, so a problem can be pointed at. */
	sourceRow: number;
}

export interface ParsedLeaveBalanceSheet {
	sheetName: string;
	layout: 'wide' | 'long';
	balances: ParsedBalance[];
	/** Headers that matched no known column and no leave type. */
	unmappedHeaders: string[];
	skippedRows: { row: number; empCode: string; reason: string }[];
}

/** Header spellings for the employee-code column. */
const EMP_CODE_HEADERS = [
	'employee code',
	'employeecode',
	'emp code',
	'empcode',
	'emp id',
	'employee id',
	'employeeid',
	'code',
	'staff id',
	'staff code'
];

/** Header spellings for the leave-type column in a long sheet. */
const LEAVE_TYPE_HEADERS = ['leave type', 'leavetype', 'type', 'leave', 'leave code', 'leavecode'];

/** Header spellings for the balance column in a long sheet. */
const BALANCE_HEADERS = [
	'balance',
	'days',
	'leave balance',
	'balance days',
	'opening balance',
	'available',
	'entitlement',
	'allocated',
	'allocated days',
	'count',
	'leave count',
	'leaves'
];

/**
 * Columns that legitimately appear in an HR export but carry no balance.
 *
 * Listed so they are silently ignored rather than reported as unmapped headers —
 * a warning about "Name" on every upload trains HR to ignore the warnings that
 * do matter.
 */
const IGNORED_HEADERS = [
	'name',
	'employee name',
	'full name',
	'employee',
	'department',
	'designation',
	'email',
	'team',
	'location',
	'doj',
	'date of joining',
	'grade',
	'status',
	'remarks',
	'notes',
	'sr no',
	'sr. no',
	'srno',
	's no',
	'sl no',
	'#'
];

const norm = (v: unknown): string =>
	String(v ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

/** Cell text, flattened from whatever exceljs hands back for that cell type. */
function cellText(cell: ExcelJS.Cell | undefined): string {
	if (!cell) return '';
	const v = cell.value;
	if (v === null || v === undefined) return '';
	if (typeof v === 'object') {
		// Rich text, hyperlinks and formula results all arrive as objects.
		if ('richText' in v && Array.isArray(v.richText)) {
			return v.richText.map((t: { text: string }) => t.text).join('');
		}
		if ('text' in v && typeof v.text === 'string') return v.text;
		if ('result' in v) return String((v as { result: unknown }).result ?? '');
		if (v instanceof Date) return v.toISOString().slice(0, 10);
	}
	return String(v).trim();
}

/**
 * A balance figure from a cell.
 *
 * Returns null for an empty cell — meaning "no figure supplied", which is left
 * alone — and throws for text that isn't a number, because silently treating
 * "twelve" or "N/A" as zero would wipe somebody's leave.
 */
function parseDays(raw: string): number | null {
	const text = raw.trim();
	if (text === '' || text === '-' || text === '—') return null;
	// Tolerates "12 days", "12.5", "1,2" typos are NOT tolerated — see below.
	const cleaned = text.replace(/\s*days?\s*$/i, '').trim();
	if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
		throw new LeaveBalanceSheetError(`"${raw}" is not a number of days`);
	}
	const n = Number(cleaned);
	if (!Number.isFinite(n)) throw new LeaveBalanceSheetError(`"${raw}" is not a number of days`);
	if (n < 0) throw new LeaveBalanceSheetError(`a negative balance (${raw}) is not allowed`);
	// A balance beyond this is far more likely a mis-keyed column (a date, an
	// employee code) than a real entitlement.
	if (n > 400) throw new LeaveBalanceSheetError(`${raw} days is implausibly large`);
	// Leave is booked in half days at finest; anything else is a typo.
	if (Math.round(n * 2) !== n * 2) {
		throw new LeaveBalanceSheetError(`${raw} is not a whole or half day`);
	}
	return n;
}

/** Finds the header row — the first row carrying an employee-code column. */
function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; headers: string[] } {
	const limit = Math.min(sheet.rowCount, 25);
	for (let r = 1; r <= limit; r++) {
		const row = sheet.getRow(r);
		const headers: string[] = [];
		row.eachCell({ includeEmpty: true }, (cell, col) => {
			headers[col - 1] = cellText(cell);
		});
		if (headers.some((h) => EMP_CODE_HEADERS.includes(norm(h)))) {
			return { rowNumber: r, headers };
		}
	}
	throw new LeaveBalanceSheetError(
		'Could not find an "Employee Code" column. The first row should name the columns, e.g. "Employee Code, EL, SL".'
	);
}

/**
 * Parses a leave-balance sheet (.csv, .xlsx).
 *
 * `knownTypeTokens` are the leave-type codes and names currently published, used
 * only to tell a leave-type column apart from an unrelated one in a wide sheet.
 * Matching the token to a real type — and reporting the ones that match nothing
 * — is the caller's job, since that needs the database.
 */
export async function parseLeaveBalanceSheet(
	buffer: Buffer,
	opts: { filename?: string; knownTypeTokens?: string[] } = {}
): Promise<ParsedLeaveBalanceSheet> {
	const known = new Set((opts.knownTypeTokens ?? []).map(norm).filter(Boolean));

	const workbook = new ExcelJS.Workbook();
	const isCsv = /\.csv$/i.test(opts.filename ?? '');
	try {
		if (isCsv) {
			// exceljs' CSV reader wants a stream; the buffer is already in memory.
			const { Readable } = await import('node:stream');
			await workbook.csv.read(Readable.from(buffer));
		} else {
			// `as never` matches biometric-sheet.ts: exceljs' bundled Buffer type
			// predates the ArrayBufferLike generic and no longer structurally matches
			// Node's own.
			await workbook.xlsx.load(buffer as never);
		}
	} catch {
		throw new LeaveBalanceSheetError(
			isCsv
				? 'That CSV could not be read. Save it as a plain comma-separated file and try again.'
				: 'That file could not be read as a spreadsheet. Upload a .csv or .xlsx file.'
		);
	}

	const sheet = workbook.worksheets[0];
	if (!sheet || sheet.rowCount === 0) throw new LeaveBalanceSheetError('That file has no rows');

	const { rowNumber: headerRow, headers } = findHeaderRow(sheet);

	const codeCol = headers.findIndex((h) => EMP_CODE_HEADERS.includes(norm(h))) + 1;
	const typeCol = headers.findIndex((h) => LEAVE_TYPE_HEADERS.includes(norm(h))) + 1;
	const balanceCol = headers.findIndex((h) => BALANCE_HEADERS.includes(norm(h))) + 1;

	// A "Leave Type" column is what makes a sheet long-form. A wide sheet names a
	// type per column instead, so it has no such column.
	const layout: 'wide' | 'long' = typeCol > 0 && balanceCol > 0 ? 'long' : 'wide';

	const balances: ParsedBalance[] = [];
	const skippedRows: { row: number; empCode: string; reason: string }[] = [];
	const unmappedHeaders: string[] = [];

	/** Columns holding a per-type balance, for a wide sheet. */
	const typeColumns: { col: number; token: string }[] = [];
	if (layout === 'wide') {
		headers.forEach((h, i) => {
			const col = i + 1;
			const n = norm(h);
			if (!n || col === codeCol) return;
			if (IGNORED_HEADERS.includes(n)) return;
			// A published type's code or name makes this a balance column. When no
			// type list was supplied, every remaining column is treated as one and
			// the caller reports whatever fails to match.
			if (known.size === 0 || known.has(n)) {
				typeColumns.push({ col, token: h.trim() });
			} else {
				unmappedHeaders.push(h.trim());
			}
		});

		if (typeColumns.length === 0) {
			throw new LeaveBalanceSheetError(
				'No leave-type columns found. Name each balance column after a published leave type — e.g. "Employee Code, EL, SL" — or use a "Leave Type" and "Balance" column instead.'
			);
		}
	}

	for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
		const row = sheet.getRow(r);
		const rawCode = cellText(row.getCell(codeCol));
		const empCode = normalizeEmpCode(rawCode);

		// A blank code is a spacer or a totals row, not an error worth reporting.
		if (!empCode) continue;
		if (/^(total|grand total)$/i.test(empCode)) continue;

		if (layout === 'long') {
			const token = cellText(row.getCell(typeCol)).trim();
			const rawDays = cellText(row.getCell(balanceCol));
			if (!token) {
				skippedRows.push({ row: r, empCode, reason: 'no leave type given' });
				continue;
			}
			let days: number | null;
			try {
				days = parseDays(rawDays);
			} catch (err) {
				skippedRows.push({
					row: r,
					empCode,
					reason: err instanceof LeaveBalanceSheetError ? err.message : 'unreadable balance'
				});
				continue;
			}
			if (days === null) {
				skippedRows.push({ row: r, empCode, reason: 'no balance given' });
				continue;
			}
			balances.push({ empCode, leaveTypeToken: token, days, sourceRow: r });
			continue;
		}

		for (const { col, token } of typeColumns) {
			const rawDays = cellText(row.getCell(col));
			let days: number | null;
			try {
				days = parseDays(rawDays);
			} catch (err) {
				skippedRows.push({
					row: r,
					empCode,
					reason: `${token}: ${err instanceof LeaveBalanceSheetError ? err.message : 'unreadable balance'}`
				});
				continue;
			}
			// An empty cell in a wide sheet means "not stated for this type", which
			// must leave the existing balance alone rather than zeroing it.
			if (days === null) continue;
			balances.push({ empCode, leaveTypeToken: token, days, sourceRow: r });
		}
	}

	// Nothing usable found. When rows were rejected for a stated reason, those
	// reasons are the useful answer — returning them beats a generic "nothing
	// found", which tells HR nothing about the "N/A" that caused it.
	if (balances.length === 0 && skippedRows.length === 0) {
		throw new LeaveBalanceSheetError(
			'No leave balances were found in that file. Check that the employee codes and balance figures are filled in.'
		);
	}

	// The same employee/type twice is contradictory — the later row is very likely
	// a correction, but guessing is worse than saying so.
	const seen = new Map<string, number>();
	for (const b of balances) {
		const key = `${b.empCode}:${norm(b.leaveTypeToken)}`;
		const prior = seen.get(key);
		if (prior !== undefined) {
			throw new LeaveBalanceSheetError(
				`${b.empCode} has more than one ${b.leaveTypeToken} balance (rows ${prior} and ${b.sourceRow}). Leave one row per employee and leave type.`
			);
		}
		seen.set(key, b.sourceRow);
	}

	return {
		sheetName: sheet.name,
		layout,
		balances,
		unmappedHeaders: [...new Set(unmappedHeaders)],
		skippedRows
	};
}
