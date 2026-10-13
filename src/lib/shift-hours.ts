/**
 * Shifts and worked hours, built from punches.
 *
 * The attendance table keeps one check-in and one check-out per calendar day,
 * which cannot describe a shift that runs past midnight: the 00:07 check-out
 * of last night's shift becomes today's "check-in", today's real check-in is
 * overwritten, and the day reads 00:07 → 23:34 = 23h 27m. So shifts are built
 * here from every punch instead, and each shift is credited to the day it
 * started — whatever shift the person works.
 *
 *   1. Punches within two minutes of each other are one punch (double taps).
 *   2. A shift starts at a check-in and takes every punch up to the longest a
 *      shift can run: the person's shift length plus overtime slack. A late
 *      logout is overtime on the same shift, never a new day.
 *   3. The person's shift window — from their office timings, or learnt from
 *      their own complete shifts when HR has none on file — decides which day
 *      a shift belongs to, and whether a lone punch near the shift's end is a
 *      check-out whose check-in was missed rather than a new check-in.
 *   4. A check-in with no check-out is "in progress" for CHECKOUT_GRACE_MINUTES
 *      and a missed check-out after that.
 */

/** Standard full shift. Days shorter than this are flagged, never rewritten. */
export const STANDARD_SHIFT_MINUTES = 9 * 60;

/** After this long checked in, the person is reminded to punch out. */
export const CHECKOUT_REMINDER_MINUTES = 9 * 60;

/** Grace after check-in before a missing check-out counts as a missed punch. */
export const CHECKOUT_GRACE_MINUTES = 9 * 60 + 30;

/**
 * Longest a shift may run when the person has no shift window on file: a
 * 9-hour shift plus five hours of overtime. An 18:00 check-in and a 09:00
 * check-out the next morning is 15 hours and is two separate punches.
 */
export const MAX_SHIFT_SPAN_MINUTES = 14 * 60;

/** Overtime allowed past the person's own shift length before a punch is a new day. */
const OVERTIME_SLACK_MINUTES = 5 * 60;

/** Punches this close together are the same punch. */
const DOUBLE_TAP_MINUTES = 2;

/** How near the shift's end (and nearer than its start) a lone punch must be to read as a check-out. */
const END_MATCH_MINUTES = 3 * 60;

/** Office hours are kept in IST; the devices report IST wall-clock time. */
export const IST_OFFSET_MINUTES = 330;

export interface ShiftDay {
	/** 'YYYY-MM-DD' — the day the shift is credited to: the day it started. */
	date: string;
	checkInAt: Date | null;
	checkOutAt: Date | null;
	/** Minutes from check-in to check-out, if both are known. */
	workedMinutes: number | null;
	/** Minutes worked beyond STANDARD_SHIFT_MINUTES. */
	overtimeMinutes: number;
	/** True when the check-out fell on a later calendar day than the shift's date. */
	crossesMidnight: boolean;
	/**
	 * The calendar day the check-out fell on, when the shift crossed midnight.
	 * Stated explicitly so the UI never re-derives a date from a timestamp.
	 */
	absorbedDate: string | null;
	/** True when worked time is known and falls short of a standard shift. */
	isShort: boolean;
	/** Checked in, no check-out yet, still inside CHECKOUT_GRACE_MINUTES. */
	inProgress: boolean;
	/** Punches that made up the shift. */
	punchCount: number;
	/**
	 * Set when the record needs a human: a check-in whose check-out never came
	 * within the grace period, or a check-out whose check-in is missing.
	 */
	anomaly: 'missing-check-out' | 'orphan-check-out' | null;
}

export interface PunchInput {
	at: Date | string;
	/** Known direction (portal corrections, devices that report it); null when unknown. */
	direction?: 'in' | 'out' | null;
}

/** A shift as minutes of the IST day: start 14:00 → 840, length 9h30 → 570. */
export interface ShiftWindow {
	startMinutes: number;
	lengthMinutes: number;
}

export interface BuildShiftsOptions {
	/** The person's shift from their office timings; learnt from their punches when absent. */
	window?: ShiftWindow | null;
	/** "Now", for deciding whether an open shift is still within its grace period. */
	now?: Date;
	offsetMinutes?: number;
}

type Punch = { at: Date; direction: 'in' | 'out' | null };

const pad = (n: number) => String(n).padStart(2, '0');

/** The office calendar day of an instant. */
export function officeDateKey(at: Date, offsetMinutes = IST_OFFSET_MINUTES): string {
	const d = new Date(at.getTime() + offsetMinutes * 60_000);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes past office midnight of an instant. */
function officeMinutes(at: Date, offsetMinutes: number): number {
	const d = new Date(at.getTime() + offsetMinutes * 60_000);
	return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Office midnight that begins a 'YYYY-MM-DD', as an instant. */
function officeMidnight(dateKey: string, offsetMinutes: number): number {
	return Date.parse(`${dateKey}T00:00:00Z`) - offsetMinutes * 60_000;
}

function addDays(dateKey: string, days: number): string {
	const d = new Date(`${dateKey}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Distance between two minute-of-day values around the clock. */
function clockDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 1440;
	return Math.min(d, 1440 - d);
}

const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);

function normalise(punches: PunchInput[]): Punch[] {
	const list = punches
		.map((p) => ({ at: p.at instanceof Date ? p.at : new Date(p.at), direction: p.direction ?? null }))
		.filter((p) => !Number.isNaN(p.at.getTime()))
		.sort((a, b) => a.at.getTime() - b.at.getTime());
	const out: Punch[] = [];
	for (const p of list) {
		const prev = out[out.length - 1];
		if (prev && p.at.getTime() - prev.at.getTime() <= DOUBLE_TAP_MINUTES * 60_000) {
			// The same punch reported twice (or a double tap): keep the first
			// instant, and whichever copy knows its direction.
			prev.direction ??= p.direction;
			continue;
		}
		out.push({ ...p });
	}
	return out;
}

/**
 * Learns someone's shift from their own complete shifts — the usual start
 * time (averaged around the clock, so 23:50 and 00:10 average to midnight) and
 * the usual length. Needs at least two shifts to go on.
 */
function inferWindow(punches: Punch[], offsetMinutes: number): ShiftWindow | null {
	const starts: number[] = [];
	const lengths: number[] = [];
	let i = 0;
	while (i < punches.length) {
		const start = punches[i];
		let j = i + 1;
		while (j < punches.length && minutesBetween(start.at, punches[j].at) <= MAX_SHIFT_SPAN_MINUTES) j++;
		const span = minutesBetween(start.at, punches[j - 1].at);
		if (j - i >= 2 && span >= 4 * 60) {
			starts.push(officeMinutes(start.at, offsetMinutes));
			lengths.push(span);
		}
		i = j;
	}
	if (starts.length < 2) return null;
	const angle = (m: number) => (m / 1440) * 2 * Math.PI;
	const x = starts.reduce((s, m) => s + Math.cos(angle(m)), 0);
	const y = starts.reduce((s, m) => s + Math.sin(angle(m)), 0);
	const mean = Math.round(((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440);
	const sorted = [...lengths].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];
	return { startMinutes: mean, lengthMinutes: Math.min(Math.max(median, 6 * 60), 12 * 60) };
}

/** The day whose shift start lies nearest an instant (a late or early arrival still belongs to it). */
function creditDate(at: Date, window: ShiftWindow | null, offsetMinutes: number): string {
	const day = officeDateKey(at, offsetMinutes);
	if (!window) return day;
	let best = day;
	let bestGap = Infinity;
	for (const candidate of [addDays(day, -1), day, addDays(day, 1)]) {
		const start = officeMidnight(candidate, offsetMinutes) + window.startMinutes * 60_000;
		const gap = Math.abs(at.getTime() - start);
		if (gap < bestGap) {
			bestGap = gap;
			best = candidate;
		}
	}
	return best;
}

/** True for a lone punch that reads as the end of a shift rather than the start of one. */
function looksLikeCheckOut(p: Punch, window: ShiftWindow | null, offsetMinutes: number): boolean {
	if (p.direction) return p.direction === 'out';
	if (!window) return false;
	const m = officeMinutes(p.at, offsetMinutes);
	const toEnd = clockDistance(m, (window.startMinutes + window.lengthMinutes) % 1440);
	const toStart = clockDistance(m, window.startMinutes);
	return toEnd <= END_MATCH_MINUTES && toEnd < toStart;
}

/**
 * Builds shifts from punches. Pass punches from a day or two either side of
 * the range being shown, so shifts that cross the range's edges come out whole.
 */
export function buildShifts(input: PunchInput[], options: BuildShiftsOptions = {}): ShiftDay[] {
	const offset = options.offsetMinutes ?? IST_OFFSET_MINUTES;
	const now = options.now ?? new Date();
	const punches = normalise(input);
	if (punches.length === 0) return [];

	const window = options.window ?? inferWindow(punches, offset);
	const maxSpan = window
		? Math.min(Math.max(window.lengthMinutes + OVERTIME_SLACK_MINUTES, 12 * 60), 16 * 60)
		: MAX_SHIFT_SPAN_MINUTES;

	const shifts: ShiftDay[] = [];
	let i = 0;
	while (i < punches.length) {
		const first = punches[i];

		// A check-out whose check-in was never recorded: it ends a shift, so it
		// must not start one and swallow the next day's check-in.
		if (looksLikeCheckOut(first, window, offset)) {
			const startGuess = new Date(first.at.getTime() - (window?.lengthMinutes ?? STANDARD_SHIFT_MINUTES) * 60_000);
			const date = creditDate(startGuess, window, offset);
			const outDay = officeDateKey(first.at, offset);
			shifts.push({
				date,
				checkInAt: null,
				checkOutAt: first.at,
				workedMinutes: null,
				overtimeMinutes: 0,
				crossesMidnight: outDay !== date,
				absorbedDate: outDay !== date ? outDay : null,
				isShort: false,
				inProgress: false,
				punchCount: 1,
				anomaly: 'orphan-check-out'
			});
			i++;
			continue;
		}

		let j = i + 1;
		while (j < punches.length && minutesBetween(first.at, punches[j].at) <= maxSpan) {
			// A punch the device marks as a check-in, after a long gap, is the
			// next shift starting early — not part of this one.
			const prev = punches[j - 1];
			if (punches[j].direction === 'in' && prev.direction === 'out') break;
			j++;
		}
		const members = punches.slice(i, j);
		const last = members[members.length - 1];
		const open = members.length === 1 || last.direction === 'in';
		const date = creditDate(first.at, window, offset);

		if (open) {
			const inProgress = minutesBetween(first.at, now) < CHECKOUT_GRACE_MINUTES;
			shifts.push({
				date,
				checkInAt: first.at,
				checkOutAt: null,
				workedMinutes: null,
				overtimeMinutes: 0,
				crossesMidnight: false,
				absorbedDate: null,
				isShort: false,
				inProgress,
				punchCount: members.length,
				anomaly: inProgress ? null : 'missing-check-out'
			});
		} else {
			const worked = minutesBetween(first.at, last.at);
			const outDay = officeDateKey(last.at, offset);
			shifts.push({
				date,
				checkInAt: first.at,
				checkOutAt: last.at,
				workedMinutes: worked,
				overtimeMinutes: Math.max(0, worked - STANDARD_SHIFT_MINUTES),
				crossesMidnight: outDay !== date,
				absorbedDate: outDay !== date ? outDay : null,
				isShort: worked < STANDARD_SHIFT_MINUTES,
				inProgress: false,
				punchCount: members.length,
				anomaly: null
			});
		}
		i = j;
	}

	return mergeSameDay(shifts);
}

/**
 * Two shifts credited to one day (a split shift, or a lone check-out next to a
 * complete shift) become one entry: earliest in, latest out, worked time summed.
 */
function mergeSameDay(shifts: ShiftDay[]): ShiftDay[] {
	const byDate = new Map<string, ShiftDay>();
	for (const s of shifts) {
		const prev = byDate.get(s.date);
		if (!prev) {
			byDate.set(s.date, s);
			continue;
		}
		const checkInAt = [prev.checkInAt, s.checkInAt].filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0] ?? null;
		const checkOutAt = [prev.checkOutAt, s.checkOutAt].filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0] ?? null;
		const worked = prev.workedMinutes === null && s.workedMinutes === null ? null : (prev.workedMinutes ?? 0) + (s.workedMinutes ?? 0);
		const later = +(s.checkOutAt ?? s.checkInAt ?? 0) >= +(prev.checkOutAt ?? prev.checkInAt ?? 0) ? s : prev;
		byDate.set(s.date, {
			date: s.date,
			checkInAt,
			checkOutAt,
			workedMinutes: worked,
			overtimeMinutes: worked === null ? 0 : Math.max(0, worked - STANDARD_SHIFT_MINUTES),
			crossesMidnight: later.crossesMidnight,
			absorbedDate: later.absorbedDate,
			isShort: worked !== null && worked < STANDARD_SHIFT_MINUTES,
			inProgress: prev.inProgress || s.inProgress,
			punchCount: prev.punchCount + s.punchCount,
			// A complete shift that day outweighs a stray punch beside it.
			anomaly: worked !== null ? null : (prev.anomaly ?? s.anomaly)
		});
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Reads an office-timings string as a shift window.
 *
 * The HR tracker writes these freehand — "06:00 PM to 03:30 AM", "10.00-7.00",
 * "6PM-3 AM" — so the parser is deliberately tolerant. Returns null when the
 * value can't be read, and the window is then learnt from the punches.
 *
 * Several rows read "06:00 PM to 03:30 PM", which is 21.5 hours and plainly a
 * typo for AM, so an implausibly long shift is re-read as ending 12 hours
 * earlier — which is also how "10.00-7.00" comes out as 10:00 to 19:00.
 */
export function parseShiftWindow(officeTimings: string | null | undefined): ShiftWindow | null {
	const raw = (officeTimings ?? '').trim();
	if (!raw) return null;

	// Two clock values separated by "to", "-", or a dash.
	const parts = raw.split(/\s*(?:to|–|—|-)\s*/i).filter(Boolean);
	if (parts.length < 2) return null;

	const parseClock = (s: string): number | null => {
		const meridiem = /pm/i.test(s) ? 'pm' : /am/i.test(s) ? 'am' : null;
		const digits = s.replace(/[^0-9.:]/g, '');
		if (!digits) return null;
		const [h, m = '0'] = digits.split(/[.:]/);
		let hour = Number(h);
		const minute = Number(m);
		if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
		if (meridiem === 'pm' && hour < 12) hour += 12;
		if (meridiem === 'am' && hour === 12) hour = 0;
		return hour * 60 + minute;
	};

	const start = parseClock(parts[0]);
	const end = parseClock(parts[1]);
	if (start === null || end === null) return null;

	let span = end - start;
	// End before start means the shift runs past midnight.
	if (span <= 0) span += 1440;
	// A "shift" over 16 hours is a mis-written meridiem, not a real one.
	if (span > 16 * 60) span -= 12 * 60;
	if (span <= 0 || span > 16 * 60) return null;
	return { startMinutes: start, lengthMinutes: span };
}

/** Shift length in minutes from an office-timings string, or null when unreadable. */
export function parseShiftMinutes(officeTimings: string | null | undefined): number | null {
	return parseShiftWindow(officeTimings)?.lengthMinutes ?? null;
}

/**
 * The shift someone is in right now with no check-out yet, if any — what the
 * check-out reminder and missed-punch prompt are about. Only a shift started
 * within the last day counts.
 */
export function openShift(shifts: ShiftDay[], now = new Date()): ShiftDay | null {
	for (let k = shifts.length - 1; k >= 0; k--) {
		const s = shifts[k];
		if (!s.checkInAt) continue;
		if (s.checkOutAt) return null;
		const elapsed = minutesBetween(s.checkInAt, now);
		return elapsed >= 0 && elapsed < 24 * 60 ? s : null;
	}
	return null;
}
