<script lang="ts">
	/**
	 * Parts of one whole as a ring, the total in the middle and a legend
	 * beside it carrying each part's count and share — so the ring is a
	 * picture of the proportions and the legend the reading of them.
	 * Segments are separated by a 2px gap in the surface colour.
	 */
	let { items, size = 120, centre }: { items: { name: string; count: number; color: string }[]; size?: number; centre: string } = $props();

	const total = $derived(items.reduce((s, i) => s + i.count, 0));
	const r = $derived(size / 2 - 9);
	const C = $derived(2 * Math.PI * r);
	const arcs = $derived.by(() => {
		let offset = 0;
		return items
			.filter((i) => i.count > 0)
			.map((i) => {
				const len = total ? (i.count / total) * C : 0;
				const arc = { ...i, len, offset };
				offset += len;
				return arc;
			});
	});
	const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
	let hover = $state<string | null>(null);
</script>

<div class="donut">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="{items.map((i) => `${i.name} ${i.count} (${share(i.count)}%)`).join(', ')}">
		<!-- Rotated so the first segment starts at twelve o'clock. -->
		<g transform="rotate(-90 {size / 2} {size / 2})">
		<circle class="track" cx={size / 2} cy={size / 2} {r} />
		{#each arcs as a (a.name)}
			<circle
				class="arc"
				class:dim={hover !== null && hover !== a.name}
				cx={size / 2}
				cy={size / 2}
				{r}
				style="stroke: {a.color}; stroke-dasharray: {a.len} {C - a.len}; stroke-dashoffset: {-a.offset}"
			/>
			<!-- 2px surface gap at the start of each segment. -->
			{#if arcs.length > 1}
				<circle class="gap" cx={size / 2} cy={size / 2} {r} style="stroke-dasharray: 2 {C - 2}; stroke-dashoffset: {-a.offset + 1}" />
			{/if}
		{/each}
		</g>
		<text class="big" x={size / 2} y={size / 2 - 2} text-anchor="middle" dominant-baseline="middle">{total}</text>
		<text class="small" x={size / 2} y={size / 2 + 14} text-anchor="middle">{centre}</text>
	</svg>
	<ul class="keys">
		{#each items as i (i.name)}
			<li onpointerenter={() => (hover = i.name)} onpointerleave={() => (hover = null)}>
				<i style="background: {i.color}"></i>
				<span class="n">{i.name}</span>
				<b>{share(i.count)}%</b>
				<span class="c">{i.count}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	svg {
		flex-shrink: 0;
	}
	circle {
		fill: none;
		stroke-width: 16;
	}
	.track {
		stroke: var(--ess-sunken);
	}
	.arc {
		transition: opacity var(--ess-t-fast);
	}
	.arc.dim {
		opacity: 0.35;
	}
	.gap {
		stroke: var(--ess-surface);
	}
	.big {
		fill: var(--ess-text);
		font-size: 22px;
		font-weight: 700;
	}
	.small {
		fill: var(--ess-text-muted);
		font-size: 10px;
	}
	.keys {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
		flex: 1;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 12px;
	}
	.keys li {
		display: grid;
		grid-template-columns: 9px 1fr auto 26px;
		align-items: center;
		gap: 7px;
		cursor: default;
	}
	.keys i {
		width: 9px;
		height: 9px;
		border-radius: 3px;
	}
	.n {
		min-width: 0;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.keys b {
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.c {
		text-align: right;
		font-size: 11px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
