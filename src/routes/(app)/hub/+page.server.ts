import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { todayFor } from '$lib/server/hub/needs';

/** Today: everything that needs the person, today's meetings and the week ahead. */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('hub:data');
	if (!locals.user) throw redirect(303, '/login');
	return { today: await todayFor(locals.user) };
};
