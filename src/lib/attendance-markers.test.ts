import { describe, test, expect } from 'vitest';
import { dayMarker } from './attendance-markers';

/**
 * Which single marker a day gets.
 *
 * The order is the whole point: a day can be several things at once (a week off
 * someone worked, a holiday they took leave on), and the marker has to name the
 * most specific true thing. Ranking regressions are silent — the calendar still
 * renders, it just tells the employee the wrong story about their day.
 */

const day = (over: Partial<Parameters<typeof dayMarker>[0]> = {}) => ({
	hasCheckIn: false,
	leaves: [],
	isHoliday: false,
	isAbsent: false,
	...over
});

describe('week off', () => {
	test('an ordinary week off is marked WO', () => {
		const m = dayMarker(day({ isWeekOff: true }));
		expect(m).toEqual({ letter: 'WO', tone: 'weekoff', label: 'Week off' });
	});

	test('working your week off reads as Present, not as a day off', () => {
		// Someone who badged in on their day off was at work; the week off is no
		// longer the most specific fact about that day.
		expect(dayMarker(day({ isWeekOff: true, hasCheckIn: true }))?.letter).toBe('P');
	});

	test('a holiday falling on a week off reads as the holiday', () => {
		// The more specific fact wins — every week off is expected, a public
		// holiday is not.
		expect(dayMarker(day({ isWeekOff: true, isHoliday: true }))?.letter).toBe('HO');
	});

	test('approved leave on a week off still reads as the leave', () => {
		const m = dayMarker(
			day({
				isWeekOff: true,
				leaves: [{ status: 'approved', typeName: 'Earned Leave', typeCode: 'EL', days: 1 }]
			})
		);
		expect(m?.tone).toBe('leave');
	});

	test('a week off is never an absence', () => {
		// The employee was not expected in, so isAbsent must not win.
		expect(dayMarker(day({ isWeekOff: true, isAbsent: true }))?.letter).toBe('WO');
	});

	test('ProHance activity on a week off reads as Present', () => {
		expect(dayMarker(day({ isWeekOff: true, prohanceMinutes: 300 }))?.letter).toBe('P');
	});
});

describe('the existing ranking is unchanged', () => {
	test('a plain working day with a check-in is Present', () => {
		expect(dayMarker(day({ hasCheckIn: true }))?.letter).toBe('P');
	});

	test('a holiday nobody worked is HO', () => {
		expect(dayMarker(day({ isHoliday: true }))?.letter).toBe('HO');
	});

	test('an unexplained missed working day is A', () => {
		expect(dayMarker(day({ isAbsent: true }))?.letter).toBe('A');
	});

	test('a plain future working day has no marker', () => {
		expect(dayMarker(day())).toBeNull();
	});

	test('approved leave outranks a check-in', () => {
		const m = dayMarker(
			day({
				hasCheckIn: true,
				leaves: [{ status: 'approved', typeName: 'Sick Leave', typeCode: 'SL', days: 1 }]
			})
		);
		expect(m?.tone).toBe('leave');
	});
});
