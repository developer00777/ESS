/**
 * Week-off rosters — the pattern that decides which days an employee is off
 * every week, independent of public holidays.
 *
 * Before this existed, "Saturday and Sunday" was hardcoded in the calendars and
 * in the leave day-count. That is right for most of the office and wrong for
 * anyone on a Sunday-only or rotational week-off, so the pattern is now data:
 * a Super Admin saves named rosters, a roster is assigned to an employee for a
 * date range, and every calendar resolves the employee's own days off from it.
 *
 * Everything here is pure and date-string based ('YYYY-MM-DD'), so the same
 * resolver runs on the server and inside the Svelte calendars.
 */

export type WeekOffPattern = 'fixed' | 'rotational';

export interface WeekOffRosterShape {
	id: string;
	name: string;
	pattern: WeekOffPattern;
	/** 'fixed' only — weekdays off every week, 0 = Sunday … 6 = Saturday. */
	weekdays: number[] | null;
	/** 'rotational' only — one weekday set per week of the cycle. */
	rotationWeeks: number[][] | null;
	/** 'rotational' only — the date week 1 of the rotation starts from. */
	rotationAnchorDate: string | null;
}

export interface WeekOffAssignmentShape {
	rosterId: string;
	effectiveFrom: string;
	effectiveTo: string | null;
}

/** The default every employee falls back to when no roster is assigned. */
export const DEFAULT_WEEKDAYS_OFF = [0, 6]; // Saturday and Sunday

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_FULL = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

const MS_PER_DAY = 86_400_000;

/** Parses 'YYYY-MM-DD' as a local date, matching how the calendars build cells. */
function parseKey(key: string): Date {
	const [y, m, d] = key.slice(0, 10).split('-').map(Number);
	return new Date(y, m - 1, d);
}

function toKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

/** Sunday of the week containing `date` — the unit a rotation advances by. */
function weekStart(date: Date): Date {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	start.setDate(start.getDate() - start.getDay());
	return start;
}

/**
 * Which week of the rotation a date falls in, 0-based. Weeks before the anchor
 * count backwards and still land inside the cycle, so a roster anchored to next
 * month still resolves sensibly for dates already on screen.
 */
export function rotationWeekIndex(dateKey: string, anchorKey: string, cycleWeeks: number): number {
	if (cycleWeeks <= 0) return 0;
	const elapsed = Math.round(
		(weekStart(parseKey(dateKey)).getTime() - weekStart(parseKey(anchorKey)).getTime()) / MS_PER_DAY / 7
	);
	return ((elapsed % cycleWeeks) + cycleWeeks) % cycleWeeks;
}

/** The weekdays off for a given date under this roster. */
export function weekdaysOffOn(roster: WeekOffRosterShape, dateKey: string): number[] {
	if (roster.pattern === 'fixed') {
		return roster.weekdays ?? DEFAULT_WEEKDAYS_OFF;
	}
	const weeks = roster.rotationWeeks ?? [];
	if (weeks.length === 0) return DEFAULT_WEEKDAYS_OFF;
	const anchor = roster.rotationAnchorDate;
	if (!anchor) return weeks[0] ?? DEFAULT_WEEKDAYS_OFF;
	return weeks[rotationWeekIndex(dateKey, anchor, weeks.length)] ?? [];
}

/** True if `dateKey` is a week off under this roster. */
export function isWeekOffUnder(roster: WeekOffRosterShape, dateKey: string): boolean {
	return weekdaysOffOn(roster, dateKey).includes(parseKey(dateKey).getDay());
}

/**
 * The assignment covering a date. Assignments are ranges rather than a single
 * current value so a roster change mid-cycle doesn't rewrite history — the
 * latest one that started on or before the date wins.
 */
export function assignmentOn(
	assignments: WeekOffAssignmentShape[],
	dateKey: string
): WeekOffAssignmentShape | null {
	let best: WeekOffAssignmentShape | null = null;
	for (const a of assignments) {
		if (a.effectiveFrom > dateKey) continue;
		if (a.effectiveTo && a.effectiveTo < dateKey) continue;
		if (!best || a.effectiveFrom > best.effectiveFrom) best = a;
	}
	return best;
}

/**
 * Builds the "is this date a week off for this employee?" test the calendars
 * use. Falls back to Sat/Sun whenever the employee has no roster covering the
 * date, so an unassigned employee keeps behaving exactly as before.
 */
export function makeWeekOffResolver(
	rosters: WeekOffRosterShape[],
	assignments: WeekOffAssignmentShape[]
): (dateKey: string) => boolean {
	const byId = new Map(rosters.map((r) => [r.id, r]));
	return (dateKey: string) => {
		const assignment = assignmentOn(assignments, dateKey);
		const roster = assignment ? byId.get(assignment.rosterId) : null;
		if (!roster) return DEFAULT_WEEKDAYS_OFF.includes(parseKey(dateKey).getDay());
		return isWeekOffUnder(roster, dateKey);
	};
}

/** Human summary of a roster, e.g. "Every Sun" or "4-week rotation". */
export function describeRoster(roster: WeekOffRosterShape): string {
	if (roster.pattern === 'fixed') {
		const days = roster.weekdays ?? [];
		if (days.length === 0) return 'No weekly off';
		if (days.length === 7) return 'Every day off';
		// Sorted so the label reads in week order regardless of the click order
		// the days were picked in.
		return `Every ${[...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(' + ')}`;
	}
	const weeks = roster.rotationWeeks ?? [];
	return `${weeks.length}-week rotation`;
}

/**
 * Per-week breakdown of a rotation, for showing the manager what they are about
 * to publish rather than making them decode a nested array.
 */
export function rotationSummary(roster: WeekOffRosterShape): string[] {
	const weeks = roster.rotationWeeks ?? [];
	return weeks.map((days, i) => {
		const label =
			days.length === 0
				? 'no off'
				: [...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(' + ');
		return `Week ${i + 1}: ${label}`;
	});
}

/** Counts the days in a range that are NOT a week off — used for leave day-counts. */
export function workingDaysInRange(
	startKey: string,
	endKey: string,
	isWeekOff: (dateKey: string) => boolean
): number {
	let count = 0;
	const cursor = parseKey(startKey);
	const last = parseKey(endKey);
	while (cursor <= last) {
		const key = toKey(cursor);
		if (!isWeekOff(key)) count++;
		cursor.setDate(cursor.getDate() + 1);
	}
	return count;
}

/** Validates a roster definition coming off the wire. Returns an error string, or null. */
export function validateRosterInput(input: {
	name?: unknown;
	pattern?: unknown;
	weekdays?: unknown;
	rotationWeeks?: unknown;
	rotationAnchorDate?: unknown;
}): string | null {
	if (typeof input.name !== 'string' || input.name.trim().length === 0) {
		return 'A roster name is required';
	}
	if (input.pattern !== 'fixed' && input.pattern !== 'rotational') {
		return 'Pattern must be "fixed" or "rotational"';
	}

	const validDays = (value: unknown): boolean =>
		Array.isArray(value) &&
		value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
		new Set(value as number[]).size === value.length;

	if (input.pattern === 'fixed') {
		if (!validDays(input.weekdays)) {
			return 'Choose the weekdays that are off (0–6, no duplicates)';
		}
		if ((input.weekdays as number[]).length === 0) {
			return 'A fixed roster needs at least one day off';
		}
		return null;
	}

	if (!Array.isArray(input.rotationWeeks) || input.rotationWeeks.length < 2) {
		return 'A rotation needs at least 2 weeks';
	}
	if (input.rotationWeeks.length > 12) {
		return 'A rotation cannot be longer than 12 weeks';
	}
	if (!input.rotationWeeks.every(validDays)) {
		return 'Each rotation week must list weekdays 0–6 with no duplicates';
	}
	if (
		typeof input.rotationAnchorDate !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(input.rotationAnchorDate)
	) {
		return 'A rotation needs a start date for week 1';
	}
	return null;
}
