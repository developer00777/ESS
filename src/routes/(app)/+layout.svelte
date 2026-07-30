<script lang="ts">
	import { page } from '$app/state';
	import SidebarNav from '$lib/components/SidebarNav.svelte';

	let { data, children } = $props();
</script>

<div class="app-shell">
	<SidebarNav activePath={page.url.pathname} role={data.user.role} fullName={data.user.fullName} />
	<main class="main">
		{@render children()}
	</main>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
	}

	.main {
		flex: 1;
		min-width: 0;
		padding: 2rem 2.5rem;
	}
</style>
