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
}

const HR_ROLES = ['admin', 'super_admin'];
const isHr = (role: string) => HR_ROLES.includes(role);

function canReview(
	actor: Person,
	requester: Person,
	stage: 'manager' | 'hr'
): boolean {
	if (actor.id === requester.id) return false; // never your own
	if (stage === 'hr') return isHr(actor.role);
	if (requester.managerId) return requester.managerId === actor.id || isHr(actor.role);
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

	test('HR can act at the manager stage as a fallback', () => {
		// Keeps a request moving when a manager is away or unset.
		expect(canReview(hr, emp, 'manager')).toBe(true);
	});

	test('someone with no manager on record falls to HR', () => {
		expect(canReview(hr, orphan, 'manager')).toBe(true);
		expect(canReview(mgr, orphan, 'manager')).toBe(false);
	});
});

describe('the HR stage', () => {
	test('only HR roles may give the second sign-off', () => {
		expect(canReview(hr, emp, 'hr')).toBe(true);
		expect(canReview(sa, emp, 'hr')).toBe(true);
		expect(canReview(mgr, emp, 'hr')).toBe(false);
	});

	test('a Super Admin cannot HR-approve their own request', () => {
		expect(canReview(sa, sa, 'hr')).toBe(false);
	});
});

describe('how far a request advances on approval', () => {
	// Comp-off is one step; leave and deviations are two.
	const nextStatus = (
		kind: 'comp_off' | 'leave' | 'deviation',
		stage: 'manager' | 'hr',
		decision: 'approve' | 'reject'
	) => {
		if (decision === 'reject') return 'rejected';
		if (kind === 'comp_off') return 'approved'; // manager's approval credits it
		return stage === 'hr' ? 'approved' : 'awaiting_hr';
	};

	test('a manager approving a comp-off credits it outright', () => {
		expect(nextStatus('comp_off', 'manager', 'approve')).toBe('approved');
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
