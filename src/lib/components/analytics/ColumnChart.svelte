<script lang="ts">
	/**
	 * Columns from one baseline: one series, or a few side by side in each
	 * slot (2px apart). Columns are at most 24px wide with a 4px rounded top,
	 * square at the baseline. Each slot is its own hover and focus target;
	 * with one series and few slots, values sit on the caps.
	 *
	 * `stacked` piles the series into one column per slot instead, segments
	 * 2px apart, the top one rounded, the slot's total on the cap.
	 */
	import ChartTooltip from './ChartTooltip.svelte';
	import { compact, labelStep, niceMax, ticks } from './scale';

	type Series = { name: string; color: string; values: number[] };

	interface Props {
		labels: string[];
		series: Series[];
		unit?: string;
		height?: number;
		label: string;
		stacked?: boolean;
	}

	let { labels, series, unit = '', height = 150, label, stacked = false }: Props = $props();

	let width = $state(0);
	// Grows to fill its card; `height` is the least it will be.
	let boxH = $state(0);
	const H = $derived(Math.max(height, boxH));
	const pad = { l: 30, r: 6, t: 14, b: 20 };
	const plotW = $derived(Math.max(0, width - pad.l - pad.r));
	const plotH = $derived(H - pad.t - pad.b);
	// Counts: a whole-number top, one tick per unit while that's five or fewer.
	const totals = $derived(labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0)));
	const top = $derived(Math.ceil(niceMax(Math.max(0, ...(stacked ? totals : series.flatMap((s) => s.values))))));
	const yTicks = $derived(top <= 5 ? ticks(top, top) : ticks(top));
	const slotW = $derived(labels.length ? plotW / labels.length : 0);
	const lanes = $derived(stacked ? 1 : series.length);
	const barW = $derived(Math.max(3, Math.min(24, (slotW * 0.7 - (lanes - 1) * 2) / lanes)));
	const groupW = $derived(barW * lanes + (lanes - 1) * 2);
	const y = (v: number) => pad.t + plotH - (v / top) * plotH;
	const step = $derived(labelStep(labels.length, plotW, 44));
	const capLabels = $derived((series.length === 1 || stacked) && labels.length <= 12);

	const slotX = (i: number) => pad.l + slotW * i;
	const barX = (i: number, s: number) => slotX(i) + (slotW - groupW) / 2 + s * (barW + 2);

	/** A column with a rounded top and a square foot. */
	function column(x: number, v: number) {
		const h = Math.max(0, plotH - (y(v) - pad.t));
		if (h <= 0) return '';
		const r = Math.min(4, barW / 2, h);
		const b = pad.t + plotH;
		const t = b - h;
		return `M${x},${b}V${t + r}Q${x},${t} ${x + r},${t}H${x + barW - r}Q${x + barW},${t} ${x + barW},${t + r}V${b}Z`;
	}

	/** Stacked segments for slot i, bottom up, with a 2px gap between them. */
	function segments(i: number) {
		const base = pad.t + plotH;
		const out: { d: string; color: string }[] = [];
		const live = series.filter((s) => (s.values[i] ?? 0) > 0);
		let acc = 0;
		live.forEach((s, n) => {
			const v = s.values[i];
			const lo = base - (acc / top) * plotH - (n ? 2 : 0);
			const hi = base - ((acc + v) / top) * plotH;
			acc += v;
			if (lo - hi <= 0.5) return;
			const x = slotX(i) + (slotW - barW) / 2;
			const isTop = n === live.length - 1;
			const r = isTop ? Math.min(4, barW / 2, lo - hi) : 0;
			out.push({
				d: `M${x},${lo}V${hi + r}Q${x},${hi} ${x + r},${hi}H${x + barW - r}Q${x + barW},${hi} ${x + barW},${hi + r}V${lo}Z`,
				color: s.color
			});
		});
		return out;
	}

	let hover = $state<number | null>(null);
	const fmt = (v: number) => `${compact(v)}${unit}`;
</script>

<div class="chart" bind:clientWidth={width} bind:clientHeight={boxH} style="min-height: {height}px">
	{#if width > 0}
		<svg {width} height={H} role="img" aria-label={label}>
			{#each yTicks as t (t)}
				<line class="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
				<text class="tick" x={pad.l - 8} y={y(t)} text-anchor="end" dominant-baseline="middle">{compact(t)}</text>
			{/each}
			{#each labels as l, i (i)}
				{#if i % step === 0}
					<text class="tick" x={slotX(i) + slotW / 2} y={H - 5} text-anchor="middle">{l}</text>
				{/if}
				<g class="slot" class:dim={hover !== null && hover !== i}>
					{#if stacked}
						{#each segments(i) as seg, si (si)}<path d={seg.d} style="fill: {seg.color}" />{/each}
						{#if capLabels && totals[i] > 0}
							<text class="cap" x={slotX(i) + slotW / 2} y={y(totals[i]) - 5} text-anchor="middle">{fmt(totals[i])}</text>
						{/if}
					{:else}
						{#each series as s, si (s.name)}
							<path d={column(barX(i, si), s.values[i])} style="fill: {s.color}" />
							{#if capLabels && s.values[i] > 0}
								<text class="cap" x={barX(i, si) + barW / 2} y={y(s.values[i]) - 5} text-anchor="middle">{fmt(s.values[i])}</text>
							{/if}
						{/each}
					{/if}
				</g>
				<rect
					class="hit"
					x={slotX(i)}
					y={pad.t}
					width={slotW}
					height={plotH}
					role="button"
					tabindex="0"
					aria-label="{l}: {series.map((s) => `${s.name} ${fmt(s.values[i])}`).join(', ')}"
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
					onfocus={() => (hover = i)}
					onblur={() => (hover = null)}
				/>
			{/each}
			<line class="base" x1={pad.l} x2={width - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} />
		</svg>
		{#if hover !== null}
			<ChartTooltip
				x={slotX(hover) + slotW / 2}
				y={Math.max(40, y(stacked ? totals[hover] : Math.max(...series.map((s) => s.values[hover!]))))}
				box={width}
				title={stacked ? `${labels[hover]} · ${fmt(totals[hover])} total` : labels[hover]}
				rows={(stacked ? [...series].reverse() : series).map((s) => ({ name: s.name, value: fmt(s.values[hover!]), color: s.color }))}
			/>
		{/if}
	{/if}
</div>

<style>
	.chart {
		position: relative;
		flex: 1 1 auto;
		width: 100%;
	}
	/* Out of flow, so measuring the box never feeds back into its size. */
	svg {
		position: absolute;
		inset: 0 auto auto 0;
		display: block;
	}
	.grid {
		stroke: var(--ess-border-subtle);
		stroke-width: 1;
	}
	.base {
		stroke: var(--ess-border-strong);
		stroke-width: 1;
	}
	.tick {
		fill: var(--ess-text-muted);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.cap {
		fill: var(--ess-text-secondary);
		font-size: 10.5px;
		font-weight: 600;
	}
	.slot {
		transition: opacity var(--ess-t-fast);
	}
	.slot.dim {
		opacity: 0.45;
	}
	.hit {
		fill: transparent;
		outline: none;
	}
	.hit:focus-visible {
		stroke: var(--ess-focus-ring);
		stroke-width: 2;
	}
</style>
