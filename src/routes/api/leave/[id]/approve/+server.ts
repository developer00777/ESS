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

const newStatusFor = (decision: 'approve' | 'reject') =>
	decision === 'approve' ? ('approved' as const) : ('rejected' as const);

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

	// A decided application is normally final. A Super Admin may still overturn
	// it — an approval given in error otherwise has no route back, and the
	// employee's balance stays spent. Reversing settles the balance below rather
	// than only flipping the status.
	const isReversal = application.status !== 'pending';
	if (isReversal) {
		if (approver.role !== 'super_admin') {
			throw error(403, 'Only a Super Admin can change a decision that has already been made');
		}
		if (application.status !== 'approved' && application.status !== 'rejected') {
			throw error(400, `A ${application.status} application cannot be reversed`);
		}
		if (application.status === newStatusFor(decision)) {
			throw error(400, `This application is already ${application.status}`);
		}
	}

	const [applicant] = await db.select().from(users).where(eq(users.id, application.userId)).limit(1);
	if (!applicant) throw error(404, 'Applicant not found');

	// Reversal is Super-Admin-only (enforced above), so these Team Lead limits
	// only ever apply to a first decision.
	if (!isReversal && approver.role === 'team_lead') {
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

	const newStatus = newStatusFor(decision);
	const days = Number(application.days);

	// The balance only moves when the *approved-ness* changes: pending→rejected
	// never spent anything, and approved→rejected has to give it back.
	const wasApproved = application.status === 'approved';
	const nowApproved = newStatus === 'approved';
	const balanceDelta = (nowApproved ? days : 0) - (wasApproved ? days : 0);

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

	// Re-approving something previously rejected spends the balance again, so it
	// has to be affordable now — the days may have been used elsewhere since.
	if (balanceDelta > 0 && allocation) {
		const remaining = Number(allocation.allocatedDays) - Number(allocation.usedDays);
		if (balanceDelta > remaining) {
			throw error(
				400,
				`Cannot approve: ${applicant.fullName} has ${remaining} day(s) left but this request needs ${days}`
			);
		}
	}

	await db
		.update(leaveApplications)
		.set({
			status: newStatus,
			approverId: approver.id,
			decidedAt: new Date(),
			decisionNote: note ?? null
		})
		.where(eq(leaveApplications.id, applicationId));

	if (balanceDelta !== 0) {
		if (allocation) {
			// Clamped at zero so a double-reversal can never drive usedDays negative
			// and hand out days the employee was never allocated.
			const nextUsed = Math.max(0, Number(allocation.usedDays) + balanceDelta);
			await db
				.update(leaveAllocations)
				.set({ usedDays: String(nextUsed) })
				.where(eq(leaveAllocations.id, allocation.id));
		}

		// The original approval entry is left in place — the ledger records what
		// happened, so a reversal reads as approve-then-refund rather than the
		// approval never having existed.
		await db.insert(leaveLedger).values({
			userId: application.userId,
			leaveTypeId: application.leaveTypeId,
			delta: String(-balanceDelta),
			reason: isReversal
				? nowApproved
					? 'Rejection reversed — leave re-approved'
					: 'Approval reversed by Super Admin'
				: 'Leave approved',
			relatedApplicationId: application.id
		});
	}

	await logActivity({
		actorUserId: approver.id,
		action: isReversal ? `leave.reversed_to_${newStatus}` : `leave.${newStatus}`,
		targetType: 'leave_application',
		targetId: application.id,
		details: {
			previousStatus: application.status,
			newStatus,
			days,
			balanceDelta,
			reversal: isReversal
		}
	});

	return json({ status: newStatus, reversed: isReversal, balanceDelta });
};
