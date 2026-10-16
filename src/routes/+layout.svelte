<script lang="ts">
	import { ClerkProvider } from 'svelte-clerk';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.clerk}
	<!-- data.clerk = publishableKey + Clerk's initialState (src/routes/+layout.server.ts) -->
	<ClerkProvider
		{...data.clerk}
		signInUrl="/login"
		signInFallbackRedirectUrl="/dashboard"
		afterSignOutUrl="/login"
	>
		{@render children()}
	</ClerkProvider>
{:else}
	{@render children()}
{/if}
