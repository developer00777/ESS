<script lang="ts">
	/**
	 * The one hover readout the analytics charts share, laid out like
	 * shadcn/ui's ChartTooltipContent: the label on top, then a row per
	 * series, a small rounded square of its colour and its name on the left,
	 * the value on the right in tabular figures. Positioned by the chart
	 * inside its own box, kept within it.
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
			<span>{r.name}</span>
			<b>{r.value}</b>
		</p>
	{/each}
</div>

<style>
	.tip {
		position: absolute;
		z-index: 5;
		display: grid;
		gap: 6px;
		min-width: 128px;
		padding: 6px 10px;
		border: 1px solid color-mix(in srgb, var(--ess-border) 50%, transparent);
		border-radius: 8px;
		background: var(--ess-modal-bg, var(--ess-surface));
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 8px 10px -6px rgba(0, 0, 0, 0.1);
		pointer-events: none;
		transform: translateY(-50%);
		font-size: 12px;
		line-height: 1.35;
	}
	.tip-title {
		margin: 0;
		font-weight: 500;
		color: var(--ess-text);
	}
	.tip-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		white-space: nowrap;
	}
	.tip-row i {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.tip-row span {
		flex: 1;
		color: var(--ess-text-muted);
	}
	.tip-row b {
		margin-left: 12px;
		font-weight: 500;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	/* Mono (shadcn "bar chart – pattern"): the label sits over a hairline,
	   values are semibold */
	:global(:root[data-ess-skin='mono']) .tip {
		gap: 8px;
		min-width: 160px;
	}
	:global(:root[data-ess-skin='mono']) .tip-title {
		padding-bottom: 7px;
		border-bottom: 1px solid color-mix(in srgb, var(--ess-border) 60%, transparent);
	}
	:global(:root[data-ess-skin='mono']) .tip-row b {
		font-weight: 600;
	}
</style>
