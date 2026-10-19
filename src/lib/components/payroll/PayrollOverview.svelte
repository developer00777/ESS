<script lang="ts">
	/**
	 * Payroll → Overview: the month at a glance for whoever runs payroll.
	 * Figures lead with the answer (who is paid, who is stopped, how much loss
	 * of pay); the charts show where it comes from. Every chart can flip to a
	 * table of the same numbers.
	 */
	import ChartCard from '$lib/components/analytics/ChartCard.svelte';
	import ColumnChart from '$lib/components/analytics/ColumnChart.svelte';
	import BarList from '$lib/components/analytics/BarList.svelte';
	import ShareBars from '$lib/components/analytics/ShareBars.svelte';
	import Donut from '$lib/components/analytics/Donut.svelte';
	import type { PayrollEmployee, PayrollReport } from '$lib/server/payroll';
	import { fmtDays } from './codes';

	let { report, employees }: { report: PayrollReport; employees: PayrollEmployee[] } = $props();

	const C = { present: 'var(--pr-1)', half: 'var(--pr-4)', absent: 'var(--pr-2)', leave: 'var(--pr-3)', none: 'var(--pr-none)' };

	const paid = $derived(employees.filter((e) => e.action === 'pay'));
	const stopped = $derived(employees.filter((e) => e.action !== 'pay'));
	const onLop = $derived(paid.filter((e) => e.balance.lopDays > 0));
	const lopDays = $derived(onLop.reduce((s, e) => s + e.balance.lopDays, 0));
	const paidDays = $derived(paid.reduce((s, e) => s + e.balance.paidDays, 0));
	const availed = $derived(employees.reduce((s, e) => s + e.balance.availed, 0));

	/* ---- daily attendance across the month (working days only) */
	const elapsed = $derived(report.dates.map((d, i) => ({ d, i })).filter(({ d }) => d <= report.asOf));
	const daily = $derived.by(() => {
		const count = (i: number, kinds: string[]) => employees.filter((e) => kinds.includes(e.days[i]?.kind)).length;
		return {
			labels: elapsed.map(({ d }) => String(Number(d.slice(8)))),
			series: [
				{ name: 'Present', color: C.present, values: elapsed.map(({ i }) => count(i, ['present'])) },
				{ name: 'Half day', color: C.half, values: elapsed.map(({ i }) => count(i, ['half'])) },
				{ name: 'On leave', color: C.leave, values: elapsed.map(({ i }) => count(i, ['leave', 'pink', 'compoff', 'compoff_half'])) },
				{ name: 'Absent', color: C.absent, values: elapsed.map(({ i }) => count(i, ['absent'])) }
			]
		};
	});

	/* ---- how each team's working days went */
	const KEYS = [
		{ name: 'Present', color: C.present, ink: '#fff' },
		{ name: 'Half day', color: C.half, ink: '#1d1d1f' },
		{ name: 'Leave', color: C.leave, ink: '#fff' },
		{ name: 'Absent', color: C.absent, ink: '#fff' }
	];
	const byTeam = $derived.by(() => {
		const groups = new Map<string, PayrollEmployee[]>();
		for (const e of employees) {
			const k = e.team || e.department || 'No team';
			groups.set(k, [...(groups.get(k) ?? []), e]);
		}
		const row = (name: string, list: PayrollEmployee[]) => {
			const counts = {
				Present: list.reduce((s, e) => s + e.summary.present, 0),
				'Half day': list.reduce((s, e) => s + e.summary.halfDay, 0),
				Leave: list.reduce((s, e) => s + e.summary.leave + e.summary.pink + e.summary.compOff + e.summary.compOffHalf, 0),
				Absent: list.reduce((s, e) => s + e.summary.absent, 0)
			};
			return { name, counts, total: Object.values(counts).reduce((a, b) => a + b, 0), people: list.length };
		};
		const teams = [...groups.entries()].map(([k, v]) => row(k, v)).sort((a, b) => b.people - a.people).slice(0, 8);
		return [row('Everyone', employees), ...teams];
	});

	const lopByTeam = $derived.by(() => {
		const m = new Map<string, number>();
		for (const e of onLop) m.set(e.team || e.department || 'No team', (m.get(e.team || e.department || 'No team') ?? 0) + e.balance.lopDays);
		return [...m.entries()].map(([name, count]) => ({ name, count: Math.round(count * 10) / 10 })).sort((a, b) => b.count - a.count).slice(0, 8);
	});

	const actions = $derived([
		{ name: 'Pay', count: paid.length, color: C.present },
		{ name: 'Stop salary', count: employees.filter((e) => e.action === 'stop').length, color: C.absent },
		{ name: 'Hold salary', count: employees.filter((e) => e.action === 'hold').length, color: C.half },
		{ name: 'Sabbatical', count: employees.filter((e) => e.action === 'sabbatical').length, color: C.leave }
	].filter((a) => a.count > 0));
</script>

<div class="pr-overview">
	<div class="ess-figures figures">
		<div class="ess-figure">
			<div>
				<div class="ess-figure__value">{employees.length}</div>
				<div class="ess-figure__label">On this month's payroll</div>
			</div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--ok"></span>
			<div>
				<div class="ess-figure__value">{paid.length}</div>
				<div class="ess-figure__label">To be paid · {fmtDays(paidDays)} paid days</div>
			</div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--bad"></span>
			<div>
				<div class="ess-figure__value">{stopped.length}</div>
				<div class="ess-figure__label">Stopped, held or on sabbatical</div>
			</div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--warn"></span>
			<div>
				<div class="ess-figure__value">{fmtDays(lopDays)}</div>
				<div class="ess-figure__label">Days of LOP · {onLop.length} {onLop.length === 1 ? 'person' : 'people'}</div>
			</div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--neutral"></span>
			<div>
				<div class="ess-figure__value">{fmtDays(availed)}</div>
				<div class="ess-figure__label">Leave days drawn</div>
			</div>
		</div>
	</div>

	{#if report.inProgress}
		<p class="running">This month is still running: figures cover {report.dates.filter((d) => d <= report.asOf).length} of {report.dates.length} days, and days still to come are not counted as loss of pay.</p>
	{/if}

	<div class="grid">
		<ChartCard title="Who turned up, day by day" sub="People present, on a half day, on leave and absent each working day. Week offs and holidays are left out." wide cls="span2">
			{#snippet legend()}
				<span class="legend">
					{#each daily.series as s (s.name)}<span><i style:background={s.color}></i>{s.name}</span>{/each}
				</span>
			{/snippet}
			{#snippet chart()}
				<ColumnChart labels={daily.labels} series={daily.series} stacked height={190} label="People by attendance each day of the month" />
			{/snippet}
			{#snippet table()}
				<table class="ess-table compact">
					<thead><tr><th>Day</th>{#each daily.series as s (s.name)}<th class="ess-num">{s.name}</th>{/each}</tr></thead>
					<tbody>
						{#each daily.labels as l, i (i)}
							<tr><td>{l}</td>{#each daily.series as s (s.name)}<td class="ess-num">{s.values[i]}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			{/snippet}
		</ChartCard>

		<ChartCard title="Salary this month" sub="Paid as computed, or stopped, held or on sabbatical.">
			{#snippet chart()}
				<div class="donut"><Donut items={actions} centre={`${paid.length}/${employees.length}`} /></div>
			{/snippet}
			{#snippet table()}
				<table class="ess-table compact">
					<thead><tr><th>Salary</th><th class="ess-num">People</th></tr></thead>
					<tbody>{#each actions as a (a.name)}<tr><td>{a.name}</td><td class="ess-num">{a.count}</td></tr>{/each}</tbody>
				</table>
			{/snippet}
		</ChartCard>

		<ChartCard title="Working days by team" sub="How each team's working days split, largest teams first." wide cls="span2">
			{#snippet legend()}
				<span class="legend">{#each KEYS as k (k.name)}<span><i style:background={k.color}></i>{k.name}</span>{/each}</span>
			{/snippet}
			{#snippet chart()}
				<ShareBars keys={KEYS} rows={byTeam} />
			{/snippet}
			{#snippet table()}
				<table class="ess-table compact">
					<thead><tr><th>Team</th><th class="ess-num">People</th>{#each KEYS as k (k.name)}<th class="ess-num">{k.name}</th>{/each}</tr></thead>
					<tbody>
						{#each byTeam as r (r.name)}
							<tr><td>{r.name}</td><td class="ess-num">{r.people}</td>{#each KEYS as k (k.name)}<td class="ess-num">{fmtDays(r.counts[k.name as keyof typeof r.counts])}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			{/snippet}
		</ChartCard>

		<ChartCard title="Loss of pay by team" sub="Days the leave balance could not cover.">
			{#snippet chart()}
				{#if lopByTeam.length}
					<BarList items={lopByTeam} color={C.absent} unit=" days" />
				{:else}
					<p class="none">No loss of pay this month.</p>
				{/if}
			{/snippet}
			{#snippet table()}
				<table class="ess-table compact">
					<thead><tr><th>Team</th><th class="ess-num">LOP days</th></tr></thead>
					<tbody>{#each lopByTeam as r (r.name)}<tr><td>{r.name}</td><td class="ess-num">{fmtDays(r.count)}</td></tr>{/each}</tbody>
				</table>
			{/snippet}
		</ChartCard>
	</div>
</div>

<style>
	/* Chart colours: the HR analytics palette, assigned by meaning —
	   present blue, absent orange, leave green, half day amber. */
	.pr-overview {
		--pr-1: #2a78d6;
		--pr-2: #eb6834;
		--pr-3: #1baf7a;
		--pr-4: #eda100;
		--pr-none: #d2d2d8;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 16px;
	}
	:global([data-ess-theme='dark']) .pr-overview {
		--pr-1: #3987e5;
		--pr-2: #d95926;
		--pr-3: #199e70;
		--pr-4: #c98500;
		--pr-none: #3a3e57;
	}
	.figures .ess-figure__label {
		font-size: 12.5px;
	}
	.running {
		margin: 0;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.grid :global(.span2) {
		grid-column: span 2;
	}
	.legend {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 12px;
		color: var(--ess-text-secondary);
	}
	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 3px;
		margin-right: 5px;
		vertical-align: -1px;
	}
	.donut {
		display: grid;
		place-items: center;
		padding: 8px 0;
	}
	.none {
		margin: 0;
		color: var(--ess-text-secondary);
		font-size: 13px;
	}
	.compact :global(td),
	.compact :global(th) {
		padding: 6px 10px;
	}
	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.grid :global(.span2) {
			grid-column: auto;
		}
	}
</style>
