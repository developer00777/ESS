<script lang="ts">
	/**
	 * The planner card's "My attendance" view: the viewer's last 13 weeks of
	 * punches (buildAttendanceHeatmap in $lib/dashboard-analytics), one column
	 * per week, Monday at the top, beside this month's totals.
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

	const weeks = $derived.by(() => {
		const out: Cell[][] = [];
		analytics.heatmap.forEach((c, i) => (out[Math.floor(i / 7)] ??= []).push(c));
		return out;
	});

	// A month name over the first week that holds its 1st (and over week one).
	const monthName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' });
	const monthLabels = $derived(
		weeks.map((w, i) => {
			const first = w.find((c) => c.date.endsWith('-01'));
			return first ? monthName(first.date) : i === 0 ? monthName(w[0].date) : '';
		})
	);

	const describe = (c: Cell) =>
		c.level === -1 ? 'Future' : !c.recorded ? 'No punch recorded' : !c.complete ? 'Check-in recorded, check-out missing' : `${c.hours} recorded hours`;

	const monthLabel = $derived(new Date(`${analytics.today}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long' }));
</script>

<div class="att">
	<div class="map">
		<div class="months" aria-hidden="true">
			{#each monthLabels as m, i (i)}<span>{m}</span>{/each}
		</div>
		<div class="body">
			<div class="weekdays" aria-hidden="true">
				{#each ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] as d, i (i)}<span>{d}</span>{/each}
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
				{#if selectedCell}<b>{selectedCell.label}</b> · {describe(selectedCell)}{:else}Select a day for its hours.{/if}
			</p>
			<span class="legend" aria-hidden="true">
				<span class="key"><i data-level="1"></i> No check-out</span>
				Less <i data-level="0"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> More
			</span>
		</div>
	</div>

	<dl class="stats">
		<div><dt>Days recorded</dt><dd>{analytics.recordedDays}<small> in {monthLabel}</small></dd></div>
		<div><dt>Hours recorded</dt><dd>{analytics.recordedHours}<small> hrs</small></dd></div>
		<div><dt>Complete days</dt><dd>{analytics.completeDays}<small> in and out</small></dd></div>
		<div class:warn={missingCheckOuts > 0}>
			<dt>Missing check-outs</dt>
			<dd>{missingCheckOuts}{#if missingCheckOuts > 0}<a href="/attendance" class="fix">Review</a>{/if}</dd>
		</div>
		<a class="more" href="/attendance">Open attendance <ArrowUpRight size={14} /></a>
	</dl>
</div>

<style>
	.att {
		display: flex;
		gap: 28px;
		align-items: stretch;
		margin-top: 14px;
		min-width: 0;
	}
	.map {
		flex: 0 0 auto;
		min-width: 0;
	}

	.months,
	.grid {
		display: grid;
		grid-template-columns: repeat(13, 18px);
		gap: 5px;
	}
	.months {
		margin-left: 36px;
		margin-bottom: 4px;
		font-size: 11px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.body {
		display: flex;
		gap: 8px;
	}
	.weekdays {
		display: grid;
		grid-template-rows: repeat(7, 18px);
		gap: 5px;
		width: 28px;
		font-size: 10.5px;
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
		grid-template-rows: repeat(7, 18px);
	}

	.grid button,
	.legend i {
		padding: 0;
		min-width: 0;
		border: 1px solid var(--ess-border-subtle);
		border-radius: 4px;
		background: var(--ess-sunken);
	}
	.grid button {
		cursor: pointer;
		transition: transform 0.12s ease;
	}
	.grid button:hover,
	.grid button[aria-pressed='true'] {
		transform: scale(1.15);
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
		flex-wrap: wrap;
		gap: 6px 16px;
		margin: 10px 0 0 36px;
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	.detail {
		margin: 0;
	}
	.detail b {
		color: var(--ess-text);
		font-weight: 600;
	}
	.legend,
	.key {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.key {
		margin-right: 10px;
	}
	.legend i {
		width: 11px;
		height: 11px;
	}

	.stats {
		flex: 1 1 auto;
		min-width: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr auto;
		gap: 10px;
		margin: 0;
	}
	.stats > div {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
	}
	.stats > div.warn {
		background: var(--ess-warning-bg);
	}
	dt {
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
	dd {
		display: flex;
		align-items: baseline;
		gap: 2px;
		margin: 2px 0 0;
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	dd small {
		font-size: 11.5px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--ess-text-muted);
	}
	.fix {
		margin-left: auto;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0;
		color: var(--ess-warning);
	}
	.more {
		grid-column: 1 / -1;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		justify-self: start;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ess-primary-text);
		text-decoration: none;
	}
	.more:hover {
		text-decoration: underline;
	}

	@media (min-width: 721px) and (max-height: 820px) {
		.att {
			margin-top: 2px;
		}
		.months,
		.grid {
			grid-template-columns: repeat(13, 14px);
			gap: 4px;
		}
		.grid,
		.weekdays {
			grid-template-rows: repeat(7, 14px);
			gap: 4px;
		}
		.foot {
			margin-top: 6px;
		}
		.stats {
			gap: 8px;
		}
		.stats > div {
			padding: 8px 12px;
		}
	}
	@media (max-width: 1000px) {
		.att {
			flex-direction: column;
			gap: 16px;
		}
		.stats {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			grid-template-rows: auto;
		}
	}
	@media (max-width: 720px) {
		.map {
			width: 100%;
		}
		.months,
		.grid {
			grid-template-columns: repeat(13, minmax(0, 1fr));
		}
		.stats {
			grid-template-columns: 1fr 1fr;
		}
		.months {
			margin-left: 0;
		}
		.weekdays {
			display: none;
		}
		.grid,
		.months {
			gap: 3px;
		}
		.grid {
			grid-template-rows: repeat(7, 13px);
		}
		.foot {
			margin-left: 0;
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
