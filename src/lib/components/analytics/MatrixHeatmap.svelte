<script lang="ts">
	/**
	 * Groups down the side, months across, each cell shaded by its count on
	 * the page's one-hue ramp, with the count written inside when it isn't
	 * zero. Shows where something is concentrated, and when.
	 */
	import ChartTooltip from './ChartTooltip.svelte';

	type Row = { name: string; cells: { value: number; detail?: string }[] };

	let { rows, labels, noun }: { rows: Row[]; labels: string[]; noun: string } = $props();

	const max = $derived(Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value))));
	const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
	const step = $derived(Math.max(1, Math.ceil(labels.length / 6)));
	const plural = (n: number) => `${n} ${n === 1 ? noun : noun + 's'}`;

	let box = $state<HTMLDivElement>();
	let width = $state(0);
	let tip = $state<{ x: number; y: number; title: string; rows: { name: string; value: string }[] } | null>(null);
	function show(e: Event, r: Row, i: number) {
		const b = box!.getBoundingClientRect();
		const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const c = r.cells[i];
		tip = { x: t.left - b.left + t.width / 2, y: t.top - b.top + t.height / 2, title: `${r.name} · ${labels[i]}`, rows: [{ name: c.detail ?? '', value: plural(c.value) }] };
	}
</script>

<div class="mx" bind:this={box} bind:clientWidth={width} style="--cols: {labels.length}">
	{#each rows as r (r.name)}
		<div class="row">
			<span class="name" title={r.name}>{r.name}</span>
			<div class="cells">
				{#each r.cells as c, i (i)}
					<button
						type="button"
						data-level={level(c.value)}
						aria-label="{r.name}, {labels[i]}: {plural(c.value)}"
						onpointerenter={(e) => show(e, r, i)}
						onpointerleave={() => (tip = null)}
						onfocus={(e) => show(e, r, i)}
						onblur={() => (tip = null)}
					>{c.value || ''}</button>
				{/each}
			</div>
		</div>
	{:else}
		<p class="empty">Nothing to show for this period.</p>
	{/each}
	<div class="row axis" aria-hidden="true">
		<span></span>
		<div class="cells">{#each labels as l, i (i)}<span>{i % step === 0 ? l : ''}</span>{/each}</div>
	</div>
	{#if tip}<ChartTooltip x={tip.x} y={tip.y} box={width} title={tip.title} rows={tip.rows} />{/if}
</div>

<style>
	/* Fills its card: rows grow (up to a limit) instead of leaving a gap. */
	.mx {
		position: relative;
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 3px;
	}
	.row:not(.axis) {
		flex: 1 1 auto;
		max-height: 34px;
		align-items: stretch;
	}
	.row:not(.axis) .name {
		align-self: center;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(70px, 28%) 1fr;
		align-items: center;
		gap: 8px;
	}
	.name {
		font-size: 11.5px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cells {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 2px;
	}
	button {
		height: 100%;
		min-height: 20px;
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 4px;
		font: inherit;
		font-size: 10px;
		font-weight: 600;
		cursor: default;
	}
	button:hover,
	button:focus-visible {
		outline: 2px solid var(--ess-text);
		outline-offset: 1px;
		position: relative;
		z-index: 1;
	}
	[data-level='0'] {
		background: var(--ess-sunken);
	}
	/* Ink by the fill's lightness so the count always reads. */
	[data-level='1'] {
		background: var(--hra-q1);
		color: var(--hra-q-ink-12);
	}
	[data-level='2'] {
		background: var(--hra-q2);
		color: var(--hra-q-ink-12);
	}
	[data-level='3'] {
		background: var(--hra-q3);
		color: var(--hra-q-ink-34);
	}
	[data-level='4'] {
		background: var(--hra-q4);
		color: var(--hra-q-ink-34);
	}
	.axis span {
		font-size: 9.5px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: visible;
	}
	.empty {
		margin: 0;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
</style>
