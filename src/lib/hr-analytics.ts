/**
 * The arithmetic behind Admin → HR analytics, kept free of the database so
 * every figure on that page can be tested. The loader
 * (src/lib/server/hr-analytics.ts) gathers rows; these turn them into series.
 *
 * Definitions, as the page states them:
 * - Headcount at a month's end: joined on or before it and not yet left.
 * - Turnover: exits in the month ÷ the average of the opening and closing
 *   headcount.
 * - Unplanned absence: scheduled working days with no punch and no approved
 *   leave ÷ scheduled working days — counted only on days the attendance
 *   feed has any punch at all, so a day the feed missed isn't read as
 *   everyone being absent.
 * - Leave: approved leave days ÷ scheduled working days.
 * - Engagement: the mean of whichever of these exist that month — turned up
 *   when expected, posted in chat, read company-wide announcements, finished
 *   tasks by their due date.
 */

export type MonthSlot = { key: string; start: string; end: string; label: string };

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last `n` calendar months, oldest first, ending with the month holding `today`. */
export function monthsBack(today: string, n: number): MonthSlot[] {
	const [y, m] = today.split('-').map(Number);
	const out: MonthSlot[] = [];
	for (let i = n - 1; i >= 0; i--) {
		const first = new Date(y, m - 1 - i, 1);
		const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
		out.push({
			key: keyOf(first).slice(0, 7),
			start: keyOf(first),
			end: keyOf(last),
			label: `${MONTHS[first.getMonth()]} ’${String(first.getFullYear()).slice(2)}`
		});
	}
	return out;
}

export function addDays(key: string, n: number): string {
	const [y, m, d] = key.split('-').map(Number);
	return keyOf(new Date(y, m - 1, d + n));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------------- people ---------------- */

export type GenderLabel = 'Female' | 'Male' | 'Other' | 'Not recorded';

/** Free-text gender from the HR sheet, folded to the four groups the page shows. */
export function genderOf(raw: string | null | undefined): GenderLabel {
	const g = (raw ?? '').trim().toLowerCase();
	if (!g) return 'Not recorded';
	if (['f', 'female', 'woman', 'women'].includes(g)) return 'Female';
	if (['m', 'male', 'man', 'men'].includes(g)) return 'Male';
	return 'Other';
}

export const AGE_BANDS = ['Under 25', '25–34', '35–44', '45–54', '55+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Whole years between a date of birth and `today`; null when unknown or implausible. */
export function ageOn(dob: string | null | undefined, today: string): number | null {
	if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
	const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number);
	const [ty, tm, td] = today.split('-').map(Number);
	const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
	return age >= 14 && age <= 90 ? age : null;
}

export function ageBand(age: number): AgeBand {
	return age < 25 ? 'Under 25' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : '55+';
}

/* ---------------- headcount, hires, exits ---------------- */

export type Tenure = { hired: string; exited: string | null };

export type HeadcountPoint = { key: string; label: string; headcount: number; hires: number; exits: number; turnover: number };

export function headcountSeries(people: Tenure[], months: MonthSlot[]): HeadcountPoint[] {
	const at = (day: string) => people.filter((p) => p.hired <= day && (!p.exited || p.exited > day)).length;
	return months.map((m) => {
		const opening = at(addDays(m.start, -1));
		const closing = at(m.end);
		const hires = people.filter((p) => p.hired >= m.start && p.hired <= m.end).length;
		const exits = people.filter((p) => p.exited && p.exited >= m.start && p.exited <= m.end).length;
		const avg = (opening + closing) / 2;
		return { key: m.key, label: m.label, headcount: closing, hires, exits, turnover: avg > 0 ? round1((exits / avg) * 100) : 0 };
	});
}

/* ---------------- absence ---------------- */

export type AbsencePerson = Tenure & {
	id: string;
	isOff: (day: string) => boolean;
	isHoliday: (day: string) => boolean;
};

export type AbsencePoint = {
	key: string;
	label: string;
	/** % of scheduled days on feed days with no punch and no leave; null with no feed days. */
	unplanned: number | null;
	/** % of scheduled days on approved leave. */
	leave: number;
	/** % of scheduled days, on feed days, with a punch or leave: turned up when expected. */
	showUp: number | null;
	scheduled: number;
};

export function absenceSeries(
	people: AbsencePerson[],
	months: MonthSlot[],
	today: string,
	lookups: { onLeave: (id: string, day: string) => boolean; punched: (id: string, day: string) => boolean; feedDay: (day: string) => boolean }
): AbsencePoint[] {
	return months.map((m) => {
		let scheduled = 0;
		let leave = 0;
		let feedScheduled = 0;
		let unplanned = 0;
		const last = m.end < today ? m.end : today;
		for (let d = m.start; d <= last; d = addDays(d, 1)) {
			const feed = lookups.feedDay(d);
			for (const p of people) {
				if (p.hired > d || (p.exited && p.exited <= d)) continue;
				if (p.isOff(d) || p.isHoliday(d)) continue;
				scheduled++;
				const away = lookups.onLeave(p.id, d);
				if (away) leave++;
				if (!feed) continue;
				feedScheduled++;
				if (!away && !lookups.punched(p.id, d)) unplanned++;
			}
		}
		return {
			key: m.key,
			label: m.label,
			unplanned: feedScheduled ? round1((unplanned / feedScheduled) * 100) : null,
			leave: scheduled ? round1((leave / scheduled) * 100) : 0,
			showUp: feedScheduled ? round1(((feedScheduled - unplanned) / feedScheduled) * 100) : null,
			scheduled
		};
	});
}

/* ---------------- engagement ---------------- */

export type EngagementParts = {
	/** Turned up when expected, %. */
	attendance: number | null;
	/** People who posted in chat, % of headcount. */
	chat: number | null;
	/** Company-wide announcements read, % of possible reads. */
	reads: number | null;
	/** Tasks due that month finished by their due date, %. */
	tasksOnTime: number | null;
};

/** The mean of whichever parts have data; null when none do. */
export function engagementScore(parts: EngagementParts): number | null {
	const have = Object.values(parts).filter((v): v is number => v !== null);
	return have.length ? round1(have.reduce((s, v) => s + v, 0) / have.length) : null;
}

export const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);
