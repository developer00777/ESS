import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMeeting } from '$lib/server/meetings/service';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('hub:data');
	if (!locals.user) throw redirect(303, '/login');
	const r = await getMeeting(locals.user, params.id);
	if (!r.ok) throw error(r.status ?? 404, r.message);
	return { meeting: r.meeting };
};
