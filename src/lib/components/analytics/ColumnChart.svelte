<script lang="ts">
	/**
	 * Columns from one baseline, in the spirit of shadcn/ui's bar charts but
	 * light: one series, or a few side by side in each slot (4px apart);
	 * each column a slim capsule (at most 26px wide, fully rounded) standing
	 * in a faint full-height track; light horizontal grid lines and no axis
	 * line; the hovered slot's track deepens. Each slot is its own hover and
	 * focus target; with one series and few slots, values sit above.
	 *
	 * `stacked` piles the series into one capsule per slot instead, segments
	 * 2px apart, the slot's total above.
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
	// Grows to fill its card; `height` is the least it will be (the box's
	// inline min-height). Draw at the box's real height once measured, so a
	// theme that lowers that minimum on short screens shrinks the chart
	// instead of letting it spill over the legend and the next card.
	let boxH = $state(0);
	const H = $derived(boxH > 0 ? boxH : height);
	const pad = { l: 30, r: 6, t: 14, b: 26 };
	const plotW = $derived(Math.max(0, width - pad.l - pad.r));
	const plotH = $derived(H - pad.t - pad.b);
	// Counts: a whole-number top, one tick per unit while that's five or fewer.
	const totals = $derived(labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0)));
	const top = $derived(Math.ceil(niceMax(Math.max(0, ...(stacked ? totals : series.flatMap((s) => s.values))))));
	const yTicks = $derived(top <= 5 ? ticks(top, top) : ticks(top));
	const slotW = $derived(labels.length ? plotW / labels.length : 0);
	const lanes = $derived(stacked ? 1 : series.length);
	/* Slim capsules: a column is at most 26px wide (thinner when the slots
	   are narrow), fully rounded, standing in a faint full-height track. */
	const GAP = 4;
	const barW = $derived(Math.max(4, Math.min(26, (slotW * 0.42 - (lanes - 1) * GAP) / lanes)));
	const groupW = $derived(barW * lanes + (lanes - 1) * GAP);
	const y = (v: number) => pad.t + plotH - (v / top) * plotH;
	const step = $derived(labelStep(labels.length, plotW, 44));
	const capLabels = $derived((series.length === 1 || stacked) && labels.length <= 12);

	const slotX = (i: number) => pad.l + slotW * i;
	const barX = (i: number, s: number) => slotX(i) + (slotW - groupW) / 2 + s * (barW + GAP);
	const base = $derived(pad.t + plotH);
	/** Height of a value, at least a dot so a small non-zero still shows. */
	const hOf = (v: number) => (v > 0 ? Math.max(barW, (v / top) * plotH) : 0);

	/** Stacked segments for slot i, bottom up, 2px apart; the whole stack is
	    clipped to one capsule, so its two ends are round. */
	function segments(i: number) {
		const out: { y: number; h: number; color: string; si: number }[] = [];
		let acc = 0;
		let n = 0;
		series.forEach((s, si) => {
			const v = s.values[i] ?? 0;
			if (v <= 0) return;
			const lo = base - (acc / top) * plotH - (n ? 2 : 0);
			const hi = base - ((acc + v) / top) * plotH;
			acc += v;
			n++;
			if (lo - hi > 0.5) out.push({ y: hi, h: lo - hi, color: s.color, si });
		});
		return out;
	}
	const uid = $props.id();

	let hover = $state<number | null>(null);
	const fmt = (v: number) => `${compact(v)}${unit}`;
</script>

<div class="chart" bind:clientWidth={width} bind:clientHeight={boxH} style="min-height: {height}px">
	{#if width > 0}
		<svg {width} height={H} role="img" aria-label={label}>
			<!-- Diagonal-stripe fills, one per series. Only the Mono theme uses
			     them (shadcn's "bar chart – pattern"); other themes keep solid
			     colour. -->
			<defs>
				{#each series as s, si (s.name)}
					<pattern id="{uid}-p{si}" width="8" height="8" patternUnits="userSpaceOnUse">
						<rect width="8" height="8" style="fill: {s.color}; opacity: 0.1" />
						<path d="M0,8 L8,0 M-2,2 L2,-2 M6,10 L10,6" style="stroke: {s.color}; stroke-width: 1.5; opacity: 0.65" />
						<path d="M-2,6 L6,-2 M2,10 L10,2" style="stroke: {s.color}; stroke-width: 1; opacity: 0.3" />
					</pattern>
				{/each}
			</defs>
			{#each yTicks as t (t)}
				<line class="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
				<text class="tick" x={pad.l - 8} y={y(t)} text-anchor="end" dominant-baseline="middle">{compact(t)}</text>
			{/each}
			{#each labels as l, i (i)}
				{#if i % step === 0}
					<text class="tick" class:on={hover === i} x={slotX(i) + slotW / 2} y={H - 6} text-anchor="middle">{l}</text>
				{/if}
				<g class="slot" class:on={hover === i}>
					{#if stacked}
						{@const x = slotX(i) + (slotW - barW) / 2}
						<rect class="track" {x} y={pad.t} width={barW} height={plotH} rx={barW / 2} />
						{#if totals[i] > 0}
							<clipPath id="{uid}-c{i}"><rect class="clip" {x} y={base - hOf(totals[i])} width={barW} height={hOf(totals[i])} rx={barW / 2} /></clipPath>
							<g clip-path="url(#{uid}-c{i})">
								{#each segments(i) as seg, k (k)}<rect class="seg" {x} y={seg.y} width={barW} height={seg.h} style="fill: {seg.color}; --bar-c: {seg.color}; --bar-pat: url(#{uid}-p{seg.si})" />{/each}
							</g>
						{/if}
						{#if capLabels && totals[i] > 0}
							<text class="cap" x={slotX(i) + slotW / 2} y={base - hOf(totals[i]) - 6} text-anchor="middle">{fmt(totals[i])}</text>
						{/if}
					{:else}
						{#each series as s, si (s.name)}
							<rect class="track" x={barX(i, si)} y={pad.t} width={barW} height={plotH} rx={barW / 2} />
							{#if s.values[i] > 0}
								<rect class="bar" x={barX(i, si)} y={base - hOf(s.values[i])} width={barW} height={hOf(s.values[i])} rx={barW / 2} style="fill: {s.color}; --bar-c: {s.color}; --bar-pat: url(#{uid}-p{si})" />
							{/if}
							{#if capLabels && s.values[i] > 0}
								<text class="cap" x={barX(i, si) + barW / 2} y={base - hOf(s.values[i]) - 6} text-anchor="middle">{fmt(s.values[i])}</text>
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
	/* shadcn: CartesianGrid vertical={false} (border at half strength), no
	   axis lines, 12px muted ticks, the hovered slot under a muted band */
	.grid {
		stroke: color-mix(in srgb, var(--ess-border) 70%, transparent);
		stroke-width: 1;
	}
	.tick {
		fill: var(--ess-text-muted);
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}
	.tick.on {
		fill: var(--ess-text);
	}
	.cap {
		fill: var(--ess-text-muted);
		font-size: 11px;
		font-weight: 500;
	}
	/* the faint capsule each column stands in; a touch deeper on hover */
	.track {
		fill: var(--ess-sunken);
		transition: fill var(--ess-t-fast);
	}
	.slot.on .track {
		fill: color-mix(in srgb, var(--ess-text) 9%, var(--ess-sunken));
	}
	.slot.on .cap {
		fill: var(--ess-text);
	}
	.hit {
		fill: transparent;
		outline: none;
	}
	/* Mono: shadcn's "bar chart – pattern". Each column is a diagonal-stripe
	   fill of its series colour with a 1px outline of that colour and 4px
	   corners; no track, only a faint band under the hovered slot. */
	:global(:root[data-ess-skin='mono']) :is(.bar, .seg) {
		fill: var(--bar-pat) !important;
		stroke: var(--bar-c);
		stroke-width: 1;
	}
	:global(:root[data-ess-skin='mono']) :is(.bar, .clip) {
		rx: 4px;
		ry: 4px;
	}
	:global(:root[data-ess-skin='mono']) .track {
		fill: transparent;
	}
	:global(:root[data-ess-skin='mono']) .slot.on .track {
		fill: color-mix(in srgb, var(--ess-text) 5%, transparent);
	}
	.hit:focus-visible {
		stroke: var(--ess-focus-ring);
		stroke-width: 2;
	}
</style>
