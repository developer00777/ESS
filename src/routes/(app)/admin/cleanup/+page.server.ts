import type { PageServerLoad } from './$types';
import { previewCleanup } from '$lib/server/admin-cleanup';
import { gateAdminPage } from '$lib/server/capabilities';

export const load: PageServerLoad = async ({ locals }) => {
	gateAdminPage(locals, ['system.cleanup']);
	const user = locals.user!;

	// Show exactly what would be removed before anything is touched.
	const preview = await previewCleanup(user.id);
	return { preview, currentUserName: user.fullName };
};
