import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { myTasks } from '$lib/server/tasks/service';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('hub:data');
	if (!locals.user) throw redirect(303, '/login');
	return { tasks: await myTasks(locals.user) };
};
