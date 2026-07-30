<script lang="ts">
	import { page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';

	let { data, children } = $props();
</script>

<div class="ess-shell">
	<SidebarNav activePath={page.url.pathname} role={data.user.role} fullName={data.user.fullName} />
	<main class="ess-main">
		{@render children()}
	</main>
</div>
