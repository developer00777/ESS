<script lang="ts">
	import { page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';
	import { chat } from '$lib/chat/client.svelte';

	let { data, children } = $props();

	// page.data, not data: under /admin the admin layout returns a fresher
	// count under the same key, and child layout data wins in the merge.
	const adminIssueCount = $derived((page.data.adminIssueCount as number | undefined) ?? data.adminIssueCount);

	// One live Champ Chat connection per tab, for every page.
	let started = $state(false);
	$effect(() => {
		chat.start(data.chatBadge.count);
		started = true;
	});
	const chatBadge = $derived({
		count: started ? chat.badge : data.chatBadge.count,
		urgent: started ? chat.channels.some((c) => c.kind === 'announcements' && c.mentions > 0) : data.chatBadge.urgent
	});
</script>

<div class="ess-shell">
	<SidebarNav
		activePath={page.url.pathname}
		role={data.user.role}
		fullName={data.user.fullName}
		userId={data.user.id}
		hasPicture={data.hasProfilePicture}
		pictureVersion={data.profilePictureVersion}
		{adminIssueCount}
		{chatBadge}
	/>
	<main class="ess-main">
		{@render children()}
	</main>
</div>

