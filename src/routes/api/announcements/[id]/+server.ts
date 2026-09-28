import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/rbac';
import { findVisible, recordRead } from '$lib/server/announcements';

/**
 * Records what someone did with an announcement: opened it, confirmed it
 * ("I've read this"), or dismissed an urgent notice ("Got it").
 */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const body = await event.request.json().catch(() => ({}));
	const action = body?.action;
	if (action !== 'read' && action !== 'ack' && action !== 'dismiss') {
		throw error(400, 'action must be read, ack or dismiss');
	}

	// Admins can open any post for review, but only its audience records reads.
	const post = await findVisible(user.id, false, event.params.id);
	if (!post) throw error(404, 'Announcement not found');

	await recordRead(post.id, user.id, action);
	return json({ ok: true });
};
