import { hasAnyCap, hasCap } from './capabilities';
import { scopeIds } from './org-scope';
import type { SessionUser } from './auth';

/** People privileges that open the Team page on their own. */
export const TEAM_PAGE_CAPS = [
	'people.directory',
	'people.create_login',
	'people.reset_password',
	'people.password_activity',
	'people.bulk_import',
	'people.send_logins'
] as const;

/**
 * Who the Team page is for, and whom its roster holds — one answer for the
 * page and the navigation, so a link is never shown to a page that bounces.
 *
 *  - Team Leads and above: always (their team, plus their org-scope reach).
 *  - Anyone with a People privilege.
 *  - An Employee-role person who manages people (someone's reportsTo is them),
 *    is concerned HR for someone, or covers a manager by delegation.
 *
 * `reach` is null when their reach is org-wide (people.directory, or a
 * privilege that opens everyone's job details).
 */
export async function teamPageAccess(user: SessionUser): Promise<{ allowed: boolean; reach: string[] | null }> {
	const reach = hasCap(user, 'people.directory') ? null : await scopeIds(user, 'person.job');
	const reachesOthers = reach === null || reach.length > 1;
	const allowed = user.role !== 'employee' || hasAnyCap(user, [...TEAM_PAGE_CAPS]) || reachesOthers;
	return { allowed, reach };
}
