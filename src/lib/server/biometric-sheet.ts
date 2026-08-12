import ExcelJS from 'exceljs';
import { env } from '$env/dynamic/private';

/**
 * Parses a biometric attendance report pasted into Excel by HR.
 *
 * This is the manual counterpart to the EasyTime Pro scheduled export
 * ($lib/server/easytime-import). That path receives one row per *punch* from the
 * device itself; this one receives an already-summarised report — one row per
 * employee-day with an in time and an out time — because that is what the
 * machine's own "Attendance Report" screen and every downloaded .xlsx look like.
 *
 * Three layouts arrive in practice and all three are supported, since HR has no
 * control over what the device exports:
 *
 *   long      Emp Code | Date | In Time | Out Time      (one row per day)
 *   day-wise  Emp Code | In Time | Out Time             (one date for the sheet)
 *   matrix    Emp Code down the side, dates across the top
 *
 * The date for a day-wise sheet is discovered from the sheet itself (a "Date:
 * 05-08-2026" banner above the table, or a date in the filename) and only falls
 * back to the uploader's own date picker — that is the "fills in the dates
 * automatically" behaviour HR expects when they drop in a single day's report.
 */

/** One employee-day resolved out of the sheet. */
export interface ParsedBiometricDay {
	/** Verbatim employee code from the sheet; matched to employee_profiles later. */
	empCode: string;
	/** Employee name if the report carried one — display only, never a join key. */
	employeeName: string | null;
	/** 'YYYY-MM-DD' — the day the shift is credited to (its start date). */
	date: string;
	/** Wall-clock 'HH:mm' as printed in the sheet, or null when absent. */
	inTime: string | null;
	outTime: string | null;
	/**
	 * True when the out time is earlier than the in time and has therefore been
	 * rolled onto the following calendar day (a night shift). Surfaced so the
	 * review screen can show it rather than silently shifting someone's day.
	 */
	crossesMidnight: boolean;
	/** Sheet row number, so the review screen can point at the offending line. */
	sourceRow: number;
	/** Human-readable note when a cell was odd but recoverable. */
	notes: string[];
}

export interface BiometricParseResult {
	days: ParsedBiometricDay[];
	sheetName: string;
	layout: 'long' | 'day-wise' | 'matrix';
	/** Where a day-wise sheet's single date came from, for the review screen. */
	dateSource: 'column' | 'sheet-banner' | 'filename' | 'supplied' | 'matrix-header';
	/** Rows that carried an employee code but no usable time at all. */
	skippedRows: { row: number; empCode: string; reason: string }[];
	/** Header text the parser could not classify — shown so HR can rename it. */
	unmappedHeaders: string[];
}

/** Thrown with a message safe to show the uploader verbatim. */
export class BiometricSheetError extends Error {}

// --- Header recognition ---------------------------------------------------
//
// Device exports name the same column a dozen ways ("InTime", "In Time",
// "First In", "Punch In", "Check-In"), so headers are matched on a normalised
// form against synonym lists rather than by exact string or position.

const norm = (v: unknown): string =>
	String(v ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

/** Strips punctuation too, for matching "Check-In:" against "check in". */
const squash = (v: unknown): string => norm(v).replace(/[^a-z0-9]/g, '');

const EMP_CODE_HEADERS = [
	'empcode',
	'employeecode',
	'employeeid',
	'empid',
	'empno',
	'employeeno',
	'ecode',
	'code',
	'cardno',
	'cardnumber',
	'userid',
	'usrid',
	'acno',
	'acno1',
	'enrollno',
	'enrollmentno',
	'attendanceid',
	'ciplempcode',
	'pin',
	'personid'
];

const NAME_HEADERS = [
	'name',
	'employeename',
	'empname',
	'fullname',
	'nameofthechampion',
	'firstname',
	'person',
	'personname'
];

const DATE_HEADERS = ['date', 'attendancedate', 'punchdate', 'day', 'dt', 'attddate', 'shiftdate'];

const IN_HEADERS = [
	'intime',
	'in',
	'checkin',
	'firstin',
	'firstpunch',
	'punchin',
	'timein',
	'entry',
	'entrytime',
	'firsthalfin',
	'logintime',
	'login',
	'arrivaltime',
	'starttime',
	'shiftin'
];

const OUT_HEADERS = [
	'outtime',
	'out',
	'checkout',
	'lastout',
	'lastpunch',
	'punchout',
	'timeout',
	'exit',
	'exittime',
	'logouttime',
	'logout',
	'departuretime',
	'endtime',
	'shiftout'
];

/**
 * Some reports put both times in one cell ("09:31 - 18:47", "09:31/18:47").
 * Recognised as its own column kind so the pair can be split out.
 */
const IN_OUT_HEADERS = [
	'inout',
	'intimeouttime',
	'inouttime',
	'punches',
	'punch',
	'punchrecords',
	'timings',
	'inandout',
	'checkincheckout'
];

type ColumnKind = 'empCode' | 'name' | 'date' | 'in' | 'out' | 'inOut';

function classifyHeader(text: string): ColumnKind | null {
	const s = squash(text);
	if (!s) return null;
	// Exact matches first: "in" must not be swallowed by a substring test against
	// "intime", and "inout" must beat both "in" and "out".
	if (IN_OUT_HEADERS.includes(s)) return 'inOut';
	if (EMP_CODE_HEADERS.includes(s)) return 'empCode';
	if (NAME_HEADERS.includes(s)) return 'name';
	if (DATE_HEADERS.includes(s)) return 'date';
	if (IN_HEADERS.includes(s)) return 'in';
	if (OUT_HEADERS.includes(s)) return 'out';
	return null;
}

// --- Cell reading ---------------------------------------------------------

/** Excel's own epoch: serial 1 is 1900-01-01, with the 1900 leap-year bug. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const PLACEHOLDER_TIMES = new Set([
	'',
	'-',
	'--',
	'---',
	'--:--',
	'-:-',
	'00:00',
	'0:00',
	'na',
	'n/a',
	'nil',
	'none',
	'null',
	'absent',
	'a',
	'ab',
	'off',
	'wo',
	'w/o',
	'weeklyoff',
	'weekoff',
	'holiday',
	'hld',
	'leave',
	'l',
	'missed',
	'missing',
	'notpunched',
	'nopunch',
	'0'
]);

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Reads a cell's raw value into text, preserving what a time actually is.
 *
 * ExcelJS hands back a Date for a real time/date cell, a number for a duration
 * or a bare serial, a formula object for computed cells, and a rich-text object
 * for styled ones. String() on a Date would give "Wed Aug 05 2026 09:31:00
 * GMT+0530" — parseable by accident today and wrong the moment the server zone
 * changes — so each shape is handled explicitly.
 */
function cellRaw(value: unknown): { kind: 'date'; value: Date } | { kind: 'number'; value: number } | { kind: 'text'; value: string } | null {
	if (value === null || value === undefined) return null;

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : { kind: 'date', value };
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? { kind: 'number', value } : null;
	}
	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		// Formula cell: { formula, result }
		if ('result' in obj) return cellRaw(obj.result);
		// Rich text: { richText: [{ text }] }
		if (Array.isArray(obj.richText)) {
			const joined = obj.richText.map((r) => String((r as { text?: unknown }).text ?? '')).join('');
			const t = joined.trim();
			return t === '' ? null : { kind: 'text', value: t };
		}
		if ('text' in obj) {
			const t = String(obj.text).trim();
			return t === '' ? null : { kind: 'text', value: t };
		}
		if ('hyperlink' in obj && 'text' in obj) {
			const t = String(obj.text).trim();
			return t === '' ? null : { kind: 'text', value: t };
		}
	}
	const s = String(value).trim();
	return s === '' ? null : { kind: 'text', value: s };
}

function cellText(value: unknown): string | null {
	const raw = cellRaw(value);
	if (!raw) return null;
	if (raw.kind === 'text') return raw.value;
	if (raw.kind === 'number') return String(raw.value);
	// A Date here is rendered in UTC parts on purpose — ExcelJS builds it from the
	// sheet's own numbers with no zone attached, so UTC parts are the sheet's
	// literal values.
	const d = raw.value;
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Coerces whatever a report put in a time cell into 'HH:mm'.
 *
 * The shapes seen from real devices and hand-maintained sheets:
 *   Date        a true time cell — ExcelJS anchors it to 1899-12-30 UTC
 *   0.3965      Excel's fraction-of-a-day time format
 *   45874.3965  a full datetime serial (date + time)
 *   '09:31'     text, sometimes with seconds, sometimes 12-hour with AM/PM
 *   '9.31'      dot-separated, as typed on a numeric keypad
 *   '0931'      four digits, no separator
 *   '18:47:03'  seconds dropped, never rounded — a punch is an instant
 *
 * Returns null for anything that means "no punch" (see PLACEHOLDER_TIMES) so an
 * absent day is never recorded as a 00:00 arrival.
 */
export function parseTimeCell(value: unknown): string | null {
	const raw = cellRaw(value);
	if (!raw) return null;

	if (raw.kind === 'date') {
		// UTC parts: the Date was reconstructed from the sheet's serial, so its UTC
		// clock is the wall clock that was typed. Reading local parts would shift
		// every punch by the server's offset.
		return `${pad2(raw.value.getUTCHours())}:${pad2(raw.value.getUTCMinutes())}`;
	}

	if (raw.kind === 'number') {
		const n = raw.value;
		if (n <= 0) return null;
		// Fraction of a day, or the fractional part of a datetime serial.
		const frac = n < 1 ? n : n - Math.floor(n);
		// A whole serial with no fractional part is a date, not a time — and 00:00
		// is indistinguishable from "no punch", so treat it as absent.
		if (frac === 0) return null;
		const totalMinutes = Math.round(frac * 24 * 60);
		// Rounding 23:59:40 can reach 1440; that is midnight of the next day.
		const minutes = totalMinutes % (24 * 60);
		return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
	}

	let s = raw.value.trim();
	if (PLACEHOLDER_TIMES.has(s.toLowerCase().replace(/[\s.]/g, ''))) return null;

	// A full datetime in one cell ("2026-08-05 09:31") — keep the time half.
	const dateTimeMatch = s.match(/\d{4}-\d{2}-\d{2}[T ](\d{1,2}:\d{2}(:\d{2})?)/);
	if (dateTimeMatch) s = dateTimeMatch[1];

	// 12-hour clocks: "9:31 AM", "06:47PM", "6 PM".
	const ampm = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2}))?\s*([ap])\.?m\.?$/i);
	if (ampm) {
		let hh = Number(ampm[1]);
		const mm = Number(ampm[2] ?? '0');
		if (hh < 1 || hh > 12 || mm > 59) return null;
		const isPm = ampm[4].toLowerCase() === 'p';
		if (hh === 12) hh = 0;
		return `${pad2(isPm ? hh + 12 : hh)}:${pad2(mm)}`;
	}

	// 24-hour with a separator: "09:31", "9.31", "18:47:03", "21-05".
	const sep = s.match(/^(\d{1,2})[:.\-h](\d{2})(?:[:.](\d{2}))?$/i);
	if (sep) {
		const hh = Number(sep[1]);
		const mm = Number(sep[2]);
		// 24:00 is midnight at the end of the day; anything past it is a typo.
		if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;
		return `${pad2(hh % 24)}:${pad2(mm)}`;
	}

	// Bare digits: "0931", "931", "1847".
	const digits = s.match(/^(\d{3,4})$/);
	if (digits) {
		const d = digits[1].padStart(4, '0');
		const hh = Number(d.slice(0, 2));
		const mm = Number(d.slice(2));
		if (hh > 23 || mm > 59) return null;
		return `${pad2(hh)}:${pad2(mm)}`;
	}

	return null;
}

/**
 * Splits a combined punch cell into its first and last time.
 *
 * Devices that print every punch in one cell ("09:31 13:02 13:44 18:47") mean
 * the first is the arrival and the last is the departure — the same rule the
 * punch-level importer applies when it folds a day's punches into one row.
 */
export function parsePunchListCell(value: unknown): { inTime: string | null; outTime: string | null } {
	const text = cellRaw(value);
	if (!text) return { inTime: null, outTime: null };
	if (text.kind !== 'text') {
		// A single time cell — one punch, treated as the arrival.
		return { inTime: parseTimeCell(value), outTime: null };
	}

	const parts = text.value
		.split(/[,;/|]|\s+-\s+|\s+to\s+|\s+/i)
		.map((p) => p.trim())
		.filter(Boolean);

	const times = parts.map((p) => parseTimeCell(p)).filter((t): t is string => t !== null);
	if (times.length === 0) return { inTime: null, outTime: null };
	if (times.length === 1) return { inTime: times[0], outTime: null };
	return { inTime: times[0], outTime: times[times.length - 1] };
}

// --- Date reading --------------------------------------------------------

/**
 * Coerces a date cell or free text into 'YYYY-MM-DD'.
 *
 * Day-first is assumed for ambiguous all-numeric dates (05/08/2026 is 5 August),
 * because every device and sheet in this deployment is Indian-locale. Anything
 * whose first component exceeds 12 is unambiguous and read as day-first anyway;
 * an ISO-shaped value (2026-08-05) is detected by its four-digit lead.
 */
export function parseDateCell(value: unknown, monthNameHint?: string): string | null {
	const raw = cellRaw(value);
	if (!raw) return null;

	if (raw.kind === 'date') {
		const d = raw.value;
		return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
	}

	if (raw.kind === 'number') {
		const serial = Math.floor(raw.value);
		// Below 32 with a month hint this is a day-of-month column in a matrix
		// report ("1 2 3 … 31" across the top, with the month named in a banner).
		if (serial >= 1 && serial <= 31 && monthNameHint) {
			const ym = parseMonthHint(monthNameHint);
			if (ym) return `${ym}-${pad2(serial)}`;
		}
		if (serial < 60) return null; // not a plausible date serial
		const ms = EXCEL_EPOCH_UTC + serial * 86_400_000;
		const d = new Date(ms);
		if (Number.isNaN(d.getTime())) return null;
		return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
	}

	return parseDateText(raw.value, monthNameHint);
}

const MONTHS: Record<string, number> = {
	jan: 1, january: 1,
	feb: 2, february: 2,
	mar: 3, march: 3,
	apr: 4, april: 4,
	may: 5,
	jun: 6, june: 6,
	jul: 7, july: 7,
	aug: 8, august: 8,
	sep: 9, sept: 9, september: 9,
	oct: 10, october: 10,
	nov: 11, november: 11,
	dec: 12, december: 12
};

/** Pulls 'YYYY-MM' out of a banner like "Month: Aug 2026" or "August-2026". */
export function parseMonthHint(text: string): string | null {
	const s = norm(text);
	const named = s.match(/([a-z]{3,9})[\s\-/,]*((?:19|20)\d{2})/);
	if (named) {
		const m = MONTHS[named[1]];
		if (m) return `${named[2]}-${pad2(m)}`;
	}
	const numeric = s.match(/((?:19|20)\d{2})[\s\-/](\d{1,2})\b/);
	if (numeric) {
		const m = Number(numeric[2]);
		if (m >= 1 && m <= 12) return `${numeric[1]}-${pad2(m)}`;
	}
	const monthFirst = s.match(/\b(\d{1,2})[\s\-/]((?:19|20)\d{2})\b/);
	if (monthFirst) {
		const m = Number(monthFirst[1]);
		if (m >= 1 && m <= 12) return `${monthFirst[2]}-${pad2(m)}`;
	}
	return null;
}

export function parseDateText(input: string, monthNameHint?: string): string | null {
	const s = input.trim();
	if (!s) return null;

	// ISO / ISO-ish, optionally with a time we discard: 2026-08-05, 2026/08/05
	const iso = s.match(/^((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
	if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

	// Day-first numeric: 05-08-2026, 5/8/26, 05.08.2026
	// Four digits are tried before two — alternation is ordered, and `\d{2}` first
	// would match only the "20" of "2026" and silently yield the year 2020.
	const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/);
	if (dmy) {
		const d = Number(dmy[1]);
		const m = Number(dmy[2]);
		let y = Number(dmy[3]);
		if (dmy[3].length === 2) y += y >= 70 ? 1900 : 2000;
		// A first component over 12 can only be the day; when both are ≤ 12 the
		// Indian day-first reading is used, which is what these reports print.
		if (d > 12 && m <= 12) return validYmd(y, m, d);
		if (m > 12 && d <= 12) return validYmd(y, d, m); // clearly month-first
		return validYmd(y, m, d);
	}

	// Named month: 05-Aug-2026, 5 August 2026, Aug 5, 2026
	const dMonY = s.match(/^(\d{1,2})[\s\-/]*([a-z]{3,9})[\s\-/]*((?:19|20)?\d{2})?/i);
	if (dMonY && MONTHS[norm(dMonY[2])]) {
		const d = Number(dMonY[1]);
		const m = MONTHS[norm(dMonY[2])];
		const y = resolveYear(dMonY[3], monthNameHint);
		if (y) return validYmd(y, m, d);
	}
	const monDY = s.match(/^([a-z]{3,9})[\s\-/]*(\d{1,2})[\s\-/,]*((?:19|20)?\d{2})?/i);
	if (monDY && MONTHS[norm(monDY[1])]) {
		const m = MONTHS[norm(monDY[1])];
		const d = Number(monDY[2]);
		const y = resolveYear(monDY[3], monthNameHint);
		if (y) return validYmd(y, m, d);
	}

	// A bare day-of-month, meaningful only against a month banner (matrix reports).
	const bare = s.match(/^(\d{1,2})$/);
	if (bare && monthNameHint) {
		const ym = parseMonthHint(monthNameHint);
		if (ym) {
			const [y, m] = ym.split('-').map(Number);
			return validYmd(y, m, Number(bare[1]));
		}
	}

	return null;
}

function resolveYear(raw: string | undefined, monthNameHint?: string): number | null {
	if (raw) {
		let y = Number(raw);
		if (raw.length === 2) y += y >= 70 ? 1900 : 2000;
		return y;
	}
	// No year in the cell — take it from the sheet's month banner if there is one.
	if (monthNameHint) {
		const ym = parseMonthHint(monthNameHint);
		if (ym) return Number(ym.slice(0, 4));
	}
	return null;
}

/** Rejects impossible dates (31 Feb) rather than letting Date roll them over. */
function validYmd(y: number, m: number, d: number): string | null {
	if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
	const probe = new Date(Date.UTC(y, m - 1, d));
	if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
	return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Finds a date in a filename: "Attendance_05-08-2026.xlsx", "report 2026-08-05". */
export function dateFromFilename(filename: string | null): string | null {
	if (!filename) return null;
	const stem = filename.replace(/\.[a-z0-9]+$/i, '');
	const iso = stem.match(/((?:19|20)\d{2})[-_./](\d{1,2})[-_./](\d{1,2})/);
	if (iso) {
		const hit = validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
		if (hit) return hit;
	}
	const dmy = stem.match(/(\d{1,2})[-_./](\d{1,2})[-_./]((?:19|20)\d{2})/);
	if (dmy) {
		const d = Number(dmy[1]);
		const m = Number(dmy[2]);
		const y = Number(dmy[3]);
		if (d > 12 && m <= 12) return validYmd(y, m, d);
		if (m > 12 && d <= 12) return validYmd(y, d, m);
		return validYmd(y, m, d);
	}
	const named = stem.match(/(\d{1,2})[\s\-_]([a-z]{3,9})[\s\-_]((?:19|20)\d{2})/i);
	if (named && MONTHS[norm(named[2])]) {
		return validYmd(Number(named[3]), MONTHS[norm(named[2])], Number(named[1]));
	}
	return null;
}

// --- Timezone ------------------------------------------------------------
//
// Identical to easytime-import's handling, and deliberately duplicated in
// intent rather than inferred: the sheet carries wall-clock times with no zone,
// so the offset has to be supplied. Without it, `new Date('2026-08-05T01:30')`
// is read in the *server's* zone, and the same file would import differently on
// Railway (UTC) than on an IST laptop.

const DEFAULT_DEVICE_UTC_OFFSET = '+05:30';

export function deviceUtcOffset(): string {
	const raw = (env.DEVICE_UTC_OFFSET ?? '').trim();
	return /^[+-]\d{2}:\d{2}$/.test(raw) ? raw : DEFAULT_DEVICE_UTC_OFFSET;
}

/** Builds the real instant for a wall-clock 'HH:mm' on a given calendar date. */
export function instantFor(date: string, time: string, offset = deviceUtcOffset()): Date {
	return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}${offset}`);
}

export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const nd = new Date(Date.UTC(y, m - 1, d + days));
	return `${nd.getUTCFullYear()}-${pad2(nd.getUTCMonth() + 1)}-${pad2(nd.getUTCDate())}`;
}

// --- Sheet parsing -------------------------------------------------------

const MAX_HEADER_SCAN_ROWS = 25;

interface HeaderMatch {
	rowNumber: number;
	columns: Map<number, ColumnKind>;
	score: number;
}

/**
 * Finds the header row and what each of its columns means.
 *
 * Device reports bury the table under banner rows (company name, "Attendance
 * Report", a date range), so the header cannot be assumed to be row 1. Every
 * row in the first 25 is scored on how many columns it classifies, and the best
 * wins — a banner row scores 0 or 1, a real header scores 3+.
 */
function findHeaderRow(sheet: ExcelJS.Worksheet, banner: string): HeaderMatch | null {
	let best: HeaderMatch | null = null;
	const limit = Math.min(MAX_HEADER_SCAN_ROWS, sheet.rowCount);

	for (let r = 1; r <= limit; r++) {
		const row = sheet.getRow(r);
		const columns = new Map<number, ColumnKind>();
		let dateHeaders = 0;
		row.eachCell({ includeEmpty: false }, (cell, col) => {
			const text = cellText(cell.value);
			if (!text) return;
			const kind = classifyHeader(text);
			if (kind) {
				// First column of a kind wins; a report with "In Time" and a later
				// "OT In Time" should map the first.
				if (![...columns.values()].includes(kind)) columns.set(col, kind);
				return;
			}
			// A matrix report names no time columns at all — it puts a date over each
			// day instead, so date-shaped headers are what makes its header row real.
			// Counted only above the row's own scan so a stray date in a banner cell
			// can't promote a banner row to the header.
			if (parseDateCell(cell.value, banner)) dateHeaders += 1;
		});

		const kinds = new Set(columns.values());
		if (!kinds.has('empCode')) continue;
		const hasTime = kinds.has('in') || kinds.has('out') || kinds.has('inOut');
		// Two date headers, not one: a long-format sheet's single "Date" column is
		// already classified above, so a lone date-shaped header here is more likely
		// a stray label than a matrix of days.
		const isMatrix = !hasTime && dateHeaders >= 2;
		if (!hasTime && !isMatrix) continue;

		// Date columns count toward the score so a matrix header outranks a banner
		// row that happens to carry an employee-code label.
		const score = kinds.size + (isMatrix ? dateHeaders : 0);
		if (!best || score > best.score) best = { rowNumber: r, columns, score };
	}

	return best;
}

/**
 * The month hint used while the header row is still being located.
 *
 * Finding the header needs a month hint (to read "1 2 3 …" day headers in a
 * matrix report), but the precise banner is defined as everything *above* the
 * header — a circular dependency. This breaks it by scanning the sheet's leading
 * rows regardless of where the header turns out to be; it is only ever used to
 * resolve a month, never to date an employee's attendance.
 */
function monthHintPrescan(sheet: ExcelJS.Worksheet): string {
	const parts: string[] = [];
	const limit = Math.min(MAX_HEADER_SCAN_ROWS, sheet.rowCount);
	for (let r = 1; r <= limit; r++) {
		sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
			const t = cellText(cell.value);
			if (t) parts.push(t);
		});
	}
	return parts.join(' | ');
}

/**
 * Reads every banner cell above the table, joined. Used to recover the date of a
 * day-wise report ("Date: 05-08-2026") or the month of a matrix one.
 */
function bannerText(sheet: ExcelJS.Worksheet, headerRowNumber: number): string {
	const parts: string[] = [];
	for (let r = 1; r < headerRowNumber; r++) {
		sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
			const t = cellText(cell.value);
			if (t) parts.push(t);
		});
	}
	return parts.join(' | ');
}

/**
 * Pulls a single date out of the banner. Prefers an explicitly labelled date
 * ("Date: 05-08-2026", "For 05/08/2026") over any loose date-shaped text so a
 * "Printed on 06-08-2026" footer never becomes the attendance date.
 */
export function dateFromBanner(banner: string): string | null {
	if (!banner) return null;

	// Ignore anything that names itself as a generated/printed timestamp.
	const labelled = banner.match(
		/\b(?:date|for|dated|attendance\s*date|report\s*date|as\s*on|w\.?e\.?f\.?)\b\s*[:\-]?\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{1,2}[\s\-]*[a-z]{3,9}[\s\-]*(?:19|20)?[0-9]{2})/i
	);
	if (labelled) {
		const hit = parseDateText(labelled[1]);
		if (hit) return hit;
	}

	// A date range whose ends are the same day is still a single-day report.
	const range = banner.match(
		/([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{2,4})\s*(?:to|–|—|-)\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{2,4})/i
	);
	if (range) {
		const from = parseDateText(range[1]);
		const to = parseDateText(range[2]);
		if (from && to && from === to) return from;
		return null; // a genuine multi-day range can't date a day-wise sheet
	}

	return null;
}

/**
 * Matrix layout: dates run across the header row instead of down a column.
 *
 * Detected by finding header cells that parse as dates (or as bare day numbers
 * when the banner names the month). Each such column holds that day's punch(es)
 * for the employee on that row.
 */
function findMatrixDateColumns(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number,
	monthHint: string
): Map<number, string> {
	const dates = new Map<number, string>();
	sheet.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
		const raw = cell.value;
		const text = cellText(raw);
		if (!text) return;
		if (classifyHeader(text)) return; // a real named column, not a date
		const date = parseDateCell(raw, monthHint);
		if (date) dates.set(col, date);
	});
	return dates;
}

/**
 * A matrix report often splits each date across two sub-columns (In / Out) in a
 * second header row beneath the dates. Reads that row so each date's pair of
 * columns is known.
 */
function findMatrixSubColumns(
	sheet: ExcelJS.Worksheet,
	subRowNumber: number
): Map<number, 'in' | 'out'> {
	const subs = new Map<number, 'in' | 'out'>();
	if (subRowNumber < 1 || subRowNumber > sheet.rowCount) return subs;
	sheet.getRow(subRowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
		const text = cellText(cell.value);
		if (!text) return;
		const kind = classifyHeader(text);
		if (kind === 'in' || kind === 'out') subs.set(col, kind);
	});
	return subs;
}

export interface ParseOptions {
	/** Filename, used to recover a day-wise sheet's date. */
	filename?: string | null;
	/** The uploader's date picker — last resort for a day-wise sheet. */
	suppliedDate?: string | null;
}

/**
 * Parses a biometric report workbook into employee-days.
 *
 * Throws BiometricSheetError with a message meant for the uploader whenever the
 * sheet can't be understood — a silent empty result would read as "the file was
 * fine and nobody was present".
 */
export async function parseBiometricSheet(
	buffer: Buffer,
	options: ParseOptions = {}
): Promise<BiometricParseResult> {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer as never);
	} catch {
		throw new BiometricSheetError(
			'Could not read that file as an Excel workbook. Save it as .xlsx and try again.'
		);
	}

	if (workbook.worksheets.length === 0) {
		throw new BiometricSheetError('The workbook has no sheets.');
	}

	// Pick the sheet whose header scores best — a workbook often carries a
	// "Summary" tab alongside the real data.
	let chosen: { sheet: ExcelJS.Worksheet; header: HeaderMatch } | null = null;
	for (const sheet of workbook.worksheets) {
		const header = findHeaderRow(sheet, monthHintPrescan(sheet));
		if (header && (!chosen || header.score > chosen.header.score)) chosen = { sheet, header };
	}

	if (!chosen) {
		throw new BiometricSheetError(
			'No attendance table found. The sheet needs a header row with an employee code column ' +
				'(e.g. "Emp Code") and at least an in-time or out-time column (e.g. "In Time", "Out Time").'
		);
	}

	const { sheet, header } = chosen;
	const banner = bannerText(sheet, header.rowNumber);
	const kinds = new Set(header.columns.values());

	const colOf = (kind: ColumnKind): number | null => {
		for (const [col, k] of header.columns) if (k === kind) return col;
		return null;
	};

	const empCol = colOf('empCode')!;
	const nameCol = colOf('name');
	const dateCol = colOf('date');

	// Unclassified headers, so HR can see what was ignored rather than wonder.
	const unmappedHeaders: string[] = [];
	sheet.getRow(header.rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
		if (header.columns.has(col)) return;
		const text = cellText(cell.value);
		if (text && !parseDateCell(cell.value, banner)) unmappedHeaders.push(text);
	});

	const days: ParsedBiometricDay[] = [];
	const skippedRows: BiometricParseResult['skippedRows'] = [];

	// --- Matrix layout: dates across the header row -----------------------
	const matrixDates = dateCol ? new Map<number, string>() : findMatrixDateColumns(sheet, header.rowNumber, banner);
	if (matrixDates.size > 0 && !dateCol) {
		const subs = findMatrixSubColumns(sheet, header.rowNumber + 1);
		// With sub-columns present the data starts a row lower.
		const firstDataRow = subs.size > 0 ? header.rowNumber + 2 : header.rowNumber + 1;
		const dateCols = [...matrixDates.entries()].sort((a, b) => a[0] - b[0]);

		for (let r = firstDataRow; r <= sheet.rowCount; r++) {
			const row = sheet.getRow(r);
			const empCode = cellText(row.getCell(empCol).value);
			if (!empCode || classifyHeader(empCode)) continue;
			const employeeName = nameCol ? cellText(row.getCell(nameCol).value) : null;

			// How wide each date's block is, taken from the gap between the first two
			// dates. The last date has no successor to bound it, and assuming a fixed
			// two columns would miss an In/Out pair that sits further right.
			const blockWidth =
				dateCols.length > 1 ? Math.max(1, dateCols[1][0] - dateCols[0][0]) : 2;

			for (let i = 0; i < dateCols.length; i++) {
				const [col, date] = dateCols[i];
				// The date's own column plus any columns before the next date that
				// were labelled In/Out beneath it.
				const nextCol = dateCols[i + 1]?.[0] ?? col + blockWidth;
				let inTime: string | null = null;
				let outTime: string | null = null;

				if (subs.size > 0) {
					for (let c = col; c < nextCol; c++) {
						const kind = subs.get(c);
						if (!kind) continue;
						const t = parseTimeCell(row.getCell(c).value);
						if (kind === 'in' && !inTime) inTime = t;
						if (kind === 'out') outTime = t ?? outTime;
					}
					// Fall back to reading the pair positionally when the sub-header
					// row exists but this date's columns weren't labelled.
					if (!inTime && !outTime) {
						const pair = parsePunchListCell(row.getCell(col).value);
						inTime = pair.inTime;
						outTime = pair.outTime;
					}
				} else {
					const pair = parsePunchListCell(row.getCell(col).value);
					inTime = pair.inTime;
					outTime = pair.outTime;
				}

				if (!inTime && !outTime) continue; // absent that day
				days.push(buildDay(empCode, employeeName, date, inTime, outTime, r));
			}
		}

		if (days.length === 0) {
			throw new BiometricSheetError(
				'The dates across the top were read, but no in/out times were found under them.'
			);
		}

		return {
			days,
			sheetName: sheet.name,
			layout: 'matrix',
			dateSource: 'matrix-header',
			skippedRows,
			unmappedHeaders
		};
	}

	// --- Long / day-wise layout ------------------------------------------
	const inCol = colOf('in');
	const outCol = colOf('out');
	const inOutCol = colOf('inOut');

	// One date for the whole sheet, when there is no date column. Sheet banner
	// first, then the filename, then whatever the uploader picked — so a report
	// that states its own date never depends on the picker being right.
	let sheetDate: string | null = null;
	let dateSource: BiometricParseResult['dateSource'] = 'column';
	if (!dateCol) {
		const fromBanner = dateFromBanner(banner);
		const fromFile = dateFromFilename(options.filename ?? null);
		if (fromBanner) {
			sheetDate = fromBanner;
			dateSource = 'sheet-banner';
		} else if (fromFile) {
			sheetDate = fromFile;
			dateSource = 'filename';
		} else if (options.suppliedDate) {
			sheetDate = options.suppliedDate;
			dateSource = 'supplied';
		} else {
			throw new BiometricSheetError(
				'This sheet has no date column, so it looks like a single day’s report — but no date ' +
					'was found in the sheet or the filename. Pick the attendance date above and upload again.'
			);
		}
	}

	for (let r = header.rowNumber + 1; r <= sheet.rowCount; r++) {
		const row = sheet.getRow(r);
		const empCode = cellText(row.getCell(empCol).value);
		if (!empCode) continue;
		// A repeated header (device reports re-print it per page) or a totals row.
		if (classifyHeader(empCode)) continue;
		if (/^(total|grand total|summary)\b/i.test(empCode)) continue;

		const employeeName = nameCol ? cellText(row.getCell(nameCol).value) : null;

		const date = dateCol ? parseDateCell(row.getCell(dateCol).value, banner) : sheetDate;
		if (!date) {
			skippedRows.push({ row: r, empCode, reason: 'date could not be read' });
			continue;
		}

		let inTime: string | null = null;
		let outTime: string | null = null;

		if (inOutCol !== null) {
			const pair = parsePunchListCell(row.getCell(inOutCol).value);
			inTime = pair.inTime;
			outTime = pair.outTime;
		}
		if (inCol !== null && !inTime) inTime = parseTimeCell(row.getCell(inCol).value);
		if (outCol !== null && !outTime) outTime = parseTimeCell(row.getCell(outCol).value);

		if (!inTime && !outTime) {
			skippedRows.push({ row: r, empCode, reason: 'no in or out time on this row' });
			continue;
		}

		days.push(buildDay(empCode, employeeName, date, inTime, outTime, r));
	}

	if (days.length === 0) {
		throw new BiometricSheetError(
			'The table was found, but no row had a usable in or out time. Check that the time cells ' +
				'hold values like "09:31" rather than text such as "Absent".'
		);
	}

	return {
		days,
		sheetName: sheet.name,
		layout: dateCol ? 'long' : 'day-wise',
		dateSource,
		skippedRows,
		unmappedHeaders
	};
}

/**
 * Builds one employee-day, deciding whether the shift crossed midnight.
 *
 * An out time earlier than the in time means a night shift: 21:00 → 06:00 is an
 * arrival on this date and a departure on the next. Recording both on the same
 * date would make the shift come out as minus fifteen hours.
 */
function buildDay(
	empCode: string,
	employeeName: string | null,
	date: string,
	inTime: string | null,
	outTime: string | null,
	sourceRow: number
): ParsedBiometricDay {
	const notes: string[] = [];
	let crossesMidnight = false;

	if (inTime && outTime && outTime < inTime) {
		crossesMidnight = true;
		notes.push(`Out time ${outTime} is before in time ${inTime} — read as a night shift ending ${addDays(date, 1)}.`);
	}
	if (inTime && !outTime) notes.push('No out time in the sheet.');
	if (!inTime && outTime) notes.push('No in time in the sheet.');

	return {
		empCode: empCode.trim(),
		employeeName,
		date,
		inTime,
		outTime,
		crossesMidnight,
		sourceRow,
		notes
	};
}
