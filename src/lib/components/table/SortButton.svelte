<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import type { TableView } from '$lib/ui/table-view.svelte';

	/**
	 * A sortable column header's content: the label and an arrow that says
	 * the order (up-down: default, up: ascending, down: descending). Goes
	 * inside a <th aria-sort={view.ariaSort(key)}>; clicking cycles it.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { view, key, children }: { view: TableView<any>; key: string; children: Snippet } = $props();

	const dir = $derived(view.dirOf(key));
	const next = $derived(dir === null ? 'ascending' : dir === 'asc' ? 'descending' : 'the original order');
</script>

<button type="button" class="ess-sort" data-dir={dir ?? 'none'} onclick={() => view.sort(key)} title="Sort {next}">
	{@render children()}
	<span class="ess-sort__icon" aria-hidden="true">
		{#if dir === 'asc'}<ArrowUp size={13} strokeWidth={2.25} />{:else if dir === 'desc'}<ArrowDown size={13} strokeWidth={2.25} />{:else}<ChevronsUpDown size={13} strokeWidth={2} />{/if}
	</span>
</button>
