import type { PageServerLoad } from './$types';
import { loadFeed } from '$lib/server/announcements';

/**
 * Everyone's Announcements page: what needs them, what's coming up, updates.
 * Signed-in is enough — the (app) layout enforces it — and each person only
 * ever receives posts whose audience includes them.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const now = new Date();
	return {
		feed: await loadFeed(locals.user!.id, now),
		// The page's relative dates ("Tomorrow", "2 h ago") use the server's
		// clock, so the first render and hydration agree.
		now: now.toISOString()
	};
};
