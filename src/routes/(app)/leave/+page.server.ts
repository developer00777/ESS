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
import { eq, and, or, desc, inArray, ne, gte, lte, sql, isNotNull } from 'drizzle-orm';
import { checkPinkLeaveEligibility, monthBounds } from '$lib/server/leave-eligibility';
import { ensureLeaveAllocations } from '$lib/server/leave-accrual';
import { loadWeekOffFor, currentRosterByUser } from '$lib/server/week-off';
import { reviewableUserIds } from '$lib/server/approval-chain';

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

	// Balances follow the published policy's monthly accrual — recomputed
	// here so the page always shows the current month's figure.
	await ensureLeaveAllocations([user.id]);

	const allocationRows = await db
		.select({ allocation: leaveAllocations, type: leaveTypes })
		.from(leaveAllocations)
		.innerJoin(leaveTypes, eq(leaveAllocations.leaveTypeId, leaveTypes.id))
		.where(and(eq(leaveAllocations.userId, user.id), eq(leaveAllocations.year, year)));

	// A monthly-quota type should never have an allocation row, and a
	// gender-restricted one should never reach someone it does not apply to.
	// Filtered on read as well as on write, so rows created before those rules
	// existed stop being shown rather than waiting on a cleanup.
	const allocations = allocationRows.filter(
		(r) => r.type.monthlyQuotaDays == null && !r.type.genderEligibility
	);

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

	{
		// Leave runs manager → HR → approved, routed by the reporting line:
		// 'pending' is the manager's to sign off, 'escalated' is HR's to finish.
		//
		// Not gated on role: being named as someone's reporting manager or
		// concerned HR is what grants the review, and such a person may hold no
		// admin role. Anyone with nobody assigned to them gets two empty lists
		// and no queue, which is the same outcome the role check gave.
		const [manageable, hrReviewable] = await Promise.all([
			reviewableUserIds(user, 'manager'),
			reviewableUserIds(user, 'hr')
		]);

		if (manageable.length > 0 || hrReviewable.length > 0) {
			approvalQueue = await db
				.select({ application: leaveApplications, type: leaveTypes, applicant: applicantColumns })
				.from(leaveApplications)
				.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
				.innerJoin(users, eq(leaveApplications.userId, users.id))
				.where(
					or(
						and(
							eq(leaveApplications.status, 'pending'),
							manageable.length ? inArray(leaveApplications.userId, manageable) : sql`false`
						),
						and(
							eq(leaveApplications.status, 'escalated'),
							hrReviewable.length ? inArray(leaveApplications.userId, hrReviewable) : sql`false`
						)
					)
				);
		}
	}

	// Recently decided applications, so a Super Admin can overturn a decision made
	// in error. Only they may reverse one, so only they are shown the list.
	let decidedQueue: typeof approvalQueue = [];
	if (user.role === 'super_admin') {
		decidedQueue = await db
			.select({ application: leaveApplications, type: leaveTypes, applicant: applicantColumns })
			.from(leaveApplications)
			.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
			.innerJoin(users, eq(leaveApplications.userId, users.id))
			.where(inArray(leaveApplications.status, ['approved', 'rejected']))
			.orderBy(desc(leaveApplications.decidedAt))
			.limit(50);
	}

	const { calendarHolidays, leaveEvents } = await loadCalendarEvents(user);

	// The calendar shades the viewer's own week offs, which are whatever roster
	// their manager assigned — not a hardcoded Saturday/Sunday. Rosters and
	// assignments are sent through so the resolver can run client-side as the
	// user pages between months.
	const today = new Date().toISOString().slice(0, 10);
	const { rosters, assignmentsByUser } = await loadWeekOffFor([user.id]);
	const myRoster = (await currentRosterByUser([user.id], today)).get(user.id) ?? null;

	return {
		allocations,
		monthlyBalances,
		myApplications,
		approvalQueue,
		// The tab appears for anyone who actually has something to decide, which
		// includes a named HR holding no admin role.
		canApprove: approvalQueue.length > 0 || user.role === 'team_lead' || user.role === 'super_admin',
		decidedQueue,
		canReverseDecisions: user.role === 'super_admin',
		calendarHolidays,
		leaveEvents,
		weekOffRosters: rosters,
		weekOffAssignments: assignmentsByUser.get(user.id) ?? [],
		myWeekOff: myRoster
	};
};
