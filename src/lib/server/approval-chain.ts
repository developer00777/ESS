/**
 * Who reviews whose request.
 *
 * Approval follows the reporting line — `users.reportsTo` — rather than role
 * alone. Before this, queues were scoped by role and team, so a Super Admin's
 * own request had no reviewer at all and simply sat pending forever.
 *
 * Two routes:
 *
 *   Comp-off      manager → credited.  One step. The manager confirms the
 *                 person actually worked the day, and that is the whole
 *                 question — there is nothing for HR to add.
 *
 *   Everything    manager → HR → approved.  Two steps. Leave and attendance
 *   else          corrections change balances and the attendance record, so HR
 *                 sees them after the manager has signed off.
 */

import { db } from '$lib/server/db/postgres';
import { users, employeeProfiles } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

/** Roles that act as HR for the second stage. */
const HR_ROLES = ['admin', 'super_admin'] as const;

export type ApprovalStage = 'manager' | 'hr';

export interface Reviewer {
	userId: string;
	fullName: string;
	role: string;
}

/**
 * The reporting manager for each of `userIds`.
 *
 * `users.reportsTo` is the authoritative link. It is only ever populated by the
 * bulk import, so accounts created another way can have none — those fall back
 * to the team lead, and finally to HR, so a request always reaches somebody.
 */
export async function managersFor(userIds: string[]): Promise<Map<string, Reviewer | null>> {
	const out = new Map<string, Reviewer | null>();
	if (userIds.length === 0) return out;

	const staff = await db
		.select({
			id: users.id,
			reportsTo: users.reportsTo,
			teamId: users.teamId
		})
		.from(users)
		.where(inArray(users.id, userIds));

	const managerIds = staff.map((s) => s.reportsTo).filter((id): id is string => Boolean(id));

	const managerRows = managerIds.length
		? await db
				.select({ id: users.id, fullName: users.fullName, role: users.role, isActive: users.isActive })
				.from(users)
				.where(inArray(users.id, managerIds))
		: [];
	const managerById = new Map(managerRows.map((m) => [m.id, m]));

	// Fallbacks, cheapest first: the team's lead, then anyone in HR.
	const teamIds = [...new Set(staff.map((s) => s.teamId).filter((t): t is string => Boolean(t)))];
	const leadRows = teamIds.length
		? await db
				.select({ id: users.id, fullName: users.fullName, role: users.role, teamId: users.teamId })
				.from(users)
				.where(inArray(users.teamId, teamIds))
		: [];
	const leadByTeam = new Map(
		leadRows.filter((l) => l.role === 'team_lead').map((l) => [l.teamId as string, l])
	);

	for (const person of staff) {
		const direct = person.reportsTo ? managerById.get(person.reportsTo) : undefined;
		// An inactive manager cannot review anything — fall through rather than
		// routing the request into a dead account.
		if (direct?.isActive) {
			out.set(person.id, { userId: direct.id, fullName: direct.fullName, role: direct.role });
			continue;
		}

		const lead = person.teamId ? leadByTeam.get(person.teamId) : undefined;
		// Never route someone's request to themselves.
		if (lead && lead.id !== person.id) {
			out.set(person.id, { userId: lead.id, fullName: lead.fullName, role: lead.role });
			continue;
		}

		out.set(person.id, null);
	}

	return out;
}

/** Convenience for a single employee. */
export async function managerFor(userId: string): Promise<Reviewer | null> {
	return (await managersFor([userId])).get(userId) ?? null;
}

/**
 * True if `actor` may act on `stage` for `requesterId`.
 *
 * An explicit assignment *routes* the request: when a reporting manager or a
 * concerned HR is named, the request is theirs and it appears in their queue
 * alone. Admins are the fallback only for people with nobody assigned, so a
 * request is never stranded — but naming someone no longer leaves every admin
 * holding a copy of it, which made one Super Admin the queue for the whole org.
 */
export async function canReviewStage(
	actor: { id: string; role: string; teamId: string | null },
	requesterId: string,
	stage: ApprovalStage
): Promise<boolean> {
	// Nobody signs off their own request, whatever their role.
	if (actor.id === requesterId) return false;

	const isHr = (HR_ROLES as readonly string[]).includes(actor.role);

	if (stage === 'hr') {
		const assigned = await assignedHrFor(requesterId);
		// Named HR owns it. A Super Admin keeps an override so a request is never
		// truly stuck if that person leaves, but ordinary admins do not see it.
		if (assigned) return assigned === actor.id || actor.role === 'super_admin';
		return isHr;
	}

	const manager = await managerFor(requesterId);
	if (manager) return manager.userId === actor.id || actor.role === 'super_admin';

	// No manager resolvable — HR picks it up so it does not sit forever.
	return isHr;
}

/** The HR person assigned to an employee, if a Super Admin has named one. */
export async function assignedHrFor(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ hrUserId: employeeProfiles.hrUserId })
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, userId))
		.limit(1);
	return row?.hrUserId ?? null;
}

/**
 * The set of user ids whose requests `actor` may review at `stage`.
 *
 * Returned as an explicit list so the queues can filter with a single `inArray`
 * instead of each one re-deriving the reporting line and drifting apart.
 */
export async function reviewableUserIds(
	actor: { id: string; role: string; teamId: string | null },
	stage: ApprovalStage
): Promise<string[]> {
	const everyone = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
	const candidateIds = everyone.map((u) => u.id).filter((id) => id !== actor.id);

	const isHr = (HR_ROLES as readonly string[]).includes(actor.role);
	const isSuperAdmin = actor.role === 'super_admin';

	if (stage === 'hr') {
		// Who each candidate's HR is, in one query rather than per-person.
		const rows = candidateIds.length
			? await db
					.select({ userId: employeeProfiles.userId, hrUserId: employeeProfiles.hrUserId })
					.from(employeeProfiles)
					.where(inArray(employeeProfiles.userId, candidateIds))
			: [];
		const hrByUser = new Map(rows.map((r) => [r.userId, r.hrUserId]));

		return candidateIds.filter((id) => {
			const assigned = hrByUser.get(id) ?? null;
			// Assigned → that person's queue (Super Admin retains an override).
			if (assigned) return assigned === actor.id || isSuperAdmin;
			// Nobody named → any admin covers it.
			return isHr;
		});
	}

	const managers = await managersFor(candidateIds);

	return candidateIds.filter((id) => {
		const manager = managers.get(id);
		if (manager) return manager.userId === actor.id || isSuperAdmin;
		// Unassigned reporting line — HR is the safety net.
		return isHr;
	});
}
