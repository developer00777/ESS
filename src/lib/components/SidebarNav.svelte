<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import ShieldUser from '@lucide/svelte/icons/shield-user';
	import Wallet from '@lucide/svelte/icons/wallet';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import type { Role } from '$lib/server/auth';

	/**
	 * A narrow, free-floating pill of icons that overlaps the workspace's
	 * left edge: the logo on top, the main sections, then Help & support at
	 * the foot. Profile lives in the top bar (settings button, avatar menu). Labels show as tooltips. Admin Controls
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

	type NavItem = { href: string; label: string; icon: typeof Calendar; soon?: boolean };

	const items = $derived.by((): NavItem[] => [
		{ href: '/dashboard', label: 'Today', icon: CalendarDays },
		{ href: '/hub', label: 'Champ Hub', icon: LayoutGrid },
		{ href: '/leave', label: 'Leave', icon: Calendar },
		{ href: '/attendance', label: 'Attendance', icon: Clock },
		{ href: '/policies', label: 'Policies', icon: FileText },
		...(role !== 'employee' ? [{ href: '/team', label: 'Team', icon: Users }] : []),
		...(canAdmin ? [{ href: '/admin', label: 'Admin Controls', icon: ShieldUser }] : []),
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
	</div>
</nav>

<style>
	/* A floating pill, vertically centred, overlapping the workspace's left
	   edge (the workspace leaves room with --ess-shell-pad-left). */
	.rail {
		position: fixed;
		left: var(--ess-rail-left);
		top: 50%;
		transform: translateY(-50%);
		z-index: 40;
		width: var(--ess-rail-width);
		max-height: calc(100dvh - 48px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 14px 0;
		background: color-mix(in srgb, var(--ess-surface) 84%, transparent);
		backdrop-filter: saturate(180%) blur(20px);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		border: 1px solid var(--ess-shell-border);
		border-radius: 999px;
		box-shadow:
			0 1px 2px rgba(20, 22, 40, 0.04),
			0 18px 40px -16px rgba(20, 22, 40, 0.22);
		color: var(--ess-text);
	}

	.brand-link {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 50%;
		color: var(--ess-primary);
	}
	.brand-mark {
		display: grid;
		place-items: center;
	}
	.brand-text,
	.nav-label,
	.soon-badge {
		display: none;
	}

	.nav-list,
	.rail-foot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.nav-list {
		flex: 1;
		min-height: 0;
	}
	.rail-foot {
		padding-top: 10px;
		border-top: 1px solid var(--ess-border);
	}

	.nav-item {
		position: relative;
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 50%;
		color: var(--ess-text-muted);
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast);
	}
	.nav-item:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.nav-item[aria-current='page'] {
		color: var(--ess-primary);
		background: var(--ess-primary-soft);
	}
	.nav-item.soon {
		opacity: 0.5;
	}

	.count {
		position: absolute;
		top: 2px;
		right: 0;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 9.5px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		box-shadow: 0 0 0 2px var(--ess-surface);
	}
	.count.warn {
		background: var(--ess-warning);
		color: #fff;
	}
	.count.urgent {
		background: var(--ess-danger);
		color: #fff;
	}

	/* Tooltips to the right of each icon. */
	.nav-item::after {
		content: attr(data-tip);
		position: absolute;
		left: calc(100% + 14px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		padding: 5px 10px;
		border-radius: 8px;
		background: var(--ess-text);
		color: var(--ess-surface);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity var(--ess-t-fast),
			transform var(--ess-t-fast);
		z-index: 50;
	}
	.nav-item:hover::after,
	.nav-item:focus-visible::after {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}

	/* Phones: an ordinary narrow rail down the left edge. */
	@media (max-width: 720px) {
		.rail {
			position: sticky;
			left: auto;
			top: 0;
			transform: none;
			flex-shrink: 0;
			width: 60px;
			height: 100dvh;
			max-height: none;
			border-radius: 0;
			border-width: 0 1px 0 0;
			border-color: var(--ess-border);
			box-shadow: none;
			background: var(--ess-surface);
			backdrop-filter: none;
		}
		.nav-list {
			overflow-y: auto;
			scrollbar-width: none;
		}
		.nav-item::after {
			display: none;
		}
	}
</style>
