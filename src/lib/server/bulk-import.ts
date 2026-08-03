import ExcelJS from 'exceljs';

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
const HEADER_MAP: Record<string, keyof ParsedImportRow> = {
	'cipl emp code': 'employeeCode',
	'name of the champion': 'fullName',
	designation: 'designation',
	'team and floor': 'teamAndFloor',
	'direct reporting authority': 'reportingAuthorityRaw',
	'official e mail': 'officialEmail'
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

/**
 * Parses the "HR Team Master data" sheet shape (or any sheet with the same headers,
 * in any column order) into one row per person. Throws if the sheet or required
 * columns aren't found — this is a known, fixed shape, not a general-purpose importer.
 */
export async function parseHrTeamSheet(buffer: Buffer): Promise<ParsedImportRow[]> {
	const workbook = new ExcelJS.Workbook();
	// exceljs's Buffer type predates newer @types/node Buffer fields (maxByteLength, etc.)
	await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

	const sheet = workbook.getWorksheet('HR Team Master data');
	if (!sheet) {
		throw new Error('Sheet "HR Team Master data" not found in this workbook');
	}

	const headerRow = sheet.getRow(1);
	const columnIndex: Partial<Record<keyof ParsedImportRow, number>> = {};
	headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const normalized = normalizeHeader(cell.value);
		const field = HEADER_MAP[normalized];
		if (field) columnIndex[field] = colNumber;
	});

	const required: (keyof ParsedImportRow)[] = ['fullName', 'officialEmail'];
	for (const field of required) {
		if (!columnIndex[field]) {
			throw new Error(`Required column for "${field}" not found in sheet headers`);
		}
	}

	const rows: ParsedImportRow[] = [];
	sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber === 1) return;

		const fullName = columnIndex.fullName ? cellText(row.getCell(columnIndex.fullName).value) : null;
		const officialEmail = columnIndex.officialEmail
			? cellText(row.getCell(columnIndex.officialEmail).value)
			: null;
		if (!fullName || !officialEmail) return;

		rows.push({
			employeeCode: columnIndex.employeeCode ? cellText(row.getCell(columnIndex.employeeCode).value) : null,
			fullName,
			designation: columnIndex.designation ? cellText(row.getCell(columnIndex.designation).value) : null,
			officialEmail: officialEmail.toLowerCase(),
			teamAndFloor: columnIndex.teamAndFloor ? cellText(row.getCell(columnIndex.teamAndFloor).value) : null,
			reportingAuthorityRaw: columnIndex.reportingAuthorityRaw
				? cellText(row.getCell(columnIndex.reportingAuthorityRaw).value)
				: null
		});
	});

	return rows;
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
