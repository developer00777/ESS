import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadPendingConfirmations } from '$lib/server/announcements';
import { requireCap } from '$lib/server/capabilities';

/** Who has not yet confirmed a post that asks for it. */
export const GET: RequestHandler = async (event) => {
	requireCap(event, 'announcements.post');
	const found = await loadPendingConfirmations(event.params.id);
	if (!found) throw error(404, 'Announcement not found');
	return json({
		audience: found.audience,
		pending: found.pending.map(({ id, fullName, opened }) => ({ id, fullName, opened }))
	});
};
