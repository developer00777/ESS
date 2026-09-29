import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { shiftGroups, holidayCalendars, holidays, leaveTypes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { gateAdminPage } from '$lib/server/capabilities';

export const load: PageServerLoad = async ({ locals }) => {
	gateAdminPage(locals, ['policies.publish']);
	const user = locals.user!;

	const groups = await db.select().from(shiftGroups);
	const groupById = new Map(groups.map((g) => [g.id, g]));
	const calendars = await db
		.select()
		.from(holidayCalendars)
		.where(eq(holidayCalendars.status, 'published'));
	const holidayRows = await db.select().from(holidays);
	const types = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));

	return {
		shiftGroups: groups,
		publishedCalendars: calendars.map((c) => ({
			...c,
			shiftGroupName: groupById.get(c.shiftGroupId)?.name ?? 'Unknown shift group',
			holidays: holidayRows.filter((h) => h.calendarId === c.id)
		})),
		leaveTypes: types
	};
};
