import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { users } from '$lib/server/db/schema';
import { requireRole, canActOnUser } from '$lib/server/rbac';
import { hashPassword } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';

// Admin-issued password reset for another user (no knowledge of their current password
// required). Authorization mirrors canActOnUser: Super Admin/Admin may reset anyone,
// a Team Lead may reset only members of their own team, and self-reset is always allowed
// here too (though self-service /api/auth/change-password is the normal path for that).
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin', 'admin', 'team_lead']);
	const targetUserId = event.params.id;
	const { newPassword } = await event.request.json();

	if (typeof newPassword !== 'string' || newPassword.length < 8) {
		throw error(400, 'newPassword is required and must be at least 8 characters');
	}

	const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
	if (!target) {
		throw error(404, 'User not found');
	}

	if (!canActOnUser(actor, target.id, target.teamId)) {
		throw error(403, 'Insufficient privileges to reset this user\'s password');
	}

	// A Team Lead may only reset passwords for Employees on their team, never peers or
	// escalate to admin/super_admin accounts even if teamId happens to line up.
	if (actor.role === 'team_lead' && target.role !== 'employee' && target.id !== actor.id) {
		throw error(403, 'Team Leads may only reset passwords for employees on their team');
	}

	const passwordHash = await hashPassword(newPassword);

	const [updated] = await db
		.update(users)
		.set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
		.where(eq(users.id, targetUserId))
		.returning();

	await logActivity({
		actorUserId: actor.id,
		action: 'user.password_reset',
		targetType: 'user',
		targetId: updated.id
	});

	return json({
		user: { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role }
	});
};
