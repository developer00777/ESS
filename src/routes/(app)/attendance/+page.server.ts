import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	attendance,
	devicePunches,
	employeeProfiles,
	holidayCalendars,
	holidays,
	leaveApplications,
	leaveTypes,
	prohanceDays
} from '$lib/server/db/schema';
import { eq, and, gte, lt, lte, desc, inArray } from 'drizzle-orm';
import { isProhanceConfigured } from '$lib/server/prohance';
import {
	CYCLE_END_DAY,
	cycleForDate,
	cycleForKey,
	workingDaysSoFar
} from '$lib/attendance-cycle';
import { pairShifts, gapForShift, STANDARD_SHIFT_MINUTES } from '$lib/shift-hours';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `attendance.date` is a Postgres `date`, but node-postgres hands it back as a
 * Date at local midnight. Formatting that with toISOString() (or String().slice)
 * shifts it a day west of UTC, so the calendar day is read from the local date
 * parts instead.
 */
function attendanceDateKey(value: string | Date): string {
	if (value instanceof Date) {
		return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
	}
	return String(value).slice(0, 10);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);

	// Attendance runs on the payroll cycle — the 26th of one month to the 25th
	// of the next — not the calendar month. `?month=YYYY-MM` still identifies a
	// cycle by the month it ends in, so existing links keep working.
	const rawMonth = url.searchParams.get('month') ?? '';
	const currentCycle = cycleForDate(now);
	const viewMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : currentCycle.key;
	const cycle = cycleForKey(viewMonth);
	const [vy, vm] = viewMonth.split('-').map(Number);
	const monthStart = cycle.startDate;
	const monthEnd = cycle.endDate;
	// Exclusive upper bound for the punch timestamp query — the day after the
	// cycle's last date.
	const cycleEnd = new Date(vy, vm - 1, CYCLE_END_DAY + 1);
	const nextMonthStart = `${cycleEnd.getFullYear()}-${pad(cycleEnd.getMonth() + 1)}-${pad(cycleEnd.getDate())}`;

	const [todayRow] = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), eq(attendance.date, todayStr)))
		.limit(1);

	const records = await db
		.select()
		.from(attendance)
		.where(
			and(
				eq(attendance.userId, user.id),
				gte(attendance.date, monthStart),
				lte(attendance.date, monthEnd)
			)
		)
		.orderBy(desc(attendance.date));

	// Raw biometric punches for the month, folded to one summary per day.
	// Days are keyed the same way easytime-import keys attendance.date (UTC),
	// so a punch always lands on the same calendar day as its attendance row.
	const punches = await db
		.select({ punchedAt: devicePunches.punchedAt })
		.from(devicePunches)
		.where(
			and(
				eq(devicePunches.matchedUserId, user.id),
				gte(devicePunches.punchedAt, new Date(`${monthStart}T00:00:00Z`)),
				lt(devicePunches.punchedAt, new Date(`${nextMonthStart}T00:00:00Z`))
			)
		);

	const punchDayMap = new Map<string, { date: string; firstAt: Date; lastAt: Date; count: number }>();
	for (const p of punches) {
		const key = p.punchedAt.toISOString().slice(0, 10);
		const day = punchDayMap.get(key);
		if (!day) {
			punchDayMap.set(key, { date: key, firstAt: p.punchedAt, lastAt: p.punchedAt, count: 1 });
		} else {
			if (p.punchedAt < day.firstAt) day.firstAt = p.punchedAt;
			if (p.punchedAt > day.lastAt) day.lastAt = p.punchedAt;
			day.count += 1;
		}
	}
	const punchDays = [...punchDayMap.values()];

	// Holidays from the published calendar for the viewer's shift group & year.
	let monthHolidays: Array<{ date: string; name: string; type: string }> = [];
	const [profile] = await db
		.select({
			shiftGroupId: employeeProfiles.shiftGroupId,
			// Drives how far a check-out may sit from its check-in when pairing an
			// overnight shift.
			officeTimings: employeeProfiles.officeTimings,
			shiftType: employeeProfiles.shiftType
		})
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, user.id))
		.limit(1);
	if (profile?.shiftGroupId) {
		// A cycle can straddle a year end (26 Dec – 25 Jan), so both years'
		// published calendars are considered rather than just the end year's.
		const startYear = Number(monthStart.slice(0, 4));
		const calendarYears = startYear === vy ? [vy] : [startYear, vy];

		const calendars = await db
			.select({ id: holidayCalendars.id })
			.from(holidayCalendars)
			.where(
				and(
					eq(holidayCalendars.shiftGroupId, profile.shiftGroupId),
					inArray(holidayCalendars.year, calendarYears),
					eq(holidayCalendars.status, 'published')
				)
			)
			.orderBy(desc(holidayCalendars.version));

		if (calendars.length > 0) {
			monthHolidays = await db
				.select({ date: holidays.date, name: holidays.name, type: holidays.type })
				.from(holidays)
				.where(
					and(
						inArray(
							holidays.calendarId,
							calendars.map((c) => c.id)
						),
						gte(holidays.date, monthStart),
						lte(holidays.date, monthEnd)
					)
				);
		}
	}

	// The viewer's own leave overlapping the month (so absent days on approved
	// leave don't read as absences).
	const monthLeaves = await db
		.select({
			id: leaveApplications.id,
			startDate: leaveApplications.startDate,
			endDate: leaveApplications.endDate,
			status: leaveApplications.status,
			// `days` distinguishes a half day (0.5) from a full one; `typeCode` is
			// the stable code from the published policy (EL, SL, PINK…) and drives
			// the calendar's day marker, so a new policy type needs no code change.
			days: leaveApplications.days,
			typeName: leaveTypes.name,
			typeCode: leaveTypes.code
		})
		.from(leaveApplications)
		.innerJoin(leaveTypes, eq(leaveApplications.leaveTypeId, leaveTypes.id))
		.where(
			and(
				eq(leaveApplications.userId, user.id),
				inArray(leaveApplications.status, ['pending', 'approved', 'escalated']),
				lte(leaveApplications.startDate, monthEnd),
				gte(leaveApplications.endDate, monthStart)
			)
		);

	// ProHance activity for the cycle (polled from their Web Services API and
	// matched to this user by employee code — see $lib/server/prohance).
	const monthProhance = await db
		.select({
			sessionDate: prohanceDays.sessionDate,
			firstLogin: prohanceDays.firstLogin,
			lastLogout: prohanceDays.lastLogout,
			timeOnSystemMinutes: prohanceDays.timeOnSystemMinutes,
			dayType: prohanceDays.dayType
		})
		.from(prohanceDays)
		.where(
			and(
				eq(prohanceDays.matchedUserId, user.id),
				gte(prohanceDays.sessionDate, monthStart),
				lte(prohanceDays.sessionDate, monthEnd)
			)
		);

	// Stats follow the viewed cycle so the counters agree with the grid. The
	// denominator counts working days only — Saturday and Sunday are the weekly
	// offs — up to today for the running cycle, or the whole cycle once past.
	const businessDaysSoFar =
		viewMonth === currentCycle.key
			? workingDaysSoFar(cycle, now)
			: viewMonth < currentCycle.key
				? workingDaysSoFar(cycle, new Date(vy, vm - 1, CYCLE_END_DAY))
				: 0;

	// Pair overnight shifts before measuring anything. A night shift arrives as
	// two rows — a check-in with no check-out, then a check-out with no check-in —
	// so subtracting per row would report neither day's hours correctly. The
	// employee's own shift window bounds how far a check-out may sit from its
	// check-in; staff with no timings on file fall back to the default gap.
	const shifts = pairShifts(
		records.map((r) => ({
			date: attendanceDateKey(r.date),
			checkInAt: r.checkInAt,
			checkOutAt: r.checkOutAt
		})),
		gapForShift(profile?.officeTimings)
	);

	// Counted from paired shifts, not raw rows: an overnight shift spans two rows
	// and would otherwise count as two days present.
	const presentDays = shifts.filter((s) => s.checkInAt).length;

	const measured = shifts.filter((s) => s.workedMinutes !== null);
	const avgHours =
		measured.length > 0
			? measured.reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0) / measured.length / 60
			: 0;

	return {
		today: todayRow ?? null,
		viewMonth,
		isCurrentMonth: viewMonth === currentCycle.key,
		// Dates normalised to a plain 'YYYY-MM-DD' string. Left as Date objects
		// they serialise through toISOString() and land a day early for anyone
		// east of UTC, which silently misfiles every row in the calendar.
		records: records.map((r) => ({ ...r, date: attendanceDateKey(r.date) })),
		punchDays,
		// Same normalisation as records — these are `date` columns too.
		monthHolidays: monthHolidays.map((h) => ({ ...h, date: attendanceDateKey(h.date) })),
		monthLeaves: monthLeaves.map((l) => ({
			...l,
			startDate: attendanceDateKey(l.startDate),
			endDate: attendanceDateKey(l.endDate)
		})),
		monthProhance: monthProhance.map((p) => ({
			...p,
			sessionDate: attendanceDateKey(p.sessionDate)
		})),
		prohanceEnabled: isProhanceConfigured(),
		presentDays,
		businessDaysSoFar,
		avgHours,
		shifts,
		standardShiftMinutes: STANDARD_SHIFT_MINUTES
	};
};
