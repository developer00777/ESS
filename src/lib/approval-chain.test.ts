import { describe, test, expect } from 'vitest';

/**
 * Who reviews whose request.
 *
 * Routing follows the reporting line, not role. The rule that matters is the
 * one that was previously missing: a Super Admin's own request goes to *their*
 * manager, so it can never sit pending with nobody able to see it.
 *
 * Mirrors canReviewStage()/reviewableUserIds() so the routing is pinned without
 * a database.
 */

interface Person {
	id: string;
	role: 'employee' | 'team_lead' | 'admin' | 'super_admin';
	managerId: string | null;
	/** The named concerned HR, when a Super Admin has assigned one. */
	hrId?: string | null;
}

const HR_ROLES = ['admin', 'super_admin'];
const isHr = (role: string) => HR_ROLES.includes(role);

function canReview(actor: Person, requester: Person, stage: 'manager' | 'hr'): boolean {
	if (actor.id === requester.id) return false; // never your own
	const isSuperAdmin = actor.role === 'super_admin';

	// An explicit assignment routes the request to that person. Admins are the
	// fallback only when nobody is named; a Super Admin keeps an override so a
	// request cannot be permanently stuck behind someone who has left.
	if (stage === 'hr') {
		if (requester.hrId) return requester.hrId === actor.id || isSuperAdmin;
		return isHr(actor.role);
	}
	if (requester.managerId) return requester.managerId === actor.id || isSuperAdmin;
	return isHr(actor.role); // no manager on record — HR is the safety net
}

const mgr: Person = { id: 'mgr', role: 'team_lead', managerId: null };
const emp: Person = { id: 'emp', role: 'employee', managerId: 'mgr' };
const sa: Person = { id: 'sa', role: 'super_admin', managerId: 'mgr' };
const hr: Person = { id: 'hr', role: 'admin', managerId: null };
const orphan: Person = { id: 'orphan', role: 'employee', managerId: null };

describe('the manager stage', () => {
	test("an employee's request goes to their own manager", () => {
		expect(canReview(mgr, emp, 'manager')).toBe(true);
	});

	test('an unrelated manager cannot review it', () => {
		const other: Person = { id: 'other', role: 'team_lead', managerId: null };
		expect(canReview(other, emp, 'manager')).toBe(false);
	});

	test("a Super Admin's own request goes to THEIR manager", () => {
		// The hole this fixed: previously nobody could review a Super Admin's
		// request and it sat pending forever.
		expect(canReview(mgr, sa, 'manager')).toBe(true);
	});

	test('nobody reviews their own request, whatever their role', () => {
		expect(canReview(sa, sa, 'manager')).toBe(false);
		expect(canReview(mgr, mgr, 'manager')).toBe(false);
		expect(canReview(hr, hr, 'hr')).toBe(false);
	});

	test('an ordinary admin does NOT see a request that has a named manager', () => {
		// The whole point of naming a manager: the request is theirs, not
		// everyone's. Before this, every admin held a copy and one Super Admin
		// was effectively the queue for the entire org.
		expect(canReview(hr, emp, 'manager')).toBe(false);
	});

	test('a Super Admin keeps an override', () => {
		// So a request cannot be permanently stuck behind someone who has left.
		const other: Person = { id: 'boss', role: 'super_admin', managerId: null };
		expect(canReview(other, emp, 'manager')).toBe(true);
	});

	test('someone with no manager on record falls to HR', () => {
		expect(canReview(hr, orphan, 'manager')).toBe(true);
		expect(canReview(mgr, orphan, 'manager')).toBe(false);
	});
});

describe('the HR stage', () => {
	test('with nobody named, any admin may give the second sign-off', () => {
		expect(canReview(hr, emp, 'hr')).toBe(true);
		expect(canReview(sa, emp, 'hr')).toBe(true);
		expect(canReview(mgr, emp, 'hr')).toBe(false);
	});

	test('a Super Admin cannot HR-approve their own request', () => {
		expect(canReview(sa, sa, 'hr')).toBe(false);
	});
});

describe('a named concerned HR owns the request', () => {
	// hrX is not an admin — being named is what gives them the request.
	const hrX: Person = { id: 'hrX', role: 'employee', managerId: null };
	const hrY: Person = { id: 'hrY', role: 'employee', managerId: null };
	const assigned: Person = { id: 'emp1', role: 'employee', managerId: 'mgr', hrId: 'hrX' };

	test('the named person may approve even without an admin role', () => {
		expect(canReview(hrX, assigned, 'hr')).toBe(true);
	});

	test('a different named HR may not', () => {
		expect(canReview(hrY, assigned, 'hr')).toBe(false);
	});

	test('an ordinary admin no longer sees it', () => {
		// This is the fix: naming an HR routes the request instead of leaving a
		// copy in every admin's queue.
		expect(canReview(hr, assigned, 'hr')).toBe(false);
	});

	test('a Super Admin keeps an override', () => {
		expect(canReview(sa, assigned, 'hr')).toBe(true);
	});

	test('being named does not let you approve your own request', () => {
		const selfHr: Person = { id: 'solo', role: 'admin', managerId: null, hrId: 'solo' };
		expect(canReview(selfHr, selfHr, 'hr')).toBe(false);
	});
});

describe('how far a request advances on approval', () => {
	// Comp-off is one step; leave and deviations are two.
	// All three run manager → HR → approved. Comp-off was single-step at first;
	// it now matches the others, so a credit only becomes spendable once the
	// concerned HR has signed off.
	const nextStatus = (
		_kind: 'comp_off' | 'leave' | 'deviation',
		stage: 'manager' | 'hr',
		decision: 'approve' | 'reject'
	) => {
		if (decision === 'reject') return 'rejected';
		return stage === 'hr' ? 'approved' : 'awaiting_hr';
	};

	test('a manager approving a comp-off hands it to HR rather than crediting', () => {
		expect(nextStatus('comp_off', 'manager', 'approve')).toBe('awaiting_hr');
	});

	test('only HR crediting makes a comp-off spendable', () => {
		expect(nextStatus('comp_off', 'hr', 'approve')).toBe('approved');
	});

	test('a manager approving leave hands over to HR', () => {
		expect(nextStatus('leave', 'manager', 'approve')).toBe('awaiting_hr');
	});

	test('a manager approving a deviation hands over to HR', () => {
		expect(nextStatus('deviation', 'manager', 'approve')).toBe('awaiting_hr');
	});

	test('only HR closes the two-step flows', () => {
		expect(nextStatus('leave', 'hr', 'approve')).toBe('approved');
		expect(nextStatus('deviation', 'hr', 'approve')).toBe('approved');
	});

	test('a rejection ends it at either stage', () => {
		for (const kind of ['comp_off', 'leave', 'deviation'] as const) {
			for (const stage of ['manager', 'hr'] as const) {
				expect(nextStatus(kind, stage, 'reject')).toBe('rejected');
			}
		}
	});
});
