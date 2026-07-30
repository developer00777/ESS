import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { attendance } from '$lib/server/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const today = new Date().toISOString().slice(0, 10);
	const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
		.toISOString()
		.slice(0, 10);

	const [todayRow] = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), eq(attendance.date, today)))
		.limit(1);

	const history = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), gte(attendance.date, monthStart)))
		.orderBy(desc(attendance.date));

	const presentDays = history.filter((r) => r.checkInAt).length;
	const businessDaysSoFar = new Date().getDate();

	const completedShifts = history.filter((r) => r.checkInAt && r.checkOutAt);
	const avgHours =
		completedShifts.length > 0
			? completedShifts.reduce((sum, r) => {
					const hrs = (new Date(r.checkOutAt!).getTime() - new Date(r.checkInAt!).getTime()) / 3_600_000;
					return sum + hrs;
				}, 0) / completedShifts.length
			: 0;

	return {
		today: todayRow ?? null,
		history,
		presentDays,
		businessDaysSoFar,
		avgHours
	};
};
