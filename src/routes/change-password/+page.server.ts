import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Reached two ways: a new login is sent here until the temporary password is
 * replaced (`required`), and anyone can come here from their profile menu to
 * choose a new password of their own accord.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	return { user: locals.user, required: locals.user.mustChangePassword };
};
