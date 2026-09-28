import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/rbac';
import { findVisible } from '$lib/server/announcements';
import { buildIcs } from '$lib/announcements';

/** "Add to my calendar" on an event: an .ics phones and Outlook can open. */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const isAdmin = user.role === 'admin' || user.role === 'super_admin';
	const post = await findVisible(user.id, isAdmin, event.params.id);
	if (!post || post.kind !== 'event' || !post.eventDate) throw error(404, 'Event not found');

	const ics = buildIcs({ ...post, eventDate: post.eventDate }, new Date());
	const name = post.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'event';
	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${name}.ics"`
		}
	});
};
