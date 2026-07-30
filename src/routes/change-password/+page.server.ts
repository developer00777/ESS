import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	if (!locals.user.mustChangePassword) {
		throw redirect(303, '/dashboard');
	}
	return { user: locals.user };
};
