/**
 * Eligibility rules for restricted leave types.
 *
 * Pink leave (menstrual leave) is the current case: one day per calendar month
 * for female employees, from their joining date. The quota refreshes monthly and
 * does not accumulate — an unused day expires at month end.
 *
 * The written policy states only "available to female employees, at 1 day per
 * calendar month" — it imposes no probation or confirmation requirement. The
 * master tracker also leaves Date of Confirmation blank for recent joiners, so
 * gating on confirmation withheld the leave from women the policy covers.
 * Joining date is what every row actually carries, and it is what this rule uses.
 *
 * This module is the single source of truth: the Leave page, the apply form and
 * the API all call it, so what an employee is shown and what the server allows
 * can never drift apart.
 */

export const PINK_LEAVE_CODE = 'PINK';

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
	/** Joining date is in the future — employment hasn't started yet. */
	| 'not_joined'
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
 * True once employment has actually begun.
 *
 * A confirmation date implies the person joined, so it stands in when the
 * joining date itself is missing — the tracker records confirmation for older
 * staff and leaves it blank for recent joiners, so between them one is always
 * present.
 */
export function hasJoined(
	profile: Pick<EligibilityProfile, 'dateOfJoining' | 'dateOfConfirmation'>,
	now: Date = new Date()
): { joined: boolean; known: boolean } {
	for (const value of [profile.dateOfJoining, profile.dateOfConfirmation]) {
		if (!value) continue;
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) return { joined: date <= now, known: true };
	}
	return { joined: false, known: false };
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

	const { joined, known } = hasJoined(profile, now);
	if (!known) {
		return {
			eligible: false,
			reason: 'unknown_tenure',
			detail: 'No joining date recorded — HR can grant this manually.'
		};
	}
	if (!joined) {
		return {
			eligible: false,
			reason: 'not_joined',
			detail: 'Starts from the joining date.'
		};
	}

	return { eligible: true, reason: 'eligible', detail: 'Female employee, joined.' };
}

/** First and last instant of the calendar month containing `date`. */
export function monthBounds(date: Date): { start: string; end: string } {
	const start = new Date(date.getFullYear(), date.getMonth(), 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return { start: iso(start), end: iso(end) };
}
