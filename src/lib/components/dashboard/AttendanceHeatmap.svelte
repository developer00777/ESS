<script lang="ts">
	/**
	 * Dashboard panel: this month's totals (days, hours, missing check-outs)
	 * under the title, then the viewer's last 13 weeks of punches
	 * (buildAttendanceHeatmap in $lib/dashboard-analytics), one column per
	 * week with Monday on top, centred in the room left.
	 *
	 * On the laptop dashboard it never scrolls: it reads its own height and,
	 * as that shrinks, turns the totals into compact chips, drops the day
	 * hint and key, then tightens the squares. The totals never hide.
	 */
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import FingerprintPattern from '@lucide/svelte/icons/fingerprint-pattern';
	import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';

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
	// The line under the grid: the same, short enough to always sit on one
	// line (the full wording stays in each square's tooltip).
	const brief = (c: Cell) => (c.level !== -1 && c.recorded && !c.complete ? 'Check-out missing' : describe(c));
</script>

<section class="ess-card panel" aria-labelledby="att-h">
	<div class="fit">
		<header class="p-head">
			<div>
				<h2 id="att-h"><FingerprintPattern size={15} aria-hidden="true" />My attendance</h2>
				<p>Last 13 weeks of punches</p>
			</div>
			<a class="more" href="/attendance" aria-label="Open attendance"><ArrowUpRight size={16} /></a>
		</header>

		<!-- This month's totals, always in view: tiles, or compact chips when
		     the panel is short. -->
		<div class="month-totals">
			<span class="cap">This month</span>
			<dl class="stats">
				<div title="Days with a punch this month"><dt>Days</dt><dd>{analytics.recordedDays}</dd></div>
				<div title="Recorded hours this month"><dt>Hours</dt><dd>{analytics.recordedHours}</dd></div>
				<div class:warn={missingCheckOuts > 0} title="Recent days with a check-in but no check-out">
					<dt>Missing</dt>
					<dd>{#if missingCheckOuts > 0}<a href="/attendance">{missingCheckOuts}</a>{:else}0{/if}</dd>
				</div>
			</dl>
		</div>

		<div class="map">
			<div class="months" aria-hidden="true">
				{#each monthLabels as m, i (i)}<span>{m}</span>{/each}
			</div>
			<div class="body">
				<div class="weekdays" aria-hidden="true">
					{#each ['M', '', 'W', '', 'F', '', 'S'] as d, i (i)}<span>{d}</span>{/each}
				</div>
				<div class="grid" role="group" aria-label="Attendance over the last 13 weeks, Monday through Sunday, oldest week first">
					{#each analytics.heatmap as cell, i (cell.date)}
						<button
							type="button"
							style="--w: {Math.floor(i / 7)}"
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
				<p class="detail" aria-live="polite" title={selectedCell ? `${selectedCell.label}: ${describe(selectedCell)}` : undefined}>
					{#if selectedCell}<b>{selectedCell.label}</b> · {brief(selectedCell)}{:else}<MousePointerClick size={12} aria-hidden="true" />Select a day for its hours{/if}
				</p>
				<span class="legend" aria-hidden="true">Less <i data-level="0"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i> More</span>
			</div>
		</div>
	</div>
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		padding: 16px 18px;
	}
	.fit {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}
	.p-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.p-head h2 {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.p-head h2 :global(svg) {
		flex: none;
		color: var(--ess-primary-text);
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

	/* the heatmap, centred in the room under the totals: one column as wide
	   as the grid, which the month row and the foot line up with */
	.map {
		flex: 1;
		display: grid;
		grid-template-columns: min(316px, 100%);
		place-content: center;
		min-width: 0;
		min-height: 0;
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
	/* a label in the last week ends at the grid's edge instead of running
	   past it (the week before never holds one) */
	.months span:last-child {
		justify-self: end;
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
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 3px;
		margin: 6px 0 0 16px;
		font-size: 11px;
		color: var(--ess-text-muted);
	}
	/* Two fixed rows, the day's line over the key, so picking a day never
	   moves anything: the line is one line long whatever the day says (a
	   short wording; the full one is in its tooltip). */
	.detail {
		margin: 0;
		min-width: 0;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.detail :global(svg) {
		margin-right: 4px;
		vertical-align: -2px;
	}
	.legend {
		justify-self: end;
	}

	/* ---------- motion ----------
	   The squares fill in week by week, the month's tiles rise in turn, and
	   the day line cross-fades when another day is picked. !important
	   lengths: contained motion that plays under reduced motion too (see
	   INTERACTION FEEDBACK in ess-components.css). */
	@keyframes hm-in {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
	}
	@keyframes hm-rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.grid button {
		animation: hm-in 380ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		animation-duration: 380ms !important;
		animation-delay: calc(300ms + var(--w, 0) * 24ms);
	}
	.stats > div {
		animation: hm-rise 460ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		animation-duration: 460ms !important;
		animation-delay: 260ms;
	}
	.stats > div:nth-child(2) {
		animation-delay: 320ms;
	}
	.stats > div:nth-child(3) {
		animation-delay: 380ms;
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

	/* this month's totals, under the title */
	.month-totals {
		display: grid;
		gap: 5px;
	}
	.cap {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ess-text-muted);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin: 0;
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
			padding: 14px 16px;
		}
		.fit {
			gap: 8px;
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


	/* Short laptop screens (about 1280×580): tighter so the dashboard fits. */
	@media (min-width: 721px) and (max-height: 760px) {
		.panel {
			padding: 10px 14px;
		}
		.p-head p {
			display: none;
		}
		.foot {
			margin-top: 4px;
		}
		dt {
			font-size: 10.5px;
		}
		.more {
			width: 26px;
			height: 26px;
		}
		.grid,
		.weekdays {
			grid-template-rows: repeat(7, 11px);
		}
		.stats > div {
			padding: 5px 9px;
		}
		dd {
			margin: 0;
			font-size: 15px;
			line-height: 1.2;
		}
	}

	/* Laptop dashboard: the panel is as tall as its row, so its contents
	   size to the room inside it rather than to themselves, and the steps
	   below keep everything in view without scrolling. Narrower layouts
	   stack the panels at their natural height. */
	@media (min-width: 1101px) and (min-height: 480px) {
		.fit {
			container-type: size;
			overflow: hidden;
		}
	}
	/* short panel: the totals become compact tiles (label over value, so a
	   label is never cut short) rather than hiding, and the caption and
	   subtitle give way */
	@container (max-height: 300px) {
		.p-head p,
		.cap {
			display: none;
		}
		.stats {
			gap: 6px;
		}
		.stats > div {
			padding: 4px 8px;
			border-radius: 8px;
		}
		dt {
			font-size: 10.5px;
		}
		dd {
			margin: 0;
			font-size: 14px;
			line-height: 1.2;
		}
	}
	@container (max-height: 200px) {
		.foot {
			display: none;
		}
	}
	@container (max-height: 150px) {
		.p-head h2 {
			line-height: 1.25;
		}
		.months {
			display: none;
		}
		.more {
			width: 26px;
			height: 26px;
		}
		.grid,
		.weekdays {
			grid-template-rows: repeat(7, 8px);
			gap: 2px;
		}
		.weekdays {
			font-size: 8px;
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
