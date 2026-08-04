import ExcelJS from 'exceljs';
import {
	mapSpreadsheet,
	redactCell,
	type SheetMapping,
	type SheetSummary
} from '$lib/server/ai/map-spreadsheet';

export interface ParsedImportRow {
	employeeCode: string | null;
	fullName: string;
	designation: string | null;
	officialEmail: string;
	teamAndFloor: string | null;
	reportingAuthorityRaw: string | null;
}

// Header names are matched case-insensitively with surrounding whitespace trimmed —
// the source sheet has trailing spaces on several headers (e.g. "Official E Mail ").
// Synonyms cover the naming drift across the HR trackers ("HR Team Master data",
// "HR Team Master Tracker", …) so familiar shapes never need the LLM fallback.
const HEADER_MAP: Record<string, keyof ParsedImportRow> = {
	'cipl emp code': 'employeeCode',
	'emp code': 'employeeCode',
	'employee code': 'employeeCode',
	'employee id': 'employeeCode',
	'name of the champion': 'fullName',
	'employee name': 'fullName',
	name: 'fullName',
	designation: 'designation',
	'team and floor': 'teamAndFloor',
	team: 'teamAndFloor',
	department: 'teamAndFloor',
	'direct reporting authority': 'reportingAuthorityRaw',
	'reporting authority': 'reportingAuthorityRaw',
	'reporting manager': 'reportingAuthorityRaw',
	'reports to': 'reportingAuthorityRaw',
	'official e mail': 'officialEmail',
	'official e-mail': 'officialEmail',
	'official email': 'officialEmail',
	'official mail id': 'officialEmail',
	'official email id': 'officialEmail',
	'email id': 'officialEmail',
	email: 'officialEmail',
	'work email': 'officialEmail'
};

function normalizeHeader(value: unknown): string {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

function cellText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
		return String((value as { text: unknown }).text).trim() || null;
	}
	const s = String(value).trim();
	return s === '' ? null : s;
}

export interface ParseResult {
	rows: ParsedImportRow[];
	/** Which sheet was used, and how it was chosen — surfaced in the review UI. */
	sheetName: string;
	strategy: 'known-headers' | 'ai-mapped';
	note: string | null;
}

/** Reads a sheet given an explicit header row and column-number map. */
function readRows(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number,
	columnIndex: Partial<Record<keyof ParsedImportRow, number>>
): ParsedImportRow[] {
	const rows: ParsedImportRow[] = [];
	const at = (row: ExcelJS.Row, field: keyof ParsedImportRow) => {
		const col = columnIndex[field];
		return col ? cellText(row.getCell(col).value) : null;
	};

	sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber <= headerRowNumber) return;

		const fullName = at(row, 'fullName');
		const officialEmail = at(row, 'officialEmail');
		// A person needs at minimum a name and a work email to become a login.
		if (!fullName || !officialEmail) return;

		rows.push({
			employeeCode: at(row, 'employeeCode'),
			fullName,
			designation: at(row, 'designation'),
			officialEmail: officialEmail.toLowerCase(),
			teamAndFloor: at(row, 'teamAndFloor'),
			reportingAuthorityRaw: at(row, 'reportingAuthorityRaw')
		});
	});

	return rows;
}

/**
 * Finds the worksheet the model named, tolerating the ways a model rewrites a
 * name: trimmed trailing spaces, case differences, or a close-but-partial name.
 * Sheet names in real HR workbooks routinely carry invisible trailing spaces,
 * and exceljs's getWorksheet() is exact-match only.
 */
function resolveSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
	const exact = workbook.getWorksheet(name);
	if (exact) return exact;

	const norm = (s: string) => s.trim().toLowerCase();
	const target = norm(name);

	const caseInsensitive = workbook.worksheets.filter((s) => norm(s.name) === target);
	if (caseInsensitive.length === 1) return caseInsensitive[0];

	const partial = workbook.worksheets.filter(
		(s) => norm(s.name).includes(target) || target.includes(norm(s.name))
	);
	if (partial.length === 1) return partial[0];

	// A one-sheet workbook leaves no room for ambiguity about which sheet was meant.
	if (workbook.worksheets.length === 1) return workbook.worksheets[0];
	return undefined;
}

/** Tries the known header names against one sheet's given header row. */
function matchKnownHeaders(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number
): Partial<Record<keyof ParsedImportRow, number>> {
	const columnIndex: Partial<Record<keyof ParsedImportRow, number>> = {};
	sheet.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const field = HEADER_MAP[normalizeHeader(cell.value)];
		if (field) columnIndex[field] = colNumber;
	});
	return columnIndex;
}

/**
 * Parses an HR spreadsheet into one row per person.
 *
 * Sheet names and column headers are NOT assumed: every sheet is tried against
 * the known header set first (instant, offline, and unchanged for files we
 * already understand). Only when no sheet matches does the LLM inspect the
 * workbook's structure and decide the mapping, so an unfamiliar export — a
 * renamed sheet, reordered or reworded columns — still imports.
 *
 * Cell values sent to the model are redacted; see redactCell.
 */
export async function parseHrTeamSheet(buffer: Buffer): Promise<ParseResult> {
	const workbook = new ExcelJS.Workbook();
	// exceljs's Buffer type predates newer @types/node Buffer fields (maxByteLength, etc.)
	await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

	const sheets = workbook.worksheets;
	if (sheets.length === 0) throw new Error('This workbook has no sheets');

	// --- 1. Deterministic pass: any sheet whose headers we already recognise.
	// Header rows are usually row 1, but tolerate a title row or two above it.
	let best: { sheet: ExcelJS.Worksheet; headerRow: number; index: Partial<Record<keyof ParsedImportRow, number>> } | null =
		null;

	for (const sheet of sheets) {
		for (let headerRow = 1; headerRow <= Math.min(3, sheet.rowCount); headerRow++) {
			const index = matchKnownHeaders(sheet, headerRow);
			if (index.fullName && index.officialEmail) {
				const score = Object.keys(index).length;
				const bestScore = best ? Object.keys(best.index).length : -1;
				if (score > bestScore) best = { sheet, headerRow, index };
			}
		}
	}

	if (best) {
		const rows = readRows(best.sheet, best.headerRow, best.index);
		if (rows.length > 0) {
			return { rows, sheetName: best.sheet.name, strategy: 'known-headers', note: null };
		}
	}

	// --- 2. LLM pass: nothing matched, so let the model decide.
	const summaries: SheetSummary[] = sheets.map((sheet) => {
		const sampleRows: string[][] = [];
		const limit = Math.min(4, sheet.rowCount);
		for (let r = 1; r <= limit; r++) {
			const cells: string[] = [];
			sheet.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
				const text = cellText(cell.value) ?? '';
				// Row 1 is nearly always headers and carries no personal data —
				// send it verbatim so the model can match on exact header text.
				cells.push(r === 1 ? text : redactCell(text));
			});
			sampleRows.push(cells);
		}
		return { name: sheet.name, rowCount: sheet.rowCount, sampleRows };
	});

	let mapping: SheetMapping;
	try {
		mapping = await mapSpreadsheet(summaries);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Could not recognise this spreadsheet's layout, and automatic mapping failed: ${detail}`
		);
	}

	const sheet = resolveSheet(workbook, mapping.sheetName);
	if (!sheet) {
		const available = workbook.worksheets.map((s) => `"${s.name}"`).join(', ');
		throw new Error(
			`Automatic mapping chose sheet "${mapping.sheetName}", which isn't in this workbook (sheets found: ${available})`
		);
	}

	// Resolve the model's header TEXT back to column numbers.
	const headerToCol = new Map<string, number>();
	sheet.getRow(mapping.headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const text = cellText(cell.value);
		if (text) headerToCol.set(normalizeHeader(text), colNumber);
	});

	const resolve = (header: string | null) =>
		header ? headerToCol.get(normalizeHeader(header)) : undefined;

	const index: Partial<Record<keyof ParsedImportRow, number>> = {
		employeeCode: resolve(mapping.columns.employeeCode),
		fullName: resolve(mapping.columns.fullName),
		designation: resolve(mapping.columns.designation),
		officialEmail: resolve(mapping.columns.officialEmail),
		teamAndFloor: resolve(mapping.columns.teamAndFloor),
		reportingAuthorityRaw: resolve(mapping.columns.reportingAuthority)
	};

	if (!index.fullName || !index.officialEmail) {
		const missing = [!index.fullName && 'employee name', !index.officialEmail && 'work email']
			.filter(Boolean)
			.join(' and ');
		throw new Error(
			`Could not find a ${missing} column in "${sheet.name}"${mapping.note ? ` — ${mapping.note}` : ''}`
		);
	}

	const rows = readRows(sheet, mapping.headerRow, index);

	return {
		rows,
		sheetName: sheet.name,
		strategy: 'ai-mapped',
		note: mapping.note ?? null
	};
}

function nameWords(name: string): string[] {
	return name
		.trim()
		.toLowerCase()
		.replace(/[.,]/g, '')
		.split(/\s+/)
		.filter((w) => w.length > 0);
}

function namesLikelyMatch(a: string, b: string): boolean {
	const aWords = nameWords(a);
	const bWords = nameWords(b);
	if (aWords.length === 0 || bWords.length === 0) return false;
	if (aWords.join(' ') === bWords.join(' ')) return true;

	const [shortWords, longSet] =
		aWords.length <= bWords.length ? [aWords, new Set(bWords)] : [bWords, new Set(aWords)];
	// Require at least 2 matching words (or all words if the shorter name only has 1)
	// so single common words ("HR", "Team") don't produce false-positive matches.
	const matchedCount = shortWords.filter(
		(w) => longSet.has(w) || [...longSet].some((c) => c.startsWith(w) || w.startsWith(c))
	).length;
	return matchedCount >= Math.min(2, shortWords.length) && matchedCount === shortWords.length;
}

/**
 * Finds an existing user whose full name closely matches this row's name but whose
 * email DIDN'T already match (so the plain email-based existing-user check missed
 * them) — e.g. a sheet listing someone's work-issued email while their real login
 * uses a different domain. Returned as a suggestion for the Super Admin to confirm
 * ("link to this existing person?") rather than silently creating a duplicate account.
 */
export function suggestExistingUserMatch<T extends { id: string; fullName: string }>(
	rowFullName: string,
	existingUsers: T[]
): T | null {
	for (const candidate of existingUsers) {
		if (namesLikelyMatch(rowFullName, candidate.fullName)) return candidate;
	}
	return null;
}

/**
 * Best-effort match of a raw "reports to" name against the other rows in the SAME
 * import batch. Handles minor spelling variants ("Deepak Gudur" vs "Deepak Guduru"
 * vs "Deepak") and word-order/abbreviation differences ("Santhosh Reddy S" vs
 * "S Santhosh Reddy") via word-set overlap — this is a SUGGESTION only, the Super
 * Admin confirms/corrects it before anything is applied.
 */
export function suggestReportsToIndex(
	reportingAuthorityRaw: string | null,
	rows: ParsedImportRow[],
	selfIndex: number
): number | null {
	if (!reportingAuthorityRaw) return null;
	const targetWords = nameWords(reportingAuthorityRaw);
	if (targetWords.length === 0) return null;
	const targetSet = new Set(targetWords);

	let bestIndex: number | null = null;
	let bestScore = 0;

	rows.forEach((row, i) => {
		if (i === selfIndex) return;
		const candidateWords = nameWords(row.fullName);
		if (candidateWords.length === 0) return;

		let score = 0;
		const joinedTarget = targetWords.join(' ');
		const joinedCandidate = candidateWords.join(' ');
		if (joinedCandidate === joinedTarget) {
			score = 1000;
		} else {
			// Word-set overlap: every one of the shorter name's words must appear in
			// the longer name's word set (handles reordering, initials, and one name
			// being a prefix/suffix of the other), scored by overlap length.
			const [shortWords, longSet] =
				targetWords.length <= candidateWords.length
					? [targetWords, new Set(candidateWords)]
					: [candidateWords, targetSet];
			const allWordsMatch = shortWords.every(
				(w) => longSet.has(w) || [...longSet].some((c) => c.startsWith(w) || w.startsWith(c))
			);
			if (allWordsMatch) {
				score = shortWords.reduce((sum, w) => sum + w.length, 0);
			}
		}

		if (score > bestScore) {
			bestScore = score;
			bestIndex = i;
		}
	});

	return bestScore >= 3 ? bestIndex : null;
}
