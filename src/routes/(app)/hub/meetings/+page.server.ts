import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMeetings } from '$lib/server/meetings/service';

/** Meetings the person scheduled, was invited to or joined, with where each one's minutes stand. */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('hub:data');
	if (!locals.user) throw redirect(303, '/login');
	return { meetings: await listMeetings(locals.user) };
};
