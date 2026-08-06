import { describe, test, expect } from 'vitest';

/**
 * Balance arithmetic for reversing a leave decision.
 *
 * A Super Admin may overturn a decision that has already been made. The status
 * flip is trivial; the balance is not — an approval that is reversed has to give
 * the days back, and a rejection that is reversed has to spend them again. This
 * mirrors the computation in src/routes/api/leave/[id]/approve/+server.ts so the
 * signs and the clamp are pinned down without a database.
 */

type Status = 'pending' | 'approved' | 'rejected';

function balanceDeltaFor(previous: Status, next: 'approved' | 'rejected', days: number): number {
	const wasApproved = previous === 'approved';
	const nowApproved = next === 'approved';
	return (nowApproved ? days : 0) - (wasApproved ? days : 0);
}

/** usedDays after applying the delta, clamped the way the endpoint clamps it. */
function nextUsedDays(usedDays: number, delta: number): number {
	return Math.max(0, usedDays + delta);
}

describe('how a decision moves the balance', () => {
	test('approving a pending request spends the days', () => {
		expect(balanceDeltaFor('pending', 'approved', 3)).toBe(3);
	});

	test('rejecting a pending request spends nothing', () => {
		// Nothing was ever deducted, so there is nothing to give back.
		expect(balanceDeltaFor('pending', 'rejected', 3)).toBe(0);
	});

	test('reversing an approval refunds the days', () => {
		expect(balanceDeltaFor('approved', 'rejected', 3)).toBe(-3);
	});

	test('reversing a rejection spends the days', () => {
		expect(balanceDeltaFor('rejected', 'approved', 3)).toBe(3);
	});

	test('a half-day request refunds a half day', () => {
		expect(balanceDeltaFor('approved', 'rejected', 0.5)).toBe(-0.5);
	});
});

describe('applying the delta to usedDays', () => {
	test('an approval increases days used', () => {
		expect(nextUsedDays(4, 3)).toBe(7);
	});

	test('a reversal returns them', () => {
		expect(nextUsedDays(7, -3)).toBe(4);
	});

	test('a full round trip leaves the balance where it started', () => {
		// approve 3, then reverse it — the employee must be exactly where they were.
		const start = 5;
		const afterApprove = nextUsedDays(start, balanceDeltaFor('pending', 'approved', 3));
		const afterReverse = nextUsedDays(afterApprove, balanceDeltaFor('approved', 'rejected', 3));
		expect(afterApprove).toBe(8);
		expect(afterReverse).toBe(start);
	});

	test('re-approving after a reversal spends the days once, not twice', () => {
		let used = 5;
		used = nextUsedDays(used, balanceDeltaFor('pending', 'approved', 3)); // 8
		used = nextUsedDays(used, balanceDeltaFor('approved', 'rejected', 3)); // 5
		used = nextUsedDays(used, balanceDeltaFor('rejected', 'approved', 3)); // 8
		expect(used).toBe(8);
	});

	test('usedDays can never go negative', () => {
		// Defensive: if allocations were reset underneath a live application, a
		// refund must not mint days the employee was never allocated.
		expect(nextUsedDays(1, -3)).toBe(0);
		expect(nextUsedDays(0, -5)).toBe(0);
	});
});

describe('affordability when re-approving', () => {
	// The endpoint refuses a re-approval the balance no longer covers, because
	// the days may have been spent elsewhere while the request sat rejected.
	const canAfford = (allocated: number, used: number, delta: number) =>
		delta <= 0 || delta <= allocated - used;

	test('allowed when the balance covers it', () => {
		expect(canAfford(12, 5, 3)).toBe(true);
	});

	test('allowed when it exactly exhausts the balance', () => {
		expect(canAfford(12, 9, 3)).toBe(true);
	});

	test('refused when the balance falls short', () => {
		expect(canAfford(12, 10, 3)).toBe(false);
	});

	test('a refund is never blocked by affordability', () => {
		// Giving days back must always succeed, even from an overdrawn balance.
		expect(canAfford(12, 12, -3)).toBe(true);
	});
});

describe('which transitions are legal', () => {
	const REVERSIBLE: Status[] = ['approved', 'rejected'];
	const isReversal = (status: Status) => status !== 'pending';

	test('a pending decision is a first decision, not a reversal', () => {
		expect(isReversal('pending')).toBe(false);
	});

	test('approved and rejected are both reversible', () => {
		for (const s of REVERSIBLE) expect(isReversal(s)).toBe(true);
	});

	test('reversing to the state it is already in is a no-op to refuse', () => {
		// Guards against a double-click refunding twice.
		expect(balanceDeltaFor('approved', 'approved', 3)).toBe(0);
		expect(balanceDeltaFor('rejected', 'rejected', 3)).toBe(0);
	});
});
