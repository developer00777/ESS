/**
 * Org scope — *whose* records a person may reach, and why.
 *
 * Capabilities (src/lib/capabilities.ts) answer "what may this login do?".
 * They are global: holding `people.directory` opens the whole roster. This
 * module answers the other half, the one every HCM suite separates out
 * (SAP's "target population", Workday's role-on-an-organisation, Oracle's
 * security profiles): "on whom?".
 *
 * Before this, three different answers lived in the code:
 *
 *   approvals       users.reportsTo, one level        (approval-chain.ts)
 *   tasks/meetings  users.reportsTo, the whole subtree (tasks/service.ts)
 *   lists & edits   same users.teamId                  (rbac.canActOnUser, Team,
 *                                                       Leave calendar, Dashboard)
 *
 * so a manager could approve a report's leave but not see it on their calendar
 * when the report sat in another team. Here every reach is derived from typed
 * relationships, so the screens and the approval chain agree — including on
 * who "the team's lead" and "the person's manager" are, which approval-chain.ts
 * resolves with the same helpers (resolveTeamLead, managerOf).
 *
 * Deliberately DB-free, like org-chart.ts, so it unit-tests directly. The
 * loader lives in src/lib/server/org-scope.ts.
 */

export type BaseRole = 'super_admin' | 'admin' | 'team_lead' | 'employee';

/** Roles that act as HR — the approval chain's HR stage and its fallback. */
export const HR_ROLES: readonly BaseRole[] = ['admin', 'super_admin'];

export interface ScopePerson {
	id: string;
	role: BaseRole;
	isActive: boolean;
	teamId: string | null;
	/** users.reportsTo — the solid line. */
	reportsTo: string | null;
	/** employee_profiles.dotted_line_manager_id. */
	dottedManagerId: string | null;
	/** employee_profiles.hr_user_id — the concerned HR. */
	hrUserId: string | null;
	/** employee_profiles.reports_to_chief — reports to the head of the company, who has no login. */
	reportsToChief?: boolean;
}

export interface ScopeTeam {
	id: string;
	teamLeadId: string | null;
}

/**
 * A time-boxed hand-over of one person's manager reach to another
 * (Workday-style "do inbox tasks on my behalf"). Responsibility stays with
 * `fromId`; when the window closes the reach simply stops resolving.
 */
export interface ScopeDelegation {
	fromId: string;
	toId: string;
	/** Inclusive ISO dates, 'YYYY-MM-DD'. */
	startsOn: string;
	endsOn: string;
	revoked?: boolean;
}

export interface OrgSnapshot {
	byId: Map<string, ScopePerson>;
	/** Active direct reports by manager id. */
	reports: Map<string, string[]>;
	dottedReports: Map<string, string[]>;
	hrOf: Map<string, string[]>;
	teamMembers: Map<string, string[]>;
	/** teamId → the team's effective lead (see resolveTeamLead). */
	teamLeadOf: Map<string, string>;
	delegations: ScopeDelegation[];
}

/** Every way one person can stand in relation to another. */
export type Relation =
	| 'self'
	| 'line_manager' // target reports directly to actor
	| 'line_chain' // target is further down actor's solid line (skip-level and below)
	| 'dotted_manager' // actor is target's dotted-line manager
	| 'concerned_hr' // actor is the HR named on target's profile
	| 'hr_fallback' // actor is HR and a request of target's falls to HR (nobody named for a stage)
	| 'team_lead' // actor is the effective lead of target's team
	| 'teammate' // same team, no line between them
	| 'delegate'; // actor holds a live delegation from target's manager

/**
 * Data permissions — about records of *another* person. Kept apart from
 * capability keys on purpose: a capability is a switch, these are scoped.
 */
export type ScopePermission =
	| 'person.basic' // name, picture, designation, team
	| 'person.job' // shift, office timings, reporting line, week off
	| 'attendance.view'
	| 'leave.view' // dates, type, status, reason
	| 'leave.dates' // dates and status only — what a dotted line sees
	| 'tasks.view'
	| 'person.edit_settings'
	| 'person.reset_password';

export const SCOPE_PERMISSIONS: readonly ScopePermission[] = [
	'person.basic',
	'person.job',
	'attendance.view',
	'leave.view',
	'leave.dates',
	'tasks.view',
	'person.edit_settings',
	'person.reset_password'
];

/**
 * The default policy: which relation grants which permission.
 *
 * Dotted lines see availability, not detail, and get no edit or approval
 * rights. Approval itself is not a permission here: approval-chain.ts decides
 * it, and asks this module only for delegation and the shared definitions of
 * "team lead" and "manager". Whoever can decide someone's request can always
 * see it: line manager, team lead (the manager-stage fallback), concerned HR,
 * HR fallback and a live delegate all hold `leave.view`.
 */
export const RELATION_POLICY: Record<Relation, readonly ScopePermission[]> = {
	self: ['person.basic', 'person.job', 'attendance.view', 'leave.view', 'leave.dates', 'tasks.view'],
	line_manager: [
		'person.basic',
		'person.job',
		'attendance.view',
		'leave.view',
		'leave.dates',
		'tasks.view',
		'person.edit_settings',
		'person.reset_password'
	],
	line_chain: ['person.basic', 'person.job', 'attendance.view', 'leave.view', 'leave.dates', 'tasks.view'],
	dotted_manager: ['person.basic', 'attendance.view', 'leave.dates'],
	concerned_hr: ['person.basic', 'person.job', 'attendance.view', 'leave.view', 'leave.dates'],
	hr_fallback: ['person.basic', 'attendance.view', 'leave.view', 'leave.dates'],
	// Today's Team Lead reach, so the switch-over changes nobody's access by itself.
	team_lead: [
		'person.basic',
		'person.job',
		'attendance.view',
		'leave.view',
		'leave.dates',
		'person.edit_settings',
		'person.reset_password'
	],
	teammate: ['person.basic', 'leave.dates'],
	delegate: ['person.basic', 'person.job', 'attendance.view', 'leave.view', 'leave.dates']
};

/** Org-wide reach that comes from a capability rather than a relationship. */
export const CAPABILITY_REACH: Partial<Record<ScopePermission, readonly string[]>> = {
	'person.basic': ['people.directory', 'org.view'],
	'person.job': ['people.directory', 'people.edit_settings'],
	'attendance.view': ['payroll.view'],
	'leave.view': ['payroll.view'],
	'leave.dates': ['people.directory', 'payroll.view'],
	'tasks.view': ['tasks.view_all'],
	'person.edit_settings': ['people.edit_settings'],
	'person.reset_password': ['people.reset_password']
};

export interface ScopeActor {
	id: string;
	role: BaseRole;
	capabilities?: readonly string[];
}

/* ------------------------------------------------- shared definitions */

/**
 * Who leads a team: the lead named on the team (`teams.team_lead_id`) while
 * they are active; failing that, the team's Team-Lead-role member — the
 * earliest by id when there are several, so the answer never depends on
 * row order. Never an inactive account.
 */
export function resolveTeamLead(
	designatedId: string | null,
	members: { id: string; role: string; isActive: boolean }[]
): string | null {
	const active = members.filter((m) => m.isActive);
	if (designatedId) {
		const named = active.find((m) => m.id === designatedId);
		if (named) return named.id;
	}
	const leads = active.filter((m) => m.role === 'team_lead').map((m) => m.id).sort();
	return leads[0] ?? null;
}

/**
 * Who fills `personId`'s manager stage, as the approval chain routes it:
 * the active `reportsTo`; nobody when they report to Chief with no line set;
 * else their team's lead (never themselves); else nobody (HR takes it).
 */
export function managerOf(snap: OrgSnapshot, personId: string): string | null {
	const p = snap.byId.get(personId);
	if (!p) return null;
	const direct = p.reportsTo ? snap.byId.get(p.reportsTo) : undefined;
	if (direct?.isActive && direct.id !== p.id) return direct.id;
	if (!p.reportsTo && p.reportsToChief) return null;
	const lead = p.teamId ? snap.teamLeadOf.get(p.teamId) : undefined;
	return lead && lead !== p.id ? lead : null;
}

/* ---------------------------------------------------------------- build */

export function buildSnapshot(
	people: ScopePerson[],
	teams: ScopeTeam[] = [],
	delegations: ScopeDelegation[] = []
): OrgSnapshot {
	const byId = new Map(people.map((p) => [p.id, p]));
	const push = (m: Map<string, string[]>, k: string, v: string) => {
		const list = m.get(k);
		if (list) list.push(v);
		else m.set(k, [v]);
	};
	const reports = new Map<string, string[]>();
	const dottedReports = new Map<string, string[]>();
	const hrOf = new Map<string, string[]>();
	const teamMembers = new Map<string, string[]>();
	for (const p of people) {
		if (!p.isActive) continue;
		if (p.reportsTo && p.reportsTo !== p.id) push(reports, p.reportsTo, p.id);
		// A dotted line naming the solid-line manager adds nothing.
		if (p.dottedManagerId && p.dottedManagerId !== p.id && p.dottedManagerId !== p.reportsTo) {
			push(dottedReports, p.dottedManagerId, p.id);
		}
		if (p.hrUserId && p.hrUserId !== p.id) push(hrOf, p.hrUserId, p.id);
		if (p.teamId) push(teamMembers, p.teamId, p.id);
	}

	const designated = new Map(teams.map((t) => [t.id, t.teamLeadId]));
	const teamLeadOf = new Map<string, string>();
	const teamIds = new Set([...designated.keys(), ...people.map((p) => p.teamId).filter((t): t is string => Boolean(t))]);
	for (const teamId of teamIds) {
		const members = people.filter((p) => p.teamId === teamId);
		const named = designated.get(teamId) ?? null;
		// The named lead may sit outside the team's membership; still eligible.
		const namedPerson = named ? byId.get(named) : undefined;
		const pool = namedPerson && !members.includes(namedPerson) ? [...members, namedPerson] : members;
		const lead = resolveTeamLead(named, pool);
		if (lead) teamLeadOf.set(teamId, lead);
	}
	return { byId, reports, dottedReports, hrOf, teamMembers, teamLeadOf, delegations };
}

/* ------------------------------------------------------------ traversal */

/** Everyone below `id` on the solid line, depth-first; loop-safe. */
export function lineSubtree(snap: OrgSnapshot, id: string): { id: string; depth: number }[] {
	const out: { id: string; depth: number }[] = [];
	const seen = new Set([id]);
	const walk = (x: string, depth: number) => {
		for (const c of snap.reports.get(x) ?? []) {
			if (seen.has(c)) continue;
			seen.add(c);
			out.push({ id: c, depth });
			walk(c, depth + 1);
		}
	};
	walk(id, 1);
	return out;
}

/** True when making `managerId` the manager of `employeeId` would close a loop. */
export function wouldCreateCycle(snap: OrgSnapshot, employeeId: string, managerId: string | null): boolean {
	if (!managerId) return false;
	if (managerId === employeeId) return true;
	return lineSubtree(snap, employeeId).some((n) => n.id === managerId);
}

/** Delegations live on `onDate` ('YYYY-MM-DD'). */
export function activeDelegations(snap: OrgSnapshot, onDate: string): ScopeDelegation[] {
	return snap.delegations.filter((d) => !d.revoked && d.startsOn <= onDate && onDate <= d.endsOn && d.fromId !== d.toId);
}

/**
 * Who may act for `managerId` today: the manager, plus anyone holding a live
 * delegation from them. One hop only — a delegate cannot pass it on.
 */
export function actingFor(snap: OrgSnapshot, managerId: string, onDate: string): string[] {
	const out = [managerId];
	for (const d of activeDelegations(snap, onDate)) {
		if (d.fromId === managerId && snap.byId.get(d.toId)?.isActive && !out.includes(d.toId)) out.push(d.toId);
	}
	return out;
}

/* ------------------------------------------------------------ relations */

/** Every relation `actorId` holds over each person they reach, in one pass. */
export function relationsFrom(snap: OrgSnapshot, actorId: string, onDate: string): Map<string, Set<Relation>> {
	const out = new Map<string, Set<Relation>>();
	const add = (target: string, r: Relation) => {
		const set = out.get(target);
		if (set) set.add(r);
		else out.set(target, new Set([r]));
	};

	add(actorId, 'self');
	for (const n of lineSubtree(snap, actorId)) add(n.id, n.depth === 1 ? 'line_manager' : 'line_chain');
	for (const id of snap.dottedReports.get(actorId) ?? []) add(id, 'dotted_manager');
	for (const id of snap.hrOf.get(actorId) ?? []) add(id, 'concerned_hr');

	const actor = snap.byId.get(actorId);
	for (const [teamId, leadId] of snap.teamLeadOf) {
		if (leadId !== actorId) continue;
		for (const id of snap.teamMembers.get(teamId) ?? []) if (id !== actorId) add(id, 'team_lead');
	}
	if (actor?.teamId) {
		for (const id of snap.teamMembers.get(actor.teamId) ?? []) if (id !== actorId) add(id, 'teammate');
	}

	// HR covers whatever the chain leaves to "any HR": the HR stage of people
	// with no concerned HR, and the manager stage of people nobody manages.
	if (actor && HR_ROLES.includes(actor.role)) {
		for (const p of snap.byId.values()) {
			if (!p.isActive || p.id === actorId) continue;
			const noHr = !p.hrUserId;
			const noManager = managerOf(snap, p.id) === null && !(p.reportsToChief && !p.reportsTo && p.hrUserId);
			if (noHr || noManager) add(p.id, 'hr_fallback');
		}
	}

	// A live delegate covers everyone whose manager stage the delegator holds —
	// direct reports and, where no line is set, the team they lead.
	const covering = new Set(activeDelegations(snap, onDate).filter((d) => d.toId === actorId).map((d) => d.fromId));
	if (covering.size) {
		for (const p of snap.byId.values()) {
			if (!p.isActive || p.id === actorId) continue;
			const m = managerOf(snap, p.id);
			if (m && covering.has(m)) add(p.id, 'delegate');
		}
	}
	return out;
}

/* ----------------------------------------------------------------- scope */

export interface Scope {
	/** True when a capability opens this permission org-wide. */
	all: boolean;
	/** Reachable ids when `all` is false (includes the actor where self grants it). */
	ids: Set<string>;
}

function capabilityOpens(actor: ScopeActor, perm: ScopePermission): string | null {
	if (actor.role === 'super_admin') return 'super_admin';
	const caps = actor.capabilities ?? [];
	return CAPABILITY_REACH[perm]?.find((c) => caps.includes(c)) ?? null;
}

/**
 * The people `actor` may reach for `perm`. Use `all` to skip the filter, else
 * `inArray(users.id, [...ids])` — one list, so screens stop re-deriving it.
 */
export function scopeFor(snap: OrgSnapshot, actor: ScopeActor, perm: ScopePermission, onDate: string): Scope {
	if (capabilityOpens(actor, perm)) return { all: true, ids: new Set() };
	const ids = new Set<string>();
	for (const [target, rels] of relationsFrom(snap, actor.id, onDate)) {
		for (const r of rels) {
			if (RELATION_POLICY[r].includes(perm)) {
				ids.add(target);
				break;
			}
		}
	}
	return { all: false, ids };
}

export function canReach(snap: OrgSnapshot, actor: ScopeActor, targetId: string, perm: ScopePermission, onDate: string): boolean {
	const s = scopeFor(snap, actor, perm, onDate);
	return s.all || s.ids.has(targetId);
}

/**
 * Why `actor` can (or cannot) reach `targetId` for `perm` — the "explain"
 * Oracle's security preview offers. Answers "why could Priya see Ravi's
 * leave?" without anyone reading code.
 */
export function explain(
	snap: OrgSnapshot,
	actor: ScopeActor,
	targetId: string,
	perm: ScopePermission,
	onDate: string
): { allowed: boolean; via: string[] } {
	const via: string[] = [];
	const cap = capabilityOpens(actor, perm);
	if (cap) via.push(cap === 'super_admin' ? 'Super Admin' : `privilege ${cap}`);
	const rels = relationsFrom(snap, actor.id, onDate).get(targetId);
	for (const r of rels ?? []) if (RELATION_POLICY[r].includes(perm)) via.push(`relation ${r}`);
	return { allowed: via.length > 0, via };
}
