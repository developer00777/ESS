<script lang="ts">
	/**
	 * A small trend line with no axes, ending in a dot on the latest value.
	 * Decorative support for a number shown beside it — the values live in
	 * the card's table view.
	 */
	let { values, color, height = 36 }: { values: (number | null)[]; color: string; height?: number } = $props();

	let width = $state(0);
	const known = $derived(values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null));
	const lo = $derived(Math.min(...known.map((k) => k[1])));
	const hi = $derived(Math.max(...known.map((k) => k[1])));
	const x = (i: number) => 4 + ((width - 8) * i) / Math.max(1, values.length - 1);
	const y = (v: number) => 4 + (height - 8) * (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo));
	const d = $derived(known.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''));
	const last = $derived(known.at(-1));
</script>

<div class="spark" bind:clientWidth={width} style="height: {height}px" aria-hidden="true">
	{#if width && known.length > 1}
		<svg {width} {height}>
			<path d="{d}L{x(last![0]).toFixed(1)},{height}L{x(known[0][0]).toFixed(1)},{height}Z" style="fill: {color}" class="wash" />
			<path {d} style="stroke: {color}" class="line" />
			<circle cx={x(last![0])} cy={y(last![1])} r="3.5" style="fill: {color}" />
		</svg>
	{/if}
</div>

<style>
	.spark {
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.wash {
		opacity: 0.1;
	}
	circle {
		stroke: var(--ess-surface);
		stroke-width: 2;
	}
</style>
