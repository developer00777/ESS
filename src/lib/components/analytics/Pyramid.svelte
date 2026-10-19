<script lang="ts">
	/**
	 * A population pyramid: age bands down the middle, one group growing to
	 * the left and the other to the right on the same scale, each bar's
	 * count at its tip. Youngest at the bottom, as the chart is usually read.
	 */
	type Row = { band: string; left: number; right: number };

	let { rows, left, right }: { rows: Row[]; left: { name: string; color: string }; right: { name: string; color: string } } = $props();

	const max = $derived(Math.max(1, ...rows.flatMap((r) => [r.left, r.right])));
	const ordered = $derived([...rows].reverse());
</script>

<div class="pyr" role="img" aria-label="{rows.map((r) => `${r.band}: ${r.left} ${left.name.toLowerCase()}, ${r.right} ${right.name.toLowerCase()}`).join('; ')}">
	<div class="heads" aria-hidden="true">
		<span><i style="background: {left.color}"></i>{left.name}</span>
		<span></span>
		<span><i style="background: {right.color}"></i>{right.name}</span>
	</div>
	{#each ordered as r (r.band)}
		<div class="row" title="{r.band}: {r.left} {left.name.toLowerCase()}, {r.right} {right.name.toLowerCase()}">
			<span class="side l">
				<b>{r.left || ''}</b>
				<span class="bar" style="width: {(r.left / max) * 100}%; background: {left.color}"></span>
			</span>
			<span class="band">{r.band}</span>
			<span class="side r">
				<span class="bar" style="width: {(r.right / max) * 100}%; background: {right.color}"></span>
				<b>{r.right || ''}</b>
			</span>
		</div>
	{/each}
</div>

<style>
	/* Fills its card; rows spread out rather than leaving a gap below. */
	.pyr {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		justify-content: space-evenly;
		gap: 4px;
	}
	.row {
		flex: 1 1 auto;
		max-height: 38px;
	}
	.heads,
	.row {
		display: grid;
		grid-template-columns: 1fr 58px 1fr;
		align-items: center;
		gap: 6px;
	}
	.heads {
		margin-bottom: 2px;
		font-size: 11px;
		color: var(--ess-text-secondary);
	}
	.heads span:first-child {
		justify-self: end;
	}
	.heads span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.heads i {
		width: 9px;
		height: 9px;
		border-radius: 3px;
	}
	.side {
		display: flex;
		align-items: center;
		gap: 5px;
		height: 100%;
		min-height: 18px;
	}
	.side.l {
		justify-content: flex-end;
	}
	.bar {
		height: 55%;
		min-height: 12px;
		max-height: 20px;
		min-width: 0;
		transition: width var(--ess-t-slow);
	}
	.l .bar {
		border-radius: 4px 0 0 4px;
	}
	.r .bar {
		border-radius: 0 4px 4px 0;
	}
	b {
		min-width: 12px;
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ess-text-secondary);
	}
	.l b {
		text-align: right;
	}
	.band {
		text-align: center;
		font-size: 11px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.row:hover .bar {
		filter: brightness(1.08);
	}
</style>
