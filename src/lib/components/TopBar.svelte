<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import Settings from '@lucide/svelte/icons/settings';
	import Plus from '@lucide/svelte/icons/plus';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import ShieldUser from '@lucide/svelte/icons/shield-user';
	import Wallet from '@lucide/svelte/icons/wallet';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Avatar from './Avatar.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import type { Role } from '$lib/server/auth';

	/**
	 * The row along the top of the workspace: today's date on the left; the
	 * section links, a search pill (Champ Hub's command palette), the team's
	 * faces, Add employee for people who may create logins, settings,
	 * announcements and the person's round avatar on the right. The avatar
	 * opens profile, password, theme, text size, dock and sign-out.
	 */
	interface Props {
		fullName: string;
		userId: string;
		hasPicture?: boolean;
		pictureVersion?: number | null;
		/** What the person is here as ("Employee", "Administrator"), shown in their menu. */
		roleLabel: string;
		/** Unread announcements; the bell shows a dot when there are any. */
		notifications?: { count: number; urgent: boolean };
		activePath?: string;
		role?: Role;
		canAdmin?: boolean;
		/** Whether the Team page is open to them (src/lib/server/team-access.ts). */
		canTeam?: boolean;
		teamPeek?: { people: { id: string; fullName: string; hasPicture: boolean }[]; total: number } | null;
		/** Where Add employee goes, or null when this login cannot create logins. */
		addEmployeeHref?: string | null;
		/** For the main navigation in themes that carry it here (Amber): the
		    same sections, counts and gates as the sidebar. */
		canPayroll?: boolean;
		chatBadge?: { count: number; urgent: boolean };
		adminIssueCount?: number;
	}

	let {
		fullName,
		userId,
		hasPicture = false,
		pictureVersion,
		roleLabel,
		notifications = { count: 0, urgent: false },
		activePath = '',
		role = 'employee',
		canAdmin = false,
		canTeam,
		teamPeek = null,
		addEmployeeHref = null,
		canPayroll = false,
		chatBadge = { count: 0, urgent: false },
		adminIssueCount = 0
	}: Props = $props();

	/* The main navigation as a row of pills (themes that move it out of the
	   sidebar: Amber). Mirrors SidebarNav's items one for one. */
	const mainNav = $derived([
		{ href: '/dashboard', label: 'Today', icon: CalendarDays, soon: false },
		{ href: '/hub', label: 'Champ Hub', icon: LayoutGrid, soon: false },
		{ href: '/leave', label: 'Leave', icon: Calendar, soon: false },
		{ href: '/attendance', label: 'Attendance', icon: Clock, soon: false },
		{ href: '/policies', label: 'Policies', icon: FileText, soon: false },
		...((canTeam ?? role !== 'employee') ? [{ href: '/team', label: 'Team', icon: Users, soon: false }] : []),
		...(canAdmin ? [{ href: '/admin', label: 'Admin Controls', icon: ShieldUser, soon: false }] : []),
		{ href: '/payroll', label: 'Payroll', icon: Wallet, soon: !canPayroll },
		{ href: '/hr-contacts', label: 'Help & support', icon: CircleHelp, soon: false }
	]);

	// The same sections as the rail, as text links.
	const links = $derived([
		{ href: '/dashboard', label: 'Overview' },
		{ href: '/hub', label: 'Champ Hub' },
		{ href: '/leave', label: 'Leave' },
		{ href: '/attendance', label: 'Attendance' },
		{ href: '/policies', label: 'Policies' },
		...((canTeam ?? role !== 'employee') ? [{ href: '/team', label: 'Team' }] : []),
		...(canAdmin ? [{ href: '/admin', label: 'Admin' }] : [])
	]);
	const isActive = (href: string) =>
		href === '/dashboard' ? activePath === '/dashboard' || activePath === '/' : activePath === href || activePath.startsWith(href + '/');

	const teamMore = $derived(teamPeek ? teamPeek.total - teamPeek.people.length : 0);

	// The date is the viewer's own, filled in after hydration.
	let today = $state('');
	$effect(() => {
		today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	});

	/* Atur shows each menu item's name in its own bubble on hover, so the
	   browser's tooltip would repeat it; other themes keep the tooltip.
	   Follows theme switches live. */
	let skin = $state('');
	$effect(() => {
		const root = document.documentElement;
		const read = () => (skin = root.getAttribute('data-ess-skin') ?? '');
		read();
		const mo = new MutationObserver(read);
		mo.observe(root, { attributes: true, attributeFilter: ['data-ess-skin'] });
		return () => mo.disconnect();
	});

	let menuOpen = $state(false);

	/* On desktop the cluster floats over the top-right of the page and
	   each page's header row leaves room for it: publish its width. */
	let cluster = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!cluster) return;
		const el = cluster;
		const root = document.documentElement;
		// Its height too, so a header row can match it and centre on one line.
		const ro = new ResizeObserver(() => {
			root.style.setProperty('--topbar-w', `${el.offsetWidth}px`);
			root.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	function openSearch() {
		// The search palette opens over whatever page this is (the app layout
		// mounts it outside Champ Hub; the Hub layout inside it).
		hub.paletteOpen = true;
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && !(e.target as HTMLElement).closest('.me')) menuOpen = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="topbar">
	<!-- Brand and main navigation pills: shown only by themes that carry the
	     navigation in the top bar (Amber); hidden everywhere else. -->
	<a href="/dashboard" class="tb-brand" aria-label="Champ HR, Today">
		<span class="tb-mark" aria-hidden="true">
			<svg viewBox="0 0 40 40" width="22" height="22">
				<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
			</svg>
		</span>
		<span class="tb-name">Champ HR</span>
		<!-- the brand's second line (Atur only; hidden elsewhere) -->
		<small class="tb-sub">Self-Service</small>
	</a>
	<nav class="pillnav" aria-label="Main">
		{#each mainNav as item (item.href)}
			<a
				href={item.href}
				class="pn-item"
				class:soon={item.soon}
				aria-current={isActive(item.href) ? 'page' : undefined}
				title={item.soon ? `${item.label} — coming soon` : skin === 'atur' ? undefined : item.label}
			>
				<item.icon size={16} strokeWidth={2} />
				<span class="pn-label">{item.label}</span>
				{#if item.href === '/admin' && adminIssueCount > 0}
					<span class="pn-count warn" aria-label="{adminIssueCount} need{adminIssueCount === 1 ? 's' : ''} attention">{adminIssueCount}</span>
				{:else if item.href === '/hub' && chatBadge.count > 0}
					<span class="pn-count" class:urgent={chatBadge.urgent} aria-label="{chatBadge.count} unread">{chatBadge.count > 99 ? '99+' : chatBadge.count}</span>
				{/if}
			</a>
		{/each}
	</nav>
	<span class="today">{today || ' '}</span>

	<nav class="links" aria-label="Sections">
		{#each links as l (l.href)}
			<a href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>{l.label}</a>
		{/each}
	</nav>

	<div class="right" bind:this={cluster}>
		<button type="button" class="search" onclick={openSearch} aria-label="Search or ask Champ" title="Search (Ctrl K)">
			<Search size={15} strokeWidth={2} />
			<span class="search-label">Search here</span>
		</button>

		{#if teamPeek && teamPeek.people.length > 0}
			<a class="team" href="/team" aria-label="Your team, {teamPeek.total} {teamPeek.total === 1 ? 'person' : 'people'}">
				{#each teamPeek.people as p (p.id)}
					<span class="face" title={p.fullName}><Avatar userId={p.id} fullName={p.fullName} hasPicture={p.hasPicture} size="sm" /></span>
				{/each}
				{#if teamMore > 0}<span class="more" aria-hidden="true">+{teamMore > 99 ? 99 : teamMore}</span>{/if}
			</a>
		{/if}

		{#if addEmployeeHref}
			<a class="add" href={addEmployeeHref} aria-label="Add employee">
				<Plus size={15} strokeWidth={2.4} />
				<span class="add-label">Add employee</span>
			</a>
		{/if}

		<a href="/profile" class="round settings" aria-label="Profile and settings" title="Profile and settings">
			<Settings size={17} strokeWidth={1.75} />
		</a>
		<a
			href="/chat?c=announcements"
			class="round bell"
			aria-label={notifications.count ? `${notifications.count} unread announcement${notifications.count === 1 ? '' : 's'}` : 'Announcements'}
			title="Announcements"
		>
			<Bell size={17} strokeWidth={1.75} />
			{#if notifications.count > 0}<span class="dot" class:urgent={notifications.urgent}></span>{/if}
		</a>

		<div class="me">
			<button type="button" class="me-btn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Your account" onclick={() => (menuOpen = !menuOpen)}>
				<Avatar {userId} {fullName} {hasPicture} size="md" version={pictureVersion ?? undefined} />
			</button>
			{#if menuOpen}
				<AccountMenu {fullName} {roleLabel} onclose={() => (menuOpen = false)} />
			{/if}
		</div>
	</div>
</div>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 18px;
		min-height: 68px;
		padding: 14px var(--ess-page-pad-x) 6px;
	}

	.today {
		font-size: 12px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	/* Only themes that move the main navigation here show these (Amber,
	   styled in ess-skin-amber.css). */
	.tb-brand,
	.pillnav,
	.tb-sub {
		display: none;
	}

	/* ---------- section links: quiet text, the current one in ink ---------- */
	.links {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: auto;
		min-width: 0;
	}
	.links a {
		position: relative;
		padding: 6px 10px;
		border-radius: 999px;
		color: var(--ess-text-muted);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		transition: color var(--ess-t-fast);
	}
	.links a:hover {
		color: var(--ess-text);
	}
	.links a[aria-current='page'] {
		color: var(--ess-text);
		font-weight: 600;
	}
	.links a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -1px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--ess-primary);
	}

	.right {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 190px;
		height: 38px;
		padding: 0 16px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: #e6e6ea;
		background: color-mix(in srgb, var(--ess-text) 7%, var(--ess-canvas));
		color: var(--ess-text-muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		transition:
			background var(--ess-t-fast),
			border-color var(--ess-t-fast);
	}
	.search:hover {
		background: var(--ess-surface);
		border-color: var(--ess-border);
	}

	/* ---------- team faces + add ---------- */
	.team {
		display: flex;
		align-items: center;
	}
	.face {
		display: grid;
		border-radius: 50%;
		box-shadow: 0 0 0 2px var(--ess-canvas);
	}
	.face + .face,
	.more {
		margin-left: -8px;
	}
	.more {
		display: grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--ess-surface);
		box-shadow: 0 0 0 2px var(--ess-canvas);
		color: var(--ess-text-secondary);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.add {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		padding: 0 16px 0 13px;
		border-radius: 12px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		box-shadow: var(--ess-primary-shadow);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		transition: background var(--ess-t-fast);
	}
	.add:hover {
		background: var(--ess-primary-hover);
		color: var(--ess-text-on-primary);
	}

	/* ---------- round buttons ---------- */
	.round {
		position: relative;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-subtle);
		color: var(--ess-text-secondary);
		box-shadow: 0 1px 2px rgba(20, 22, 40, 0.04);
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast);
	}
	.round:hover {
		color: var(--ess-text);
		background: var(--ess-surface-hover);
	}
	.dot {
		position: absolute;
		top: 8px;
		right: 9px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ess-primary);
		box-shadow: 0 0 0 2px var(--ess-surface);
	}
	.dot.urgent {
		background: var(--ess-danger);
	}

	.me {
		position: relative;
	}
	.me-btn {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		cursor: pointer;
		box-shadow: 0 0 0 2px var(--ess-surface), 0 4px 10px -4px rgba(20, 22, 40, 0.3);
	}


	/* Narrower laptops: the rail carries the sections. */
	/* Short laptop screens (e.g. 1280×720 at 150% scaling): a slimmer bar. */
	/* Desktop: the date and section links give way (the sidebar has the
	   sections) and the cluster floats at the top right, beside the page's
	   own header row. */
	@media (min-width: 1101px) {
		@container ess-fill (min-width: 1075px) {
			.topbar {
				position: absolute;
				top: var(--bar-top, 14px);
				right: var(--ess-page-pad-x);
				z-index: 25;
				min-height: 0;
				padding: 0;
			}
		}
		/* Not floating (the page scrolls with large text, or the workspace
		   is too narrow with a fixed dock): its own row. */
		@container ess-main (max-width: 1074px) {
			.right {
				margin-left: auto;
			}
		}
		:global([data-ess-flow]) .right {
			margin-left: auto;
		}
		.today,
		.links {
			display: none;
		}
		.right {
			gap: 8px;
		}
	}
	@media (min-width: 1101px) {
		@container ess-main (max-width: 1474px) {
			.search {
				width: 38px;
				padding: 0;
				justify-content: center;
				background: var(--ess-surface);
				border-color: var(--ess-border-subtle);
				color: var(--ess-text-secondary);
			}
			.search-label {
				display: none;
			}
		}
	}
	@media (min-width: 721px) and (max-width: 1100px) and (max-height: 760px) {
		.topbar {
			min-height: 50px;
			padding: 8px var(--ess-page-pad-x) 2px;
		}
	}
	@media (min-width: 721px) and (max-height: 760px) {
		.search,
		.add {
			height: 32px;
		}
		.round {
			width: 32px;
			height: 32px;
		}
	}

	@media (max-width: 1300px) {
		.links {
			display: none;
		}
		.right {
			margin-left: auto;
		}
	}
	@container ess-main (max-width: 1274px) {
		.add-label {
			display: none;
		}
		.add {
			width: 38px;
			padding: 0;
			justify-content: center;
		}
	}

	@media (max-width: 960px) {
		.team,
		.settings,
		.today {
			display: none;
		}
	}

	@media (max-width: 720px) {
		.topbar {
			min-height: 56px;
			padding: 10px 14px 0;
		}
		.search {
			width: 38px;
			padding: 0;
			justify-content: center;
		}
		.search-label {
			display: none;
		}
	}
</style>
