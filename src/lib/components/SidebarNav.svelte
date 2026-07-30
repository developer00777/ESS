<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Users from '@lucide/svelte/icons/users';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import LogOut from '@lucide/svelte/icons/log-out';
	import type { Role } from '$lib/server/auth';

	interface Props {
		activePath: string;
		role: Role;
		fullName: string;
	}

	let { activePath, role, fullName }: Props = $props();

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
		width: var(--sidebar-width);
		flex-shrink: 0;
		background: var(--color-ink);
		color: var(--color-text-inverse);
		display: flex;
		flex-direction: column;
		height: 100vh;
		position: sticky;
		top: 0;
		padding: 1.5rem 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.5rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 1rem;
	}

	.brand-mark {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--color-accent);
		color: var(--color-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 0.85rem;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}

	.brand-text strong {
		font-size: 1rem;
	}

	.brand-text span {
		font-size: 0.72rem;
		color: rgba(242, 248, 247, 0.6);
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex: 1;
	}

	.nav-list a {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: rgba(242, 248, 247, 0.75);
		font-size: 0.92rem;
		font-weight: 500;
		transition: background 0.15s ease;
	}

	.nav-list a:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text-inverse);
	}

	.nav-list a.active {
		background: var(--color-primary);
		color: var(--color-white);
		font-weight: 600;
	}

	.rail-foot {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.foot-user {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}

	.foot-avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--color-accent);
		color: var(--color-ink);
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
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.foot-info span {
		font-size: 0.7rem;
		color: rgba(242, 248, 247, 0.55);
		text-transform: capitalize;
	}

	.logout-btn {
		background: transparent;
		border: none;
		color: rgba(242, 248, 247, 0.6);
		cursor: pointer;
		padding: 0.4rem;
		border-radius: var(--radius-sm);
		display: flex;
	}

	.logout-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-text-inverse);
	}
</style>
