import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { leaveAllocations, leaveApplications, attendance } from '$lib/server/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

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

	return {
		leaveBalance,
		attendancePct,
		pendingCount: Number(pendingLeaveCount[0]?.count ?? 0)
	};
};
