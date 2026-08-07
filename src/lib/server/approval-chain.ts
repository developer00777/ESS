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
import { users } from '$lib/server/db/schema';
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
 * The manager stage is the requester's own manager — or, when they have none,
 * HR, so a request is never stranded. This is what lets a Super Admin's own
 * comp-off be reviewed by *their* manager instead of nobody.
 */
export async function canReviewStage(
	actor: { id: string; role: string; teamId: string | null },
	requesterId: string,
	stage: ApprovalStage
): Promise<boolean> {
	// Nobody signs off their own request, whatever their role.
	if (actor.id === requesterId) return false;

	const isHr = (HR_ROLES as readonly string[]).includes(actor.role);

	if (stage === 'hr') return isHr;

	const manager = await managerFor(requesterId);
	if (manager) return manager.userId === actor.id || isHr;

	// No manager resolvable — HR picks it up so it does not sit forever.
	return isHr;
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

	if (stage === 'hr') {
		return (HR_ROLES as readonly string[]).includes(actor.role) ? candidateIds : [];
	}

	const managers = await managersFor(candidateIds);
	const isHr = (HR_ROLES as readonly string[]).includes(actor.role);

	return candidateIds.filter((id) => {
		const manager = managers.get(id);
		if (manager) return manager.userId === actor.id || isHr;
		// Unassigned reporting line — HR is the safety net.
		return isHr;
	});
}
