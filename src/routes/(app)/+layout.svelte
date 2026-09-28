<script lang="ts">
	import { page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';

	let { data, children } = $props();

	// page.data, not data: under /admin the admin layout returns a fresher
	// count under the same key, and child layout data wins in the merge.
	const adminIssueCount = $derived((page.data.adminIssueCount as number | undefined) ?? data.adminIssueCount);
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
		announcementBadge={data.announcementBadge}
	/>
	<main class="ess-main">
		{@render children()}
	</main>
</div>
