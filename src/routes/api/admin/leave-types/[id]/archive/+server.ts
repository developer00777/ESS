import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { leaveTypes } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async (event) => {
	const user = requireRole(event, ['super_admin']);
	const leaveTypeId = event.params.id;

	const [existing] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId)).limit(1);
	if (!existing) {
		throw error(404, 'Leave type not found');
	}

	const [archived] = await db
		.update(leaveTypes)
		.set({ isActive: false })
		.where(eq(leaveTypes.id, leaveTypeId))
		.returning();

	await logActivity({
		actorUserId: user.id,
		action: 'leave_type.archive',
		targetType: 'leave_type',
		targetId: leaveTypeId,
		details: { code: existing.code, name: existing.name }
	});

	return json({ leaveType: archived });
};
