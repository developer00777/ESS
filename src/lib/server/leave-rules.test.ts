import { describe, test, expect } from 'vitest';
import { checkPinkLeaveEligibility, isConfirmed, monthBounds } from './leave-eligibility';
import { makeWeekOffResolver, workingDaysInRange, DEFAULT_WEEKDAYS_OFF } from '$lib/week-off';

/**
 * Leave application rules: how many days a request costs, who may take a
 * restricted type, and how a monthly quota is bounded.
 *
 * The day-count is the money question — it is what gets deducted from a
 * balance — and it now depends on the employee's week-off roster rather than a
 * fixed weekend, so both paths are covered.
 */

const profile = (over: Partial<Parameters<typeof checkPinkLeaveEligibility>[0]> = {}) => ({
	gender: 'Female',
	dateOfJoining: '2020-01-01',
	dateOfConfirmation: '2020-07-01',
	pinkLeaveEligibleOverride: null,
	...over
});

describe('how many days a leave request costs', () => {
	// Aug 2026: 7th Fri, 8th Sat, 9th Sun, 10th Mon.
	const defaultOff = makeWeekOffResolver([], []);

	test('a plain weekend is not charged on the default roster', () => {
		expect(workingDaysInRange('2026-08-07', '2026-08-10', defaultOff)).toBe(2); // Fri + Mon
	});

	test('a single working day costs one day', () => {
		expect(workingDaysInRange('2026-08-07', '2026-08-07', defaultOff)).toBe(1);
	});

	test('a request wholly inside the weekend costs nothing', () => {
		expect(workingDaysInRange('2026-08-08', '2026-08-09', defaultOff)).toBe(0);
	});

	test('a Sunday-only employee is charged for Saturdays', () => {
		// The case the old hardcoded Sat/Sun got wrong: someone on a six-day week
		// must lose a day of balance for the Saturday inside their leave.
		const sundaysOnly = makeWeekOffResolver(
			[
				{
					id: 'r1',
					name: 'All Sundays',
					pattern: 'fixed',
					weekdays: [0],
					rotationWeeks: null,
					rotationAnchorDate: null
				}
			],
			[{ rosterId: 'r1', effectiveFrom: '2026-08-01', effectiveTo: null }]
		);
		expect(workingDaysInRange('2026-08-07', '2026-08-10', sundaysOnly)).toBe(3); // Fri, Sat, Mon
	});

	test('a rotation charges each week by its own pattern', () => {
		// wk1 (Aug 2-8) = Sun off; wk2 (Aug 9-15) = Sun + Sat off.
		// So Sat Aug 8 is a working day but Sat Aug 15 is not.
		const rotating = makeWeekOffResolver(
			[
				{
					id: 'r2',
					name: 'Support Rotation',
					pattern: 'rotational',
					weekdays: null,
					rotationWeeks: [[0], [0, 6]],
					rotationAnchorDate: '2026-08-02'
				}
			],
			[{ rosterId: 'r2', effectiveFrom: '2026-08-01', effectiveTo: null }]
		);
		expect(rotating('2026-08-08')).toBe(false); // week 1 — Saturday is worked
		expect(rotating('2026-08-15')).toBe(true); // week 2 — Saturday is off
		expect(workingDaysInRange('2026-08-07', '2026-08-10', rotating)).toBe(3);
	});

	test('an employee with no roster keeps the Saturday + Sunday default', () => {
		expect(DEFAULT_WEEKDAYS_OFF).toEqual([0, 6]);
		expect(defaultOff('2026-08-08')).toBe(true);
		expect(defaultOff('2026-08-09')).toBe(true);
		expect(defaultOff('2026-08-10')).toBe(false);
	});

	test('dates outside an assignment fall back to the default', () => {
		// Leave taken before the roster took effect must not be counted under it.
		const fromAugust = makeWeekOffResolver(
			[
				{
					id: 'r3',
					name: 'All Sundays',
					pattern: 'fixed',
					weekdays: [0],
					rotationWeeks: null,
					rotationAnchorDate: null
				}
			],
			[{ rosterId: 'r3', effectiveFrom: '2026-08-01', effectiveTo: null }]
		);
		expect(fromAugust('2026-07-25')).toBe(true); // Saturday, before the roster — default applies
		expect(fromAugust('2026-08-08')).toBe(false); // Saturday, under the roster — worked
	});
});

describe('which leave types accrue a balance', () => {
	/**
	 * Mirrors the filter in ensureLeaveAllocations. Two rules, both learned the
	 * hard way: a published pink-leave policy arrived with BOTH an accrual and a
	 * monthly quota set, and the accrual loop never looked at gender — so every
	 * employee, male and unrecorded alike, was handed 8 days of pink leave.
	 */
	const accrues = (t: {
		code?: string | null;
		accrualPerMonth: number;
		monthlyQuotaDays?: number | null;
	}) => Boolean(t.code) && t.accrualPerMonth > 0 && t.monthlyQuotaDays == null;

	test('an ordinary accruing type accrues', () => {
		expect(accrues({ code: 'EL', accrualPerMonth: 1.5 })).toBe(true);
	});

	test('a monthly-quota type never does, even with an accrual set', () => {
		// The quota wins: it refreshes and lapses rather than building up.
		expect(accrues({ code: 'PINK', accrualPerMonth: 1, monthlyQuotaDays: 1 })).toBe(false);
	});

	test('an event-based type with no accrual does not', () => {
		expect(accrues({ code: 'MATERNITY', accrualPerMonth: 0 })).toBe(false);
	});

	test('a seed placeholder with no code does not', () => {
		expect(accrues({ code: null, accrualPerMonth: 1.5 })).toBe(false);
	});
});

describe('who a gender-restricted leave accrues for', () => {
	const grants = (
		type: { genderEligibility: string | null },
		profile: { gender: string | null; pinkLeaveEligibleOverride: boolean | null }
	) => {
		if (!type.genderEligibility) return true;
		if (profile.pinkLeaveEligibleOverride === false) return false;
		if (profile.pinkLeaveEligibleOverride === true) return true;
		return (profile.gender ?? '').trim().toLowerCase() === type.genderEligibility.toLowerCase();
	};

	const pink = { genderEligibility: 'female' };
	const p = (gender: string | null, override: boolean | null = null) => ({
		gender,
		pinkLeaveEligibleOverride: override
	});

	test('a female employee gets it', () => {
		expect(grants(pink, p('Female'))).toBe(true);
		expect(grants(pink, p('female'))).toBe(true);
	});

	test('a male employee does not', () => {
		expect(grants(pink, p('Male'))).toBe(false);
	});

	test('an unrecorded gender does not', () => {
		// The production roster is mostly blank here; granting on blank is exactly
		// how it reached everyone.
		expect(grants(pink, p(null))).toBe(false);
		expect(grants(pink, p(''))).toBe(false);
	});

	test('an HR grant overrides a blank or wrong gender', () => {
		expect(grants(pink, p(null, true))).toBe(true);
		expect(grants(pink, p('Male', true))).toBe(true);
	});

	test('an HR withholding beats a matching gender', () => {
		expect(grants(pink, p('Female', false))).toBe(false);
	});

	test('an unrestricted type reaches everyone', () => {
		expect(grants({ genderEligibility: null }, p(null))).toBe(true);
	});
});

describe('pink leave eligibility', () => {
	test('a confirmed female employee is eligible', () => {
		expect(checkPinkLeaveEligibility(profile()).eligible).toBe(true);
	});

	test('an HR grant overrides every inferred rule', () => {
		// The rule alone would exclude this profile on both gender and tenure.
		const verdict = checkPinkLeaveEligibility(
			profile({ gender: null, dateOfJoining: null, dateOfConfirmation: null, pinkLeaveEligibleOverride: true })
		);
		expect(verdict.eligible).toBe(true);
		expect(verdict.reason).toBe('granted_by_hr');
	});

	test('an HR withholding overrides eligibility', () => {
		const verdict = checkPinkLeaveEligibility(profile({ pinkLeaveEligibleOverride: false }));
		expect(verdict.eligible).toBe(false);
		expect(verdict.reason).toBe('withheld_by_hr');
	});

	test('an unconfirmed employee is not yet eligible', () => {
		const verdict = checkPinkLeaveEligibility(
			profile({ dateOfJoining: '2026-07-01', dateOfConfirmation: null }),
			new Date('2026-08-06')
		);
		expect(verdict.eligible).toBe(false);
		expect(verdict.reason).toBe('not_confirmed');
	});

	test('a missing profile is refused rather than assumed eligible', () => {
		expect(checkPinkLeaveEligibility(null).eligible).toBe(false);
	});

	test('unknown tenure is distinguished from being unconfirmed', () => {
		// HR needs to tell "too new" apart from "we never recorded the date", since
		// only the second is fixed by filling in a field.
		const verdict = checkPinkLeaveEligibility(
			profile({ dateOfJoining: null, dateOfConfirmation: null })
		);
		expect(verdict.reason).toBe('unknown_tenure');
	});
});

describe('confirmation fallback', () => {
	test('a recorded confirmation date wins', () => {
		expect(isConfirmed({ dateOfJoining: '2026-01-01', dateOfConfirmation: '2026-02-01' }, new Date('2026-03-01')))
			.toEqual({ confirmed: true, known: true });
	});

	test('without one, joining + 6 months stands in', () => {
		// So a missing HR field does not block someone who has clearly served.
		expect(isConfirmed({ dateOfJoining: '2026-01-01', dateOfConfirmation: null }, new Date('2026-08-01')))
			.toEqual({ confirmed: true, known: true });
		expect(isConfirmed({ dateOfJoining: '2026-01-01', dateOfConfirmation: null }, new Date('2026-03-01')))
			.toEqual({ confirmed: false, known: true });
	});

	test('neither date recorded reads as unknown, not zero tenure', () => {
		expect(isConfirmed({ dateOfJoining: null, dateOfConfirmation: null }))
			.toEqual({ confirmed: false, known: false });
	});
});

describe('monthly quota bounds', () => {
	test('covers the whole calendar month', () => {
		expect(monthBounds(new Date(2026, 7, 15))).toEqual({ start: '2026-08-01', end: '2026-08-31' });
	});

	test('handles a 30-day month and February', () => {
		expect(monthBounds(new Date(2026, 3, 10)).end).toBe('2026-04-30');
		expect(monthBounds(new Date(2026, 1, 10)).end).toBe('2026-02-28');
	});

	test('handles a leap February', () => {
		expect(monthBounds(new Date(2028, 1, 10)).end).toBe('2028-02-29');
	});
});
