<script lang="ts">
	/**
	 * Lines over months on one shared axis (never two). A crosshair snaps to
	 * the nearest month and the tooltip lists every series there; arrow keys
	 * do the same from the keyboard. A single series gets a faint area wash
	 * and its latest value labelled at the end.
	 */
	import ChartTooltip from './ChartTooltip.svelte';
	import { compact, labelStep, niceMax, ticks } from './scale';

	type Series = { name: string; color: string; values: (number | null)[] };

	interface Props {
		labels: string[];
		series: Series[];
		unit?: string;
		/** Fixed axis top, e.g. 100 for a score. */
		max?: number;
		height?: number;
		label: string;
	}

	let { labels, series, unit = '', max, height = 150, label }: Props = $props();

	let width = $state(0);
	// Grows to fill its card; `height` is the least it will be.
	let boxH = $state(0);
	const H = $derived(Math.max(height, boxH));
	const pad = { l: 34, r: 14, t: 8, b: 20 };
	const plotW = $derived(Math.max(0, width - pad.l - pad.r));
	const plotH = $derived(H - pad.t - pad.b);

	const top = $derived(
		max ?? niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null))) * 1.1)
	);
	const yTicks = $derived(ticks(top));
	const x = (i: number) => pad.l + (labels.length <= 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
	const y = (v: number) => pad.t + plotH - (v / top) * plotH;
	const step = $derived(labelStep(labels.length, plotW));

	/** One path per run of known values; a gap stays a gap. */
	function path(values: (number | null)[]) {
		let d = '';
		let pen = false;
		values.forEach((v, i) => {
			if (v === null) {
				pen = false;
				return;
			}
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
			pen = true;
		});
		return d;
	}
	function area(values: (number | null)[]) {
		const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
		if (known.length < 2) return '';
		const base = y(0).toFixed(1);
		return `M${x(known[0][0]).toFixed(1)},${base}` + known.map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('') + `L${x(known.at(-1)![0]).toFixed(1)},${base}Z`;
	}
	const lastKnown = (values: (number | null)[]) => {
		for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
		return -1;
	};

	const fmt = (v: number | null) => (v === null ? 'No data' : `${compact(v)}${unit}`);

	/* ---------- hover ---------- */
	let hover = $state<number | null>(null);
	let tipY = $state(0);
	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = e.clientX - r.left;
		const i = labels.length <= 1 ? 0 : Math.round(((px - pad.l) / plotW) * (labels.length - 1));
		hover = Math.min(labels.length - 1, Math.max(0, i));
		tipY = Math.min(Math.max(e.clientY - r.top, 40), H - 30);
	}
	function key(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		hover = Math.min(labels.length - 1, Math.max(0, (hover ?? labels.length) + (e.key === 'ArrowLeft' ? -1 : 1)));
		tipY = H / 2;
	}
</script>

<div class="chart" bind:clientWidth={width} bind:clientHeight={boxH} style="min-height: {height}px">
	{#if width > 0}
		<!-- An image of the data that also takes arrow keys to read it month
		     by month; the table view holds the same values. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<svg
			{width}
			height={H}
			role="img"
			aria-label="{label}. Use the left and right arrow keys to read each month."
			tabindex="0"
			onpointermove={move}
			onpointerleave={() => (hover = null)}
			onkeydown={key}
			onblur={() => (hover = null)}
		>
			{#each yTicks as t (t)}
				<line class="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
				<text class="tick" x={pad.l - 8} y={y(t)} text-anchor="end" dominant-baseline="middle">{compact(t)}{unit}</text>
			{/each}
			{#each labels as l, i (i)}
				<!-- The last month always shows; a stepped label too close to it gives way. -->
				{#if (i % step === 0 && labels.length - 1 - i >= step) || i === labels.length - 1}
					<text class="tick" x={x(i)} y={H - 5} text-anchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text>
				{/if}
			{/each}

			{#if series.length === 1}
				<path class="area" d={area(series[0].values)} style="fill: {series[0].color}" />
			{/if}
			{#each series as s (s.name)}
				{@const li = lastKnown(s.values)}
				<path class="line" d={path(s.values)} style="stroke: {s.color}" />
				{#if li >= 0 && hover === null}
					<circle class="dot" cx={x(li)} cy={y(s.values[li]!)} r="4" style="fill: {s.color}" />
					<!-- Short charts sit under a headline that already gives this value. -->
					{#if series.length === 1 && height >= 120}
						<text class="end" x={x(li)} y={y(s.values[li]!) - 10} text-anchor="end">{fmt(s.values[li])}</text>
					{/if}
				{/if}
			{/each}

			{#if hover !== null}
				<line class="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} />
				{#each series as s (s.name)}
					{#if s.values[hover] !== null}
						<circle class="dot" cx={x(hover)} cy={y(s.values[hover]!)} r="4" style="fill: {s.color}" />
					{/if}
				{/each}
			{/if}
		</svg>
		{#if hover !== null}
			<ChartTooltip
				x={x(hover)}
				y={tipY}
				box={width}
				title={labels[hover]}
				rows={series.map((s) => ({ name: s.name, value: fmt(s.values[hover!]), color: s.color }))}
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
		outline: none;
		cursor: crosshair;
	}
	svg:focus-visible {
		box-shadow: 0 0 0 2px var(--ess-focus-ring);
		border-radius: 8px;
	}
	.grid {
		stroke: var(--ess-border-subtle);
		stroke-width: 1;
	}
	.tick {
		fill: var(--ess-text-muted);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.area {
		opacity: 0.1;
	}
	.dot {
		stroke: var(--ess-surface);
		stroke-width: 2;
	}
	.cross {
		stroke: var(--ess-border-strong);
		stroke-width: 1;
	}
	.end {
		fill: var(--ess-text);
		font-size: 11.5px;
		font-weight: 600;
	}
</style>
