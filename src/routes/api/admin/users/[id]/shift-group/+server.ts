import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { employeeProfiles, shiftGroups } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq } from 'drizzle-orm';

/**
 * Assigns an employee to a shift group. The shift group is what resolves their
 * holiday calendar and working days, so an unset one leaves Policies showing
 * "your shift group isn't set yet" with no way for HR to fix it — it was only
 * ever settable at login-creation time before this.
 *
 * Passing shiftGroupId: null clears the assignment.
 */
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin', 'admin']);
	const userId = event.params.id;
	const { shiftGroupId } = await event.request.json();

	if (shiftGroupId !== null && typeof shiftGroupId !== 'string') {
		throw error(400, 'shiftGroupId must be a shift group id or null');
	}

	const [profile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, userId))
		.limit(1);
	if (!profile) throw error(404, 'Employee profile not found');

	let groupName: string | null = null;
	if (shiftGroupId) {
		const [group] = await db
			.select({ id: shiftGroups.id, name: shiftGroups.name })
			.from(shiftGroups)
			.where(eq(shiftGroups.id, shiftGroupId))
			.limit(1);
		if (!group) throw error(404, 'Shift group not found');
		groupName = group.name;
	}

	const [updated] = await db
		.update(employeeProfiles)
		.set({ shiftGroupId: shiftGroupId ?? null, updatedAt: new Date() })
		.where(eq(employeeProfiles.userId, userId))
		.returning();

	await logActivity({
		actorUserId: actor.id,
		action: 'employee_profile.set_shift_group',
		targetType: 'user',
		targetId: userId,
		details: { shiftGroupId, shiftGroupName: groupName, previous: profile.shiftGroupId }
	});

	return json({ profile: updated });
};
