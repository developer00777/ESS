import { describe, it, expect } from 'vitest';
import {
	buildSnapshot,
	scopeFor,
	canReach,
	explain,
	actingFor,
	wouldCreateCycle,
	lineSubtree,
	resolveTeamLead,
	managerOf,
	type ScopePerson
} from './org-scope';

const TODAY = '2026-10-20';

const p = (id: string, over: Partial<ScopePerson> = {}): ScopePerson => ({
	id,
	role: 'employee',
	isActive: true,
	teamId: null,
	reportsTo: null,
	dottedManagerId: null,
	hrUserId: null,
	...over
});

/*
 *   ceo
 *    └─ mgr (team_lead, team A)
 *        ├─ ana  (team B — a report outside the lead's own team)
 *        │    └─ intern
 *        └─ bob  (team A, dotted line to pm)
 *   peer (team_lead, team A, nobody reports to them)
 *   pm   (employee, project lead)
 *   hr   (admin, concerned HR for ana and bob)
 *   hr2  (admin, concerned HR for nobody)
 */
const people = [
	p('ceo', { role: 'super_admin', hrUserId: 'hr' }),
	p('mgr', { role: 'team_lead', teamId: 'A', reportsTo: 'ceo', hrUserId: 'hr' }),
	p('ana', { teamId: 'B', reportsTo: 'mgr', hrUserId: 'hr' }),
	p('intern', { teamId: 'B', reportsTo: 'ana', hrUserId: 'hr' }),
	p('bob', { teamId: 'A', reportsTo: 'mgr', dottedManagerId: 'pm', hrUserId: 'hr' }),
	p('peer', { role: 'team_lead', teamId: 'A', reportsTo: 'ceo', hrUserId: 'hr' }),
	p('pm', { reportsTo: 'ceo', hrUserId: 'hr' }),
	p('hr', { role: 'admin', reportsTo: 'ceo', hrUserId: 'hr2' }),
	p('hr2', { role: 'admin', reportsTo: 'ceo', hrUserId: 'hr' })
];
const teams = [
	{ id: 'A', teamLeadId: 'mgr' },
	{ id: 'B', teamLeadId: null }
];
const snap = buildSnapshot(people, teams);
const actor = (id: string, capabilities: string[] = []) => ({ id, role: snap.byId.get(id)!.role, capabilities });

describe('line hierarchy', () => {
	it('reaches a report who sits in another team — the case teamId scoping missed', () => {
		expect(canReach(snap, actor('mgr'), 'ana', 'leave.view', TODAY)).toBe(true);
	});

	it('reaches skip-level reports for viewing but not for editing', () => {
		expect(canReach(snap, actor('mgr'), 'intern', 'leave.view', TODAY)).toBe(true);
		expect(canReach(snap, actor('mgr'), 'intern', 'person.edit_settings', TODAY)).toBe(false);
	});

	it('does not let a teammate read leave detail, only dates', () => {
		expect(canReach(snap, actor('peer'), 'bob', 'leave.view', TODAY)).toBe(false);
		expect(canReach(snap, actor('peer'), 'bob', 'leave.dates', TODAY)).toBe(true);
	});
});

describe('dotted line', () => {
	it('sees availability, not detail, and cannot edit', () => {
		expect(canReach(snap, actor('pm'), 'bob', 'leave.dates', TODAY)).toBe(true);
		expect(canReach(snap, actor('pm'), 'bob', 'leave.view', TODAY)).toBe(false);
		expect(canReach(snap, actor('pm'), 'bob', 'person.edit_settings', TODAY)).toBe(false);
	});

	it('does not leak to anyone beyond the dotted reports', () => {
		const s = scopeFor(snap, actor('pm'), 'leave.dates', TODAY);
		expect(s.all).toBe(false);
		expect([...s.ids].sort()).toEqual(['bob', 'pm']);
	});

	it('is ignored when it repeats the solid-line manager', () => {
		const s2 = buildSnapshot([p('m'), p('e', { reportsTo: 'm', dottedManagerId: 'm' })]);
		expect(s2.dottedReports.get('m')).toBeUndefined();
	});
});

describe('concerned HR, HR fallback and capabilities', () => {
	it('gives the named HR their people without a directory privilege', () => {
		expect(canReach(snap, actor('hr'), 'ana', 'leave.view', TODAY)).toBe(true);
		// hr2 is named for nobody here, and everyone has both a manager and an HR.
		expect(canReach(snap, actor('hr2'), 'ana', 'leave.view', TODAY)).toBe(false);
	});

	it('lets HR see whoever the chain leaves to "any HR" — the approvals they can decide', () => {
		const s = buildSnapshot([...people, p('orphan', { teamId: 'B' }), p('nohr', { reportsTo: 'mgr', hrUserId: null })], teams);
		const hr2 = { id: 'hr2', role: 'admin' as const };
		// No manager, no lead in team B: the manager stage falls to HR.
		expect(canReach(s, hr2, 'orphan', 'leave.view', TODAY)).toBe(true);
		// A manager, but no concerned HR: the HR stage falls to any HR.
		expect(canReach(s, hr2, 'nohr', 'leave.view', TODAY)).toBe(true);
		// Never something an Employee gets.
		expect(canReach(s, actor('pm'), 'orphan', 'leave.view', TODAY)).toBe(false);
	});

	it('opens org-wide reach only through a capability', () => {
		expect(scopeFor(snap, actor('hr', ['people.directory']), 'person.basic', TODAY).all).toBe(true);
		expect(scopeFor(snap, actor('ceo'), 'person.reset_password', TODAY).all).toBe(true);
	});

	it('explains why access exists', () => {
		const e = explain(snap, actor('mgr'), 'bob', 'leave.view', TODAY);
		expect(e.allowed).toBe(true);
		expect(e.via).toEqual(expect.arrayContaining(['relation line_manager', 'relation team_lead']));
		expect(explain(snap, actor('pm'), 'ana', 'leave.view', TODAY)).toEqual({ allowed: false, via: [] });
	});
});

describe('team lead and manager — the same answers the approval chain uses', () => {
	it('prefers the designated lead, then a Team-Lead-role member, never an inactive one', () => {
		const m = (id: string, role = 'employee', isActive = true) => ({ id, role, isActive });
		expect(resolveTeamLead('x', [m('x'), m('b', 'team_lead')])).toBe('x');
		expect(resolveTeamLead('x', [m('x', 'team_lead', false), m('c', 'team_lead'), m('b', 'team_lead')])).toBe('b');
		expect(resolveTeamLead(null, [m('z', 'team_lead', false)])).toBe(null);
	});

	it('resolves a manager like the approval chain: reportsTo, chief, team lead', () => {
		const s = buildSnapshot(
			[
				p('lead', { role: 'team_lead', teamId: 'T' }),
				p('gone', { isActive: false }),
				p('a', { teamId: 'T', reportsTo: 'gone' }),
				p('b', { teamId: 'T', reportsToChief: true }),
				p('c', { teamId: 'T', reportsTo: 'lead' })
			],
			[{ id: 'T', teamLeadId: null }]
		);
		expect(managerOf(s, 'a')).toBe('lead'); // inactive manager → the team's lead
		expect(managerOf(s, 'b')).toBe(null); // reports to Chief
		expect(managerOf(s, 'c')).toBe('lead');
		expect(managerOf(s, 'lead')).toBe(null); // never their own manager
	});

	it('gives detail to the one effective lead; other Team Leads in the team see dates', () => {
		const s = buildSnapshot(
			[p('l1', { role: 'team_lead', teamId: 'T' }), p('l2', { role: 'team_lead', teamId: 'T' }), p('e', { teamId: 'T' })],
			[{ id: 'T', teamLeadId: null }]
		);
		expect(canReach(s, { id: 'l1', role: 'team_lead' }, 'e', 'leave.view', TODAY)).toBe(true);
		expect(canReach(s, { id: 'l2', role: 'team_lead' }, 'e', 'leave.view', TODAY)).toBe(false);
		expect(canReach(s, { id: 'l2', role: 'team_lead' }, 'e', 'leave.dates', TODAY)).toBe(true);
	});
});

describe('delegation', () => {
	const withLeave = buildSnapshot(people, teams, [{ fromId: 'mgr', toId: 'peer', startsOn: '2026-10-19', endsOn: '2026-10-23' }]);

	it('lets the delegate act for the manager inside the window only', () => {
		expect(actingFor(withLeave, 'mgr', TODAY)).toEqual(['mgr', 'peer']);
		expect(actingFor(withLeave, 'mgr', '2026-10-24')).toEqual(['mgr']);
		expect(canReach(withLeave, actor('peer'), 'ana', 'leave.view', TODAY)).toBe(true);
		expect(canReach(withLeave, actor('peer'), 'ana', 'leave.view', '2026-10-25')).toBe(false);
	});

	it('does not pass the manager’s skip-level reach to the delegate', () => {
		expect(canReach(withLeave, actor('peer'), 'intern', 'leave.view', TODAY)).toBe(false);
	});

	it('covers the people a lead manages by team-lead fallback, as the approval chain does', () => {
		const s = buildSnapshot(
			[p('lead', { role: 'team_lead', teamId: 'T' }), p('e', { teamId: 'T' }), p('cover')],
			[{ id: 'T', teamLeadId: 'lead' }],
			[{ fromId: 'lead', toId: 'cover', startsOn: TODAY, endsOn: TODAY }]
		);
		expect(canReach(s, { id: 'cover', role: 'employee' }, 'e', 'leave.view', TODAY)).toBe(true);
	});

	it('ignores revoked delegations and self-delegation', () => {
		const s = buildSnapshot(people, teams, [
			{ fromId: 'mgr', toId: 'peer', startsOn: '2026-10-01', endsOn: '2026-10-31', revoked: true },
			{ fromId: 'mgr', toId: 'mgr', startsOn: '2026-10-01', endsOn: '2026-10-31' }
		]);
		expect(actingFor(s, 'mgr', TODAY)).toEqual(['mgr']);
	});
});

describe('safety', () => {
	it('detects a reporting loop before it is written', () => {
		expect(wouldCreateCycle(snap, 'mgr', 'intern')).toBe(true);
		expect(wouldCreateCycle(snap, 'intern', 'mgr')).toBe(false);
		expect(wouldCreateCycle(snap, 'ana', 'ana')).toBe(true);
	});

	it('survives a loop already in the data', () => {
		const looped = buildSnapshot([p('x', { reportsTo: 'y' }), p('y', { reportsTo: 'x' })]);
		expect(lineSubtree(looped, 'x').map((n) => n.id)).toEqual(['y']);
	});

	it('drops inactive people from every reach', () => {
		const s = buildSnapshot([p('m'), p('gone', { reportsTo: 'm', isActive: false })]);
		expect(scopeFor(s, { id: 'm', role: 'employee' }, 'leave.view', TODAY).ids.has('gone')).toBe(false);
	});
});
