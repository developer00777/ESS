/**
 * Privileges — what a login may do, beyond its base role.
 *
 * Every login keeps one base role (Employee, Team Lead, HR Admin, Super Admin).
 * The base role still decides the things that are about *position* rather than
 * permission: who approves whose leave, who counts as HR for the second stage.
 *
 * On top of that, a Super Admin can create named roles ("IT Support",
 * "Operations", …) that bundle privileges from this catalogue, and give one to
 * any login. A person's effective privileges are their base role's defaults
 * plus their named role's list; a Super Admin has everything.
 *
 * The defaults below reproduce exactly what each base role could do before
 * named roles existed, so introducing them changes nobody's access by itself.
 */

import type { Role } from './server/auth';

export type CapabilityGroup = 'People' | 'Attendance & leave' | 'Policies' | 'Communication' | 'Champ' | 'System';

export type Capability = {
	key: string;
	label: string;
	group: CapabilityGroup;
	description: string;
	/** False for the few powers only a Super Admin may hold. */
	grantable: boolean;
};

export const CAPABILITIES = [
	// --- People
	{ key: 'people.directory', label: 'See everyone in People', group: 'People', description: 'Open the People tab and see the whole roster, not just their own team.', grantable: true },
	{ key: 'people.create_login', label: 'Create logins', group: 'People', description: 'Create a login for one person, with a temporary password.', grantable: true },
	{ key: 'people.bulk_import', label: 'Bulk import logins', group: 'People', description: 'Upload the HR spreadsheet and create logins in bulk.', grantable: true },
	{ key: 'people.edit_settings', label: 'Change reporting lines and shifts', group: 'People', description: 'Set reports to, concerned HR, shift group, office timings and week off.', grantable: true },
	{ key: 'people.reset_password', label: 'Reset passwords', group: 'People', description: 'Issue a new temporary password for anyone.', grantable: true },
	{ key: 'people.password_activity', label: 'See password activity', group: 'People', description: 'Who changed or reset whose password, and when.', grantable: true },
	{ key: 'people.employee_code', label: 'Set employee codes', group: 'People', description: 'Change the employee code that links biometric punches.', grantable: true },
	{ key: 'people.assign_roles', label: 'Give people roles', group: 'People', description: 'Change base roles and give named roles. Super Admin only.', grantable: false },
	{ key: 'people.delete', label: 'Delete people', group: 'People', description: 'Permanently delete a login and its records. Super Admin only.', grantable: false },
	// --- Attendance & leave
	{ key: 'attendance.biometric_upload', label: 'Upload biometric reports', group: 'Attendance & leave', description: "Load the device's report for days the scheduled feed missed.", grantable: true },
	{ key: 'attendance.device_sync', label: 'Run the device sync', group: 'Attendance & leave', description: 'Trigger a ProHance attendance sync by hand and see its status.', grantable: true },
	{ key: 'leave.set_balances', label: 'Set leave balances', group: 'Attendance & leave', description: 'Upload opening balances such as the HRone carry-forward.', grantable: true },
	{ key: 'leave.week_off_rosters', label: 'Author week-off rosters', group: 'Attendance & leave', description: 'Create, publish and delete week-off rosters.', grantable: true },
	// --- Policies
	{ key: 'policies.publish', label: 'Publish policies and holidays', group: 'Policies', description: 'Publish the holiday calendar and leave policy, and change leave types.', grantable: true },
	{ key: 'org.view', label: 'See the org chart', group: 'Policies', description: 'The reporting hierarchy for the whole company.', grantable: true },
	{ key: 'access.view', label: 'See roles and access', group: 'Policies', description: 'Read who holds which role and privilege.', grantable: true },
	// --- Communication
	{ key: 'announcements.post', label: 'Post announcements', group: 'Communication', description: 'Post in #announcements and see who has read each post.', grantable: true },
	{ key: 'chat.dm_anyone', label: 'Message anyone', group: 'Communication', description: 'Start a direct message with anyone. Without it, employees message their team, manager and HR.', grantable: true },
	{ key: 'chat.create_channels', label: 'Create channels anywhere', group: 'Communication', description: 'Create channels for any group of people. Team Leads can always create them for their own team.', grantable: true },
	{ key: 'chat.mention_all', label: 'Use @channel and @here', group: 'Communication', description: 'Notify a whole channel at once, in any channel.', grantable: true },
	{ key: 'chat.hr_desk', label: 'Answer #ask-hr', group: 'Communication', description: 'See and answer questions people raise with HR.', grantable: true },
	{ key: 'chat.moderate', label: 'Moderate chat', group: 'Communication', description: 'Review reported messages and hide them for everyone.', grantable: true },
	{ key: 'chat.export', label: 'Export a conversation', group: 'Communication', description: 'Export one conversation for a formal complaint. Recorded. Super Admin only.', grantable: false },
	// --- Champ
	{ key: 'champ.reports', label: 'Roster reports in Champ', group: 'Champ', description: 'Counts, lists and reports across the whole roster.', grantable: true },
	{ key: 'champ.audit', label: 'Audit trail in Champ', group: 'Champ', description: 'Search who changed what, and when.', grantable: true },
	// --- System
	{ key: 'system.cleanup', label: 'Data cleanup', group: 'System', description: 'Delete seeded and test data. Super Admin only.', grantable: false },
	{ key: 'system.design_tweaks', label: 'Design tweaks', group: 'System', description: 'Preview design variants in your browser.', grantable: true },
	{ key: 'system.roles', label: 'Manage roles', group: 'System', description: 'Create, change and delete named roles. Super Admin only.', grantable: false }
] as const satisfies readonly Capability[];

export type CapabilityKey = (typeof CAPABILITIES)[number]['key'];

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key) as CapabilityKey[];

export const GRANTABLE_KEYS = CAPABILITIES.filter((c) => c.grantable).map((c) => c.key) as CapabilityKey[];

/** What each base role has before any named role is added. */
const DEFAULTS: Record<Role, CapabilityKey[]> = {
	employee: [],
	team_lead: ['chat.dm_anyone'],
	admin: [
		'people.directory',
		'people.create_login',
		'people.edit_settings',
		'people.reset_password',
		'people.employee_code',
		'attendance.biometric_upload',
		'leave.set_balances',
		'org.view',
		'access.view',
		'announcements.post',
		'chat.dm_anyone',
		'chat.create_channels',
		'chat.mention_all',
		'chat.hr_desk',
		'chat.moderate',
		'champ.reports',
		'champ.audit'
	],
	super_admin: CAPABILITY_KEYS
};

export function defaultCapabilities(role: Role): CapabilityKey[] {
	return DEFAULTS[role] ?? [];
}

/**
 * Base role defaults plus a named role's privileges. Unknown keys (a privilege
 * removed from the catalogue since the role was saved) are dropped, and a
 * named role can never add a Super Admin-only power.
 */
export function effectiveCapabilities(role: Role, extra: readonly string[] = []): CapabilityKey[] {
	if (role === 'super_admin') return CAPABILITY_KEYS;
	const set = new Set<CapabilityKey>(defaultCapabilities(role));
	for (const key of extra) if ((GRANTABLE_KEYS as string[]).includes(key)) set.add(key as CapabilityKey);
	return CAPABILITY_KEYS.filter((k) => set.has(k));
}

/** The privileges that open an Admin Controls tab; any one lets you in. */
export const ADMIN_AREA_KEYS: CapabilityKey[] = [
	'people.directory',
	'people.create_login',
	'people.bulk_import',
	'people.reset_password',
	'people.password_activity',
	'attendance.biometric_upload',
	'attendance.device_sync',
	'leave.set_balances',
	'policies.publish',
	'org.view',
	'access.view',
	'system.cleanup',
	'system.design_tweaks',
	'system.roles'
];

export function canOpenAdmin(caps: readonly string[]): boolean {
	return ADMIN_AREA_KEYS.some((k) => caps.includes(k));
}

/** Ready-made starting points for the roles people ask for most. */
export const ROLE_PRESETS: { name: string; description: string; baseRole: Exclude<Role, 'super_admin'>; capabilities: CapabilityKey[] }[] = [
	{
		name: 'IT Support',
		description: 'Looks after logins, passwords and the biometric devices.',
		baseRole: 'employee',
		capabilities: [
			'people.directory',
			'people.create_login',
			'people.reset_password',
			'people.password_activity',
			'people.employee_code',
			'attendance.biometric_upload',
			'attendance.device_sync',
			'chat.dm_anyone'
		]
	},
	{
		name: 'Operations',
		description: 'Runs day-to-day operations across teams: rosters, attendance and channels.',
		baseRole: 'employee',
		capabilities: [
			'people.directory',
			'org.view',
			'attendance.biometric_upload',
			'leave.week_off_rosters',
			'chat.dm_anyone',
			'chat.create_channels',
			'chat.mention_all'
		]
	}
];

export const BASE_ROLE_LABEL: Record<Role, string> = {
	employee: 'Employee',
	team_lead: 'Team Lead',
	admin: 'HR Admin',
	super_admin: 'Super Admin'
};
