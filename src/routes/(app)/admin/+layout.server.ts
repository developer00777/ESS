import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { loadAdminFacts } from '$lib/server/admin-health';
import { adminStrips, deriveAdminIssues } from '$lib/admin-issues';

/**
 * The floor for everything under /admin: Super Admin or Admin (HR).
 *
 * Five pages each carried an identical inline copy of this check, which meant
 * a new admin page was one forgotten redirect away from being reachable by an
 * employee. The two pages whose floor this exactly matches (biometric upload,
 * leave balances) now rely on it; the three that are deliberately stricter
 * (data cleanup, publish policies, design tweaks) keep their own Super
 * Admin-only check, because the floor is not the same as their rule.
 *
 * This does not belong in hooks.server.ts: that layer authenticates every
 * request for the whole app, and folding one route subtree's authorisation
 * into it would put the rule at the wrong level and hide it from anyone
 * reading these routes.
 *
 * It also computes what the Admin Controls shell shows on every tab: the
 * attention list, the status dot on each tab and each section's summary.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const role = locals.user?.role;
	if (role !== 'super_admin' && role !== 'admin') {
		throw redirect(303, '/dashboard');
	}

	// Read on purpose: it makes this load re-run on every tab switch, so the
	// tab dots reflect a fix made on the previous tab rather than the state
	// when Admin Controls was first opened.
	void url.pathname;

	const now = new Date();
	const facts = await loadAdminFacts(now);
	const issues = deriveAdminIssues(facts, role === 'super_admin', now);

	return {
		adminRole: role,
		adminIssues: issues,
		adminStrips: adminStrips(facts, now),
		// Overrides the (app) layout's figure, so the sidebar badge is fresh here.
		adminIssueCount: issues.filter((i) => i.severity !== 'info').length
	};
};
