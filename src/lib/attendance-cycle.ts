/**
 * Attendance runs on a payroll cycle, not a calendar month: the 26th of one
 * month through the 25th of the next. A cycle is named for the month it ends
 * in — 26 Jul to 25 Aug is the August cycle, the month that gets paid.
 *
 * The URL still carries `YYYY-MM` (the end month), so links and navigation are
 * unchanged; only the range each key expands to is different.
 */

export const CYCLE_START_DAY = 26;
export const CYCLE_END_DAY = 25;

const pad = (n: number) => String(n).padStart(2, '0');

export interface AttendanceCycle {
	/** 'YYYY-MM' of the end month — the cycle's identity. */
	key: string;
	/** First date in the cycle, 'YYYY-MM-DD' (the 26th of the previous month). */
	startDate: string;
	/** Last date in the cycle, 'YYYY-MM-DD' (the 25th of the end month). */
	endDate: string;
	endYear: number;
	/** 1-based month number of the end month. */
	endMonth: number;
}

/** Builds the cycle ending in the given month. */
export function cycleForKey(key: string): AttendanceCycle {
	const [year, month] = key.split('-').map(Number);
	// The 26th of the preceding month; month is 1-based, so month-2 is 0-based
	// for the previous month and Date normalises a December rollover.
	const start = new Date(year, month - 2, CYCLE_START_DAY);
	return {
		key,
		startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(CYCLE_START_DAY)}`,
		endDate: `${year}-${pad(month)}-${pad(CYCLE_END_DAY)}`,
		endYear: year,
		endMonth: month
	};
}

/**
 * The cycle a date falls inside. On or after the 26th the date belongs to the
 * next month's cycle — 28 Jul is part of the August cycle.
 */
export function cycleForDate(date: Date): AttendanceCycle {
	const shifted = new Date(date.getFullYear(), date.getMonth(), 1);
	if (date.getDate() >= CYCLE_START_DAY) shifted.setMonth(shifted.getMonth() + 1);
	return cycleForKey(`${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`);
}

/** Moves `delta` cycles from the given key. */
export function shiftCycle(key: string, delta: number): string {
	const [year, month] = key.split('-').map(Number);
	const d = new Date(year, month - 1 + delta, 1);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const MONTHS_SHORT = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Human label for a cycle, e.g. "26 Jul – 25 Aug 2026". The year is shown once
 * when both ends share it, and on both ends when the cycle spans a new year
 * ("26 Dec 2026 – 25 Jan 2027").
 */
export function cycleLabel(cycle: AttendanceCycle): string {
	const [sy, sm] = cycle.startDate.split('-').map(Number);
	const [ey, em] = cycle.endDate.split('-').map(Number);
	const startPart = `${CYCLE_START_DAY} ${MONTHS_SHORT[sm - 1]}`;
	const endPart = `${CYCLE_END_DAY} ${MONTHS_SHORT[em - 1]} ${ey}`;
	return sy === ey ? `${startPart} – ${endPart}` : `${startPart} ${sy} – ${endPart}`;
}

/** Every date in the cycle, in order, as 'YYYY-MM-DD'. */
export function cycleDates(cycle: AttendanceCycle): string[] {
	const [sy, sm, sd] = cycle.startDate.split('-').map(Number);
	const [ey, em, ed] = cycle.endDate.split('-').map(Number);
	const cursor = new Date(sy, sm - 1, sd);
	const last = new Date(ey, em - 1, ed);
	const out: string[] = [];
	while (cursor <= last) {
		out.push(
			`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
		);
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

/** Working days elapsed in the cycle up to `upTo`, excluding Sat/Sun. */
export function workingDaysSoFar(cycle: AttendanceCycle, upTo: Date): number {
	const todayKey = `${upTo.getFullYear()}-${pad(upTo.getMonth() + 1)}-${pad(upTo.getDate())}`;
	return cycleDates(cycle).filter((key) => {
		if (key > todayKey) return false;
		const [y, m, d] = key.split('-').map(Number);
		const weekday = new Date(y, m - 1, d).getDay();
		return weekday !== 0 && weekday !== 6; // Saturday and Sunday are the weekly offs
	}).length;
}
