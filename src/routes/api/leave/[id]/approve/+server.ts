import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	leaveApplications,
	leaveAllocations,
	leaveLedger,
	teams,
	users
} from '$lib/server/db/schema';
import { requireRole } from '$lib/server/rbac';
import { eq, and } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';

export const POST: RequestHandler = async (event) => {
	const approver = requireRole(event, ['team_lead', 'super_admin']);
	const applicationId = event.params.id!;
	const { decision, note } = await event.request.json(); // decision: 'approve' | 'reject'

	if (decision !== 'approve' && decision !== 'reject') {
		throw error(400, "decision must be 'approve' or 'reject'");
	}

	const [application] = await db
		.select()
		.from(leaveApplications)
		.where(eq(leaveApplications.id, applicationId))
		.limit(1);

	if (!application) throw error(404, 'Leave application not found');
	if (application.status !== 'pending') throw error(400, 'Application already decided');

	const [applicant] = await db.select().from(users).where(eq(users.id, application.userId)).limit(1);
	if (!applicant) throw error(404, 'Applicant not found');

	if (approver.role === 'team_lead') {
		const isOwnTeam = applicant.teamId === approver.teamId;
		if (!isOwnTeam) throw error(403, 'Not authorized for this team');

		// A Team Lead cannot approve their own leave — must escalate to Super Admin.
		if (applicant.id === approver.id) {
			throw error(403, 'Team Leads cannot approve their own leave; escalate to Super Admin');
		}

		const [team] = await db.select().from(teams).where(eq(teams.id, approver.teamId ?? '')).limit(1);
		const threshold = team?.maxLeaveDaysAutoApprove ?? 2;
		if (Number(application.days) > threshold) {
			throw error(
				403,
				`Exceeds auto-approve threshold of ${threshold} day(s); must be approved by Super Admin`
			);
		}
	}

	const newStatus = decision === 'approve' ? 'approved' : 'rejected';

	await db
		.update(leaveApplications)
		.set({
			status: newStatus,
			approverId: approver.id,
			decidedAt: new Date(),
			decisionNote: note ?? null
		})
		.where(eq(leaveApplications.id, applicationId));

	if (newStatus === 'approved') {
		const year = new Date(application.startDate).getFullYear();
		const [allocation] = await db
			.select()
			.from(leaveAllocations)
			.where(
				and(
					eq(leaveAllocations.userId, application.userId),
					eq(leaveAllocations.leaveTypeId, application.leaveTypeId),
					eq(leaveAllocations.year, year)
				)
			)
			.limit(1);

		if (allocation) {
			await db
				.update(leaveAllocations)
				.set({ usedDays: String(Number(allocation.usedDays) + Number(application.days)) })
				.where(eq(leaveAllocations.id, allocation.id));
		}

		await db.insert(leaveLedger).values({
			userId: application.userId,
			leaveTypeId: application.leaveTypeId,
			delta: String(-Number(application.days)),
			reason: 'Leave approved',
			relatedApplicationId: application.id
		});
	}

	await logActivity({
		actorUserId: approver.id,
		action: `leave.${newStatus}`,
		targetType: 'leave_application',
		targetId: application.id
	});

	return json({ status: newStatus });
};
