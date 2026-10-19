<script lang="ts">
	/**
	 * One square per day, a column per week (Monday on top), darker for more.
	 * Busy weeks and quiet stretches show at a glance. Colours come from the
	 * page's one-hue ramp (--hra-q1…q4); every square has a tooltip and a
	 * label, and the card's table view holds the monthly totals.
	 */
	import ChartTooltip from './ChartTooltip.svelte';

	let { days, noun = 'meeting' }: { days: { date: string; count: number }[]; noun?: string } = $props();

	const weeks = $derived.by(() => {
		const out: { date: string; count: number }[][] = [];
		for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
		return out;
	});
	const max = $derived(Math.max(1, ...days.map((d) => d.count)));
	const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	/** A week is labelled with the month whose 1st it holds. */
	const monthOf = (week: { date: string }[]) => {
		const first = week.find((d) => d.date.endsWith('-01'));
		return first ? MONTHS[Number(first.date.slice(5, 7)) - 1] : '';
	};
	const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

	let box = $state<HTMLDivElement>();
	let width = $state(0);
	let tip = $state<{ x: number; y: number; title: string; value: string } | null>(null);
	function show(e: Event, d: { date: string; count: number }) {
		const b = box!.getBoundingClientRect();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		tip = { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, title: fmt(d.date), value: `${d.count} ${d.count === 1 ? noun : noun + 's'}` };
	}
</script>

<div class="cal" bind:this={box} bind:clientWidth={width}>
	<div class="months" aria-hidden="true" style="--weeks: {weeks.length}">
		{#each weeks as w, i (i)}<span>{monthOf(w)}</span>{/each}
	</div>
	<div class="body">
		<div class="dows" aria-hidden="true">
			{#each ['M', '', 'W', '', 'F', '', ''] as d, i (i)}<span>{d}</span>{/each}
		</div>
		<div class="grid" style="--weeks: {weeks.length}" role="group" aria-label="{noun}s per day, last {weeks.length} weeks">
			{#each days as d (d.date)}
				<button
					type="button"
					data-level={level(d.count)}
					aria-label="{fmt(d.date)}: {d.count} {d.count === 1 ? noun : noun + 's'}"
					onpointerenter={(e) => show(e, d)}
					onpointerleave={() => (tip = null)}
					onfocus={(e) => show(e, d)}
					onblur={() => (tip = null)}
				></button>
			{/each}
		</div>
	</div>
	<div class="key" aria-hidden="true">Less <i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> More</div>
	{#if tip}<ChartTooltip x={tip.x} y={tip.y} box={width} title={tip.title} rows={[{ name: '', value: tip.value }]} />{/if}
</div>

<style>
	.cal {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.months,
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--weeks), minmax(0, 1fr));
		gap: 3px;
	}
	.months {
		margin-left: 15px;
		font-size: 10px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.body {
		display: flex;
		gap: 3px;
	}
	.dows {
		display: grid;
		grid-template-rows: repeat(7, 1fr);
		gap: 3px;
		width: 12px;
		font-size: 9px;
		color: var(--ess-text-muted);
	}
	.dows span {
		display: flex;
		align-items: center;
	}
	.grid {
		flex: 1;
		grid-auto-flow: column;
		grid-template-rows: repeat(7, 1fr);
	}
	button,
	.key i {
		aspect-ratio: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 3px;
	}
	button {
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
	[data-level='1'] {
		background: var(--hra-q1);
	}
	[data-level='2'] {
		background: var(--hra-q2);
	}
	[data-level='3'] {
		background: var(--hra-q3);
	}
	[data-level='4'] {
		background: var(--hra-q4);
	}
	.key {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 3px;
		margin-top: 4px;
		font-size: 10px;
		color: var(--ess-text-muted);
	}
	.key i {
		width: 9px;
	}
</style>
