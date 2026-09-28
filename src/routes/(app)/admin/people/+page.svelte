<script lang="ts">
	import TeamPage from '../../team/+page.svelte';
	// The Team route's own types: this route runs that exact load and those
	// actions (see +page.server.ts), but SvelteKit cannot infer PageData
	// through an imported load, so it is stated here instead.
	import type { ActionData, PageData } from '../../team/$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<TeamPage {data} {form} embedded />
