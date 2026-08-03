import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	leaveAllocations,
	leaveApplications,
	attendance,
	leaveTypes,
	users,
	employeeProfiles,
	holidayCalendars,
	holidays
} from '$lib/server/db/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { getUsersWithProfilePicture } from '$lib/server/db/mongo';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const year = new Date().getFullYear();

	const allocations = await db
		.select()
		.from(leaveAllocations)
		.where(and(eq(leaveAllocations.userId, user.id), eq(leaveAllocations.year, year)));

	const leaveBalance = allocations.reduce(
		(sum, a) => sum + (Number(a.allocatedDays) - Number(a.usedDays)),
		0
	);

	const pendingLeaveCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(leaveApplications)
		.where(and(eq(leaveApplications.userId, user.id), eq(leaveApplications.status, 'pending')));

	const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
		.toISOString()
		.slice(0, 10);

	const attendanceRows = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), gte(attendance.date, monthStart)));

	const daysWithCheckIn = attendanceRows.filter((r) => r.checkInAt).length;
	const businessDaysSoFar = new Date().getDate();
	const attendancePct =
		businessDaysSoFar > 0 ? Math.round((daysWithCheckIn / businessDaysSoFar) * 100) : 0;

	// Sparkline over the last 7 days: full bar on a day with a check-in, a low
	// stub otherwise. Real data — the KPI card never shows a decorative trend.
	const attendanceByDate = new Set(
		attendanceRows.filter((r) => r.checkInAt).map((r) => r.date)
	);
	const attendanceSpark: number[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		attendanceSpark.push(attendanceByDate.has(iso) ? 100 : 14);
	}

	const leaveTypeCount = allocations.length;

	const applicantColumns = { id: users.id, fullName: users.fullName, teamId: users.teamId };

	let approvalQueue: Array<{
		application: typeof leaveApplications.$inferSelect;
		type: typeof leaveTypes.$inferSelect;
		applicant: { id: string; fullName: string; teamId: string | null };
	}> = [];

	if (user.role === 'team_lead' || user.role === 'super_admin') {
		const base = db
			.select({ application: leaveApplications, type: leaveTypes, applicant: applicantColumns })
			.from(leaveApplications)
			.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
			.innerJoin(users, eq(leaveApplications.userId, users.id));

		approvalQueue =
			user.role === 'super_admin'
				? await base.where(eq(leaveApplications.status, 'pending')).orderBy(desc(leaveApplications.createdAt))
				: await base.where(
						and(eq(leaveApplications.status, 'pending'), eq(users.teamId, user.teamId ?? ''))
					).orderBy(desc(leaveApplications.createdAt));
	}

	const today = new Date().toISOString().slice(0, 10);
	let upcomingHolidays: (typeof holidays.$inferSelect)[] = [];

	if (user.role === 'super_admin') {
		const publishedCalendars = await db
			.select({ id: holidayCalendars.id })
			.from(holidayCalendars)
			.where(eq(holidayCalendars.status, 'published'));
		if (publishedCalendars.length > 0) {
			upcomingHolidays = await db
				.select()
				.from(holidays)
				.where(
					and(
						sql`${holidays.calendarId} in ${publishedCalendars.map((c) => c.id)}`,
						gte(holidays.date, today)
					)
				)
				.orderBy(holidays.date)
				.limit(2);
		}
	} else {
		const [profile] = await db
			.select()
			.from(employeeProfiles)
			.where(eq(employeeProfiles.userId, user.id))
			.limit(1);

		if (profile?.shiftGroupId) {
			const [calendar] = await db
				.select()
				.from(holidayCalendars)
				.where(
					and(eq(holidayCalendars.shiftGroupId, profile.shiftGroupId), eq(holidayCalendars.status, 'published'))
				)
				.orderBy(desc(holidayCalendars.year))
				.limit(1);
			if (calendar) {
				upcomingHolidays = await db
					.select()
					.from(holidays)
					.where(and(eq(holidays.calendarId, calendar.id), gte(holidays.date, today)))
					.orderBy(holidays.date)
					.limit(2);
			}
		}
	}

	const applicantsWithPictures = await getUsersWithProfilePicture(
		approvalQueue.map((r) => r.applicant.id)
	);

	return {
		leaveBalance,
		leaveTypeCount,
		attendancePct,
		attendanceSpark,
		daysWithCheckIn,
		businessDaysSoFar,
		pendingCount: Number(pendingLeaveCount[0]?.count ?? 0),
		approvalQueue: approvalQueue.map((r) => ({
			...r,
			applicantHasPicture: applicantsWithPictures.has(r.applicant.id)
		})),
		upcomingHolidays
	};
};
