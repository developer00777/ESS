import { describe, test, expect } from 'vitest';
import { accrualStartMonth, accrualSinceBaseline } from './leave-accrual';

/**
 * A balance HR uploads is the opening figure, not the final one: earned leave
 * goes on accruing on top of it. The recompute runs on every page load, so the
 * arithmetic below has to be idempotent — the same month must never be credited
 * twice, no matter how many times the page is opened.
 */
describe('accrual on top of an HR-set balance', () => {
	const EL = 1.5; // days per month, per the published policy
	const sep = new Date('2026-09-02T10:00:00Z');

	test('adds nothing in the month the figure was uploaded', () => {
		// The figure is the balance as at upload, so September is already in it.
		expect(accrualSinceBaseline(sep, 0, 2026, 8, EL)).toBe(0);
	});

	test('adds one month in the month after', () => {
		expect(accrualSinceBaseline(sep, 0, 2026, 9, EL)).toBe(1.5);
	});

	test('accumulates month by month', () => {
		expect(accrualSinceBaseline(sep, 0, 2026, 10, EL)).toBe(3);
		expect(accrualSinceBaseline(sep, 0, 2026, 11, EL)).toBe(4.5);
	});

	/** Re-running in the same month must give the same answer, not a bigger one. */
	test('is idempotent — repeated recomputes do not compound', () => {
		const first = accrualSinceBaseline(sep, 0, 2026, 9, EL);
		const second = accrualSinceBaseline(sep, 0, 2026, 9, EL);
		expect(second).toBe(first);
		expect(39 + second).toBe(40.5);
	});

	test('never runs backwards if the clock does', () => {
		expect(accrualSinceBaseline(sep, 0, 2026, 7, EL)).toBe(0);
	});

	/**
	 * Someone confirmed in November accrues from November, so a figure uploaded
	 * in September earns nothing for the months they were still on probation.
	 */
	test('skips months the person was not yet eligible to accrue', () => {
		expect(accrualSinceBaseline(sep, 10, 2026, 10, EL)).toBe(0);
		expect(accrualSinceBaseline(sep, 10, 2026, 11, EL)).toBe(1.5);
	});

	test('adds nothing when the person accrues nothing this year', () => {
		expect(accrualSinceBaseline(sep, null, 2026, 11, EL)).toBe(0);
	});

	test('adds nothing for a baseline set in another year', () => {
		// Allocations are per calendar year; a 2025 baseline says nothing about
		// the 2026 row, which starts from the policy instead.
		expect(accrualSinceBaseline(new Date('2025-09-02T10:00:00Z'), 0, 2026, 11, EL)).toBe(0);
	});

	test('adds nothing when no baseline date was recorded', () => {
		expect(accrualSinceBaseline(null, 0, 2026, 11, EL)).toBe(0);
	});

	test('keeps half-day precision rather than drifting', () => {
		expect(accrualSinceBaseline(sep, 0, 2026, 11, 0.5)).toBe(1.5);
	});
});

describe('accrualStartMonth', () => {
	test('a joiner from an earlier year accrues from January', () => {
		expect(accrualStartMonth({ year: 2011, month: 7 }, 2026)).toBe(0);
	});

	test('a joiner this year accrues from their joining month', () => {
		expect(accrualStartMonth({ year: 2026, month: 5 }, 2026)).toBe(5);
	});

	test('a date in a later year accrues not at all', () => {
		expect(accrualStartMonth({ year: 2027, month: 0 }, 2026)).toBeNull();
	});

	test('no date on file falls back to January', () => {
		expect(accrualStartMonth(null, 2026)).toBe(0);
	});
});
