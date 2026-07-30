import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	leaveApplications,
	leaveAllocations,
	leaveTypes,
	users,
	employeeProfiles,
	holidayCalendars,
	holidays
} from '$lib/server/db/schema';
import { eq, and, desc, inArray, ne } from 'drizzle-orm';

/**
 * Every role reads the same published holiday calendar rows and the same
 * leaveApplications table — only the scope of *which* applications differs.
 * There is exactly one calendar per shift group (Super Admin publishes it,
 * see (app)/admin/policies); nothing here creates a separate view of it.
 */
async function loadCalendarEvents(user: { id: string; role: string; teamId: string | null }) {
	const [profile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, user.id))
		.limit(1);

	let calendarHolidays: (typeof holidays.$inferSelect)[] = [];

	if (user.role === 'super_admin') {
		// Org-wide view: every published calendar's holidays, so Super Admin sees the full picture.
		const publishedCalendars = await db
			.select({ id: holidayCalendars.id })
			.from(holidayCalendars)
			.where(eq(holidayCalendars.status, 'published'));
		if (publishedCalendars.length > 0) {
			calendarHolidays = await db
				.select()
				.from(holidays)
				.where(
					inArray(
						holidays.calendarId,
						publishedCalendars.map((c) => c.id)
					)
				);
		}
	} else if (profile?.shiftGroupId) {
		const [calendar] = await db
			.select()
			.from(holidayCalendars)
			.where(and(eq(holidayCalendars.shiftGroupId, profile.shiftGroupId), eq(holidayCalendars.status, 'published')))
			.orderBy(desc(holidayCalendars.year))
			.limit(1);
		if (calendar) {
			calendarHolidays = await db.select().from(holidays).where(eq(holidays.calendarId, calendar.id));
		}
	}

	const applicantColumns = { id: users.id, fullName: users.fullName, teamId: users.teamId };

	let leaveEvents: Array<{
		application: typeof leaveApplications.$inferSelect;
		type: typeof leaveTypes.$inferSelect;
		applicant: { id: string; fullName: string; teamId: string | null };
	}>;

	const base = db
		.select({ application: leaveApplications, type: leaveTypes, applicant: applicantColumns })
		.from(leaveApplications)
		.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
		.innerJoin(users, eq(leaveApplications.userId, users.id));

	if (user.role === 'super_admin') {
		leaveEvents = await base.where(ne(leaveApplications.status, 'cancelled'));
	} else if (user.role === 'team_lead') {
		leaveEvents = await base.where(
			and(eq(users.teamId, user.teamId ?? ''), ne(leaveApplications.status, 'cancelled'))
		);
	} else {
		leaveEvents = await base.where(eq(leaveApplications.userId, user.id));
	}

	return { calendarHolidays, leaveEvents };
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const year = new Date().getFullYear();

	const allocations = await db
		.select({ allocation: leaveAllocations, type: leaveTypes })
		.from(leaveAllocations)
		.innerJoin(leaveTypes, eq(leaveAllocations.leaveTypeId, leaveTypes.id))
		.where(and(eq(leaveAllocations.userId, user.id), eq(leaveAllocations.year, year)));

	const myApplications = await db
		.select({ application: leaveApplications, type: leaveTypes })
		.from(leaveApplications)
		.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
		.where(eq(leaveApplications.userId, user.id))
		.orderBy(desc(leaveApplications.createdAt));

	const applicantColumns = {
		id: users.id,
		fullName: users.fullName,
		email: users.email,
		teamId: users.teamId
	};

	let approvalQueue: Array<{
		application: typeof leaveApplications.$inferSelect;
		type: typeof leaveTypes.$inferSelect;
		applicant: { id: string; fullName: string; email: string; teamId: string | null };
	}> = [];

	if (user.role === 'team_lead' || user.role === 'super_admin') {
		const base = db
			.select({ application: leaveApplications, type: leaveTypes, applicant: applicantColumns })
			.from(leaveApplications)
			.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
			.innerJoin(users, eq(leaveApplications.userId, users.id));

		approvalQueue =
			user.role === 'super_admin'
				? await base.where(eq(leaveApplications.status, 'pending'))
				: await base.where(
						and(eq(leaveApplications.status, 'pending'), eq(users.teamId, user.teamId ?? ''))
					);
	}

	const { calendarHolidays, leaveEvents } = await loadCalendarEvents(user);

	return { allocations, myApplications, approvalQueue, calendarHolidays, leaveEvents };
};
