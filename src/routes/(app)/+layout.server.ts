import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getProfilePicture } from '$lib/server/db/mongo';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	if (locals.user.mustChangePassword) {
		throw redirect(303, '/change-password');
	}

	// The nav rail shows the signed-in user's avatar on every page, so this
	// lives in the layout rather than being re-fetched per route.
	const picture = await getProfilePicture(locals.user.id);

	return {
		user: locals.user,
		hasProfilePicture: Boolean(picture),
		profilePictureVersion: picture?.updatedAt?.getTime() ?? null
	};
};
