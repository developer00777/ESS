import { describe, test, expect } from 'vitest';
import {
	countsTowardCap,
	monthKeyOf,
	DEVIATION_MONTHLY_CAP,
	CAPPED_DEVIATION_REASONS,
	COMP_OFF_MIN_MINUTES,
	compOffExpiryFor
} from './comp-off';
import { DEVIATION_REASONS } from './ai/triage-deviation';

/**
 * SOP §2 rules for attendance-correction requests.
 *
 * The cap is the part that decides whether a request goes to HR alone or needs
 * the Reporting Manager too, so it is worth pinning down: which reasons count,
 * how a month is derived from the date, and where the boundary sits.
 */

describe('which reasons count toward the monthly cap', () => {
	// The SOP scopes the cap to biometric records — a server outage or a wrong
	// half-day marking is not the employee's doing and must not consume it.
	test.each(CAPPED_DEVIATION_REASONS)('%s counts', (reason) => {
		expect(countsTowardCap(reason)).toBe(true);
	});

	test.each([
		'prohance_mismatch',
		'system_server_issue',
		'machine_malfunction',
		'technical_error',
		'wrong_half_day',
		'wrong_absent',
		'incorrect_working_hours'
	])('%s does not count', (reason) => {
		expect(countsTowardCap(reason)).toBe(false);
	});

	test('an unknown reason never counts', () => {
		expect(countsTowardCap('not_a_real_reason')).toBe(false);
		expect(countsTowardCap('')).toBe(false);
	});

	test('every capped reason is a real deviation reason', () => {
		// Guards against a typo in the cap list silently disabling the cap for a
		// reason that looks covered.
		for (const reason of CAPPED_DEVIATION_REASONS) {
			expect(DEVIATION_REASONS).toContain(reason);
		}
	});
});

describe('the month a request is counted against', () => {
	test('comes from the date of the deviation, not today', () => {
		// A correction raised in August for a July day belongs to July's quota —
		// otherwise a backdated request would eat the wrong month's allowance.
		expect(monthKeyOf('2026-07-15')).toBe('2026-07');
		expect(monthKeyOf('2026-01-01')).toBe('2026-01');
		expect(monthKeyOf('2026-12-31')).toBe('2026-12');
	});
});

describe('the cap boundary', () => {
	// The endpoint computes `overCap = capped && priorCount >= DEVIATION_MONTHLY_CAP`.
	// Reproduced here so the off-by-one is pinned: 3 prior requests is the limit,
	// so the 4th escalates.
	const isOverCap = (capped: boolean, priorCount: number) =>
		capped && priorCount >= DEVIATION_MONTHLY_CAP;

	test('the first three biometric requests stay with HR', () => {
		expect(isOverCap(true, 0)).toBe(false);
		expect(isOverCap(true, 1)).toBe(false);
		expect(isOverCap(true, 2)).toBe(false);
	});

	test('the fourth needs the Reporting Manager as well', () => {
		expect(isOverCap(true, 3)).toBe(true);
		expect(isOverCap(true, 9)).toBe(true);
	});

	test('an uncapped reason is never escalated, however many exist', () => {
		// Someone with 3 biometric requests can still report a server outage
		// without it being treated as a fourth strike.
		expect(isOverCap(false, 3)).toBe(false);
		expect(isOverCap(false, 99)).toBe(false);
	});
});

describe('comp-off eligibility constants', () => {
	test('the SOP threshold is 7 hours', () => {
		expect(COMP_OFF_MIN_MINUTES).toBe(420);
	});

	test('a credit expires three months after the day worked', () => {
		expect(compOffExpiryFor('2026-08-15')).toBe('2026-11-15');
	});

	test('expiry crosses a year boundary correctly', () => {
		expect(compOffExpiryFor('2026-11-10')).toBe('2027-02-10');
	});

	test('expiry is the same calendar day regardless of timezone', () => {
		// Regression: the expiry was formatted with toISOString() after parsing at
		// local midnight, so east of UTC every credit expired a day early.
		expect(compOffExpiryFor('2026-08-15')).toBe('2026-11-15');
		expect(compOffExpiryFor('2026-05-20')).toBe('2026-08-20');
	});

	test('a day-31 start rolls into the next month when the target is shorter', () => {
		// Jan 31 + 3 months has no 31st in April, so Date rolls it to May 1.
		// Documented rather than "fixed" — it errs in the employee's favour.
		expect(compOffExpiryFor('2026-01-31')).toBe('2026-05-01');
	});
});
