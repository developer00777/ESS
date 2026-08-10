import { describe, test, expect } from 'vitest';
import { isCompOffLeaveCode } from './server/comp-off';

describe('recognising the comp-off leave type', () => {
	// The live policy publishes 'COMP_OFF'. An exact-match on one spelling meant
	// the other silently spent a leave allocation instead of a credit — wrong in
	// a way nothing surfaces, since the request still succeeds.
	test.each(['COMP_OFF', 'COMPOFF', 'comp_off', 'comp-off', 'Comp Off'])(
		'%s is comp-off leave',
		(code) => {
			expect(isCompOffLeaveCode(code)).toBe(true);
		}
	);

	test.each(['EL', 'SL', 'MATERNITY', 'COMP', '', null, undefined])(
		'%s is not',
		(code) => {
			expect(isCompOffLeaveCode(code)).toBe(false);
		}
	);
});

/**
 * Spending comp-off credits.
 *
 * A credit is earned by working a holiday or week off, approved by the
 * reporting manager, and then spent by applying for Comp-Off leave — one credit
 * per day, inside a three-month window. The selection rule and the reservation
 * lifecycle are what this covers; both decide whether a credit is silently lost.
 */

interface Credit {
	id: string;
	status: 'pending' | 'approved' | 'used' | 'lapsed' | 'rejected';
	expiresOn: string;
}

/** Mirrors spendableCredits(): approved, unexpired, soonest expiry first. */
function spendable(credits: Credit[], onDate: string): Credit[] {
	return credits
		.filter((c) => c.status === 'approved' && c.expiresOn >= onDate)
		.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

const credit = (id: string, expiresOn: string, status: Credit['status'] = 'approved'): Credit => ({
	id,
	status,
	expiresOn
});

describe('withdrawing your own claim', () => {
	/**
	 * Mirrors the DELETE endpoint. The line that matters: a credited comp-off is
	 * a real balance the employee may already have spent, so withdrawing it would
	 * silently take back leave that was granted. That is HR's to reverse, not the
	 * claimant's to delete.
	 */
	const canWithdraw = (
		credit: { userId: string; status: string; usedApplicationId?: string | null },
		actorId: string
	) => {
		if (credit.userId !== actorId) return false;
		if (credit.status === 'used' || credit.usedApplicationId) return false;
		return credit.status === 'pending' || credit.status === 'manager_approved';
	};

	const mine = (status: string, usedApplicationId: string | null = null) => ({
		userId: 'me',
		status,
		usedApplicationId
	});

	test('an undecided claim can be withdrawn', () => {
		expect(canWithdraw(mine('pending'), 'me')).toBe(true);
	});

	test('one the manager has signed off can still be withdrawn', () => {
		// Nothing has been credited yet, so there is no balance to take back.
		expect(canWithdraw(mine('manager_approved'), 'me')).toBe(true);
	});

	test('a credited comp-off cannot — that is HR reversing a decision', () => {
		expect(canWithdraw(mine('approved'), 'me')).toBe(false);
	});

	test('one already spent on leave cannot', () => {
		expect(canWithdraw(mine('used', 'leave-1'), 'me')).toBe(false);
		// Belt and braces: the link alone blocks it even if the status lagged.
		expect(canWithdraw(mine('approved', 'leave-1'), 'me')).toBe(false);
	});

	test('a lapsed or rejected claim cannot', () => {
		expect(canWithdraw(mine('lapsed'), 'me')).toBe(false);
		expect(canWithdraw(mine('rejected'), 'me')).toBe(false);
	});

	test('you cannot withdraw somebody else’s claim', () => {
		// A manager rejects; they do not delete, which would look like a decision
		// without being recorded as one.
		expect(canWithdraw({ userId: 'someone', status: 'pending' }, 'me')).toBe(false);
	});
});

describe('which credits can be spent', () => {
	test('only approved credits count', () => {
		const credits = [
			credit('a', '2026-11-01', 'pending'),
			credit('b', '2026-11-01'),
			credit('c', '2026-11-01', 'used'),
			credit('d', '2026-11-01', 'lapsed'),
			credit('e', '2026-11-01', 'rejected')
		];
		expect(spendable(credits, '2026-08-15').map((c) => c.id)).toEqual(['b']);
	});

	test('an expired credit is not spendable', () => {
		const credits = [credit('old', '2026-08-01'), credit('live', '2026-11-01')];
		expect(spendable(credits, '2026-08-15').map((c) => c.id)).toEqual(['live']);
	});

	test('a credit expiring on the day itself is still usable', () => {
		// The window is inclusive — losing the last day would be an off-by-one that
		// silently costs the employee a day.
		expect(spendable([credit('x', '2026-08-15')], '2026-08-15').map((c) => c.id)).toEqual(['x']);
	});
});

describe('which credit is spent first', () => {
	test('the one closest to expiring', () => {
		// Spending a newer credit first would let an older one lapse unused.
		const credits = [
			credit('nov', '2026-11-01'),
			credit('sep', '2026-09-01'),
			credit('oct', '2026-10-01')
		];
		expect(spendable(credits, '2026-08-15').map((c) => c.id)).toEqual(['sep', 'oct', 'nov']);
	});

	test('a multi-day request takes them in that order', () => {
		const credits = [
			credit('nov', '2026-11-01'),
			credit('sep', '2026-09-01'),
			credit('oct', '2026-10-01')
		];
		expect(spendable(credits, '2026-08-15').slice(0, 2).map((c) => c.id)).toEqual(['sep', 'oct']);
	});
});

describe('how many credits a request needs', () => {
	const canAfford = (available: number, days: number) => available >= days;

	test('one credit per day of leave', () => {
		expect(canAfford(3, 3)).toBe(true);
		expect(canAfford(2, 3)).toBe(false);
	});

	test('no credits means no comp-off leave', () => {
		expect(canAfford(0, 1)).toBe(false);
	});

	test('spare credits are fine', () => {
		expect(canAfford(5, 2)).toBe(true);
	});
});

describe('the reservation lifecycle', () => {
	// Credits are consumed when the leave is applied for, not when it is
	// approved — otherwise the same credit could back two pending requests.
	function apply(credits: Credit[], days: number, onDate: string): Credit[] {
		const spending = spendable(credits, onDate).slice(0, days);
		const spent = new Set(spending.map((c) => c.id));
		return credits.map((c) => (spent.has(c.id) ? { ...c, status: 'used' as const } : c));
	}

	function release(credits: Credit[]): Credit[] {
		return credits.map((c) => (c.status === 'used' ? { ...c, status: 'approved' as const } : c));
	}

	test('applying reserves the credits immediately', () => {
		const after = apply([credit('a', '2026-09-01'), credit('b', '2026-10-01')], 1, '2026-08-15');
		expect(after.find((c) => c.id === 'a')?.status).toBe('used');
		expect(after.find((c) => c.id === 'b')?.status).toBe('approved');
	});

	test('a reserved credit cannot back a second request', () => {
		const after = apply([credit('a', '2026-09-01')], 1, '2026-08-15');
		expect(spendable(after, '2026-08-15')).toHaveLength(0);
	});

	test('rejecting the leave hands the credits back', () => {
		const applied = apply([credit('a', '2026-09-01')], 1, '2026-08-15');
		const released = release(applied);
		expect(spendable(released, '2026-08-15').map((c) => c.id)).toEqual(['a']);
	});

	test('a full apply-reject-reapply cycle spends exactly one credit', () => {
		let credits = [credit('a', '2026-09-01'), credit('b', '2026-10-01')];
		credits = apply(credits, 1, '2026-08-15');
		credits = release(credits);
		credits = apply(credits, 1, '2026-08-15');
		expect(credits.filter((c) => c.status === 'used')).toHaveLength(1);
		expect(spendable(credits, '2026-08-15')).toHaveLength(1);
	});
});

describe('the displayed balance', () => {
	// The tally must not offer a credit that applying would then refuse.
	const availableCount = (credits: Credit[], today: string) => spendable(credits, today).length;

	test('excludes credits that have passed their expiry', () => {
		const credits = [credit('old', '2026-08-01'), credit('live', '2026-12-01')];
		expect(availableCount(credits, '2026-08-15')).toBe(1);
	});

	test('excludes credits already spent', () => {
		expect(availableCount([credit('a', '2026-12-01', 'used')], '2026-08-15')).toBe(0);
	});

	test('excludes claims still awaiting the manager', () => {
		expect(availableCount([credit('a', '2026-12-01', 'pending')], '2026-08-15')).toBe(0);
	});
});
