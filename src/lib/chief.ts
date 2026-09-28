/**
 * "Chief" — the head of the company, at the top of the reporting hierarchy.
 *
 * Chief is a position, not an account: nobody signs in as Chief and there is
 * no login to create for it. People who report to Chief are recorded with
 * `employee_profiles.reports_to_chief` rather than a `users.reports_to` link,
 * and their requests skip the manager stage and go straight to their
 * concerned HR for a single approval (src/lib/server/approval-chain.ts).
 *
 * The HR sheet writes it as plain text in the reporting-authority column,
 * sometimes misspelt, so the import recognises it here.
 */

export const CHIEF_LABEL = 'Chief';

/** Sentinel the "Reports to" picker uses for Chief, since it has no user id. */
export const CHIEF_PICK = '__chief__';

/** True when a reporting-authority cell names Chief rather than a person. */
export function isChiefReference(raw: string | null | undefined): boolean {
	if (!raw) return false;
	const s = raw
		.toLowerCase()
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^the /, '');
	return s === 'chief' || s === 'cheif';
}
