import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasCap } from '$lib/server/capabilities';
import { loadOrg, teamTasks } from '$lib/server/tasks/service';

/**
 * A lead's team board: one lane per direct report plus Unassigned. People
 * holding "See every team's tasks" can pick any lead's team.
 */
export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('hub:data');
	const user = locals.user;
	if (!user) throw redirect(303, '/login');
	const seeAll = hasCap(user, 'tasks.view_all') || user.role === 'super_admin';
	const org = await loadOrg();
	const want = url.searchParams.get('lead');
	const leadId = want && seeAll ? want : user.id;
	const r = await teamTasks(user, leadId);
	if (!r.ok) throw error(r.status ?? 403, r.message);
	const leads = seeAll
		? [...org.children.entries()]
				.filter(([id, kids]) => kids.length > 0 && org.byId.get(id)?.isActive)
				.map(([id]) => ({ id, fullName: org.byId.get(id)!.fullName }))
				.sort((a, b) => a.fullName.localeCompare(b.fullName))
		: [];
	return { lanes: r.lanes, unassigned: r.unassigned, leadId, leadName: org.byId.get(leadId)?.fullName ?? '', leads };
};
