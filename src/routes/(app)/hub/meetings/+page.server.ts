import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listMeetings, meetingsToday } from '$lib/server/meetings/service';

/** Meetings the person hosted or joined, with where each one's minutes stand. */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('hub:data');
	if (!locals.user) throw redirect(303, '/login');
	const [meetings, today] = await Promise.all([listMeetings(locals.user), meetingsToday(locals.user).catch(() => [])]);
	// Zoom's upcoming list is not stored, so it joins from the day strip query.
	return { meetings, upcoming: today.filter((m) => m.state === 'upcoming') };
};
