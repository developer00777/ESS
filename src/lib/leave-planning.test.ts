import { describe, test, expect } from 'vitest';
import { addDays, breakIdeas, daysBetween, leaveRanges } from './leave-planning';

const satSun = (k: string) => [0, 6].includes(new Date(k + 'T00:00:00').getDay());
const never = () => false;

function ideasFor(holidays: { date: string; name: string }[], isBooked: (k: string) => boolean = never) {
	return breakIdeas({ today: '2026-10-01', until: '2027-03-31', holidays, isWeekOff: satSun, isBooked });
}

describe('date helpers', () => {
	test('addDays crosses month and year ends', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
	});
	test('daysBetween counts whole days', () => {
		expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
		expect(daysBetween('2026-10-05', '2026-10-01')).toBe(-4);
	});
});

describe('breakIdeas', () => {
	test('a Tuesday holiday suggests taking the Monday for a four-day break', () => {
		const [idea] = ideasFor([{ date: '2026-11-10', name: 'Diwali' }]);
		expect(idea).toMatchObject({
			holiday: 'Diwali',
			apply: [{ start: '2026-11-09', end: '2026-11-09', days: 1 }],
			leaveDays: 1,
			breakStart: '2026-11-07',
			breakEnd: '2026-11-10',
			breakDays: 4
		});
	});

	test('a Thursday holiday suggests the Friday', () => {
		const [idea] = ideasFor([{ date: '2026-11-12', name: 'Bhai Dooj' }]);
		expect(idea.apply).toEqual([{ start: '2026-11-13', end: '2026-11-13', days: 1 }]);
		expect(idea.breakDays).toBe(4);
	});

	test('a Friday holiday is already a long weekend and needs no leave', () => {
		const [idea] = ideasFor([{ date: '2026-12-25', name: 'Christmas' }]);
		expect(idea).toMatchObject({ apply: [], leaveDays: 0, breakStart: '2026-12-25', breakEnd: '2026-12-27', breakDays: 3 });
	});

	test('never suggests a day already booked', () => {
		const ideas = ideasFor([{ date: '2026-11-10', name: 'Diwali' }], (k) => k === '2026-11-09');
		expect(ideas).toEqual([]);
	});

	test('skips holidays that have passed', () => {
		expect(ideasFor([{ date: '2026-10-01', name: 'Past' }])).toEqual([]);
	});

	test('two holidays in one break are suggested once', () => {
		const ideas = ideasFor([
			{ date: '2026-11-10', name: 'Diwali' },
			{ date: '2026-11-11', name: 'Govardhan Puja' }
		]);
		expect(ideas).toHaveLength(1);
		expect(ideas[0]).toMatchObject({ breakStart: '2026-11-07', breakEnd: '2026-11-11', leaveDays: 1, breakDays: 5 });
	});

	test('honours the limit', () => {
		const ideas = breakIdeas({
			today: '2026-10-01',
			until: '2027-03-31',
			holidays: [
				{ date: '2026-11-10', name: 'A' },
				{ date: '2026-12-25', name: 'B' },
				{ date: '2027-01-26', name: 'C' }
			],
			isWeekOff: satSun,
			isBooked: never,
			limit: 2
		});
		expect(ideas.map((i) => i.holiday)).toEqual(['A', 'B']);
	});
});

describe('leaveRanges', () => {
	test('joins days separated only by week offs, so one request covers them', () => {
		expect(leaveRanges(['2026-11-06', '2026-11-09'], satSun)).toEqual([{ start: '2026-11-06', end: '2026-11-09', days: 2 }]);
	});
	test('keeps days apart when a working day sits between them', () => {
		expect(leaveRanges(['2026-11-09', '2026-11-11'], satSun)).toEqual([
			{ start: '2026-11-09', end: '2026-11-09', days: 1 },
			{ start: '2026-11-11', end: '2026-11-11', days: 1 }
		]);
	});
});
