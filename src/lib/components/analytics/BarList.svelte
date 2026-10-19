<script lang="ts">
	/**
	 * Ranked horizontal bars, one series: name on the left, the value at the
	 * bar's tip. Every value is labelled, so there is no tooltip to find.
	 */
	let { items, color, unit = '' }: { items: { name: string; count: number }[]; color: string; unit?: string } = $props();
	const max = $derived(Math.max(1, ...items.map((i) => i.count)));
	const total = $derived(items.reduce((s, i) => s + i.count, 0));
</script>

<ul class="bars">
	{#each items as item (item.name)}
		<li title="{item.name}: {item.count}{unit} ({total ? Math.round((item.count / total) * 100) : 0}%)">
			<span class="name">{item.name}</span>
			<span class="track">
				<span class="fill" style="width: {(item.count / max) * 100}%; background: {color}"></span>
				<b>{item.count}{unit}</b>
			</span>
		</li>
	{:else}
		<li class="empty">No one to count yet.</li>
	{/each}
</ul>

<style>
	/* Fills its card; rows spread out rather than leaving a gap below. */
	.bars {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		justify-content: space-evenly;
		gap: 3px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* Rows grow with the card, bars thicken with them (within limits). */
	li {
		display: grid;
		flex: 1 1 auto;
		max-height: 36px;
		grid-template-columns: minmax(90px, 34%) 1fr;
		align-items: center;
		gap: 10px;
		font-size: 12px;
	}
	.name {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--ess-text-secondary);
	}
	.track {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		height: 100%;
		min-height: 16px;
	}
	.fill {
		min-width: 2px;
		height: 55%;
		min-height: 11px;
		max-height: 18px;
		border-radius: 0 4px 4px 0;
		transition: width var(--ess-t-slow);
	}
	b {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ess-text);
	}
	li:hover .fill {
		filter: brightness(1.08);
	}
	.empty {
		display: block;
		color: var(--ess-text-muted);
	}
</style>
