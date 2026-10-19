<script lang="ts">
	/**
	 * The one hover readout the analytics charts share: the value leads, the
	 * series name follows, each keyed by a short stroke of its colour.
	 * Positioned by the chart inside its own box, kept within it.
	 */
	export type TipRow = { name: string; value: string; color?: string };

	let { x, y, title, rows, box }: { x: number; y: number; title: string; rows: TipRow[]; box: number } = $props();

	let width = $state(0);
	// Prefer the right of the pointer; flip left near the edge.
	const left = $derived(x + 14 + width > box ? Math.max(0, x - 14 - width) : x + 14);
</script>

<div class="tip" role="status" bind:clientWidth={width} style="left: {left}px; top: {y}px">
	<p class="tip-title">{title}</p>
	{#each rows as r (r.name)}
		<p class="tip-row">
			{#if r.color}<i style="background: {r.color}"></i>{/if}
			<b>{r.value}</b>
			<span>{r.name}</span>
		</p>
	{/each}
</div>

<style>
	.tip {
		position: absolute;
		z-index: 5;
		min-width: 120px;
		padding: 8px 10px;
		border-radius: 10px;
		background: var(--ess-surface);
		box-shadow:
			0 0 0 1px var(--ess-border),
			0 8px 24px -8px rgba(20, 22, 40, 0.25);
		pointer-events: none;
		transform: translateY(-50%);
		font-size: 12px;
	}
	.tip-title {
		margin: 0 0 4px;
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	.tip-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0 0;
		white-space: nowrap;
	}
	.tip-row i {
		width: 10px;
		height: 2px;
		border-radius: 1px;
		flex-shrink: 0;
	}
	.tip-row b {
		font-weight: 650;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.tip-row span {
		color: var(--ess-text-secondary);
	}
</style>
