import { describe, expect, it } from 'vitest';
import { isChiefReference } from './chief';
import { buildOrgTree, type OrgPerson } from './org-chart';

describe('isChiefReference', () => {
	it('recognises Chief however the sheet wrote it', () => {
		for (const raw of ['Chief', 'CHIEF', ' chief ', 'Cheif', 'The Chief', 'Chief.']) {
			expect(isChiefReference(raw)).toBe(true);
		}
	});

	it('does not mistake people or other titles for Chief', () => {
		for (const raw of [null, '', 'Chief Operating Officer', 'Deepak Guduru', 'Chiefly Rao', 'CEO']) {
			expect(isChiefReference(raw)).toBe(false);
		}
	});
});

describe('org chart with Chief', () => {
	const p = (id: string, reportsTo: string | null, reportsToChief = false): OrgPerson => ({
		id,
		fullName: id,
		role: 'employee',
		reportsTo,
		teamId: null,
		reportsToChief
	});

	it('hangs Chief reporters and their teams under Chief, and leaves the rest as roots', () => {
		const chart = buildOrgTree([
			p('director', null, true),
			p('manager', 'director'),
			p('unlinked', null),
			p('stale', 'manager', true) // a real manager wins over the flag
		]);
		expect(chart.underChief.map((n) => n.person.id)).toEqual(['director']);
		expect(chart.underChief[0].children[0].person.id).toBe('manager');
		expect(chart.roots.map((n) => n.person.id)).toEqual(['unlinked']);
	});
});

/**
 * Mirrors canReviewStage() for the Chief case, as approval-chain.test.ts does
 * for the rest, so the routing is pinned without a database.
 */
describe('approvals for people who report to Chief', () => {
	type Actor = { id: string; role: 'admin' | 'super_admin' | 'team_lead' | 'employee' };
	type Requester = { id: string; reportsToChief: boolean; hrId: string | null };

	function managerStage(actor: Actor, r: Requester): boolean {
		if (actor.id === r.id) return false;
		if (r.reportsToChief && r.hrId) return actor.id === r.hrId || actor.role === 'super_admin';
		return actor.role === 'admin' || actor.role === 'super_admin';
	}
	function hrStage(actor: Actor, r: Requester): boolean {
		if (actor.id === r.id) return false;
		if (r.hrId) return actor.id === r.hrId || actor.role === 'super_admin';
		return actor.role === 'admin' || actor.role === 'super_admin';
	}
	/** One approval finishes it when the HR stage lands on the same person. */
	const singleStage = (actor: Actor, r: Requester) => managerStage(actor, r) && hrStage(actor, r);

	const priya: Actor = { id: 'priya', role: 'admin' };
	const otherHr: Actor = { id: 'ravi', role: 'admin' };
	const lead: Actor = { id: 'lead', role: 'team_lead' };
	const director: Requester = { id: 'director', reportsToChief: true, hrId: 'priya' };

	it('goes straight to the concerned HR, who approves it in one step', () => {
		expect(managerStage(priya, director)).toBe(true);
		expect(singleStage(priya, director)).toBe(true);
	});

	it('is not in another admin’s or a team lead’s queue', () => {
		expect(managerStage(otherHr, director)).toBe(false);
		expect(managerStage(lead, director)).toBe(false);
	});

	it('falls to any admin, still in one step, when no concerned HR is set', () => {
		const noHr: Requester = { ...director, hrId: null };
		expect(singleStage(otherHr, noHr)).toBe(true);
	});
});
