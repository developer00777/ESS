import type { CapabilityKey } from './capabilities';

/**
 * Every Admin Controls section, in the order the tab bar shows them.
 *
 * This list is the one place a section is declared: the tab bar, the Ctrl+K
 * jump list and the privilege gate all read it, so a new admin page is one
 * entry here rather than a new sidebar row plus a card plus a redirect check.
 *
 * A tab shows for anyone holding any of its `caps` (src/lib/capabilities.ts),
 * which is how a named role such as IT Support sees exactly its own tabs.
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
	| 'chat'
	| 'zoom'
	| 'cleanup'
	| 'tweaks';

export type AdminTab = {
	id: AdminTabId;
	href: string;
	label: string;
	/** One line under the page title, in place of each page's own header. */
	blurb: string;
	group: 0 | 1 | 2 | 3;
	/** Any one of these opens the tab. Empty = anyone who can open Admin Controls. */
	caps: CapabilityKey[];
};

export const ADMIN_TABS: AdminTab[] = [
	{
		id: 'overview',
		href: '/admin',
		label: 'Overview',
		blurb: 'What needs your attention across the portal, worked out from live data.',
		group: 0,
		caps: []
	},
	{
		id: 'people',
		href: '/admin/people',
		label: 'People',
		blurb: 'Logins, bulk imports, week-off rosters and password activity.',
		group: 1,
		caps: ['people.directory', 'people.create_login', 'people.bulk_import', 'people.reset_password', 'people.password_activity']
	},
	{
		id: 'biometric',
		href: '/admin/biometric',
		label: 'Biometric',
		blurb: 'Load the device report for days the scheduled feed never sent.',
		group: 1,
		caps: ['attendance.biometric_upload']
	},
	{
		id: 'balances',
		href: '/admin/leave-balances',
		label: 'Leave Balances',
		blurb: 'Set opening balances from a spreadsheet, such as the HRone carry-forward.',
		group: 1,
		caps: ['leave.set_balances']
	},
	{
		id: 'policies',
		href: '/admin/policies',
		label: 'Policies',
		blurb: 'Publish the holiday calendar and leave policy from the source document.',
		group: 2,
		caps: ['policies.publish']
	},
	{
		id: 'org',
		href: '/admin/org-chart',
		label: 'Org Chart',
		blurb: 'Who reports to whom, from the live roster.',
		group: 2,
		caps: ['org.view']
	},
	{
		id: 'access',
		href: '/admin/access-control',
		label: 'Roles & access',
		blurb: 'Named roles such as IT Support, what each one may do, and who holds them.',
		group: 2,
		caps: ['access.view', 'system.roles']
	},
	{
		id: 'chat',
		href: '/admin/chat-rules',
		label: 'Chat rules',
		blurb: 'Who employees can message directly, and who can start group chats.',
		group: 2,
		caps: ['chat.manage_rules']
	},
	{
		id: 'zoom',
		href: '/admin/zoom',
		label: 'Zoom',
		blurb: 'Connect Zoom so meeting minutes arrive in Champ Hub, and link Zoom names to logins.',
		group: 2,
		caps: ['system.zoom']
	},
	{
		id: 'cleanup',
		href: '/admin/cleanup',
		label: 'Data Cleanup',
		blurb: 'Remove seeded and test data. Everything here is permanent.',
		group: 3,
		caps: ['system.cleanup']
	},
	{
		id: 'tweaks',
		href: '/admin/tweaks',
		label: 'Design Tweaks',
		blurb: 'Preview design variants in your browser only. Employees are unaffected.',
		group: 3,
		caps: ['system.design_tweaks']
	}
];

/** The tabs a person with these privileges can open. */
export function visibleAdminTabs(caps: readonly string[]): AdminTab[] {
	return ADMIN_TABS.filter((t) => t.caps.length === 0 || t.caps.some((c) => caps.includes(c)));
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
