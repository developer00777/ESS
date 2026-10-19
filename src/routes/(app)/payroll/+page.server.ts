import type { PageServerLoad } from './$types';
import { hasCap } from '$lib/server/capabilities';
import { loadPayroll, recentCycles } from '$lib/server/payroll';

/**
 * Payroll. With the "See payroll" privilege (Super Admin, the Finance role,
 * or anyone given it) this is the payroll dashboard for a month —
 * `?month=YYYY-MM` names the cycle that ends in that month (26th → 25th).
 * Everyone else still sees the "payslips are not available yet" page.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	if (!hasCap(user, 'payroll.view')) return { payroll: null, canManage: false, cycles: [] };

	const cycles = recentCycles();
	const asked = url.searchParams.get('month') ?? '';
	const cycleKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : cycles[0].key;
	return {
		payroll: await loadPayroll(cycleKey),
		canManage: hasCap(user, 'payroll.manage'),
		cycles
	};
};
