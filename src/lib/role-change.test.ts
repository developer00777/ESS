import { describe, test, expect } from 'vitest';

/**
 * Guards on changing a user's role.
 *
 * Role decides who approves what and who sees which queue, so it is the
 * sharpest privilege change in the portal. Two things must never happen: an
 * actor escalating themselves, and the portal ending up with no administrator.
 *
 * Mirrors the checks in src/routes/api/admin/users/[id]/role/+server.ts.
 */

type Role = 'super_admin' | 'admin' | 'team_lead' | 'employee';
const ROLES: Role[] = ['super_admin', 'admin', 'team_lead', 'employee'];

interface Outcome {
	ok: boolean;
	reason?: string;
}

function changeRole(params: {
	actorRole: Role;
	actorId: string;
	targetId: string;
	targetRole: Role;
	nextRole: string;
	otherSuperAdmins: number;
}): Outcome {
	if (params.actorRole !== 'super_admin') return { ok: false, reason: 'forbidden' };
	if (!ROLES.includes(params.nextRole as Role)) return { ok: false, reason: 'invalid_role' };
	if (params.targetRole === params.nextRole) return { ok: true, reason: 'unchanged' };
	if (params.actorId === params.targetId) return { ok: false, reason: 'own_role' };
	if (params.targetRole === 'super_admin' && params.nextRole !== 'super_admin') {
		if (params.otherSuperAdmins === 0) return { ok: false, reason: 'last_super_admin' };
	}
	return { ok: true };
}

const base = {
	actorRole: 'super_admin' as Role,
	actorId: 'sa',
	targetId: 'emp',
	targetRole: 'employee' as Role,
	nextRole: 'team_lead',
	otherSuperAdmins: 1
};

describe('who may change a role', () => {
	test('a Super Admin may', () => {
		expect(changeRole(base).ok).toBe(true);
	});

	test.each(['admin', 'team_lead', 'employee'] as Role[])('a %s may not', (actorRole) => {
		// Not delegated: an Admin who could mint Super Admins would make the
		// hierarchy meaningless.
		expect(changeRole({ ...base, actorRole }).reason).toBe('forbidden');
	});
});

describe('self-escalation', () => {
	test('nobody changes their own role', () => {
		const out = changeRole({ ...base, targetId: 'sa', targetRole: 'super_admin', nextRole: 'employee' });
		expect(out).toEqual({ ok: false, reason: 'own_role' });
	});

	test('even a promotion of yourself is refused', () => {
		expect(changeRole({ ...base, targetId: 'sa', nextRole: 'admin' }).reason).toBe('own_role');
	});
});

describe('keeping an administrator', () => {
	test('the last Super Admin cannot be demoted', () => {
		const out = changeRole({
			...base,
			actorId: 'other',
			targetId: 'last',
			targetRole: 'super_admin',
			nextRole: 'employee',
			otherSuperAdmins: 0
		});
		expect(out).toEqual({ ok: false, reason: 'last_super_admin' });
	});

	test('one of several Super Admins may be demoted', () => {
		expect(
			changeRole({
				...base,
				actorId: 'other',
				targetId: 'one-of-two',
				targetRole: 'super_admin',
				nextRole: 'employee',
				otherSuperAdmins: 1
			}).ok
		).toBe(true);
	});

	test('a Super Admin "changed" to Super Admin is a no-op, not a lockout', () => {
		expect(
			changeRole({
				...base,
				targetId: 'last',
				targetRole: 'super_admin',
				nextRole: 'super_admin',
				otherSuperAdmins: 0
			})
		).toEqual({ ok: true, reason: 'unchanged' });
	});
});

describe('role validation', () => {
	test.each(ROLES)('%s is accepted', (role) => {
		expect(changeRole({ ...base, nextRole: role }).ok).toBe(true);
	});

	test.each(['root', 'owner', '', 'SUPER_ADMIN'])('%s is rejected', (role) => {
		expect(changeRole({ ...base, nextRole: role }).reason).toBe('invalid_role');
	});
});
