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
import { eq, and, desc, inArray, ne, gte, lte, sql, isNotNull } from 'drizzle-orm';
import { checkPinkLeaveEligibility, monthBounds } from '$lib/server/leave-eligibility';

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

	// Monthly-quota leave (pink leave) has no allocation row — its entitlement
	// refreshes each month and doesn't accumulate — so its balance is computed
	// from this month's applications instead.
	const [selfProfile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, user.id))
		.limit(1);

	const pinkVerdict = checkPinkLeaveEligibility(
		selfProfile
			? {
					gender: selfProfile.gender,
					dateOfJoining: selfProfile.dateOfJoining,
					dateOfConfirmation: selfProfile.dateOfConfirmation,
					pinkLeaveEligibleOverride: selfProfile.pinkLeaveEligibleOverride
				}
			: null
	);

	let monthlyBalances: Array<{
		typeId: string;
		name: string;
		quota: number;
		used: number;
		remaining: number;
	}> = [];

	if (pinkVerdict.eligible) {
		const monthlyTypes = await db
			.select()
			.from(leaveTypes)
			.where(and(eq(leaveTypes.isActive, true), isNotNull(leaveTypes.monthlyQuotaDays)));

		if (monthlyTypes.length > 0) {
			const { start: monthStart, end: monthEnd } = monthBounds(new Date());
			const usedRows = await db
				.select({
					leaveTypeId: leaveApplications.leaveTypeId,
					total: sql<string>`coalesce(sum(${leaveApplications.days}), 0)`
				})
				.from(leaveApplications)
				.where(
					and(
						eq(leaveApplications.userId, user.id),
						inArray(
							leaveApplications.leaveTypeId,
							monthlyTypes.map((t) => t.id)
						),
						inArray(leaveApplications.status, ['pending', 'approved', 'escalated']),
						gte(leaveApplications.startDate, monthStart),
						lte(leaveApplications.startDate, monthEnd)
					)
				)
				.groupBy(leaveApplications.leaveTypeId);

			const usedByType = new Map(usedRows.map((r) => [r.leaveTypeId, Number(r.total)]));

			monthlyBalances = monthlyTypes.map((t) => {
				const quota = Number(t.monthlyQuotaDays);
				const used = usedByType.get(t.id) ?? 0;
				return {
					typeId: t.id,
					name: t.name,
					quota,
					used,
					remaining: Math.max(0, quota - used)
				};
			});
		}
	}

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

	return {
		allocations,
		monthlyBalances,
		myApplications,
		approvalQueue,
		calendarHolidays,
		leaveEvents
	};
};
