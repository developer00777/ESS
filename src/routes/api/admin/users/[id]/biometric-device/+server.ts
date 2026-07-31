import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { employeeProfiles } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq } from 'drizzle-orm';

// Maps a user to their EasyTime Pro / ZKTeco device enrollment number (PIN), so incoming
// biometric punches from the device-push endpoint can be attributed to the right employee.
export const PUT: RequestHandler = async (event) => {
	const user = requireRole(event, ['super_admin', 'admin']);
	const userId = event.params.id;
	const { biometricDeviceId } = await event.request.json();

	if (!biometricDeviceId || typeof biometricDeviceId !== 'string') {
		throw error(400, 'biometricDeviceId is required');
	}

	const [existing] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, userId))
		.limit(1);
	if (!existing) {
		throw error(404, 'Employee profile not found');
	}

	const [updated] = await db
		.update(employeeProfiles)
		.set({ biometricDeviceId, updatedAt: new Date() })
		.where(eq(employeeProfiles.userId, userId))
		.returning();

	await logActivity({
		actorUserId: user.id,
		action: 'employee_profile.set_biometric_device_id',
		targetType: 'user',
		targetId: userId,
		details: { biometricDeviceId }
	});

	return json({ profile: updated });
};
