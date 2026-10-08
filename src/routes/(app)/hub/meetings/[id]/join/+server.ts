import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinTarget } from '$lib/server/meetings/service';

/**
 * "Join" on a meeting scheduled in ESS. The call link is looked up here, at
 * the moment someone joins, so it never sits on a page: the host is sent in
 * as host, everyone invited joins as a guest.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/login');
	const target = await joinTarget(locals.user, params.id);
	if (!target) throw error(404, 'This meeting has no call to join, or you were not invited to it');
	throw redirect(303, target);
};
