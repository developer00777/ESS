import { describe, test, expect } from 'vitest';
import {
	rotationWeekIndex,
	isWeekOffUnder,
	assignmentOn,
	makeWeekOffResolver,
	describeRoster,
	rotationSummary,
	validateRosterInput,
	type WeekOffRosterShape
} from './week-off';

const fixed = (weekdays: number[]): WeekOffRosterShape => ({
	id: 'f',
	name: 'Fixed',
	pattern: 'fixed',
	weekdays,
	rotationWeeks: null,
	rotationAnchorDate: null
});

// Anchored to Sunday 2 Aug 2026, so week 1 is Aug 2–8.
const rotation = (weeks: number[][]): WeekOffRosterShape => ({
	id: 'r',
	name: 'Rotation',
	pattern: 'rotational',
	weekdays: null,
	rotationWeeks: weeks,
	rotationAnchorDate: '2026-08-02'
});

describe('rotation week index', () => {
	test('the anchor week is week 1', () => {
		expect(rotationWeekIndex('2026-08-02', '2026-08-02', 3)).toBe(0);
		expect(rotationWeekIndex('2026-08-08', '2026-08-02', 3)).toBe(0); // same week
	});

	test('advances one step per calendar week', () => {
		expect(rotationWeekIndex('2026-08-09', '2026-08-02', 3)).toBe(1);
		expect(rotationWeekIndex('2026-08-16', '2026-08-02', 3)).toBe(2);
	});

	test('wraps back to the start after a full cycle', () => {
		expect(rotationWeekIndex('2026-08-23', '2026-08-02', 3)).toBe(0);
		expect(rotationWeekIndex('2026-08-30', '2026-08-02', 3)).toBe(1);
	});

	test('counts backwards before the anchor without going negative', () => {
		// A roster anchored next month still has to resolve for dates already on
		// screen, so the modulo must stay inside the cycle.
		expect(rotationWeekIndex('2026-07-26', '2026-08-02', 3)).toBe(2);
		expect(rotationWeekIndex('2026-07-19', '2026-08-02', 3)).toBe(1);
	});
});

describe('is a date a week off', () => {
	test('fixed patterns match the weekday', () => {
		expect(isWeekOffUnder(fixed([0]), '2026-08-09')).toBe(true); // Sunday
		expect(isWeekOffUnder(fixed([0]), '2026-08-08')).toBe(false); // Saturday
		expect(isWeekOffUnder(fixed([0, 6]), '2026-08-08')).toBe(true);
	});

	test('a rotation uses that week of the cycle', () => {
		const r = rotation([[0], [0, 6], [5, 6]]);
		expect(isWeekOffUnder(r, '2026-08-08')).toBe(false); // wk1 Sat — worked
		expect(isWeekOffUnder(r, '2026-08-15')).toBe(true); // wk2 Sat — off
		expect(isWeekOffUnder(r, '2026-08-21')).toBe(true); // wk3 Fri — off
		expect(isWeekOffUnder(r, '2026-08-16')).toBe(false); // wk3 Sun — worked
	});

	test('a rotation week with no days off means a full week worked', () => {
		expect(isWeekOffUnder(rotation([[], [0]]), '2026-08-02')).toBe(false);
	});
});

describe('which assignment applies on a date', () => {
	const a1 = { rosterId: 'A', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' };
	const a2 = { rosterId: 'B', effectiveFrom: '2026-09-01', effectiveTo: null };

	test('picks the one covering the date', () => {
		expect(assignmentOn([a1, a2], '2026-08-15')?.rosterId).toBe('A');
		expect(assignmentOn([a1, a2], '2026-09-15')?.rosterId).toBe('B');
	});

	test('returns nothing before any assignment began', () => {
		expect(assignmentOn([a1, a2], '2026-07-15')).toBeNull();
	});

	test('the latest start wins when ranges overlap', () => {
		const overlapping = [
			{ rosterId: 'old', effectiveFrom: '2026-08-01', effectiveTo: null },
			{ rosterId: 'new', effectiveFrom: '2026-08-10', effectiveTo: null }
		];
		expect(assignmentOn(overlapping, '2026-08-20')?.rosterId).toBe('new');
		expect(assignmentOn(overlapping, '2026-08-05')?.rosterId).toBe('old');
	});
});

describe('resolver fallback', () => {
	test('an unknown roster id falls back to Saturday + Sunday', () => {
		// A dangling assignment must not silently give someone zero days off.
		const resolve = makeWeekOffResolver([], [
			{ rosterId: 'missing', effectiveFrom: '2026-01-01', effectiveTo: null }
		]);
		expect(resolve('2026-08-08')).toBe(true);
		expect(resolve('2026-08-10')).toBe(false);
	});
});

describe('human descriptions', () => {
	test('fixed patterns read in week order regardless of pick order', () => {
		expect(describeRoster(fixed([6, 0]))).toBe('Every Sun + Sat');
		expect(describeRoster(fixed([0]))).toBe('Every Sun');
	});

	test('a rotation reports its length', () => {
		expect(describeRoster(rotation([[0], [0, 6]]))).toBe('2-week rotation');
	});

	test('each rotation week is spelled out', () => {
		expect(rotationSummary(rotation([[0], [0, 6], []]))).toEqual([
			'Week 1: Sun',
			'Week 2: Sun + Sat',
			'Week 3: no off'
		]);
	});
});

describe('roster validation', () => {
	test('accepts a well-formed fixed roster', () => {
		expect(validateRosterInput({ name: 'Sundays', pattern: 'fixed', weekdays: [0] })).toBeNull();
	});

	test('accepts a well-formed rotation', () => {
		expect(
			validateRosterInput({
				name: 'Rot',
				pattern: 'rotational',
				rotationWeeks: [[0], [0, 6]],
				rotationAnchorDate: '2026-08-02'
			})
		).toBeNull();
	});

	const invalidCases: Array<{ label: string; input: Record<string, unknown> }> = [
		{ label: 'a blank name', input: { name: '   ', pattern: 'fixed', weekdays: [0] } },
		{ label: 'an unknown pattern', input: { name: 'x', pattern: 'weekly', weekdays: [0] } },
		{ label: 'a fixed roster with no days', input: { name: 'x', pattern: 'fixed', weekdays: [] } },
		{ label: 'duplicate weekdays', input: { name: 'x', pattern: 'fixed', weekdays: [0, 0] } },
		{ label: 'an out-of-range weekday', input: { name: 'x', pattern: 'fixed', weekdays: [7] } },
		{
			label: 'a 1-week rotation',
			input: { name: 'x', pattern: 'rotational', rotationWeeks: [[0]], rotationAnchorDate: '2026-08-02' }
		},
		{
			label: 'a rotation with no anchor date',
			input: { name: 'x', pattern: 'rotational', rotationWeeks: [[0], [6]] }
		}
	];

	test.each(invalidCases)('rejects $label', ({ input }) => {
		expect(validateRosterInput(input)).toBeTypeOf('string');
	});

	test('rejects a rotation longer than 12 weeks', () => {
		expect(
			validateRosterInput({
				name: 'x',
				pattern: 'rotational',
				rotationWeeks: Array.from({ length: 13 }, () => [0]),
				rotationAnchorDate: '2026-08-02'
			})
		).toBeTypeOf('string');
	});
});
