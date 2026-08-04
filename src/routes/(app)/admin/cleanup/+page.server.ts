import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { previewCleanup } from '$lib/server/admin-cleanup';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	if (user.role !== 'super_admin') {
		throw redirect(303, '/dashboard');
	}

	// Show exactly what would be removed before anything is touched.
	const preview = await previewCleanup(user.id);
	return { preview, currentUserName: user.fullName };
};
