import { db } from '$lib/server/db/postgres';
import {
	attendance,
	compOffCredits,
	holidayCalendars,
	holidays,
	employeeProfiles,
	prohanceDays
} from '$lib/server/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';

/** SOP §1: 7+ working hours on an eligible holiday or weekend earns one comp-off. */
export const COMP_OFF_MIN_MINUTES = 7 * 60;

/** SOP §1: comp-off must be used within 3 months of being earned, and cannot be encashed. */
export const COMP_OFF_VALIDITY_MONTHS = 3;

export function compOffExpiryFor(workedDate: string): string {
	const d = new Date(workedDate + 'T00:00:00');
	d.setMonth(d.getMonth() + COMP_OFF_VALIDITY_MONTHS);
	return d.toISOString().slice(0, 10);
}

export interface CompOffEligibility {
	eligible: boolean;
	workedMinutes: number | null;
	/** 'holiday' | 'weekend' — why the day qualifies at all. */
	dayBasis: 'holiday' | 'weekend' | null;
	holidayName: string | null;
	reasons: string[];
	evidence: Record<string, unknown>;
}

/**
 * Decides whether one worked date can earn a comp-off, per SOP §1.
 *
 * Deliberately does NOT create the credit — it reports. HR still runs the §1
 * process (verify attendance, confirm 7+ hours, manager approval, then credit),
 * so this exists to make that verification one glance instead of a spreadsheet
 * reconciliation.
 */
export async function evaluateCompOffEligibility(
	userId: string,
	workedDate: string
): Promise<CompOffEligibility> {
	const reasons: string[] = [];

	// --- Is the day itself eligible? A comp-off is only earned on a holiday or
	// a weekend; ordinary working days are covered by normal attendance. ---
	// 'YYYY-MM-DD' + 'T00:00:00' parses as *local* midnight, so getUTCDay() reads
	// the previous day anywhere east of UTC (in IST it made Saturday a weekday and
	// Monday a weekend). getDay() reads the same local date that was parsed.
	const dow = new Date(workedDate + 'T00:00:00').getDay(); // 0 Sun … 6 Sat
	const isWeekend = dow === 0 || dow === 6;

	const [profile] = await db
		.select({ shiftGroupId: employeeProfiles.shiftGroupId, employeeCode: employeeProfiles.employeeCode })
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, userId))
		.limit(1);

	let holidayName: string | null = null;
	if (profile?.shiftGroupId) {
		const [cal] = await db
			.select({ id: holidayCalendars.id })
			.from(holidayCalendars)
			.where(
				and(
					eq(holidayCalendars.shiftGroupId, profile.shiftGroupId),
					eq(holidayCalendars.status, 'published')
				)
			)
			.limit(1);
		if (cal) {
			const [h] = await db
				.select({ name: holidays.name })
				.from(holidays)
				.where(and(eq(holidays.calendarId, cal.id), eq(holidays.date, workedDate)))
				.limit(1);
			holidayName = h?.name ?? null;
		}
	}

	const dayBasis: 'holiday' | 'weekend' | null = holidayName ? 'holiday' : isWeekend ? 'weekend' : null;
	if (!dayBasis) {
		reasons.push('This is a regular working day — comp-off is earned only on a holiday or weekend.');
	}

	// --- How long did they actually work? Portal attendance first, ProHance as
	// the fallback, mirroring how the rest of the portal treats the two. ---
	let workedMinutes: number | null = null;
	let source: string | null = null;

	const [att] = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, userId), eq(attendance.date, workedDate)))
		.limit(1);

	if (att?.checkInAt && att?.checkOutAt) {
		workedMinutes = Math.round(
			(new Date(att.checkOutAt).getTime() - new Date(att.checkInAt).getTime()) / 60000
		);
		source = `portal (${att.source})`;
	} else if (profile?.employeeCode) {
		const [ph] = await db
			.select({
				logged: prohanceDays.loggedMinutes,
				active: prohanceDays.activeMinutes,
				dayType: prohanceDays.dayType
			})
			.from(prohanceDays)
			.where(
				and(eq(prohanceDays.empCode, profile.employeeCode), eq(prohanceDays.sessionDate, workedDate))
			)
			.limit(1);
		if (ph?.logged != null) {
			workedMinutes = ph.logged;
			source = 'ProHance logged time';
		}
	}

	if (workedMinutes == null) {
		reasons.push('No attendance or ProHance record found for this date.');
	} else if (workedMinutes < COMP_OFF_MIN_MINUTES) {
		reasons.push(
			`Worked ${(workedMinutes / 60).toFixed(1)}h — the SOP requires 7+ hours to earn a comp-off.`
		);
	}

	// --- Already claimed? ---
	const existing = await db
		.select({ id: compOffCredits.id, status: compOffCredits.status })
		.from(compOffCredits)
		.where(and(eq(compOffCredits.userId, userId), eq(compOffCredits.workedDate, workedDate)));
	const live = existing.filter((e) => e.status !== 'rejected' && e.status !== 'lapsed');
	if (live.length > 0) {
		reasons.push('A comp-off has already been claimed for this date.');
	}

	const eligible =
		dayBasis !== null && workedMinutes != null && workedMinutes >= COMP_OFF_MIN_MINUTES && live.length === 0;

	return {
		eligible,
		workedMinutes,
		dayBasis,
		holidayName,
		reasons,
		evidence: {
			workedDate,
			dayBasis,
			holidayName,
			workedMinutes,
			source,
			minimumRequiredMinutes: COMP_OFF_MIN_MINUTES,
			expiresOn: compOffExpiryFor(workedDate)
		}
	};
}

/**
 * SOP §1: comp-offs lapse automatically at the end of their validity window.
 * Called opportunistically on read so a stale 'approved' credit is never shown
 * as spendable past its expiry.
 */
export async function lapseExpiredCompOffs(userId?: string): Promise<number> {
	const today = new Date().toISOString().slice(0, 10);
	const conditions = [eq(compOffCredits.status, 'approved'), lte(compOffCredits.expiresOn, today)];
	if (userId) conditions.push(eq(compOffCredits.userId, userId));

	const rows = await db
		.update(compOffCredits)
		.set({ status: 'lapsed' })
		.where(and(...conditions))
		.returning({ id: compOffCredits.id });
	return rows.length;
}

/** SOP §2: at most 3 biometric-related deviation requests per calendar month. */
export const DEVIATION_MONTHLY_CAP = 3;

/** Reasons that count toward the monthly cap — the SOP scopes it to biometric records. */
export const CAPPED_DEVIATION_REASONS = [
	'missing_biometric_punch',
	'login_not_captured',
	'logout_not_captured',
	'biometric_system_mismatch'
] as const;

export function monthKeyOf(date: string): string {
	return date.slice(0, 7);
}

export function countsTowardCap(reason: string): boolean {
	return (CAPPED_DEVIATION_REASONS as readonly string[]).includes(reason);
}
