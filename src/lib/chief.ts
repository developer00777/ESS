/**
 * The top-level positions — "Chief" and "Mam" — at the head of the company,
 * above the reporting hierarchy. Mam is Chief's equal: everything here holds
 * for both.
 *
 * A top position is not an account: nobody signs in as Chief or Mam and there
 * is no login to create for either. People who report to one are recorded with
 * `employee_profiles.reports_to_chief` (true for either position) rather than a
 * `users.reports_to` link, plus `employee_profiles.top_position` naming which
 * one. Their requests skip the manager stage and go straight to their concerned
 * HR for a single approval (src/lib/server/approval-chain.ts).
 *
 * The HR sheet writes them as plain text in the reporting-authority column,
 * sometimes misspelt, so the import recognises them here.
 */

export type TopPosition = 'chief' | 'mam';

export const TOP_POSITIONS: readonly TopPosition[] = ['chief', 'mam'];

export const CHIEF_LABEL = 'Chief';
export const MAM_LABEL = 'Mam';

/** Sentinels the "Reports to" pickers use, since neither position has a user id. */
export const CHIEF_PICK = '__chief__';
export const MAM_PICK = '__mam__';

const LABEL: Record<TopPosition, string> = { chief: CHIEF_LABEL, mam: MAM_LABEL };
const PICK: Record<TopPosition, string> = { chief: CHIEF_PICK, mam: MAM_PICK };

export function topLabel(position: string | null | undefined): string {
	return LABEL[asTopPosition(position)];
}

export function topPick(position: string | null | undefined): string {
	return PICK[asTopPosition(position)];
}

/** The position a picker value names, or null for a person / none. */
export function topFromPick(value: string | null | undefined): TopPosition | null {
	if (value === CHIEF_PICK) return 'chief';
	if (value === MAM_PICK) return 'mam';
	return null;
}

/** Anything unrecognised (including a null from an old row) reads as Chief. */
export function asTopPosition(value: string | null | undefined): TopPosition {
	return value === 'mam' ? 'mam' : 'chief';
}

/** Which top position a reporting-authority cell names, or null for a person. */
export function topPositionReference(raw: string | null | undefined): TopPosition | null {
	if (!raw) return null;
	const s = raw
		.toLowerCase()
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^the /, '');
	if (s === 'chief' || s === 'cheif') return 'chief';
	// "Ma'am" loses its apostrophe above and arrives as "ma am".
	if (s === 'mam' || s === 'maam' || s === 'ma am' || s === 'madam') return 'mam';
	return null;
}

/** True when a reporting-authority cell names Chief or Mam rather than a person. */
export function isTopReference(raw: string | null | undefined): boolean {
	return topPositionReference(raw) !== null;
}

/**
 * The lowercased, trimmed spellings above, for SQL that has to spot a top
 * position without running this module (team/+page.server.ts).
 */
export const TOP_REFERENCE_SPELLINGS = ['chief', 'cheif', 'the chief', 'mam', 'maam', "ma'am", 'madam', 'the mam', "the ma'am"];
