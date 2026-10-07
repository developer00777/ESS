import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { hasCap } from '$lib/server/capabilities';
import { loadOrg } from '$lib/server/tasks/service';
import { zoomConfigured } from '$lib/server/zoom/client';

/**
 * Champ Hub: chat, tasks and meetings on one screen. The tabs (Today, Chats,
 * Tasks, Meetings, Team) are routes under /hub; this layout draws the top bar
 * they share. Team shows for anyone with people reporting to them.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/login');
	const org = await loadOrg();
	const reports = (org.children.get(user.id) ?? []).length;
	return {
		hubMe: { id: user.id, fullName: user.fullName, role: user.role },
		hub: {
			isLead: reports > 0 || hasCap(user, 'tasks.view_all') || user.role === 'super_admin',
			reports,
			zoom: zoomConfigured()
		}
	};
};
