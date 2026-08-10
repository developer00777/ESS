import { db } from '$lib/server/db/postgres';
import { leaveTypes, leaveAllocations, employeeProfiles } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Policy-driven leave balances (see "leave polcies.pdf", published through
 * Admin → Publish Policies into leave_types).
 *
 * Balances are ACCRUED, not granted up front: every accrual-based type
 * credits its `accrualPerMonth` once per month, January (or the joining
 * month) through the current month. Types marked `post_probation` (Earned
 * Leave) start at the confirmation month instead; someone whose confirmation
 * hasn't happened yet accrues nothing on those. Event-based types
 * (maternity/paternity/bereavement — `fixedDays`, no accrual) never carry a
 * standing balance, so they get no allocation row.
 *
 * Recomputed idempotently on page loads: allocatedDays is overwritten with
 * the freshly computed figure (usedDays is never touched), so the numbers
 * follow the calendar month with no cron. Employees with no joining or
 * confirmation date on file are treated as long-settled staff and accrue
 * from January — the HR tracker carries these dates, so the gap is rare.
 *
 * Deliberately out of scope: prior years' carry-forward (max 5 days by
 * policy). That history lives in HRone, which the portal cannot read; when
 * HR provides opening balances they can be added as a one-time adjustment.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthOf(value: string | Date | null | undefined): { year: number; month: number } | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + 'T00:00');
	if (Number.isNaN(d.getTime())) return null;
	return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Months of accrual this calendar year given the accrual can only start
 * after `from` (a joining or confirmation date). Inclusive of the current
 * month; 0 when `from` is in the future.
 */
function accrualMonths(
	from: { year: number; month: number } | null,
	year: number,
	currentMonth: number
): number {
	let startMonth = 0;
	if (from) {
		if (from.year > year) return 0;
		if (from.year === year) startMonth = from.month;
	}
	return Math.max(0, currentMonth - startMonth + 1);
}

/**
 * Ensures every listed user has this year's allocations matching the
 * published policy. Batched: three reads plus one write per row that
 * actually changed, so roster-sized calls stay cheap.
 */
export async function ensureLeaveAllocations(userIds: string[]): Promise<void> {
	if (userIds.length === 0) return;

	const now = new Date();
	const year = now.getFullYear();
	const currentMonth = now.getMonth();

	const types = (await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true))).filter(
		(t) =>
			// Only types published from a policy document (they carry a code).
			// Seed placeholders never accrue here.
			Boolean(t.code) &&
			Number(t.accrualPerMonth) > 0 &&
			// A monthly quota refreshes and lapses; it is not a balance that builds,
			// so it must never get an allocation row. A policy that sets both — as a
			// published pink-leave policy did — is a quota first.
			t.monthlyQuotaDays == null
	);
	if (types.length === 0) return;

	const profiles = await db
		.select({
			userId: employeeProfiles.userId,
			dateOfJoining: employeeProfiles.dateOfJoining,
			dateOfConfirmation: employeeProfiles.dateOfConfirmation,
			// Decides whether a gender-restricted type accrues for this person.
			gender: employeeProfiles.gender,
			pinkLeaveEligibleOverride: employeeProfiles.pinkLeaveEligibleOverride
		})
		.from(employeeProfiles)
		.where(inArray(employeeProfiles.userId, userIds));
	const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

	const existing = await db
		.select()
		.from(leaveAllocations)
		.where(and(inArray(leaveAllocations.userId, userIds), eq(leaveAllocations.year, year)));
	const existingByKey = new Map(existing.map((a) => [`${a.userId}:${a.leaveTypeId}`, a]));

	for (const userId of userIds) {
		const profile = profileByUser.get(userId);
		const joined = monthOf(profile?.dateOfJoining);
		const confirmed = monthOf(profile?.dateOfConfirmation);

		for (const type of types) {
			// A gender-restricted leave only accrues for those it applies to. HR's
			// explicit override wins over the recorded gender, and an unrecorded
			// gender grants nothing — handing the leave to everyone whose profile
			// is simply blank is how a men's roster ended up with pink leave.
			if (type.genderEligibility) {
				const override = profile?.pinkLeaveEligibleOverride;
				const matches =
					(profile?.gender ?? '').trim().toLowerCase() === type.genderEligibility.toLowerCase();
				if (override === false) continue;
				if (override !== true && !matches) continue;
			}

			let months: number;
			if (type.eligibility === 'post_probation' && profile?.dateOfConfirmation) {
				// Probation ends at confirmation; accrual starts that month.
				months = accrualMonths(confirmed, year, currentMonth);
			} else if (type.eligibility === 'post_probation' && joined && joined.year === year) {
				// Joined this year with no confirmation on file yet → still on
				// probation, no post-probation accrual.
				months = 0;
			} else {
				months = accrualMonths(joined, year, currentMonth);
			}

			const accrued = round2(months * Number(type.accrualPerMonth));
			const key = `${userId}:${type.id}`;
			const row = existingByKey.get(key);

			if (!row) {
				if (accrued > 0) {
					await db.insert(leaveAllocations).values({
						userId,
						leaveTypeId: type.id,
						year,
						allocatedDays: String(accrued),
						usedDays: '0'
					});
				}
			} else if (Number(row.allocatedDays) !== accrued) {
				await db
					.update(leaveAllocations)
					.set({ allocatedDays: String(accrued) })
					.where(eq(leaveAllocations.id, row.id));
			}
		}
	}
}
