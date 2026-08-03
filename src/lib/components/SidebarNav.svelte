<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Users from '@lucide/svelte/icons/users';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileText from '@lucide/svelte/icons/file-text';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import type { Role } from '$lib/server/auth';

	interface Props {
		activePath: string;
		role: Role;
		fullName: string;
	}

	let { activePath, role, fullName }: Props = $props();

	let theme = $state<'light' | 'dark'>('light');
	let shell = $state<'classic' | 'rail'>('classic');

	$effect(() => {
		theme = document.documentElement.getAttribute('data-ess-theme') === 'dark' ? 'dark' : 'light';
		shell =
			document.documentElement.getAttribute('data-ess-shell') === 'rail' ? 'rail' : 'classic';
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

	function toggleShell() {
		const next = shell === 'rail' ? 'classic' : 'rail';
		shell = next;
		if (next === 'rail') {
			document.documentElement.setAttribute('data-ess-shell', 'rail');
		} else {
			document.documentElement.removeAttribute('data-ess-shell');
		}
		localStorage.setItem('essShell', next);
	}

	/* Nav grouped per the Cosmic shell spec: "Me" (personal) / "Manage" (lead+). */
	const meItems = [
		{ href: '/dashboard', label: 'Home', icon: LayoutDashboard },
		{ href: '/profile', label: 'My Profile', icon: User },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		{ href: '/payroll', label: 'Payroll', icon: Wallet },
		{ href: '/policies', label: 'Policies', icon: FileText }
	];

	const teamItem = { href: '/team', label: 'Team', icon: Users };
	const adminItem = { href: '/admin/policies', label: 'Publish Policies', icon: UploadCloud };

	let sections = $derived.by(() => {
		const manage = [
			...(role !== 'employee' ? [teamItem] : []),
			...(role === 'super_admin' ? [adminItem] : [])
		];
		return [
			{ label: 'Me', items: meItems },
			{ label: 'Manage', items: manage }
		].filter((s) => s.items.length > 0);
	});
</script>

<nav class="rail">
	<div class="brand">
		<div class="brand-mark">CH</div>
		<div class="brand-text">
			<strong>Champ HR</strong>
			<span>ESS Portal</span>
		</div>
		<button
			type="button"
			class="collapse-btn"
			onclick={toggleShell}
			aria-label={shell === 'rail' ? 'Expand sidebar' : 'Collapse sidebar'}
			title={shell === 'rail' ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if shell === 'rail'}
				<PanelLeftOpen size={16} />
			{:else}
				<PanelLeftClose size={16} />
			{/if}
		</button>
	</div>

	<div class="theme-toggle" role="group" aria-label="Palette">
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'light'}
			onclick={() => setTheme('light')}
			title="Nebula palette"
		>
			<Sparkles size={14} />
			<span class="theme-label">Nebula</span>
		</button>
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'dark'}
			onclick={() => setTheme('dark')}
			title="Onyx palette"
		>
			<Moon size={14} />
			<span class="theme-label">Onyx</span>
		</button>
	</div>

	<div class="nav-list">
		{#each sections as section (section.label)}
			<span class="nav-eyebrow">{section.label}</span>
			{#each section.items as item (item.href)}
				<a
					href={item.href}
					class:active={activePath.startsWith(item.href)}
					title={item.label}
					aria-label={item.label}
				>
					<item.icon size={18} />
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		{/each}
	</div>

	<div class="rail-foot">
		<div class="foot-user">
			<div class="foot-avatar">{fullName.charAt(0)}</div>
			<div class="foot-info">
				<strong>{fullName}</strong>
				<span>{role.replace('_', ' ')}</span>
			</div>
		</div>
		<form method="POST" action="/logout">
			<button type="submit" class="logout-btn" aria-label="Log out" title="Log out">
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
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 13px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			0 6px 16px -8px var(--glow);
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
		background: linear-gradient(180deg, color-mix(in oklab, var(--acc) 82%, #fff), var(--acc));
		color: var(--ess-text-on-primary);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}

	.collapse-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: var(--ess-text-inverse-secondary);
		cursor: pointer;
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast);
	}

	.collapse-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--ess-text-inverse);
	}

	.nav-list {
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.nav-eyebrow {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.82);
		padding: 0 12px 4px;
	}

	.nav-eyebrow:not(:first-child) {
		padding-top: 16px;
	}

	.nav-list a {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: var(--ess-radius-sm);
		text-decoration: none;
		color: var(--ess-text-inverse-secondary);
		font-size: var(--ess-fs-body);
		font-weight: 500;
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast),
			border-color var(--ess-t-fast);
	}

	.nav-list a:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--ess-text-inverse);
	}

	.nav-list a.active {
		color: #fff;
		font-weight: 600;
		border-color: color-mix(in oklab, var(--acc) 45%, transparent);
		background: linear-gradient(
			100deg,
			color-mix(in oklab, var(--acc) 34%, transparent),
			rgba(255, 255, 255, 0.05)
		);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.24),
			0 10px 24px -14px var(--glow);
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
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			0 6px 16px -8px var(--glow);
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

	/* ------------------------------------------------------------
	   RAIL SHELL — 74px icon-only column, per the Cosmic shell spec
	   ([data-ess-shell='rail'] on <html>, persisted as essShell).
	------------------------------------------------------------ */

	:global([data-ess-shell='rail']) .rail {
		width: 74px;
		padding: 14px 10px;
		align-items: center;
	}

	:global([data-ess-shell='rail']) .brand {
		flex-direction: column;
		gap: 8px;
		padding: 0 0 14px;
		justify-content: center;
		width: 100%;
	}

	:global([data-ess-shell='rail']) .brand-text {
		display: none;
	}

	:global([data-ess-shell='rail']) .collapse-btn {
		margin-left: 0;
	}

	:global([data-ess-shell='rail']) .theme-toggle {
		flex-direction: column;
		width: 100%;
	}

	:global([data-ess-shell='rail']) .theme-label {
		display: none;
	}

	:global([data-ess-shell='rail']) .nav-eyebrow {
		display: none;
	}

	:global([data-ess-shell='rail']) .nav-label {
		display: none;
	}

	:global([data-ess-shell='rail']) .nav-list {
		width: 100%;
		gap: 6px;
	}

	:global([data-ess-shell='rail']) .nav-list a {
		justify-content: center;
		padding: 0;
		height: 46px;
	}

	:global([data-ess-shell='rail']) .rail-foot {
		flex-direction: column;
		gap: 8px;
		justify-content: center;
		width: 100%;
	}

	:global([data-ess-shell='rail']) .foot-info {
		display: none;
	}

	/* Below tablet the full 264px rail leaves too little room for content
	   (measured: 400px viewport → ~136px of usable width), so the sidebar
	   always collapses to the icon rail regardless of the stored preference. */
	@media (max-width: 720px) {
		.rail {
			width: 74px;
			padding: 14px 8px;
			align-items: center;
		}

		.brand,
		.theme-toggle,
		.rail-foot {
			flex-direction: column;
			width: 100%;
			justify-content: center;
		}

		.brand {
			gap: 8px;
			padding: 0 0 14px;
		}

		.collapse-btn,
		.brand-text,
		.theme-label,
		.nav-eyebrow,
		.nav-label,
		.foot-info {
			display: none;
		}

		.nav-list {
			width: 100%;
			gap: 6px;
		}

		.nav-list a {
			justify-content: center;
			padding: 0;
			height: 46px;
		}

		.rail-foot {
			gap: 8px;
		}
	}
</style>
