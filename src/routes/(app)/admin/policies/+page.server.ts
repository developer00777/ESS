import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { shiftGroups, holidayCalendars, holidays, leaveTypes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	if (user.role !== 'super_admin') {
		throw redirect(303, '/dashboard');
	}

	const groups = await db.select().from(shiftGroups);
	const calendars = await db
		.select()
		.from(holidayCalendars)
		.where(eq(holidayCalendars.status, 'published'));
	const holidayRows = await db.select().from(holidays);
	const types = await db.select().from(leaveTypes);

	return {
		shiftGroups: groups,
		publishedCalendars: calendars.map((c) => ({
			...c,
			holidays: holidayRows.filter((h) => h.calendarId === c.id)
		})),
		leaveTypes: types
	};
};
