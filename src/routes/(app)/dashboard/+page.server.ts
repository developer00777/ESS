import { attendanceWindow, buildAttendanceHeatmap } from '$lib/dashboard-analytics';
import { tenureFrom } from '$lib/tenure';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	leaveAllocations,
	leaveApplications,
	attendance,
	attendanceDeviations,
	leaveTypes,
	users,
	employeeProfiles,
	holidayCalendars,
	holidays
} from '$lib/server/db/schema';
import { eq, and, gte, lt, sql, desc } from 'drizzle-orm';
import { getUsersWithProfilePicture } from '$lib/server/db/mongo';
import { ensureLeaveAllocations } from '$lib/server/leave-accrual';
import { meetingsToday } from '$lib/server/meetings/service';

const pad = (n: number) => String(n).padStart(2, '0');

/** `date` columns come back as local-midnight Dates; read the calendar day from the parts. */
function dateKey(value: string | Date): string {
	if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
	return String(value).slice(0, 10);
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const year = new Date().getFullYear();

	// Keep the balance tile on the policy's monthly accrual schedule.
	await ensureLeaveAllocations([user.id]);

	const allocations = await db
		.select()
		.from(leaveAllocations)
		.where(and(eq(leaveAllocations.userId, user.id), eq(leaveAllocations.year, year)));

	const leaveBalance = allocations.reduce((sum, a) => sum + (Number(a.allocatedDays) - Number(a.usedDays)), 0);
	const leaveAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedDays), 0);

	const pendingLeaveCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(leaveApplications)
		.where(and(eq(leaveApplications.userId, user.id), eq(leaveApplications.status, 'pending')));

	const now = new Date();
	const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
	const today = dateKey(now);

	const attendanceRows = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), gte(attendance.date, monthStart)));

	const daysWithCheckIn = attendanceRows.filter((r) => r.checkInAt).length;
	const businessDaysSoFar = now.getDate();
	const attendancePct = businessDaysSoFar > 0 ? Math.round((daysWithCheckIn / businessDaysSoFar) * 100) : 0;

	// Sparkline over the last 7 days: full bar on a day with a check-in, a low
	// stub otherwise. Real data — the KPI card never shows a decorative trend.
	const attendanceByDate = new Set(attendanceRows.filter((r) => r.checkInAt).map((r) => dateKey(r.date)));
	const attendanceSpark: number[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		attendanceSpark.push(attendanceByDate.has(dateKey(d)) ? 100 : 14);
	}

	const leaveTypeCount = allocations.length;

	// Today's own punch, for the first entry on the timeline.
	const todayRow = attendanceRows.find((r) => dateKey(r.date) === today) ?? null;

	// Recent days with a check-in but no check-out, which the person may want to
	// correct. A day already raised as a correction is not nagged about again.
	const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
	const recentRows = await db
		.select({ date: attendance.date, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt })
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), gte(attendance.date, dateKey(weekAgo)), lt(attendance.date, today)));
	const myDeviations = await db
		.select({ id: attendanceDeviations.id, date: attendanceDeviations.date, reason: attendanceDeviations.reason, status: attendanceDeviations.status, createdAt: attendanceDeviations.createdAt })
		.from(attendanceDeviations)
		.where(eq(attendanceDeviations.userId, user.id))
		.orderBy(desc(attendanceDeviations.createdAt))
		.limit(5);
	const raisedDates = new Set(myDeviations.map((d) => dateKey(d.date)));
	const missingCheckOuts = recentRows
		.filter((r) => r.checkInAt && !r.checkOutAt && !raisedDates.has(dateKey(r.date)))
		.map((r) => ({ date: dateKey(r.date), checkInAt: r.checkInAt }))
		.sort((a, b) => b.date.localeCompare(a.date));

	// The person's own recent leave requests: the newest drives "Request
	// progress", the rest feed the activity list.
	const myLeave = await db
		.select({ application: leaveApplications, typeName: leaveTypes.name })
		.from(leaveApplications)
		.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
		.where(eq(leaveApplications.userId, user.id))
		.orderBy(desc(leaveApplications.createdAt))
		.limit(5);
	const latestRequest = myLeave[0]
		? {
				id: myLeave[0].application.id,
				status: myLeave[0].application.status,
				startDate: dateKey(myLeave[0].application.startDate),
				endDate: dateKey(myLeave[0].application.endDate),
				days: Number(myLeave[0].application.days),
				createdAt: myLeave[0].application.createdAt.toISOString(),
				decidedAt: myLeave[0].application.decidedAt?.toISOString() ?? null,
				typeName: myLeave[0].typeName
			}
		: null;
	const approvedThisMonth = myLeave.filter((r) => r.application.status === 'approved' && dateKey(r.application.startDate) >= monthStart).length;

	type Activity = { key: string; at: string; title: string; detail: string; kind: 'checkin' | 'leave' | 'deviation'; status: string };
	const activity: Activity[] = [];
	if (todayRow?.checkInAt) {
		activity.push({ key: 'checkin', at: todayRow.checkInAt.toISOString(), title: 'Checked in', detail: todayRow.source === 'biometric' ? 'Biometric punch' : 'Portal', kind: 'checkin', status: 'present' });
	}
	for (const r of myLeave) {
		activity.push({
			key: `leave-${r.application.id}`,
			at: r.application.createdAt.toISOString(),
			title: 'Leave request submitted',
			detail: `${r.typeName} · ${dateKey(r.application.startDate)} – ${dateKey(r.application.endDate)} · ${Number(r.application.days)} day${Number(r.application.days) === 1 ? '' : 's'}`,
			kind: 'leave',
			status: r.application.status
		});
	}
	for (const d of myDeviations) {
		activity.push({
			key: `dev-${d.id}`,
			at: d.createdAt.toISOString(),
			title: 'Attendance correction submitted',
			detail: `For ${dateKey(d.date)} · ${d.reason.replace(/_/g, ' ')}`,
			kind: 'deviation',
			status: d.status
		});
	}
	activity.sort((a, b) => b.at.localeCompare(a.at));

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
				: await base.where(and(eq(leaveApplications.status, 'pending'), eq(users.teamId, user.teamId ?? ''))).orderBy(desc(leaveApplications.createdAt));
	}

	let upcomingHolidays: (typeof holidays.$inferSelect)[] = [];

	if (user.role === 'super_admin') {
		const publishedCalendars = await db.select({ id: holidayCalendars.id }).from(holidayCalendars).where(eq(holidayCalendars.status, 'published'));
		if (publishedCalendars.length > 0) {
			upcomingHolidays = await db
				.select()
				.from(holidays)
				.where(and(sql`${holidays.calendarId} in ${publishedCalendars.map((c) => c.id)}`, gte(holidays.date, today)))
				.orderBy(holidays.date)
				.limit(2);
		}
	} else {
		const [profile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1);

		if (profile?.shiftGroupId) {
			const [calendar] = await db
				.select()
				.from(holidayCalendars)
				.where(and(eq(holidayCalendars.shiftGroupId, profile.shiftGroupId), eq(holidayCalendars.status, 'published')))
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

	const [applicantsWithPictures, todaysMeetings] = await Promise.all([
		getUsersWithProfilePicture(approvalQueue.map((r) => r.applicant.id)),
		meetingsToday(user).catch(() => [])
	]);

	const analyticsToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
	const window = attendanceWindow(analyticsToday);
	const [profileRows, punchRows] = await Promise.all([
		db.select({ dateOfJoining: employeeProfiles.dateOfJoining, designation: employeeProfiles.designation }).from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1),
		db.select({ date: attendance.date, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt }).from(attendance).where(and(eq(attendance.userId, user.id), gte(attendance.date, window.start), lt(attendance.date, new Date(Date.parse(analyticsToday + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10))))
	]);
	const heatmap = buildAttendanceHeatmap(analyticsToday, punchRows.map(r => ({ ...r, date: dateKey(r.date) })));
	const monthCells = heatmap.filter(c => c.date.startsWith(analyticsToday.slice(0, 7)) && c.date <= analyticsToday);
	return {
		analytics: {
			heatmap, today: analyticsToday, updatedAt: new Date().toISOString(),
			tenure: tenureFrom(profileRows[0]?.dateOfJoining, new Date(analyticsToday + 'T12:00:00')),
			joiningDate: profileRows[0]?.dateOfJoining ?? null,
			designation: profileRows[0]?.designation ?? null,
			recordedDays: monthCells.filter(c => c.recorded).length,
			recordedHours: Math.round(monthCells.reduce((sum, c) => sum + c.hours, 0) * 10) / 10,
			completeDays: monthCells.filter(c => c.complete).length
		},
		leaveBalance,
		leaveAllocated,
		leaveTypeCount,
		attendancePct,
		attendanceSpark,
		attendanceMonth: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
		attendanceCalendar: Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => {
			const day = i + 1;
			const date = monthStart.slice(0, 8) + pad(day);
			return { date, day, label: day + ' ' + now.toLocaleDateString('en-IN', { month: 'short' }), future: date > today, recorded: attendanceByDate.has(date), total: [...attendanceByDate].filter(key => key <= date).length };
		}),
		daysWithCheckIn,
		businessDaysSoFar,
		pendingCount: Number(pendingLeaveCount[0]?.count ?? 0),
		approvedThisMonth,
		todayAttendance: todayRow
			? { checkInAt: todayRow.checkInAt?.toISOString() ?? null, checkOutAt: todayRow.checkOutAt?.toISOString() ?? null, source: todayRow.source }
			: null,
		missingCheckOuts: missingCheckOuts.map((m) => ({ date: m.date, checkInAt: m.checkInAt?.toISOString() ?? null })),
		latestRequest,
		activity: activity.slice(0, 6),
		meetingsToday: todaysMeetings,
		approvalQueue: approvalQueue.map((r) => ({
			...r,
			applicantHasPicture: applicantsWithPictures.has(r.applicant.id)
		})),
		upcomingHolidays: upcomingHolidays.map((h) => ({ ...h, date: dateKey(h.date) }))
	};
};
