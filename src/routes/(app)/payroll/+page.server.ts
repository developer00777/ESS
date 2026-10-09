import type { PageServerLoad } from './$types';

// Payroll is nav-visible but not built yet. The page is an honest "not
// available yet" state rather than a redirect, so someone who clicks the row
// learns where payslips will appear and who to ask.
export const load: PageServerLoad = async () => {
	return {};
};
