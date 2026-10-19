<script lang="ts">
	/**
	 * Payroll → Attendance tracker: HR's "Payroll Attendance" sheet as a grid.
	 * One row per person, one cell per day of the payroll month (26th → 25th)
	 * with the day's code, then the sheet's totals. Hover a cell for the
	 * biometric and ProHance hours behind it; open a row for the person.
	 */
	import type { PayrollEmployee, PayrollReport } from '$lib/server/payroll';
	import { hhmm } from '$lib/payroll';
	import { KIND_LABEL, KIND_LEGEND, dow, fmtDate, fmtDays } from './codes';

	let { report, employees, onopen }: { report: PayrollReport; employees: PayrollEmployee[]; onopen: (userId: string) => void } = $props();

	function tip(e: PayrollEmployee, i: number): string {
		const d = e.days[i];
		const date = report.dates[i];
		const parts = [`${dow(date)} ${fmtDate(date)}`, d.note ? `${KIND_LABEL[d.kind]} · ${d.note}` : KIND_LABEL[d.kind]];
		if (d.bio) parts.push(`Biometric ${hhmm(d.bio)}`);
		if (d.pro) parts.push(`ProHance ${hhmm(d.pro)}`);
		return parts.join('\n');
	}
</script>

<div class="tracker">
	<div class="legend" aria-label="What the codes mean">
		{#each KIND_LEGEND as k (k.kind)}
			<span class="key"><b class="c k-{k.kind}">{k.code}</b>{k.label}</span>
		{/each}
		<span class="rule">P: biometric 6:55+ or ProHance 5:55+ · H: either 2:55+ · Total days = P + H/2 + WO + CH/2 + CO + HD + PH</span>
	</div>

	<div class="ess-table-shell ess-scroll grid-shell">
		<table class="ess-table grid">
			<thead>
				<tr>
					<th class="sticky s1">Emp ID</th>
					<th class="sticky s2">Employee</th>
					{#each report.dates as d (d)}
						<th class="day" class:today={d === report.asOf && report.inProgress} title={fmtDate(d)}>
							<span>{dow(d).slice(0, 2)}</span>{Number(d.slice(8))}
						</th>
					{/each}
					<th class="num" title="Present">P</th>
					<th class="num" title="Absent">A</th>
					<th class="num" title="Half day">H</th>
					<th class="num" title="Week off">WO</th>
					<th class="num" title="Half-day comp off">CH</th>
					<th class="num" title="Comp off">CO</th>
					<th class="num" title="Pink leave">PH</th>
					<th class="num" title="Holidays">HD</th>
					<th class="num" title="Leave (EL, SL…)">Lv</th>
					<th class="num strong" title="Total days: P + H/2 + WO + CH/2 + CO + HD + PH">Total</th>
					<th class="num" title="Payroll days in the cycle">Days</th>
					<th class="num strong" title="Actual LOP: days not covered by Total days (leave and absences)">Uncov.</th>
				</tr>
			</thead>
			<tbody>
				{#each employees as e (e.userId)}
					<tr onclick={() => onopen(e.userId)} class:inactive={e.status === 'Inactive'}>
						<td class="sticky s1 code">{e.empCode || '—'}</td>
						<td class="sticky s2 who">
							<button type="button" class="name" onclick={(ev) => { ev.stopPropagation(); onopen(e.userId); }}>{e.name}</button>
							<span>{e.team || e.department || '—'}</span>
						</td>
						{#each e.days as d, i (i)}
							<td class="cell"><b class="c k-{d.kind}" title={tip(e, i)}>{d.code}</b></td>
						{/each}
						<td class="num">{e.summary.present}</td>
						<td class="num" class:bad={e.summary.absent > 0}>{e.summary.absent}</td>
						<td class="num">{e.summary.halfDay}</td>
						<td class="num">{e.summary.weekOff}</td>
						<td class="num">{e.summary.compOffHalf}</td>
						<td class="num">{e.summary.compOff}</td>
						<td class="num">{e.summary.pink}</td>
						<td class="num">{e.summary.holidays}</td>
						<td class="num">{e.summary.leave}</td>
						<td class="num strong">{fmtDays(e.summary.totalDays)}</td>
						<td class="num">{e.summary.cycleDays}</td>
						<td class="num strong" class:bad={e.summary.uncoveredDays > 0}>{fmtDays(e.summary.uncoveredDays)}</td>
					</tr>
				{:else}
					<tr><td colspan={report.dates.length + 14} class="empty">No one matches these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.tracker {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		flex: 1 1 auto;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		font-size: 12px;
		color: var(--ess-text-secondary);
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.rule {
		flex-basis: 100%;
		font-size: 11.5px;
	}
	.grid-shell {
		flex: 1 1 auto;
		min-height: 320px;
		max-height: calc(100vh - 250px);
	}
	.grid {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12px;
	}
	.grid th,
	.grid td {
		padding: 4px 6px;
		white-space: nowrap;
	}
	.grid thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--ess-surface);
	}
	.sticky {
		position: sticky;
		z-index: 1;
		background: var(--ess-surface);
	}
	thead .sticky {
		z-index: 3;
	}
	.s1 {
		left: 0;
		min-width: 86px;
	}
	.s2 {
		left: 86px;
		min-width: 190px;
		max-width: 220px;
		box-shadow: 1px 0 0 var(--ess-border);
	}
	.code {
		font-family: var(--ess-font-mono);
		font-size: 11.5px;
		color: var(--ess-text-secondary);
	}
	.who {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.who span {
		font-size: 11px;
		color: var(--ess-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name {
		all: unset;
		cursor: pointer;
		font-weight: 600;
		color: var(--ess-text);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name:focus-visible {
		outline: 3px solid var(--ess-focus-ring);
		border-radius: 4px;
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover td {
		background: var(--ess-surface-hover);
	}
	tr.inactive .who .name {
		color: var(--ess-text-secondary);
	}
	.day {
		text-align: center;
		font-weight: 600;
		min-width: 30px;
	}
	.day span {
		display: block;
		font-size: 10px;
		font-weight: 500;
		color: var(--ess-text-muted);
	}
	.day.today {
		color: var(--ess-primary-text);
	}
	.cell {
		text-align: center;
		padding: 2px !important;
	}
	.c {
		display: inline-grid;
		place-items: center;
		min-width: 26px;
		height: 22px;
		padding: 0 3px;
		border-radius: 5px;
		font-size: 10.5px;
		font-weight: 600;
		box-sizing: border-box;
	}
	.k-present {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.k-half {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.k-absent {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.k-leave {
		background: var(--ess-ev-purple-bg);
		color: var(--ess-ev-purple);
	}
	.k-pink {
		background: var(--ess-pink-bg);
		color: var(--ess-pink);
	}
	.k-compoff,
	.k-compoff_half {
		background: var(--ess-ev-green-bg);
		color: var(--ess-ev-green);
	}
	.k-weekoff {
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
	}
	.k-holiday {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.k-not_joined,
	.k-exited {
		background: var(--ess-cell-off);
		color: var(--ess-text-muted);
	}
	.k-upcoming {
		border: 1px dashed var(--ess-border);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.strong {
		font-weight: 700;
	}
	.bad {
		color: var(--ess-danger);
	}
	.empty {
		text-align: center;
		padding: 28px;
		color: var(--ess-text-secondary);
	}
</style>
