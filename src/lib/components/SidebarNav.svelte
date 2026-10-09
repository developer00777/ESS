<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import Settings from '@lucide/svelte/icons/settings';
	import Wallet from '@lucide/svelte/icons/wallet';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import Avatar from './Avatar.svelte';
	import type { Role } from '$lib/server/auth';

	/**
	 * The 210px sidebar from the Timeline mockups: brand, the main sections,
	 * then Help & support and the person's avatar at the foot. Admin Controls
	 * only shows for people whose privileges open it.
	 */
	interface Props {
		activePath: string;
		role: Role;
		fullName: string;
		userId: string;
		hasPicture?: boolean;
		pictureVersion?: number | null;
		/** Whether this login may open Admin Controls at all. */
		canAdmin?: boolean;
		/** Open admin problems, shown on the Admin Controls row. */
		adminIssueCount?: number;
		/** Champ Hub: unread chat plus requests, minutes and due work; red when urgent. */
		chatBadge?: { count: number; urgent: boolean };
	}

	let {
		activePath,
		role,
		fullName,
		userId,
		hasPicture = false,
		pictureVersion,
		canAdmin = false,
		adminIssueCount = 0,
		chatBadge = { count: 0, urgent: false }
	}: Props = $props();

	let shell = $state<'classic' | 'rail'>('classic');

	$effect(() => {
		shell = document.documentElement.getAttribute('data-ess-shell') === 'rail' ? 'rail' : 'classic';
	});

	function toggleShell() {
		const next = shell === 'rail' ? 'classic' : 'rail';
		shell = next;
		if (next === 'rail') document.documentElement.setAttribute('data-ess-shell', 'rail');
		else document.documentElement.removeAttribute('data-ess-shell');
		localStorage.setItem('essShell', next);
	}

	type NavItem = { href: string; label: string; icon: typeof Calendar; soon?: boolean };

	const items = $derived.by((): NavItem[] => [
		{ href: '/dashboard', label: 'Today', icon: CalendarDays },
		{ href: '/hub', label: 'Champ Hub', icon: LayoutGrid },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		{ href: '/policies', label: 'Policies', icon: FileText },
		...(role !== 'employee' ? [{ href: '/team', label: 'Team', icon: Users }] : []),
		...(canAdmin ? [{ href: '/admin', label: 'Admin Controls', icon: Settings }] : []),
		/* Payroll is not built yet. The row stays so people know where it will
		   live, and opens an honest "not available yet" page. */
		{ href: '/payroll', label: 'Payroll', icon: Wallet, soon: true }
	]);

	const isActive = (href: string) =>
		href === '/dashboard' ? activePath === '/dashboard' || activePath === '/' : activePath === href || activePath.startsWith(href + '/');
</script>

<nav class="rail" aria-label="Main">
	<div class="brand">
		<a href="/dashboard" class="brand-link" aria-label="Champ HR, Today">
			<span class="brand-mark" aria-hidden="true">
				<svg viewBox="0 0 40 40" width="30" height="30">
					<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
					<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				</svg>
			</span>
			<span class="brand-text">Champ HR</span>
		</a>
		<button
			type="button"
			class="collapse-btn"
			onclick={toggleShell}
			aria-label={shell === 'rail' ? 'Expand navigation' : 'Collapse navigation'}
			title={shell === 'rail' ? 'Expand navigation' : 'Collapse navigation'}
		>
			{#if shell === 'rail'}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}
		</button>
	</div>

	<div class="nav-list">
		{#each items as item (item.href)}
			<a
				href={item.href}
				class="nav-item"
				class:soon={item.soon}
				aria-current={isActive(item.href) ? 'page' : undefined}
				data-tip={item.soon ? `${item.label} — coming soon` : item.label}
				aria-label={item.label}
			>
				<item.icon size={19} strokeWidth={1.75} />
				<span class="nav-label">{item.label}</span>
				{#if item.soon}
					<span class="soon-badge">Coming soon</span>
				{:else if item.href === '/admin' && adminIssueCount > 0}
					<span class="count warn" aria-label="{adminIssueCount} need{adminIssueCount === 1 ? 's' : ''} attention">{adminIssueCount}</span>
				{:else if item.href === '/hub' && chatBadge.count > 0}
					<span class="count" class:urgent={chatBadge.urgent} aria-label="{chatBadge.count} unread{chatBadge.urgent ? ', something is urgent' : ''}">
						{chatBadge.count > 99 ? '99+' : chatBadge.count}
					</span>
				{/if}
			</a>
		{/each}
	</div>

	<div class="rail-foot">
		<a href="/hr-contacts" class="nav-item" aria-current={isActive('/hr-contacts') ? 'page' : undefined} data-tip="Help & support" aria-label="Help & support">
			<CircleHelp size={19} strokeWidth={1.75} />
			<span class="nav-label">Help &amp; support</span>
		</a>
		<a href="/profile" class="nav-item me" aria-current={isActive('/profile') ? 'page' : undefined} data-tip="My profile" aria-label="My profile">
			<Avatar {userId} {fullName} {hasPicture} size="sm" version={pictureVersion ?? undefined} />
			<span class="nav-label me-name">{fullName}</span>
		</a>
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
		height: 100dvh;
		position: sticky;
		top: 0;
		padding: 18px 12px 16px;
		border-right: 1px solid var(--ess-border-inverse);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px 18px;
		margin-bottom: 22px;
		border-bottom: 1px solid var(--ess-border-inverse);
	}

	.brand-link {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		color: var(--ess-text);
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		color: var(--ess-primary);
		flex: none;
	}

	.brand-text {
		font-size: 19px;
		font-weight: 600;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}

	.collapse-btn {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: none;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 7px;
		color: var(--ess-text-muted);
		cursor: pointer;
		opacity: 0;
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast),
			opacity var(--ess-t-fast);
	}
	.rail:hover .collapse-btn,
	.collapse-btn:focus-visible {
		opacity: 1;
	}
	.collapse-btn:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 2px;
		overscroll-behavior: contain;
	}

	.nav-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 44px;
		padding: 0 14px;
		border-radius: var(--ess-radius-md);
		color: var(--ess-text-secondary);
		font-size: 14.5px;
		font-weight: 500;
		white-space: nowrap;
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast);
	}
	.nav-item :global(svg) {
		flex: none;
		color: var(--ess-text-muted);
		transition: color var(--ess-t-fast);
	}
	.nav-item:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.nav-item:hover :global(svg) {
		color: var(--ess-text);
	}
	.nav-item[aria-current='page'] {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.nav-item[aria-current='page'] :global(svg) {
		color: var(--ess-primary);
	}

	.nav-item.soon {
		color: var(--ess-text-muted);
	}

	.soon-badge {
		margin-left: auto;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 2px 7px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
		white-space: nowrap;
	}

	.count {
		margin-left: auto;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--ess-radius-pill);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.nav-item[aria-current='page'] .count {
		background: var(--ess-surface);
	}
	.count.warn {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.count.urgent {
		background: var(--ess-danger);
		color: #fff;
	}

	.rail-foot {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 12px;
		border-top: 1px solid var(--ess-border-inverse);
	}

	.me {
		padding-left: 12px;
	}
	.me-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ------------------------------------------------------------
	   COMPACT RAIL — 68px icon column ([data-ess-shell='rail'] on <html>).
	------------------------------------------------------------ */

	:global([data-ess-shell='rail']) .rail {
		width: var(--ess-rail-width-collapsed);
		padding: 14px 10px 12px;
		align-items: center;
	}
	:global([data-ess-shell='rail']) .brand {
		flex-direction: column;
		gap: 8px;
		padding: 0 0 12px;
		justify-content: center;
		width: 100%;
	}
	:global([data-ess-shell='rail']) .brand-text,
	:global([data-ess-shell='rail']) .nav-label,
	:global([data-ess-shell='rail']) .soon-badge {
		display: none;
	}
	:global([data-ess-shell='rail']) .collapse-btn {
		margin-left: 0;
		opacity: 1;
	}
	:global([data-ess-shell='rail']) .nav-list,
	:global([data-ess-shell='rail']) .rail-foot {
		width: 100%;
		overflow: visible;
	}
	:global([data-ess-shell='rail']) .nav-item {
		justify-content: center;
		padding: 0;
		height: 46px;
	}
	:global([data-ess-shell='rail']) .count {
		position: absolute;
		top: 4px;
		right: 4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		font-size: 9.5px;
	}

	/* Icon-only rails show the label on hover. */
	:global([data-ess-shell='rail']) .nav-item::after {
		content: attr(data-tip);
		position: absolute;
		left: calc(100% + 10px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		background: var(--ess-text);
		color: var(--ess-canvas);
		font-size: 12px;
		font-weight: 500;
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
	:global([data-ess-shell='rail']) .nav-item:hover::after,
	:global([data-ess-shell='rail']) .nav-item:focus-visible::after {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}

	/* Below tablet the full rail leaves too little room, so it always collapses. */
	@media (max-width: 720px) {
		.rail {
			width: var(--ess-rail-width-collapsed);
			padding: 14px 8px 12px;
			align-items: center;
		}
		.brand {
			flex-direction: column;
			gap: 8px;
			padding: 0 0 12px;
			justify-content: center;
			width: 100%;
		}
		.collapse-btn,
		.brand-text,
		.nav-label,
		.soon-badge {
			display: none;
		}
		.nav-list,
		.rail-foot {
			width: 100%;
		}
		.nav-item {
			justify-content: center;
			padding: 0;
			height: 46px;
		}
		.count {
			position: absolute;
			top: 4px;
			right: 4px;
			min-width: 16px;
			height: 16px;
			padding: 0 4px;
			font-size: 9.5px;
		}
	}
</style>
