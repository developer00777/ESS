import type { Component } from 'svelte';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import Calendar from '@lucide/svelte/icons/calendar';
import Clock from '@lucide/svelte/icons/clock';
import FileText from '@lucide/svelte/icons/file-text';
import Users from '@lucide/svelte/icons/users';
import ShieldUser from '@lucide/svelte/icons/shield-user';
import Wallet from '@lucide/svelte/icons/wallet';
import type { Role } from '$lib/server/auth';

/**
 * The portal's main sections, shared by every main navigation (the
 * sidebar, and Atur's dock), so they always list the same pages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NavItem = { href: string; label: string; icon: Component<any>; soon?: boolean };

export function mainNavItems(opts: { role: Role; canTeam?: boolean; canAdmin?: boolean; canPayroll?: boolean }): NavItem[] {
	const { role, canTeam, canAdmin = false, canPayroll = false } = opts;
	return [
		{ href: '/dashboard', label: 'Today', icon: CalendarDays },
		{ href: '/hub', label: 'Champ Hub', icon: LayoutGrid },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		{ href: '/policies', label: 'Policies', icon: FileText },
		...((canTeam ?? role !== 'employee') ? [{ href: '/team', label: 'Team', icon: Users }] : []),
		...(canAdmin ? [{ href: '/admin', label: 'Admin Controls', icon: ShieldUser }] : []),
		/* Payroll is live for those who run it; for everyone else payslips
		   are not in the portal yet, and the row says so. */
		{ href: '/payroll', label: 'Payroll', icon: Wallet, soon: !canPayroll }
	];
}

/** Whether a nav link is the current page (Today also covers "/"). */
export function isNavActive(href: string, activePath: string) {
	return href === '/dashboard'
		? activePath === '/dashboard' || activePath === '/'
		: activePath === href || activePath.startsWith(href + '/');
}
