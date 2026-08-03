/**
 * Eligibility rules for restricted leave types.
 *
 * Pink leave (menstrual leave) is the current case: one day per calendar month
 * for confirmed female employees. The quota refreshes monthly and does not
 * accumulate — an unused day expires at month end.
 *
 * This module is the single source of truth: the Leave page, the apply form and
 * the API all call it, so what an employee is shown and what the server allows
 * can never drift apart.
 */

export const PINK_LEAVE_CODE = 'PINK';

/** Months of service after joining that stand in for confirmation when HR hasn't recorded a date. */
const CONFIRMATION_FALLBACK_MONTHS = 6;

export interface EligibilityProfile {
	gender: string | null;
	dateOfJoining: string | null;
	dateOfConfirmation: string | null;
	pinkLeaveEligibleOverride: boolean | null;
}

export type EligibilityReason =
	| 'eligible'
	| 'granted_by_hr'
	| 'withheld_by_hr'
	| 'not_female'
	| 'not_confirmed'
	| 'unknown_tenure';

export interface EligibilityResult {
	eligible: boolean;
	reason: EligibilityReason;
	/** Plain-language explanation, safe to show to HR (not shown to the employee). */
	detail: string;
}

function isFemale(gender: string | null): boolean {
	return (gender ?? '').trim().toLowerCase() === 'female';
}

/**
 * True once the employee is confirmed. Confirmation date wins when recorded;
 * otherwise fall back to joining + 6 months so a missing HR field doesn't
 * silently block someone who has clearly served long enough.
 */
export function isConfirmed(
	profile: Pick<EligibilityProfile, 'dateOfJoining' | 'dateOfConfirmation'>,
	now: Date = new Date()
): { confirmed: boolean; known: boolean } {
	if (profile.dateOfConfirmation) {
		const confirmed = new Date(profile.dateOfConfirmation);
		if (!Number.isNaN(confirmed.getTime())) {
			return { confirmed: confirmed <= now, known: true };
		}
	}

	if (profile.dateOfJoining) {
		const joined = new Date(profile.dateOfJoining);
		if (!Number.isNaN(joined.getTime())) {
			const threshold = new Date(joined);
			threshold.setMonth(threshold.getMonth() + CONFIRMATION_FALLBACK_MONTHS);
			return { confirmed: threshold <= now, known: true };
		}
	}

	// Neither date recorded — tenure is unknown, not "zero".
	return { confirmed: false, known: false };
}

export function checkPinkLeaveEligibility(
	profile: EligibilityProfile | null,
	now: Date = new Date()
): EligibilityResult {
	if (!profile) {
		return { eligible: false, reason: 'unknown_tenure', detail: 'No employee profile on record.' };
	}

	// An explicit HR decision always wins over the inferred rule.
	if (profile.pinkLeaveEligibleOverride === true) {
		return { eligible: true, reason: 'granted_by_hr', detail: 'Granted by HR.' };
	}
	if (profile.pinkLeaveEligibleOverride === false) {
		return { eligible: false, reason: 'withheld_by_hr', detail: 'Withheld by HR.' };
	}

	if (!isFemale(profile.gender)) {
		return {
			eligible: false,
			reason: 'not_female',
			detail: profile.gender
				? 'Not applicable for this employee.'
				: 'Gender not recorded — HR can grant this manually.'
		};
	}

	const { confirmed, known } = isConfirmed(profile, now);
	if (!known) {
		return {
			eligible: false,
			reason: 'unknown_tenure',
			detail: 'No joining or confirmation date recorded — HR can grant this manually.'
		};
	}
	if (!confirmed) {
		return {
			eligible: false,
			reason: 'not_confirmed',
			detail: `Available after confirmation (or ${CONFIRMATION_FALLBACK_MONTHS} months of service).`
		};
	}

	return { eligible: true, reason: 'eligible', detail: 'Confirmed employee.' };
}

/** First and last instant of the calendar month containing `date`. */
export function monthBounds(date: Date): { start: string; end: string } {
	const start = new Date(date.getFullYear(), date.getMonth(), 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return { start: iso(start), end: iso(end) };
}
