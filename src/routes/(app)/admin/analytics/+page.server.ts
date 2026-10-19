import type { PageServerLoad } from './$types';
import { gateAdminPage } from '$lib/server/capabilities';
import { loadHrAnalytics, RANGE_OPTIONS } from '$lib/server/hr-analytics';

/**
 * Admin → HR analytics. Role is enforced by (app)/admin/+layout.server.ts;
 * this page needs `people.analytics` on top.
 *
 * `?months=6|12|24` picks the window and `?dept=<name>` narrows every figure
 * to one department.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	gateAdminPage(locals, ['people.analytics']);
	const asked = Number(url.searchParams.get('months'));
	const months = (RANGE_OPTIONS as readonly number[]).includes(asked) ? asked : 12;
	return {
		analytics: await loadHrAnalytics({ months, department: url.searchParams.get('dept') }),
		rangeOptions: [...RANGE_OPTIONS]
	};
};
