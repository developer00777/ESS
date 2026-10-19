import { describe, test, expect } from 'vitest';
import { absenceSeries, ageBand, ageOn, engagementScore, genderOf, headcountSeries, monthsBack } from './hr-analytics';

describe('monthsBack', () => {
	test('lists the last n months oldest first, across a year end', () => {
		const m = monthsBack('2026-02-14', 3);
		expect(m.map((x) => x.key)).toEqual(['2025-12', '2026-01', '2026-02']);
		expect(m[0]).toMatchObject({ start: '2025-12-01', end: '2025-12-31', label: 'Dec ’25' });
		expect(m[2].end).toBe('2026-02-28');
	});
});

describe('people', () => {
	test('genderOf folds free text into four groups', () => {
		expect(['F', 'female', ' Woman '].map(genderOf)).toEqual(['Female', 'Female', 'Female']);
		expect(['M', 'Male'].map(genderOf)).toEqual(['Male', 'Male']);
		expect(genderOf('Non-binary')).toBe('Other');
		expect(genderOf(null)).toBe('Not recorded');
		expect(genderOf('  ')).toBe('Not recorded');
	});

	test('ageOn counts whole years and refuses implausible dates', () => {
		expect(ageOn('1990-10-20', '2026-10-19')).toBe(35);
		expect(ageOn('1990-10-19', '2026-10-19')).toBe(36);
		expect(ageOn('2020-01-01', '2026-10-19')).toBeNull();
		expect(ageOn(null, '2026-10-19')).toBeNull();
	});

	test('ageBand edges', () => {
		expect([24, 25, 34, 35, 44, 45, 54, 55].map(ageBand)).toEqual(['Under 25', '25–34', '25–34', '35–44', '35–44', '45–54', '45–54', '55+']);
	});
});

describe('headcountSeries', () => {
	const months = monthsBack('2026-03-31', 3); // Jan, Feb, Mar
	test('counts hires and exits in their month and headcount at month end', () => {
		const people = [
			{ hired: '2025-06-01', exited: null },
			{ hired: '2025-06-01', exited: '2026-02-10' },
			{ hired: '2026-01-15', exited: null },
			{ hired: '2026-03-01', exited: null }
		];
		const s = headcountSeries(people, months);
		expect(s.map((p) => [p.hires, p.exits, p.headcount])).toEqual([
			[1, 0, 3],
			[0, 1, 2],
			[1, 0, 3]
		]);
		// Feb: 1 exit over an average of (3 + 2) / 2 people = 40%.
		expect(s[1].turnover).toBe(40);
	});
});

describe('absenceSeries', () => {
	const months = monthsBack('2026-03-31', 1); // March 2026
	const weekend = (d: string) => [0, 6].includes(new Date(d + 'T00:00:00').getDay());
	const person = (id: string) => ({ id, hired: '2025-01-01', exited: null, isOff: weekend, isHoliday: (d: string) => d === '2026-03-04' });

	test('splits scheduled days into leave and unplanned, only judging feed days', () => {
		const leaveDays = new Set(['a:2026-03-02', 'a:2026-03-03']);
		const punches = new Set(['b:2026-03-02']);
		const [p] = absenceSeries([person('a'), person('b')], months, '2026-03-03', {
			onLeave: (id, d) => leaveDays.has(`${id}:${d}`),
			punched: (id, d) => punches.has(`${id}:${d}`),
			// The feed ran on the 2nd only.
			feedDay: (d) => d === '2026-03-02'
		});
		// Mon 2 and Tue 3 are working days (the 1st is a Sunday), for two people.
		expect(p.scheduled).toBe(4);
		expect(p.leave).toBe(50);
		// On the 2nd: a on leave, b punched — nobody missing.
		expect(p.unplanned).toBe(0);
		expect(p.showUp).toBe(100);
	});

	test('a month with no feed days has no unplanned figure', () => {
		const [p] = absenceSeries([person('a')], months, '2026-03-31', { onLeave: () => false, punched: () => false, feedDay: () => false });
		expect(p.unplanned).toBeNull();
		expect(p.showUp).toBeNull();
		// 22 weekdays in March 2026, less the holiday on the 4th.
		expect(p.scheduled).toBe(21);
	});
});

describe('engagementScore', () => {
	test('averages the parts that have data', () => {
		expect(engagementScore({ attendance: 90, chat: 60, reads: null, tasksOnTime: 75 })).toBe(75);
		expect(engagementScore({ attendance: null, chat: null, reads: null, tasksOnTime: null })).toBeNull();
	});
});
