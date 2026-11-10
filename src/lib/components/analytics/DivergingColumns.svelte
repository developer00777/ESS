<script lang="ts">
	/**
	 * Two opposing counts per month from one centre line: the first grows
	 * up, the second down. Whether a month grew or shrank is read straight
	 * off the picture. Each month is a hover/focus target with both counts
	 * and the net.
	 */
	import ChartTooltip from './ChartTooltip.svelte';

	type Side = { name: string; color: string; values: number[] };

	let { labels, up, down, height = 150, label }: { labels: string[]; up: Side; down: Side; height?: number; label: string } = $props();

	let width = $state(0);
	// Grows to fill its card; `height` is the least it will be.
	let boxH = $state(0);
	const H = $derived(Math.max(height, boxH));
	// The left margin holds the "▲ Hires / ▼ Exits" labels, clear of the bars.
	const pad = { l: 46, r: 6, t: 12, b: 20 };
	const plotW = $derived(Math.max(0, width - pad.l - pad.r));
	const plotH = $derived(H - pad.t - pad.b);
	// Same scale both ways, so a hire and an exit are the same height.
	const top = $derived(Math.max(1, ...up.values, ...down.values));
	const mid = $derived(pad.t + plotH / 2);
	const unit = $derived(plotH / 2 / top);
	const slotW = $derived(labels.length ? plotW / labels.length : 0);
	const barW = $derived(Math.max(3, Math.min(44, slotW * 0.72)));
	const cx = (i: number) => pad.l + slotW * i + slotW / 2;
	const step = $derived(Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 44)))));

	/** Rounded at the far end (shadcn's 8px), square on the centre line. */
	function bar(i: number, v: number, dir: 1 | -1) {
		const h = v * unit;
		if (h <= 0) return '';
		const x = cx(i) - barW / 2;
		const r = Math.min(8, barW / 2, h);
		const end = mid - dir * h;
		return dir === 1
			? `M${x},${mid}V${end + r}Q${x},${end} ${x + r},${end}H${x + barW - r}Q${x + barW},${end} ${x + barW},${end + r}V${mid}Z`
			: `M${x},${mid}V${end - r}Q${x},${end} ${x + r},${end}H${x + barW - r}Q${x + barW},${end} ${x + barW},${end - r}V${mid}Z`;
	}

	const uid = $props.id();
	let hover = $state<number | null>(null);
	const net = (i: number) => up.values[i] - down.values[i];
</script>

<div class="chart" bind:clientWidth={width} bind:clientHeight={boxH} style="min-height: {height}px">
	{#if width > 0}
		<svg {width} height={H} role="img" aria-label={label}>
			<!-- Diagonal-stripe fills for the Mono theme (as in ColumnChart) -->
			<defs>
				{#each [up, down] as s, si (si)}
					<pattern id="{uid}-p{si}" width="8" height="8" patternUnits="userSpaceOnUse">
						<rect width="8" height="8" style="fill: {s.color}; opacity: 0.1" />
						<path d="M0,8 L8,0 M-2,2 L2,-2 M6,10 L10,6" style="stroke: {s.color}; stroke-width: 1.5; opacity: 0.65" />
						<path d="M-2,6 L6,-2 M2,10 L10,2" style="stroke: {s.color}; stroke-width: 1; opacity: 0.3" />
					</pattern>
				{/each}
			</defs>
			<text class="side" x={2} y={mid - 8}>▲ {up.name}</text>
			<text class="side" x={2} y={mid + 14}>▼ {down.name}</text>
			{#each labels as l, i (i)}
				<g class:dim={hover !== null && hover !== i}>
					<path class="bar" d={bar(i, up.values[i], 1)} style="fill: {up.color}; --bar-c: {up.color}; --bar-pat: url(#{uid}-p0)" />
					<path class="bar" d={bar(i, down.values[i], -1)} style="fill: {down.color}; --bar-c: {down.color}; --bar-pat: url(#{uid}-p1)" />
					{#if up.values[i] > 0 && labels.length <= 12}
						<text class="val" x={cx(i)} y={mid - up.values[i] * unit - 4} text-anchor="middle">{up.values[i]}</text>
					{/if}
					{#if down.values[i] > 0 && labels.length <= 12}
						<text class="val" x={cx(i)} y={mid + down.values[i] * unit + 11} text-anchor="middle">{down.values[i]}</text>
					{/if}
				</g>
				{#if i % step === 0}<text class="tick" x={cx(i)} y={H - 5} text-anchor="middle">{l}</text>{/if}
				<rect
					class="hit"
					x={cx(i) - slotW / 2}
					y={pad.t}
					width={slotW}
					height={plotH}
					role="button"
					tabindex="0"
					aria-label="{l}: {up.values[i]} {up.name.toLowerCase()}, {down.values[i]} {down.name.toLowerCase()}, net {net(i) > 0 ? '+' : ''}{net(i)}"
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
					onfocus={() => (hover = i)}
					onblur={() => (hover = null)}
				/>
			{/each}
			<line class="mid" x1={pad.l} x2={width - pad.r} y1={mid} y2={mid} />
		</svg>
		{#if hover !== null}
			<ChartTooltip
				x={cx(hover)}
				y={mid}
				box={width}
				title={labels[hover]}
				rows={[
					{ name: up.name, value: String(up.values[hover]), color: up.color },
					{ name: down.name, value: String(down.values[hover]), color: down.color },
					{ name: 'Net', value: `${net(hover) > 0 ? '+' : ''}${net(hover)}` }
				]}
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
	.mid {
		stroke: var(--ess-border);
		stroke-width: 1;
	}
	.tick,
	.side {
		fill: var(--ess-text-muted);
		font-size: 11.5px;
	}
	.side {
		font-weight: 500;
	}
	.val {
		fill: var(--ess-text);
		font-size: 11.5px;
		font-weight: 500;
	}
	g {
		transition: opacity var(--ess-t-fast);
	}
	g.dim {
		opacity: 0.4;
	}
	.hit {
		fill: transparent;
		outline: none;
	}
	/* Mono: diagonal-stripe fills with a 1px outline of the series colour */
	:global(:root[data-ess-skin='mono']) .bar {
		fill: var(--bar-pat) !important;
		stroke: var(--bar-c);
		stroke-width: 1;
	}
	.hit:focus-visible {
		stroke: var(--ess-focus-ring);
		stroke-width: 2;
	}
</style>
