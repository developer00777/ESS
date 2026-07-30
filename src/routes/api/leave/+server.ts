import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { leaveApplications, leaveAllocations, users } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/rbac';
import { and, eq } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';

function businessDaysBetween(start: Date, end: Date): number {
	let count = 0;
	const cur = new Date(start);
	while (cur <= end) {
		const day = cur.getDay();
		if (day !== 0 && day !== 6) count++;
		cur.setDate(cur.getDate() + 1);
	}
	return count;
}

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const { leaveTypeId, startDate, endDate, reason } = await event.request.json();

	if (!leaveTypeId || !startDate || !endDate) {
		throw error(400, 'leaveTypeId, startDate, and endDate are required');
	}

	const start = new Date(startDate);
	const end = new Date(endDate);
	if (end < start) {
		throw error(400, 'endDate cannot be before startDate');
	}
	const days = businessDaysBetween(start, end);

	const [allocation] = await db
		.select()
		.from(leaveAllocations)
		.where(
			and(
				eq(leaveAllocations.userId, user.id),
				eq(leaveAllocations.leaveTypeId, leaveTypeId),
				eq(leaveAllocations.year, start.getFullYear())
			)
		)
		.limit(1);

	if (allocation) {
		const remaining = Number(allocation.allocatedDays) - Number(allocation.usedDays);
		if (days > remaining) {
			throw error(400, `Insufficient leave balance: ${remaining} day(s) remaining`);
		}
	}

	// Auto-escalation: if the requester is a Team Lead, or the request exceeds
	// their team's auto-approve threshold, it still routes to reports_to first —
	// the approve endpoint enforces the Super Admin escalation at decision time.
	const [applied] = await db
		.insert(leaveApplications)
		.values({
			userId: user.id,
			leaveTypeId,
			startDate,
			endDate,
			days: String(days),
			reason: reason ?? null,
			status: 'pending'
		})
		.returning();

	await logActivity({
		actorUserId: user.id,
		action: 'leave.apply',
		targetType: 'leave_application',
		targetId: applied.id,
		details: { days, leaveTypeId }
	});

	return json({ application: applied }, { status: 201 });
};

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const scope = event.url.searchParams.get('scope'); // 'mine' | 'team'

	if (scope === 'team' && (user.role === 'team_lead' || user.role === 'super_admin')) {
		const applicantColumns = {
			id: users.id,
			fullName: users.fullName,
			email: users.email,
			role: users.role,
			teamId: users.teamId
		};
		const rows =
			user.role === 'super_admin'
				? await db
						.select({ application: leaveApplications, applicant: applicantColumns })
						.from(leaveApplications)
						.innerJoin(users, eq(leaveApplications.userId, users.id))
				: await db
						.select({ application: leaveApplications, applicant: applicantColumns })
						.from(leaveApplications)
						.innerJoin(users, eq(leaveApplications.userId, users.id))
						.where(eq(users.teamId, user.teamId ?? ''));

		return json({ applications: rows });
	}

	const rows = await db
		.select()
		.from(leaveApplications)
		.where(eq(leaveApplications.userId, user.id));

	return json({ applications: rows });
};
