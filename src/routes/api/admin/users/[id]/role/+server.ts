import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { users, teams } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq, and, ne } from 'drizzle-orm';
import type { Role } from '$lib/server/auth';

const ROLES: Role[] = ['super_admin', 'admin', 'team_lead', 'employee'];

/**
 * Changes an employee's role.
 *
 * Super Admin only. Role decides who may approve what and who sees which
 * queues, so this is the sharpest privilege escalation in the portal and is not
 * delegated — an Admin who could mint Super Admins would make the hierarchy
 * meaningless.
 *
 * Promoting to team_lead gives the person a team to lead when they have none,
 * because a lead with no team can approve nothing and would look broken.
 */
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin']);
	const userId = event.params.id;
	const { role } = await event.request.json();

	if (!ROLES.includes(role)) {
		throw error(400, `role must be one of: ${ROLES.join(', ')}`);
	}

	const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) throw error(404, 'Employee not found');

	if (target.role === role) {
		return json({
			user: { id: target.id, email: target.email, fullName: target.fullName, role: target.role },
			changed: false
		});
	}

	// Demoting yourself would take away the privilege mid-session and, if you
	// were the last one, leave the portal with no administrator at all.
	if (userId === actor.id) {
		throw error(400, 'You cannot change your own role');
	}

	// The portal must always retain someone who can administer it.
	if (target.role === 'super_admin' && role !== 'super_admin') {
		const remaining = await db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.role, 'super_admin'), ne(users.id, userId)));
		if (remaining.length === 0) {
			throw error(400, 'Cannot change the role of the only Super Admin account');
		}
	}

	// Selected explicitly — `returning()` with no argument hands back the whole
	// row, password hash included, and this response goes to the browser.
	const [updated] = await db
		.update(users)
		.set({ role, updatedAt: new Date() })
		.where(eq(users.id, userId))
		.returning({
			id: users.id,
			email: users.email,
			fullName: users.fullName,
			role: users.role,
			teamId: users.teamId
		});

	// A new Team Lead with no team has nothing to lead — the approval queues key
	// off team membership, so one is created rather than leaving them inert.
	let teamCreated: string | null = null;
	if (role === 'team_lead' && !updated.teamId) {
		const [team] = await db
			.insert(teams)
			.values({ name: `${updated.fullName}'s Team`, teamLeadId: updated.id })
			.returning();
		await db.update(users).set({ teamId: team.id }).where(eq(users.id, userId));
		teamCreated = team.id;
	}

	await logActivity({
		actorUserId: actor.id,
		action: 'user.role_change',
		targetType: 'user',
		targetId: userId,
		details: { from: target.role, to: role, email: target.email, teamCreated }
	});

	return json({ user: { ...updated, teamId: teamCreated ?? updated.teamId }, changed: true });
};
