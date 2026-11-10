<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { TableView } from '$lib/ui/table-view.svelte';

	/**
	 * A table's foot: which rows show ("13–24 of 40") and the pages. Only
	 * there when the rows run past one page. `noun` names what the rows are
	 * ("people", "records").
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { view, noun = 'rows' }: { view: TableView<any>; noun?: string } = $props();

	/** Page numbers to show: the first, the last, and the two around the current one. */
	const pageList = $derived.by(() => {
		const n = view.pages;
		const c = view.current;
		const keep = new Set([1, n, c - 1, c, c + 1].filter((p) => p >= 1 && p <= n));
		const out: (number | '…')[] = [];
		let last = 0;
		for (const p of [...keep].sort((a, b) => a - b)) {
			if (p - last > 1) out.push('…');
			out.push(p);
			last = p;
		}
		return out;
	});
</script>

{#if view.total > view.pageSize}
	<div class="ess-table-foot ess-pager">
		<span class="ess-pager__count">{view.from}–{view.to} of {view.total} {noun}</span>
		<nav class="ess-pager__pages" aria-label="Pages">
			<button type="button" class="ess-pager__btn" onclick={() => view.go(view.current - 1)} disabled={view.current === 1} aria-label="Previous page">
				<ChevronLeft size={15} />
			</button>
			{#each pageList as p, i (i)}
				{#if p === '…'}
					<span class="ess-pager__gap" aria-hidden="true">…</span>
				{:else}
					<button
						type="button"
						class="ess-pager__btn"
						aria-current={p === view.current ? 'page' : undefined}
						aria-label="Page {p}"
						onclick={() => view.go(p)}>{p}</button
					>
				{/if}
			{/each}
			<button type="button" class="ess-pager__btn" onclick={() => view.go(view.current + 1)} disabled={view.current === view.pages} aria-label="Next page">
				<ChevronRight size={15} />
			</button>
		</nav>
	</div>
{/if}
