import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Payroll is nav-visible but not built yet. The sidebar and dashboard render it
// inert, so this only catches someone typing the URL directly — send them home
// rather than rendering a blank page.
export const load: PageServerLoad = async () => {
	throw redirect(303, '/dashboard');
};
