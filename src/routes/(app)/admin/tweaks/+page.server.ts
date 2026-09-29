import type { PageServerLoad } from './$types';
import { gateAdminPage } from '$lib/server/capabilities';

/**
 * Design preview panel — Super Admin only. This is the prototype's Tweaks
 * toolbar rebuilt as an internal tool: flip the design variants live against
 * real screens to decide defaults, then bake the winners into the CSS.
 * It changes nothing for anyone else; the attributes it sets live only in
 * this browser's localStorage.
 */
export const load: PageServerLoad = async ({ locals }) => {
	gateAdminPage(locals, ['system.design_tweaks']);
	return {};
};
