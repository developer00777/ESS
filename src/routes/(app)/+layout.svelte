<script lang="ts">
	import { navigating, page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import MagnifyDock from '$lib/components/MagnifyDock.svelte';
	import ApprovalPopup from '$lib/components/hub/ApprovalPopup.svelte';
	import ShiftReminder from '$lib/components/ShiftReminder.svelte';
	import { chat } from '$lib/chat/client.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import { cardSpotlight } from '$lib/ui/spotlight';
	import { goto } from '$app/navigation';
	import CommandPalette from '$lib/components/hub/CommandPalette.svelte';
	import TunnelLoader from '$lib/components/TunnelLoader.svelte';

	let { data, children } = $props();

	/* Search (the top bar's button, or Ctrl K) opens right over the page
	   you're on. Champ Hub mounts its own copy, so this one is for every
	   other page. Its two Hub-only results (start a task, open a task) need
	   Hub's dialog and sheet, so those carry on into Hub. Admin Controls keeps
	   Ctrl K for its own Jump to. */
	const inHub = $derived(page.url.pathname.startsWith('/hub'));
	$effect(() => {
		if (inHub) return;
		if (hub.newTaskOpen) void goto('/hub');
		else if (hub.openTaskId) void goto(`/hub/tasks?task=${encodeURIComponent(hub.openTaskId)}`);
	});
	function searchKey(e: KeyboardEvent) {
		if (inHub || page.url.pathname.startsWith('/admin')) return;
		if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			hub.paletteOpen = !hub.paletteOpen;
		}
	}

	// page.data, not data: under /admin the admin layout returns a fresher
	// count under the same key, and child layout data wins in the merge.
	const adminIssueCount = $derived((page.data.adminIssueCount as number | undefined) ?? data.adminIssueCount);

	// One live Champ Chat connection per tab, for every page.
	let started = $state(false);
	$effect(() => {
		chat.start(data.chatBadge.count);
		// Champ Hub's counts (requests, minutes, due work) ride the same stream.
		hub.start();
		started = true;
	});
	/* The first app page of a browser session (straight after logging in,
	   or opening the portal in a new tab) opens with the corridor intro. It
	   is in the server's HTML, so it plays from the first paint; app.html
	   marks <html> once it has played this session, and CSS hides it from
	   then on, so a refresh never waits for it. */
	const firstName = $derived(data.user.fullName.split(' ')[0]);
	let appIntro = $state(true);
	$effect(() => {
		if (document.documentElement.hasAttribute('data-ess-intro-seen')) {
			appIntro = false;
			return;
		}
		try {
			sessionStorage.setItem('essIntroSeen', '1');
		} catch {
			/* private mode: it plays again on the next load */
		}
		const timer = setTimeout(() => (appIntro = false), 1800);
		return () => clearTimeout(timer);
	});

	/* A page that is slow to load shows the corridor loader over the
	   workspace. Only when moving to another page (not a filter or tab that
	   changes the query string) and only after 400ms, so quick moves never
	   flash it. */
	const SECTIONS: Record<string, string> = {
		dashboard: 'Home',
		leave: 'Leave',
		attendance: 'Attendance',
		payroll: 'Payroll',
		chat: 'Champ Chat',
		hub: 'Champ Hub',
		team: 'Team',
		admin: 'Admin Controls',
		profile: 'Profile',
		announcements: 'Announcements',
		policies: 'Policies',
		'hr-contacts': 'HR contacts'
	};
	let slowNav = $state<string | null>(null);
	$effect(() => {
		const to = navigating.to;
		if (!to || navigating.willUnload || to.url.pathname === navigating.from?.url.pathname) {
			slowNav = null;
			return;
		}
		const section = SECTIONS[to.url.pathname.split('/')[1] || 'dashboard'];
		const timer = setTimeout(() => (slowNav = section ? `Opening ${section}…` : 'Loading…'), 400);
		return () => clearTimeout(timer);
	});

	// Cards glow under the mouse pointer (visual only).
	$effect(() => cardSpotlight());

	const chatBadge = $derived({
		count: (started ? chat.badge : data.chatBadge.count) + hub.counts.work,
		urgent: (started ? chat.channels.some((c) => c.kind === 'announcements' && c.mentions > 0) : data.chatBadge.urgent) || hub.counts.urgent
	});

	// What the person is here as. A base role is an access setting, not a job
	// title, so it is phrased as the kind of access rather than a rank.
	/* Breadcrumb, only where a page has no other way back up: a trail that
	   repeats the sidebar ("Home"), a section's own menu (Admin Controls,
	   Champ Hub) or the page's own back link just adds noise. Shown by themes
	   that use it (Mono); hidden elsewhere. */
	const TRAILS: Record<string, { label: string; href?: string }[]> = {
		'/leave/apply': [{ label: 'Leave', href: '/leave' }, { label: 'Apply for leave' }]
	};
	const crumbs = $derived(TRAILS[page.url.pathname.replace(/\/$/, '')] ?? []);

	const roleLabel = $derived(
		data.user.role === 'super_admin' ? 'Administrator' : data.user.role === 'admin' ? 'HR admin' : data.user.role === 'team_lead' ? 'Team lead' : 'Employee'
	);
</script>

<svelte:window onkeydown={searchKey} />

{#if appIntro}
	<div class="app-intro">
		<TunnelLoader variant="intro" message={firstName ? `Welcome back, ${firstName}` : 'Preparing your workspace…'} />
	</div>
{/if}

{#if hub.paletteOpen && !inHub}
	<CommandPalette meId={data.user.id} isLead={data.canTeam} onclose={() => (hub.paletteOpen = false)} />
{/if}

<div class="ess-shell">
	<SidebarNav
		activePath={page.url.pathname}
		role={data.user.role}
		fullName={data.user.fullName}
		userId={data.user.id}
		hasPicture={data.hasProfilePicture}
		pictureVersion={data.profilePictureVersion}
		canAdmin={data.canAdmin}
		canPayroll={data.canPayroll}
		canTeam={data.canTeam}
		{adminIssueCount}
		{chatBadge}
		{roleLabel}
	/>
	<main class="ess-main">
		<TopBar
			fullName={data.user.fullName}
			userId={data.user.id}
			hasPicture={data.hasProfilePicture}
			pictureVersion={data.profilePictureVersion}
			{roleLabel}
			notifications={data.announcementBadge}
			activePath={page.url.pathname}
			role={data.user.role}
			canAdmin={data.canAdmin}
			canTeam={data.canTeam}
			teamPeek={data.teamPeek}
			addEmployeeHref={data.addEmployeeHref}
			canPayroll={data.canPayroll}
			{chatBadge}
			{adminIssueCount}
		/>
		<!-- data-section: the themes give every page but the dashboard their
		     own layout (ess-skin-layouts.css) and key off it. -->
		<div class="ess-content" tabindex="0" role="region" aria-label="Page content" data-section={page.url.pathname.split('/')[1] || 'dashboard'}>
			{#if crumbs.length}
				<nav class="ess-breadcrumb" aria-label="Breadcrumb">
					<ol>
						{#each crumbs as c (c.label)}
							<li>
								{#if c.href}<a href={c.href}>{c.label}</a>{:else}<span aria-current="page">{c.label}</span>{/if}
							</li>
						{/each}
					</ol>
				</nav>
			{/if}
			{@render children()}
		</div>
		{#if slowNav}<TunnelLoader message={slowNav} />{/if}
	</main>
</div>

<!-- Atur's main navigation on desktop and tablet (hidden in other themes). -->
<MagnifyDock
	activePath={page.url.pathname}
	role={data.user.role}
	canAdmin={data.canAdmin}
	canPayroll={data.canPayroll}
	canTeam={data.canTeam}
	{adminIssueCount}
	{chatBadge}
/>

<!-- Leads: tasks waiting for approval pop up on whatever page they are on. -->
<ApprovalPopup />
<!-- Checked in: punch-out reminder at 9h, missed-punch prompt at 9h 30m. -->
<ShiftReminder />

<style>
	/* the opening corridor covers the whole window, sidebar included */
	.app-intro {
		position: fixed;
		inset: 0;
		z-index: 200;
	}
	:global(html[data-ess-intro-seen]) .app-intro {
		display: none;
	}
</style>
