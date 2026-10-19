/**
 * Pure helpers behind the absence planner's "My leave" panel and its plan
 * sheet. Shared by the dashboard loader and the browser so both count days
 * the way POST /api/leave charges them: week offs are free, every other day
 * in the range — holidays included — is a leave day.
 */

import type { WeekOffAssignmentShape, WeekOffRosterShape } from './week-off';

/** The planner's five calendar fills (see dashboard/planner.server.ts). */
export type LeaveTone = 'blue' | 'purple' | 'green' | 'yellow' | 'pink';

export type DayRange = { start: string; end: string; days: number };

export type BreakIdea = {
	/** The holiday the break is built around. */
	holiday: string;
	holidayDate: string;
	/** What to apply for. Empty when the holiday already makes a long weekend. */
	apply: DayRange[];
	leaveDays: number;
	/** The whole stretch away from work: leave, holidays and week offs. */
	breakStart: string;
	breakEnd: string;
	breakDays: number;
};

/** The viewer's own leave, as dashboard/my-leave.server.ts loads it. */
export type MyBalance = {
	typeId: string;
	code: string | null;
	name: string;
	tone: LeaveTone;
	/** Accrued so far this year (or as HR set it). */
	allocated: number;
	/** Approved leave already behind the viewer. */
	taken: number;
	/** Approved leave still ahead. */
	scheduled: number;
	/** Requests waiting on a decision. */
	pending: number;
	/** allocated − approved − pending: what a new request can still use. */
	free: number;
	accrualPerMonth: number;
	/** `free` plus the accrual still to come this year. */
	yearEnd: number;
	carryForwardCap: number;
	/** Days that won't carry into next year if left unused. */
	lapsing: number;
	encashable: boolean;
};

export type MyLeave = {
	year: number;
	today: string;
	balances: MyBalance[];
	totals: { allocated: number; taken: number; scheduled: number; pending: number; free: number };
	monthly: { typeId: string; name: string; quota: number; used: number; remaining: number }[];
	compOff: { available: number; nextExpiry: string | null; expiringSoon: number };
	holidays: {
		hasCalendar: boolean;
		upcoming: { date: string; name: string; type: string }[];
		leftThisYear: number;
		totalThisYear: number;
	};
	next: { id: string; typeName: string; start: string; end: string; days: number; status: 'approved' | 'pending'; inDays: number } | null;
	upcomingCount: number;
	ideas: BreakIdea[];
	/** For counting a planned range in the browser exactly as the API will. */
	weekOff: { rosters: WeekOffRosterShape[]; assignments: WeekOffAssignmentShape[] };
	/** Every holiday on the viewer's calendar from Jan this year, a year ahead. */
	calendar: { date: string; name: string }[];
	/** The viewer's own leave already booked, to flag overlaps when planning. */
	booked: { start: string; end: string; typeName: string; status: 'approved' | 'pending' }[];
	/** Leave types the viewer may apply for, for the plan sheet. */
	types: { id: string; name: string; tone: LeaveTone; compOff: boolean }[];
};

const pad = (n: number) => String(n).padStart(2, '0');

export function parseKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function toKey(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key: string, n: number): string {
	const d = parseKey(key);
	d.setDate(d.getDate() + n);
	return toKey(d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

/**
 * Long-weekend ideas: for each upcoming holiday, the fewest leave days that
 * join it to the week offs around it into a longer break. A holiday that
 * already touches a weekend is offered as a free long weekend. Days the
 * person has already booked are never suggested again.
 */
export function breakIdeas(opts: {
	today: string;
	until: string;
	holidays: { date: string; name: string }[];
	isWeekOff: (key: string) => boolean;
	isBooked: (key: string) => boolean;
	maxLeave?: number;
	limit?: number;
}): BreakIdea[] {
	const { today, until, isWeekOff, isBooked, maxLeave = 2, limit = 4 } = opts;
	const holidayName = new Map(opts.holidays.map((h) => [h.date, h.name]));
	const isFree = (k: string, extra: Set<string>) => isWeekOff(k) || holidayName.has(k) || extra.has(k);

	/** The run of free days around `k`, with `extra` counted as free too. */
	function runAround(k: string, extra: Set<string>) {
		let s = k;
		let e = k;
		while (isFree(addDays(s, -1), extra)) s = addDays(s, -1);
		while (isFree(addDays(e, 1), extra)) e = addDays(e, 1);
		return { s, e };
	}

	const ideas: BreakIdea[] = [];
	const seen = new Set<string>();
	const upcoming = [...holidayName.keys()].filter((d) => d > today && d <= until).sort();

	for (const h of upcoming) {
		const base = runAround(h, new Set());
		if (seen.has(base.s)) continue;
		seen.add(base.s);
		const baseLen = daysBetween(base.s, base.e) + 1;

		// Grow the break one working day at a time to the left and right.
		let best: { extra: Set<string>; s: string; e: string } | null = null;
		const ratio = (c: { extra: Set<string>; s: string; e: string }) => (daysBetween(c.s, c.e) + 1) / c.extra.size;
		for (let left = 0; left <= maxLeave; left++) {
			for (let right = 0; left + right <= maxLeave; right++) {
				if (left + right === 0) continue;
				const extra = new Set<string>();
				let run = base;
				let ok = true;
				for (let i = 0; i < left && ok; i++) {
					const d = addDays(run.s, -1);
					if (d <= today || isBooked(d)) ok = false;
					else {
						extra.add(d);
						run = runAround(h, extra);
					}
				}
				for (let i = 0; i < right && ok; i++) {
					const d = addDays(run.e, 1);
					if (d <= today || isBooked(d)) ok = false;
					else {
						extra.add(d);
						run = runAround(h, extra);
					}
				}
				if (!ok) continue;
				const cand = { extra, ...run };
				const len = daysBetween(cand.s, cand.e) + 1;
				// Worth suggesting only if the break is at least four days and
				// gives back two days or more for each one spent.
				if (len < 4 || len < extra.size + 2 || len - baseLen < 2) continue;
				if (!best || ratio(cand) > ratio(best) || (ratio(cand) === ratio(best) && len > daysBetween(best.s, best.e) + 1)) {
					best = cand;
				}
			}
		}

		// A holiday that already makes a long weekend is offered as it is,
		// unless spending leave buys at least three days off for each one.
		if (best && baseLen >= 3 && ratio(best) < 3) best = null;

		if (best) {
			ideas.push({
				holiday: holidayName.get(h)!,
				holidayDate: h,
				apply: leaveRanges([...best.extra].sort(), isWeekOff),
				leaveDays: best.extra.size,
				breakStart: best.s,
				breakEnd: best.e,
				breakDays: daysBetween(best.s, best.e) + 1
			});
		} else if (baseLen >= 3) {
			ideas.push({
				holiday: holidayName.get(h)!,
				holidayDate: h,
				apply: [],
				leaveDays: 0,
				breakStart: base.s,
				breakEnd: base.e,
				breakDays: baseLen
			});
		}
		if (ideas.length >= limit) break;
	}
	return ideas;
}

/**
 * Leave days to apply for, as ranges. Consecutive days share one range, and so
 * do days with only week offs between them (week offs inside a range are not
 * charged); a holiday between them splits the range, since it would be.
 */
export function leaveRanges(days: string[], isWeekOff: (key: string) => boolean): DayRange[] {
	const out: DayRange[] = [];
	for (const d of days) {
		const last = out.at(-1);
		if (last) {
			let k = addDays(last.end, 1);
			while (k < d && isWeekOff(k)) k = addDays(k, 1);
			if (k === d) {
				last.end = d;
				last.days++;
				continue;
			}
		}
		out.push({ start: d, end: d, days: 1 });
	}
	return out;
}
