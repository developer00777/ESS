import type { PageServerLoad } from './$types';
import { gateAdminPage } from '$lib/server/capabilities';

export const load: PageServerLoad = async ({ locals }) => {
	gateAdminPage(locals, ['cabs.plan']);
	return {};
};
