<script lang="ts">
	import { page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import ApprovalPopup from '$lib/components/hub/ApprovalPopup.svelte';
	import { chat } from '$lib/chat/client.svelte';
	import { hub } from '$lib/hub/client.svelte';

	let { data, children } = $props();

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
	const chatBadge = $derived({
		count: (started ? chat.badge : data.chatBadge.count) + hub.counts.work,
		urgent: (started ? chat.channels.some((c) => c.kind === 'announcements' && c.mentions > 0) : data.chatBadge.urgent) || hub.counts.urgent
	});

	// What the person is here as. A base role is an access setting, not a job
	// title, so it is phrased as the kind of access rather than a rank.
	const roleLabel = $derived(
		data.user.role === 'super_admin' ? 'Administrator' : data.user.role === 'admin' ? 'HR admin' : data.user.role === 'team_lead' ? 'Team lead' : 'Employee'
	);
</script>

<div class="ess-shell">
	<SidebarNav
		activePath={page.url.pathname}
		role={data.user.role}
		fullName={data.user.fullName}
		userId={data.user.id}
		hasPicture={data.hasProfilePicture}
		pictureVersion={data.profilePictureVersion}
		canAdmin={data.canAdmin}
		{adminIssueCount}
		{chatBadge}
	/>
	<main class="ess-main">
		<TopBar
			fullName={data.user.fullName}
			userId={data.user.id}
			hasPicture={data.hasProfilePicture}
			pictureVersion={data.profilePictureVersion}
			{roleLabel}
			notifications={data.announcementBadge}
		/>
		<div class="ess-content" tabindex="0" role="region" aria-label="Page content">
			{@render children()}
		</div>
	</main>
</div>

<!-- Leads: tasks waiting for approval pop up on whatever page they are on. -->
<ApprovalPopup />
