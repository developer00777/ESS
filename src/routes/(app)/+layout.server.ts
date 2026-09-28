import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getProfilePicture } from '$lib/server/db/mongo';
import { loadAdminFacts } from '$lib/server/admin-health';
import { deriveAdminIssues } from '$lib/admin-issues';
import { loadBadge } from '$lib/server/announcements';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	if (locals.user.mustChangePassword) {
		throw redirect(303, '/change-password');
	}

	const role = locals.user.role;
	const isAdmin = role === 'super_admin' || role === 'admin';

	// The nav rail shows the signed-in user's avatar on every page, so this
	// lives in the layout rather than being re-fetched per route.
	const [picture, adminFacts, announcementBadge] = await Promise.all([
		getProfilePicture(locals.user.id),
		// The Admin Controls entry carries a count of open problems, so an admin
		// sees one is waiting without opening the section. Only admins pay for
		// the queries; this load does not re-run on client-side navigation.
		isAdmin ? loadAdminFacts() : Promise.resolve(null),
		// Re-read after every action on the Announcements page (invalidateAll),
		// so the badge clears as people read.
		loadBadge(locals.user.id)
	]);

	const adminIssueCount = adminFacts
		? deriveAdminIssues(adminFacts, role === 'super_admin', new Date()).filter(
				(i) => i.severity !== 'info'
			).length
		: 0;

	return {
		user: locals.user,
		hasProfilePicture: Boolean(picture),
		profilePictureVersion: picture?.updatedAt?.getTime() ?? null,
		adminIssueCount,
		announcementBadge
	};
};
