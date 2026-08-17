import { describe, test, expect } from 'vitest';
import { cycleForKey, cycleDates, daysSoFar, workingDaysSoFar } from './attendance-cycle';

/**
 * The denominator behind "Present days — 9 of N".
 *
 * The payroll cycle runs 26th to 25th, so a cycle spans two months and the
 * count is not simply "days this month". Two functions exist deliberately:
 * `daysSoFar` counts every elapsed day, `workingDaysSoFar` excludes week offs.
 *
 * The attendance counter uses `daysSoFar`, because presence is credited for any
 * day with a check-in — week offs included. Pairing a numerator that counts
 * worked week offs with a denominator that excludes them could read as 17 of 16.
 */

// 26 Jul – 25 Aug 2026. Contains 7 Saturdays/Sundays in its first 23 days.
const AUG_2026 = cycleForKey('2026-08');

describe('the shape of a cycle', () => {
	test('runs from the 26th to the 25th', () => {
		const dates = cycleDates(AUG_2026);
		expect(dates[0]).toBe('2026-07-26');
		expect(dates[dates.length - 1]).toBe('2026-08-25');
	});
});

describe('daysSoFar — every elapsed day', () => {
	test('counts week offs as well as working days', () => {
		// 26 Jul → 17 Aug inclusive is 23 days, of which 7 are Sat/Sun.
		expect(daysSoFar(AUG_2026, new Date(2026, 7, 17))).toBe(23);
	});

	test('a completed cycle counts every day in it', () => {
		expect(daysSoFar(AUG_2026, new Date(2026, 7, 25))).toBe(cycleDates(AUG_2026).length);
	});

	test('the first day of the cycle counts as one', () => {
		expect(daysSoFar(AUG_2026, new Date(2026, 6, 26))).toBe(1);
	});

	test('a date before the cycle opens counts nothing', () => {
		expect(daysSoFar(AUG_2026, new Date(2026, 6, 25))).toBe(0);
	});

	test('a date past the cycle does not overcount', () => {
		// Someone viewing an old cycle must not get a total larger than the cycle.
		expect(daysSoFar(AUG_2026, new Date(2026, 8, 30))).toBe(cycleDates(AUG_2026).length);
	});
});

describe('workingDaysSoFar — week offs excluded', () => {
	test('excludes Saturday and Sunday by default', () => {
		// The same span as above, less its 7 week offs.
		expect(workingDaysSoFar(AUG_2026, new Date(2026, 7, 17))).toBe(16);
	});

	test('honours a roster that makes other days the week off', () => {
		// A Tue/Wed roster: the count must follow the employee's own roster rather
		// than assuming the weekend.
		const isWeekOff = (key: string) => {
			const [y, m, d] = key.split('-').map(Number);
			const dow = new Date(y, m - 1, d).getDay();
			return dow === 2 || dow === 3;
		};
		const total = daysSoFar(AUG_2026, new Date(2026, 7, 17));
		const working = workingDaysSoFar(AUG_2026, new Date(2026, 7, 17), isWeekOff);
		expect(working).toBeLessThan(total);
		// 23 days spans 3 full weeks plus 2 days, so 6 or 7 Tue/Wed fall inside.
		expect(total - working).toBeGreaterThanOrEqual(6);
	});

	test('never exceeds the all-days count for the same date', () => {
		const upTo = new Date(2026, 7, 17);
		expect(workingDaysSoFar(AUG_2026, upTo)).toBeLessThanOrEqual(daysSoFar(AUG_2026, upTo));
	});
});
