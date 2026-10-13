<script lang="ts">
	/**
	 * Dashboard panel: the viewer's last 13 weeks of punches
	 * (buildAttendanceHeatmap in $lib/dashboard-analytics), one column per
	 * week with Monday on top, and this month's totals underneath.
	 */
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';

	type Cell = { date: string; label: string; hours: number; level: number; recorded: boolean; complete: boolean };

	interface Props {
		analytics: { heatmap: Cell[]; today: string; recordedDays: number; recordedHours: number; completeDays: number };
		/** Recent days with a check-in but no check-out and no correction raised. */
		missingCheckOuts: number;
	}

	let { analytics, missingCheckOuts }: Props = $props();

	let selected = $state<string | null>(null);
	const selectedCell = $derived(analytics.heatmap.find((c) => c.date === selected));

	// A month name over the first week that holds its 1st (and over week one).
	const monthName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' });
	const monthLabels = $derived(
		Array.from({ length: Math.ceil(analytics.heatmap.length / 7) }, (_, i) => {
			const week = analytics.heatmap.slice(i * 7, i * 7 + 7);
			const first = week.find((c) => c.date.endsWith('-01'));
			return first ? monthName(first.date) : i === 0 ? monthName(week[0].date) : '';
		})
	);

	const describe = (c: Cell) =>
		c.level === -1 ? 'Future' : !c.recorded ? 'No punch recorded' : !c.complete ? 'Check-in recorded, check-out missing' : `${c.hours} recorded hours`;
</script>

<section class="ess-card panel" aria-labelledby="att-h">
	<header class="p-head">
		<div>
			<h2 id="att-h">My attendance</h2>
			<p>Last 13 weeks of punches</p>
		</div>
		<a class="more" href="/attendance" aria-label="Open attendance"><ArrowUpRight size={16} /></a>
	</header>

	<div class="map">
		<div class="months" aria-hidden="true">
			{#each monthLabels as m, i (i)}<span>{m}</span>{/each}
		</div>
		<div class="body">
			<div class="weekdays" aria-hidden="true">
				{#each ['M', '', 'W', '', 'F', '', 'S'] as d, i (i)}<span>{d}</span>{/each}
			</div>
			<div class="grid" role="group" aria-label="Attendance over the last 13 weeks, Monday through Sunday, oldest week first">
				{#each analytics.heatmap as cell (cell.date)}
					<button
						type="button"
						data-level={cell.level}
						class:today={cell.date === analytics.today}
						aria-pressed={selected === cell.date}
						aria-label="{cell.label}: {describe(cell)}"
						title="{cell.label}: {describe(cell)}"
						onclick={() => (selected = selected === cell.date ? null : cell.date)}
					></button>
				{/each}
			</div>
		</div>
		<div class="foot">
			<p class="detail" aria-live="polite">
				{#if selectedCell}<b>{selectedCell.label}</b> · {describe(selectedCell)}{:else}Select a day for its hours{/if}
			</p>
			<span class="legend" aria-hidden="true">Less <i data-level="0"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> More</span>
		</div>
	</div>

	<dl class="stats">
		<div title="Days with a punch this month"><dt>Days</dt><dd>{analytics.recordedDays}</dd></div>
		<div title="Recorded hours this month"><dt>Hours</dt><dd>{analytics.recordedHours}</dd></div>
		<div class:warn={missingCheckOuts > 0} title="Recent days with a check-in but no check-out">
			<dt>Missing</dt>
			<dd>{#if missingCheckOuts > 0}<a href="/attendance">{missingCheckOuts}</a>{:else}0{/if}</dd>
		</div>
	</dl>
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		min-width: 0;
		padding: 16px 18px;
	}
	.p-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.p-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.p-head p {
		margin: 1px 0 0;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.more {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}
	.more:hover {
		color: var(--ess-text);
	}

	.map {
		min-width: 0;
	}
	.months,
	.grid,
	.foot {
		max-width: 300px;
	}
	.months,
	.grid {
		display: grid;
		grid-template-columns: repeat(13, minmax(0, 1fr));
		gap: 3px;
	}
	.months {
		margin: 0 0 3px 16px;
		font-size: 10.5px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.body {
		display: flex;
		gap: 4px;
	}
	.weekdays {
		display: grid;
		grid-template-rows: repeat(7, 14px);
		gap: 3px;
		width: 12px;
		font-size: 9.5px;
		color: var(--ess-text-muted);
	}
	.weekdays span {
		display: flex;
		align-items: center;
	}
	.grid {
		flex: 1;
		min-width: 0;
		grid-auto-flow: column;
		grid-template-rows: repeat(7, 14px);
	}

	.grid button,
	.legend i {
		padding: 0;
		min-width: 0;
		border: 1px solid var(--ess-border-subtle);
		border-radius: 3px;
		background: var(--ess-sunken);
	}
	.grid button {
		cursor: pointer;
		transition: transform 0.12s ease;
	}
	.grid button:hover,
	.grid button[aria-pressed='true'] {
		transform: scale(1.2);
		outline: 2px solid var(--ess-primary);
		outline-offset: 1px;
		position: relative;
		z-index: 1;
	}
	.grid button.today {
		box-shadow: inset 0 0 0 1.5px var(--ess-primary);
	}
	[data-level='-1'] {
		background: transparent !important;
		border-style: dashed !important;
	}
	[data-level='1'] {
		background: var(--ess-warning-bg) !important;
		border-color: var(--ess-warning) !important;
	}
	[data-level='2'] {
		background: color-mix(in srgb, var(--ess-success) 28%, var(--ess-surface)) !important;
		border-color: transparent !important;
	}
	[data-level='3'] {
		background: color-mix(in srgb, var(--ess-success) 60%, var(--ess-surface)) !important;
		border-color: transparent !important;
	}
	[data-level='4'] {
		background: var(--ess-success) !important;
		border-color: transparent !important;
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px 10px;
		flex-wrap: wrap;
		margin: 6px 0 0 16px;
		font-size: 11px;
		color: var(--ess-text-muted);
	}
	.detail {
		margin: 0;
		min-width: 0;
	}
	.detail b {
		color: var(--ess-text);
		font-weight: 600;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.legend i {
		width: 9px;
		height: 9px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin: auto 0 0;
	}
	.stats > div {
		min-width: 0;
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--ess-sunken);
	}
	.stats > div.warn {
		background: var(--ess-warning-bg);
	}
	dt {
		font-size: 11px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	dd {
		margin: 1px 0 0;
		font-size: 18px;
		font-weight: 650;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.warn dd a {
		color: var(--ess-warning);
	}

	/* Laptop-height screens: a little denser so the dashboard still fits. */
	@media (min-width: 721px) and (max-height: 820px) {
		.panel {
			gap: 8px;
			padding: 14px 16px;
		}
		.grid,
		.weekdays {
			grid-template-rows: repeat(7, 12px);
		}
		.foot {
			margin-top: 4px;
		}
		.stats > div {
			padding: 6px 10px;
		}
		dd {
			font-size: 16px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.grid button {
			transition: none;
		}
		.grid button:hover {
			transform: none;
		}
	}
</style>
