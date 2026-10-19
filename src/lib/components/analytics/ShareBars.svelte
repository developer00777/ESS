<script lang="ts">
	/**
	 * Shares of a whole as 100% bars: one row for everyone, then one per
	 * group. Segments sit 2px apart; a segment labels its share inside only
	 * when the text fits, otherwise the tooltip and table carry it.
	 */
	import ChartTooltip from './ChartTooltip.svelte';

	type Row = { name: string; counts: Record<string, number>; total: number };

	interface Props {
		keys: { name: string; color: string; ink: string }[];
		rows: Row[];
		/** Set the first row apart as the total the others break down. */
		totalFirst?: boolean;
	}

	let { keys, rows, totalFirst = true }: Props = $props();

	let box = $state<HTMLDivElement>();
	let width = $state(0);
	let tip = $state<{ x: number; y: number; title: string; rows: { name: string; value: string; color: string }[] } | null>(null);

	const share = (r: Row, k: string) => (r.total ? (r.counts[k] ?? 0) / r.total : 0);
	const pctText = (v: number) => `${Math.round(v * 100)}%`;

	function show(e: PointerEvent | FocusEvent, r: Row) {
		const b = box!.getBoundingClientRect();
		const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
		tip = {
			x: 'clientX' in e ? e.clientX - b.left : t.left - b.left + t.width / 2,
			y: t.top - b.top + t.height / 2,
			title: `${r.name} · ${r.total} ${r.total === 1 ? 'person' : 'people'}`,
			rows: keys.filter((k) => r.counts[k.name]).map((k) => ({ name: k.name, value: `${r.counts[k.name]} · ${pctText(share(r, k.name))}`, color: k.color }))
		};
	}
</script>

<div class="share" bind:this={box} bind:clientWidth={width}>
	{#each rows as r, ri (r.name)}
		<div class="row" class:first={totalFirst && ri === 0 && rows.length > 1}>
			<span class="name">{r.name}<small>{r.total}</small></span>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="bar"
				role="img"
				tabindex="0"
				aria-label="{r.name}: {keys.filter((k) => r.counts[k.name]).map((k) => `${k.name} ${r.counts[k.name]} (${pctText(share(r, k.name))})`).join(', ') || 'no one'}"
				onpointermove={(e) => show(e, r)}
				onpointerleave={() => (tip = null)}
				onfocus={(e) => show(e, r)}
				onblur={() => (tip = null)}
			>
				{#each keys as k (k.name)}
					{@const s = share(r, k.name)}
					{#if s > 0}
						<span class="seg" style="flex-grow: {s}; background: {k.color}; color: {k.ink}">
							<!-- Inside only when there's room for it. -->
							{#if s * (width * 0.66) > 38}{pctText(s)}{/if}
						</span>
					{/if}
				{/each}
				{#if r.total === 0}<span class="seg none"></span>{/if}
			</div>
		</div>
	{/each}
	{#if tip}<ChartTooltip x={tip.x} y={tip.y} box={width} title={tip.title} rows={tip.rows} />{/if}
</div>

<style>
	.share {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(90px, 30%) 1fr;
		align-items: center;
		gap: 10px;
	}
	.row.first {
		padding-bottom: 5px;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.row.first .bar {
		height: 20px;
	}
	.name {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		font-size: 12px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.first .name {
		font-weight: 600;
		color: var(--ess-text);
	}
	.name small {
		font-size: 11px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 15px;
		border-radius: 4px;
		overflow: hidden;
		outline: none;
	}
	.bar:focus-visible {
		box-shadow: 0 0 0 2px var(--ess-focus-ring);
	}
	.seg {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-basis: 0;
		min-width: 3px;
		font-size: 10px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
	}
	.seg.none {
		flex-grow: 1;
		background: var(--ess-sunken);
	}
</style>
