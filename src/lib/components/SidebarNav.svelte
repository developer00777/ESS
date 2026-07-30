<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Users from '@lucide/svelte/icons/users';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import type { Role } from '$lib/server/auth';

	interface Props {
		activePath: string;
		role: Role;
		fullName: string;
	}

	let { activePath, role, fullName }: Props = $props();

	let theme = $state<'light' | 'dark'>('light');

	$effect(() => {
		theme = document.documentElement.getAttribute('data-ess-theme') === 'dark' ? 'dark' : 'light';
	});

	function setTheme(next: 'light' | 'dark') {
		theme = next;
		if (next === 'dark') {
			document.documentElement.setAttribute('data-ess-theme', 'dark');
		} else {
			document.documentElement.removeAttribute('data-ess-theme');
		}
		localStorage.setItem('essTheme', next);
	}

	const navItems = [
		{ href: '/dashboard', label: 'Home', icon: LayoutDashboard },
		{ href: '/profile', label: 'My Profile', icon: User },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		{ href: '/payroll', label: 'Payroll', icon: Wallet }
	];

	const teamItem = { href: '/team', label: 'Team', icon: Users };
	const adminItem = { href: '/admin/policies', label: 'Publish Policies', icon: UploadCloud };

	let items = $derived.by(() => {
		let list = role === 'employee' ? navItems : [...navItems, teamItem];
		if (role === 'super_admin') list = [...list, adminItem];
		return list;
	});
</script>

<nav class="rail">
	<div class="brand">
		<div class="brand-mark">CH</div>
		<div class="brand-text">
			<strong>Champ HR</strong>
			<span>ESS Portal</span>
		</div>
	</div>

	<div class="theme-toggle" role="group" aria-label="Theme">
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'light'}
			onclick={() => setTheme('light')}
		>
			<Sun size={14} />
			Light
		</button>
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'dark'}
			onclick={() => setTheme('dark')}
		>
			<Moon size={14} />
			Dark
		</button>
	</div>

	<ul class="nav-list">
		{#each items as item (item.href)}
			<li>
				<a href={item.href} class:active={activePath.startsWith(item.href)}>
					<item.icon size={18} />
					<span>{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>

	<div class="rail-foot">
		<div class="foot-user">
			<div class="foot-avatar">{fullName.charAt(0)}</div>
			<div class="foot-info">
				<strong>{fullName}</strong>
				<span>{role.replace('_', ' ')}</span>
			</div>
		</div>
		<form method="POST" action="/logout">
			<button type="submit" class="logout-btn" aria-label="Log out">
				<LogOut size={18} />
			</button>
		</form>
	</div>
</nav>

<style>
	.rail {
		width: var(--ess-rail-width);
		flex-shrink: 0;
		background: var(--ess-inverse);
		color: var(--ess-text-inverse);
		display: flex;
		flex-direction: column;
		height: 100vh;
		position: sticky;
		top: 0;
		padding: 20px 14px;
		border-right: 1px solid var(--ess-border-inverse);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 8px 16px;
		border-bottom: 1px solid var(--ess-border-inverse);
		margin-bottom: 14px;
	}

	.brand-mark {
		width: 38px;
		height: 38px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-green-400);
		color: var(--ess-teal-900);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 13px;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}

	.brand-text strong {
		font-size: 15px;
	}

	.brand-text span {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-inverse-secondary);
	}

	.theme-toggle {
		display: flex;
		gap: 2px;
		padding: 3px;
		margin-bottom: 14px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: var(--ess-radius-sm);
	}

	.theme-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: none;
		border-radius: 6px;
		padding: 6px 0;
		background: transparent;
		color: var(--ess-text-inverse-secondary);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.theme-btn[aria-pressed='true'] {
		background: var(--ess-green-400);
		color: var(--ess-teal-900);
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
	}

	.nav-list a {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 12px;
		border-radius: var(--ess-radius-sm);
		text-decoration: none;
		color: var(--ess-text-inverse-secondary);
		font-size: var(--ess-fs-body);
		font-weight: 500;
		transition: background var(--ess-t-fast), color var(--ess-t-fast);
	}

	.nav-list a:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--ess-text-inverse);
	}

	.nav-list a.active {
		background: var(--ess-primary);
		color: #fff;
		font-weight: 600;
	}

	.rail-foot {
		border-top: 1px solid var(--ess-border-inverse);
		padding-top: 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.foot-user {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.foot-avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--ess-green-400);
		color: var(--ess-teal-900);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
	}

	.foot-info {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		min-width: 0;
	}

	.foot-info strong {
		font-size: var(--ess-fs-body);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.foot-info span {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-inverse-secondary);
		text-transform: capitalize;
	}

	.logout-btn {
		background: transparent;
		border: none;
		color: var(--ess-text-inverse-secondary);
		cursor: pointer;
		padding: 6px;
		border-radius: var(--ess-radius-sm);
		display: flex;
	}

	.logout-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ess-text-inverse);
	}
</style>
