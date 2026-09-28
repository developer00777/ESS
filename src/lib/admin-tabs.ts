/**
 * Every Admin Controls section, in the order the tab bar shows them.
 *
 * This list is the one place a section is declared: the tab bar, the Ctrl+K
 * jump list and the role gate all read it, so a new admin page is one entry
 * here rather than a new sidebar row plus a card plus a redirect check.
 *
 * `group` separates the tab bar into how often each section is used: weekly
 * work, setup, and the rare Super Admin tools. It is ordering, not a rule.
 */

export type AdminTabId =
	| 'overview'
	| 'people'
	| 'biometric'
	| 'balances'
	| 'policies'
	| 'org'
	| 'access'
	| 'cleanup'
	| 'tweaks';

export type AdminTab = {
	id: AdminTabId;
	href: string;
	label: string;
	/** One line under the page title, in place of each page's own header. */
	blurb: string;
	group: 0 | 1 | 2 | 3;
	superAdminOnly?: boolean;
};

export const ADMIN_TABS: AdminTab[] = [
	{
		id: 'overview',
		href: '/admin',
		label: 'Overview',
		blurb: 'What needs your attention across the portal, worked out from live data.',
		group: 0
	},
	{
		id: 'people',
		href: '/admin/people',
		label: 'People',
		blurb: 'Logins, bulk imports, week-off rosters and password activity.',
		group: 1
	},
	{
		id: 'biometric',
		href: '/admin/biometric',
		label: 'Biometric',
		blurb: 'Load the device report for days the scheduled feed never sent.',
		group: 1
	},
	{
		id: 'balances',
		href: '/admin/leave-balances',
		label: 'Leave Balances',
		blurb: 'Set opening balances from a spreadsheet, such as the HRone carry-forward.',
		group: 1
	},
	{
		id: 'policies',
		href: '/admin/policies',
		label: 'Policies',
		blurb: 'Publish the holiday calendar and leave policy from the source document.',
		group: 2,
		superAdminOnly: true
	},
	{
		id: 'org',
		href: '/admin/org-chart',
		label: 'Org Chart',
		blurb: 'Who reports to whom, from the live roster.',
		group: 2
	},
	{
		id: 'access',
		href: '/admin/access-control',
		label: 'Access',
		blurb: 'What each role may do, and what each team has been granted.',
		group: 2
	},
	{
		id: 'cleanup',
		href: '/admin/cleanup',
		label: 'Data Cleanup',
		blurb: 'Remove seeded and test data. Everything here is permanent.',
		group: 3,
		superAdminOnly: true
	},
	{
		id: 'tweaks',
		href: '/admin/tweaks',
		label: 'Design Tweaks',
		blurb: 'Preview design variants in your browser only. Employees are unaffected.',
		group: 3,
		superAdminOnly: true
	}
];

export function visibleAdminTabs(isSuperAdmin: boolean): AdminTab[] {
	return ADMIN_TABS.filter((t) => !t.superAdminOnly || isSuperAdmin);
}

/**
 * The tab a path belongs to. Overview only matches exactly, since every other
 * tab's href also starts with /admin.
 */
export function adminTabForPath(pathname: string): AdminTab | undefined {
	const path = pathname.replace(/\/+$/, '') || '/';
	if (path === '/admin') return ADMIN_TABS[0];
	return ADMIN_TABS.find((t) => t.id !== 'overview' && (path === t.href || path.startsWith(t.href + '/')));
}
