import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	users,
	teams,
	attendance,
	leaveApplications,
	leaveAllocations,
	shiftGroups,
	holidayCalendars,
	employeeProfiles
} from '$lib/server/db/schema';
import { eq, and, inArray, lte, gte } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';
import { randomBytes } from 'node:crypto';
import { logActivity } from '$lib/server/db/mongo';
import { requireRole, canCreateRole } from '$lib/server/rbac';
import { type Role } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	if (user.role === 'employee') {
		throw redirect(303, '/dashboard');
	}

	const roster =
		user.role === 'super_admin'
			? await db.select().from(users)
			: await db.select().from(users).where(eq(users.teamId, user.teamId ?? ''));

	const today = new Date().toISOString().slice(0, 10);
	const todaysAttendance = await db.select().from(attendance).where(eq(attendance.date, today));
	const attendanceByUser = new Map(todaysAttendance.map((a) => [a.userId, a]));

	const pendingApprovalRows = await db
		.select({ application: leaveApplications, applicant: users })
		.from(leaveApplications)
		.innerJoin(users, eq(leaveApplications.userId, users.id))
		.where(
			user.role === 'super_admin'
				? eq(leaveApplications.status, 'pending')
				: and(eq(leaveApplications.status, 'pending'), eq(users.teamId, user.teamId ?? ''))
		);

	const year = new Date().getFullYear();
	const rosterIds = roster.map((r) => r.id);
	const allocations =
		rosterIds.length > 0
			? await db
					.select()
					.from(leaveAllocations)
					.where(and(inArray(leaveAllocations.userId, rosterIds), eq(leaveAllocations.year, year)))
			: [];
	const balanceByUser = new Map<string, number>();
	for (const a of allocations) {
		const remaining = Number(a.allocatedDays) - Number(a.usedDays);
		balanceByUser.set(a.userId, (balanceByUser.get(a.userId) ?? 0) + remaining);
	}

	const onLeaveToday =
		rosterIds.length > 0
			? await db
					.select({ userId: leaveApplications.userId })
					.from(leaveApplications)
					.where(
						and(
							inArray(leaveApplications.userId, rosterIds),
							eq(leaveApplications.status, 'approved'),
							lte(leaveApplications.startDate, today),
							gte(leaveApplications.endDate, today)
						)
					)
			: [];

	const creatableRoles: Role[] =
		user.role === 'super_admin'
			? ['super_admin', 'admin', 'team_lead', 'employee']
			: user.role === 'admin'
				? ['team_lead', 'employee']
				: ['employee'];

	// Only shift groups with a currently-published holiday calendar are offered when
	// creating a login, so every new employee resolves to a real calendar immediately.
	const groupsWithPublishedCalendar = await db
		.selectDistinct({ id: shiftGroups.id, name: shiftGroups.name })
		.from(shiftGroups)
		.innerJoin(holidayCalendars, eq(holidayCalendars.shiftGroupId, shiftGroups.id))
		.where(eq(holidayCalendars.status, 'published'));

	const rosterWithStatus = roster.map((r) => ({
		id: r.id,
		fullName: r.fullName,
		email: r.email,
		role: r.role,
		isActive: r.isActive,
		leaveLeft: balanceByUser.get(r.id) ?? 0,
		status: attendanceByUser.get(r.id)?.checkInAt
			? attendanceByUser.get(r.id)?.checkOutAt
				? 'left'
				: 'present'
			: 'absent'
	}));

	return {
		roster: rosterWithStatus,
		teamSize: rosterWithStatus.length,
		presentNow: rosterWithStatus.filter((r) => r.status === 'present').length,
		onLeave: new Set(onLeaveToday.map((r) => r.userId)).size,
		pendingApprovals: pendingApprovalRows.length,
		creatableRoles,
		shiftGroups: groupsWithPublishedCalendar
	};
};

export const actions: Actions = {
	createEmployee: async (event) => {
		const actor = requireRole(event, ['super_admin', 'admin', 'team_lead']);
		const { request } = event;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').toLowerCase();
		const fullName = String(form.get('fullName') ?? '');
		const requestedRole = (String(form.get('role') ?? 'employee') || 'employee') as Role;
		const shiftGroupId = String(form.get('shiftGroupId') ?? '');

		if (!email || !fullName) {
			return { success: false, message: 'Email and name are required' };
		}

		if (!shiftGroupId) {
			return { success: false, message: 'Shift group is required' };
		}

		if (!canCreateRole(actor, requestedRole)) {
			return { success: false, message: `${actor.role} accounts may not create ${requestedRole} accounts` };
		}

		if (actor.role === 'team_lead') {
			const [team] = await db.select().from(teams).where(eq(teams.id, actor.teamId ?? '')).limit(1);
			if (!team?.canCreateEmployeeLogins) {
				return { success: false, message: 'This Team Lead does not have permission to create employee logins' };
			}
		}

		const [eligibleGroup] = await db
			.select({ id: shiftGroups.id })
			.from(shiftGroups)
			.innerJoin(holidayCalendars, eq(holidayCalendars.shiftGroupId, shiftGroups.id))
			.where(and(eq(shiftGroups.id, shiftGroupId), eq(holidayCalendars.status, 'published')))
			.limit(1);

		if (!eligibleGroup) {
			return { success: false, message: 'Selected shift group has no published holiday calendar' };
		}

		const tempPassword = randomBytes(9).toString('base64url');
		const passwordHash = await hashPassword(tempPassword);

		const [created] = await db
			.insert(users)
			.values({
				email,
				passwordHash,
				role: requestedRole,
				fullName,
				teamId: actor.teamId,
				reportsTo: actor.id,
				isActive: true,
				mustChangePassword: true
			})
			.returning();

		await db.insert(employeeProfiles).values({
			userId: created.id,
			shiftGroupId
		});

		await logActivity({
			actorUserId: actor.id,
			action: 'user.create',
			targetType: 'user',
			targetId: created.id,
			details: { role: requestedRole, shiftGroupId }
		});

		return { success: true, tempPassword, email };
	}
};
