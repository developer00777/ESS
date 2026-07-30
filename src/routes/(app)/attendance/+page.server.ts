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

	return { today: todayRow ?? null, history };
};
