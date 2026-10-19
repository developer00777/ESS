<script lang="ts">
	/**
	 * A card for one analytics question: title, the one-line definition of
	 * what is plotted, the chart, and a Chart/Table switch so every value is
	 * readable without hovering or telling colours apart.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		sub: string;
		note?: string;
		wide?: boolean;
		/** Controls that belong to this chart only, e.g. a group-by switch. */
		tools?: Snippet;
		legend?: Snippet;
		chart: Snippet;
		table: Snippet;
		/** An extra class for the page's own layout rules. */
		cls?: string;
	}

	let { title, sub, note, wide = false, tools, legend, chart, table, cls = '' }: Props = $props();
	let asTable = $state(false);
	const id = $props.id();
</script>

<section class="ess-card card {cls}" class:wide aria-labelledby={id}>
	<header class="head">
		<div class="titles">
			<h2 {id}>{title}</h2>
			<p>{sub}</p>
		</div>
		<div class="actions">
			{@render tools?.()}
			<div class="seg" role="group" aria-label="View">
				<button type="button" aria-pressed={!asTable} onclick={() => (asTable = false)}>Chart</button>
				<button type="button" aria-pressed={asTable} onclick={() => (asTable = true)}>Table</button>
			</div>
		</div>
	</header>
	{#if asTable}
		<div class="table-wrap">{@render table()}</div>
	{:else}
		{@render legend?.()}
		{@render chart()}
	{/if}
	{#if note}<p class="note">{note}</p>{/if}
</section>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 12px 14px;
	}
	.wide {
		grid-column: 1 / -1;
	}
	/* Title on the left, controls on the right — the controls never drop to
	   a line of their own; a long subtitle wraps instead. */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.titles {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 13.5px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.titles p {
		margin: 1px 0 0;
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	/* Phones: not enough width for both side by side. */
	@media (max-width: 720px) {
		.head {
			flex-wrap: wrap;
		}
		.titles {
			flex-basis: 100%;
		}
	}
	.seg {
		display: flex;
		padding: 2px;
		border-radius: 999px;
		background: var(--ess-sunken);
	}
	.seg button {
		height: 22px;
		padding: 0 9px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ess-text-muted);
		font: inherit;
		font-size: 11.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.seg button[aria-pressed='true'] {
		background: var(--ess-surface);
		color: var(--ess-text);
		box-shadow: 0 1px 2px rgba(20, 22, 40, 0.08);
	}
	.table-wrap {
		max-height: 190px;
		overflow: auto;
	}
	.table-wrap :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	.table-wrap :global(th),
	.table-wrap :global(td) {
		padding: 4px 8px;
		border-bottom: 1px solid var(--ess-border-subtle);
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.table-wrap :global(th:first-child),
	.table-wrap :global(td:first-child) {
		text-align: left;
	}
	.table-wrap :global(th) {
		font-weight: 600;
		color: var(--ess-text-muted);
		font-size: 11.5px;
	}
	.note {
		margin: auto 0 0;
		font-size: 10.5px;
		color: var(--ess-text-muted);
		line-height: 1.4;
	}
</style>
