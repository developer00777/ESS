import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { logActivity } from '$lib/server/db/mongo';
import { deleteLeaveType } from '$lib/server/admin-cleanup';

/**
 * Permanently deletes a leave type along with every allocation, application
 * and ledger entry that used it.
 *
 * This is for types created in error — duplicates left by seeding. To retire a
 * policy that people have genuinely taken leave under, archive it instead
 * (POST .../archive), which hides it while preserving the history.
 */
export const DELETE: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin']);
	const leaveTypeId = event.params.id;

	let result;
	try {
		result = await deleteLeaveType(leaveTypeId);
	} catch (err) {
		throw error(404, err instanceof Error ? err.message : 'Leave type not found');
	}

	await logActivity({
		actorUserId: actor.id,
		action: 'leave_type.delete',
		targetType: 'leave_type',
		targetId: leaveTypeId,
		details: { name: result.name, affectedRows: result.affected }
	});

	return json({ deleted: result });
};
