<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Users from '@lucide/svelte/icons/users';
	import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Palette from '@lucide/svelte/icons/palette';
	import DatabaseZap from '@lucide/svelte/icons/database-zap';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import Avatar from './Avatar.svelte';
	import type { Role } from '$lib/server/auth';

	interface Props {
		activePath: string;
		role: Role;
		fullName: string;
		userId: string;
		hasPicture?: boolean;
		pictureVersion?: number | null;
	}

	let { activePath, role, fullName, userId, hasPicture = false, pictureVersion }: Props = $props();

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
	type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; soon?: boolean };

	const meItems: NavItem[] = [
		{ href: '/dashboard', label: 'Home', icon: LayoutDashboard },
		{ href: '/profile', label: 'My Profile', icon: User },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		/* Payroll has no route yet, so it stays visible (employees expect it in
		   the nav) but is inert and badged rather than 404-ing on click. */
		{ href: '/payroll', label: 'Payroll', icon: Wallet, soon: true },
		{ href: '/policies', label: 'Policies', icon: BookOpen }
	];

	/* Icons follow the standalone reference's semantics: reading a policy is a
	   book (▥), publishing one is a push upward (⇧). The old set used a plain
	   document for both and a vague cloud for publish, so the two policy rows
	   were near-indistinguishable in the collapsed rail. */
	const teamItem: NavItem = { href: '/team', label: 'Team', icon: Users };
	const adminItem: NavItem = {
		href: '/admin/policies',
		label: 'Publish Policies',
		icon: ArrowUpFromLine
	};
	const tweaksItem: NavItem = { href: '/admin/tweaks', label: 'Design Tweaks', icon: Palette };
	const cleanupItem: NavItem = { href: '/admin/cleanup', label: 'Data Cleanup', icon: DatabaseZap };
	/* HR uploads the biometric machine's own report for the days its scheduled
	   feed missed, so this is Admin's as much as the Super Admin's. */
	const biometricItem: NavItem = {
		href: '/admin/biometric',
		label: 'Biometric Upload',
		icon: Fingerprint
	};
	/* Carry-forward balances come from HRone as a spreadsheet, so HR sets them
	   here rather than waiting on the policy accrual, which cannot know them. */
	const leaveBalanceItem: NavItem = {
		href: '/admin/leave-balances',
		label: 'Leave Balances',
		icon: CalendarPlus
	};

	let sections = $derived.by(() => {
		const manage = [
			...(role !== 'employee' ? [teamItem] : []),
			...(role === 'super_admin' || role === 'admin' ? [biometricItem, leaveBalanceItem] : []),
			...(role === 'super_admin' ? [adminItem, tweaksItem, cleanupItem] : [])
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

	<div class="theme-toggle" role="group" aria-label="Theme">
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'light'}
			onclick={() => setTheme('light')}
			title="Light mode"
		>
			<Sun size={14} />
			<span class="theme-label">Light</span>
		</button>
		<button
			type="button"
			class="theme-btn"
			aria-pressed={theme === 'dark'}
			onclick={() => setTheme('dark')}
			title="Dark mode"
		>
			<Moon size={14} />
			<span class="theme-label">Dark</span>
		</button>
	</div>

	<div class="nav-list">
		{#each sections as section (section.label)}
			<span class="nav-eyebrow">{section.label}</span>
			{#each section.items as item (item.href)}
				{#if item.soon}
					<span
						class="nav-soon"
						data-tip="{item.label} — coming soon"
						aria-disabled="true"
						title="{item.label} — coming soon"
					>
						<item.icon size={18} />
						<span class="nav-label">{item.label}</span>
						<span class="soon-badge">Soon</span>
					</span>
				{:else}
					<a
						href={item.href}
						class:active={activePath.startsWith(item.href)}
						data-tip={item.label}
						aria-label={item.label}
					>
						<item.icon size={18} />
						<span class="nav-label">{item.label}</span>
					</a>
				{/if}
			{/each}
		{/each}
	</div>

	<div class="rail-foot">
		<div class="foot-user">
			<a href="/profile" class="foot-avatar-link" title="My Profile">
				<Avatar {userId} {fullName} {hasPicture} size="md" version={pictureVersion ?? undefined} />
			</a>
			<div class="foot-info">
				<strong>{fullName}</strong>
				<span>{role.replace('_', ' ')}</span>
			</div>
		</div>
		<form method="POST" action="/logout">
			<button type="submit" class="logout-btn" aria-label="Log out" data-tip="Log out">
				<LogOut size={18} />
				<span class="logout-label">Log out</span>
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

	/* Same geometry as a nav link so the rail rhythm holds, but inert: no
	   href, no hover affordance, and a badge that says why. */
	.nav-soon {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: var(--ess-radius-sm);
		color: var(--ess-text-inverse-secondary);
		font-size: var(--ess-fs-body);
		font-weight: 500;
		opacity: 0.55;
		cursor: not-allowed;
		position: relative;
		user-select: none;
	}

	.soon-badge {
		margin-left: auto;
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		white-space: nowrap;
	}

	:global([data-ess-shell='rail']) .nav-soon {
		justify-content: center;
		padding: 0;
		height: 46px;
	}

	:global([data-ess-shell='rail']) .soon-badge {
		display: none;
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

	.foot-avatar-link {
		display: block;
		line-height: 0;
		flex-shrink: 0;
		border-radius: 50%;
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

	/* Sign-out reads as a real button at rest, not a bare glyph: it carries a
	   visible border and surface in both shells. Previously the only styling
	   was on :hover, so at rest it was indistinguishable from a plain icon. */
	.logout-btn {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-strong);
		color: var(--ess-text-inverse);
		cursor: pointer;
		padding: 7px 12px;
		border-radius: var(--ess-radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		position: relative;
		transition:
			background 150ms ease-out,
			color 150ms ease-out,
			border-color 150ms ease-out;
	}

	.logout-label {
		white-space: nowrap;
	}

	/* Sign-out is destructive-ish and easy to hit by accident next to the
	   avatar, so the hover state names it in the danger colour rather than
	   reading as just another grey icon button. */
	.logout-btn:hover {
		background: var(--ess-danger-bg);
		border-color: var(--ess-danger);
		color: var(--ess-danger);
	}

	.logout-btn:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}

	:global([data-ess-shell='rail']) .logout-label {
		display: none;
	}

	/* Collapsed rail: a full-width square button, so it still reads as an
	   action rather than a stray icon under the avatar. */
	:global([data-ess-shell='rail']) .logout-btn {
		padding: 0;
		width: 40px;
		height: 40px;
	}

	:global([data-ess-shell='rail']) .rail-foot form {
		display: flex;
		justify-content: center;
		width: 100%;
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

	/* The expanded rail scrolls its nav list, but `overflow:auto` clips the
	   hover tooltips below. In the collapsed rail every item fits without
	   scrolling, so the clipping container is removed rather than worked
	   around with a portal. */
	:global([data-ess-shell='rail']) .nav-list {
		width: 100%;
		gap: 6px;
		overflow: visible;
	}

	:global([data-ess-shell='rail']) .nav-list a {
		justify-content: center;
		padding: 0;
		height: 46px;
		position: relative;
	}

	/* Collapsed rail shows icons only, so the label has to come back on hover
	   — a native `title` waits ~1s and can't be styled, which made items like
	   "Publish Policies" and "Design Tweaks" unidentifiable at a glance. */
	:global([data-ess-shell='rail']) .nav-list a::after,
	:global([data-ess-shell='rail']) .nav-soon::after,
	:global([data-ess-shell='rail']) .logout-btn::after {
		content: attr(data-tip);
		position: absolute;
		left: calc(100% + 10px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		background: var(--ess-text);
		color: var(--ess-canvas);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.01em;
		white-space: nowrap;
		padding: 6px 10px;
		border-radius: var(--ess-radius-xs);
		box-shadow: var(--ess-elev-2);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 140ms ease-out,
			transform 140ms ease-out;
		z-index: 60;
	}

	:global([data-ess-shell='rail']) .nav-list a:hover::after,
	:global([data-ess-shell='rail']) .nav-list a:focus-visible::after,
	:global([data-ess-shell='rail']) .nav-soon:hover::after,
	:global([data-ess-shell='rail']) .logout-btn:hover::after,
	:global([data-ess-shell='rail']) .logout-btn:focus-visible::after {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}

	@media (prefers-reduced-motion: reduce) {
		:global([data-ess-shell='rail']) .nav-list a::after,
		:global([data-ess-shell='rail']) .logout-btn::after {
			transition: none;
		}
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

	/* ------------------------------------------------------------
	   LIGHT (OPAL) — the rail is a light pane, so the white-alpha
	   fills/borders above (correct on the dark Onyx pane) are retuned
	   to ink-alpha. Scoped to the default palette; dark keeps the above.
	------------------------------------------------------------ */
	:global(:root:not([data-ess-theme='dark'])) .theme-toggle {
		background: rgba(20, 18, 35, 0.05);
	}
	:global(:root:not([data-ess-theme='dark'])) .nav-eyebrow {
		color: rgba(20, 18, 35, 0.6);
	}
	:global(:root:not([data-ess-theme='dark'])) .nav-list a:hover {
		background: rgba(20, 18, 35, 0.05);
	}
	:global(:root:not([data-ess-theme='dark'])) .nav-list a.active {
		color: var(--ess-text);
	}
	:global(:root:not([data-ess-theme='dark'])) .collapse-btn:hover {
		background: rgba(20, 18, 35, 0.06);
		color: var(--ess-text);
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
