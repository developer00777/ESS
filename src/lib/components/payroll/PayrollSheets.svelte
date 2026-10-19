<script lang="ts">
	/**
	 * The salary report's sheets, in the columns of HR's "Salary Report"
	 * workbook: Leave Balance, To Be Paid, LOP, Stop Salary, HR Comments.
	 * Rows open the person; the same data downloads as CSV or .xlsx.
	 */
	import type { PayrollEmployee, PayrollReport } from '$lib/server/payroll';
	import { salaryActionLabel } from '$lib/payroll';
	import { fmtDate, fmtDays } from './codes';

	type Sheet = 'leave-balance' | 'to-be-paid' | 'lop' | 'stop-salary' | 'hr-comments';
	let {
		sheet,
		report,
		employees,
		canManage,
		onopen
	}: { sheet: Sheet; report: PayrollReport; employees: PayrollEmployee[]; canManage: boolean; onopen: (userId: string) => void } = $props();

	const tenure = (doj: string | null) => (doj ? Math.max(0, (Date.parse(report.asOf) - Date.parse(doj)) / (365 * 86_400_000)).toFixed(1) : '—');
	const paid = $derived(employees.filter((e) => e.action === 'pay'));
	const lop = $derived(paid.filter((e) => e.balance.lopDays > 0).sort((a, b) => b.balance.lopDays - a.balance.lopDays));
	const commented = $derived(employees.filter((e) => e.comment || e.remarks));
	const visible = $derived(new Set(employees.map((e) => e.userId)));

	let pick = $state('');
</script>

{#snippet person(e: { userId: string; name: string; empCode: string })}
	<button type="button" class="who" onclick={(ev) => { ev.stopPropagation(); onopen(e.userId); }}>
		<strong>{e.name}</strong><span>{e.empCode || 'no code'}</span>
	</button>
{/snippet}

<div class="ess-table-shell ess-scroll sheet">
	{#if sheet === 'leave-balance'}
		<p class="def">Opening is the leave balance before the month (or Finance's figure). Availed = approved leave + absences + the missing half of half days. CL = Opening + EL + SL + Comp off − Availed; below zero is loss of pay.</p>
		<table class="ess-table">
			<thead>
				<tr>
					<th>Employee</th><th>Designation</th><th>Department</th><th>Team</th><th class="ess-num">Tenure (yrs)</th><th>DOJ</th>
					<th class="ess-num">Op Leave Bal</th><th class="ess-num">EL</th><th class="ess-num">SL</th><th class="ess-num">Comp off</th>
					<th class="ess-num">Availed</th><th class="ess-num">CL</th><th>LWD</th><th>Remarks</th>
				</tr>
			</thead>
			<tbody>
				{#each employees as e (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td>{@render person(e)}</td>
						<td>{e.designation || '—'}</td><td>{e.department || '—'}</td><td>{e.team || '—'}</td>
						<td class="ess-num">{tenure(e.doj)}</td><td>{fmtDate(e.doj)}</td>
						<td class="ess-num">{fmtDays(e.balance.opening)}{#if e.balance.openingOverridden}<span class="mark" title="Set by Finance">•</span>{/if}</td>
						<td class="ess-num">{fmtDays(e.balance.el)}</td><td class="ess-num">{fmtDays(e.balance.sl)}</td><td class="ess-num">{fmtDays(e.balance.compOff)}</td>
						<td class="ess-num">{fmtDays(e.balance.availed)}</td>
						<td class="ess-num strong" class:bad={e.balance.closing < 0}>{fmtDays(e.balance.closing)}</td>
						<td>{e.lwd ? fmtDate(e.lwd) : ''}</td><td class="remarks">{e.remarks}</td>
					</tr>
				{:else}
					<tr><td colspan="14" class="empty">No one matches these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	{:else if sheet === 'to-be-paid'}
		<table class="ess-table">
			<thead><tr><th class="ess-num">Sl</th><th>Employee</th><th>Designation</th><th>Team</th><th>DOJ</th><th class="ess-num">Paid days</th><th class="ess-num">LOP days</th></tr></thead>
			<tbody>
				{#each paid as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{i + 1}</td><td>{@render person(e)}</td><td>{e.designation || '—'}</td><td>{e.team || '—'}</td><td>{fmtDate(e.doj)}</td>
						<td class="ess-num strong">{fmtDays(e.balance.paidDays)}</td>
						<td class="ess-num" class:bad={e.balance.lopDays > 0}>{e.balance.lopDays ? fmtDays(e.balance.lopDays) : '—'}</td>
					</tr>
				{:else}
					<tr><td colspan="7" class="empty">No one to pay matches these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	{:else if sheet === 'lop'}
		<table class="ess-table">
			<thead><tr><th class="ess-num">Sl</th><th>Employee</th><th>Designation</th><th>Team</th><th class="ess-num">LOP</th><th class="ess-num">Absent</th><th class="ess-num">Half days</th><th class="ess-num">Leave</th></tr></thead>
			<tbody>
				{#each lop as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{i + 1}</td><td>{@render person(e)}</td><td>{e.designation || '—'}</td><td>{e.team || '—'}</td>
						<td class="ess-num strong bad">-{fmtDays(e.balance.lopDays)}</td>
						<td class="ess-num">{e.summary.absent}</td><td class="ess-num">{e.summary.halfDay}</td><td class="ess-num">{e.summary.leave}</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="empty">No loss of pay this month.</td></tr>
				{/each}
			</tbody>
		</table>
	{:else if sheet === 'stop-salary'}
		{#each report.stopSalary as block, b (block.cycleKey)}
			{@const rows = b === 0 ? block.rows.filter((r) => visible.has(r.userId)) : block.rows}
			<h3 class="block">{block.label}{b === 0 ? ' · this month' : ''}</h3>
			<table class="ess-table">
				<thead><tr><th class="ess-num">S. #</th><th>Employee</th><th>Department</th><th>LWD</th><th>Remarks</th><th>DOJ</th><th>{block.label} _ Remarks</th></tr></thead>
				<tbody>
					{#each rows as r, i (r.userId)}
						<tr onclick={() => onopen(r.userId)}>
							<td class="ess-num">{i + 1}</td><td>{@render person(r)}</td><td>{r.department || '—'}</td><td>{fmtDate(r.lwd)}</td>
							<td>{r.remarks || salaryActionLabel(r.action)}</td><td>{fmtDate(r.doj)}</td>
							<td><span class="ess-badge {r.action === 'hold' ? 'ess-badge--warn' : r.action === 'sabbatical' ? 'ess-badge--info' : 'ess-badge--bad'}">{salaryActionLabel(r.action)}</span></td>
						</tr>
					{:else}
						<tr><td colspan="7" class="empty">No stopped or held salaries this month.</td></tr>
					{/each}
				</tbody>
			</table>
		{/each}
	{:else}
		{#if canManage}
			<div class="add">
				<select class="ess-select" bind:value={pick} aria-label="Person to add a comment for">
					<option value="">Add a comment for…</option>
					{#each employees as e (e.userId)}<option value={e.userId}>{e.empCode ? `${e.empCode} · ` : ''}{e.name}</option>{/each}
				</select>
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={!pick} onclick={() => { onopen(pick); pick = ''; }}>Add comment</button>
			</div>
		{/if}
		<table class="ess-table">
			<thead><tr><th class="ess-num">S.No</th><th>Employee</th><th>Comment</th><th>Remarks</th></tr></thead>
			<tbody>
				{#each commented as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{i + 1}</td><td>{@render person(e)}</td><td>{e.comment || '—'}</td><td class="remarks">{e.remarks}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="empty">No HR comments this month{canManage ? ' — open anyone to add one' : ''}.</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.sheet {
		flex: 1 1 auto;
		min-height: 320px;
		max-height: calc(100vh - 230px);
	}
	.def {
		margin: 0;
		padding: 10px 14px;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		border-bottom: 1px solid var(--ess-border);
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover td {
		background: var(--ess-surface-hover);
	}
	.who {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.who span {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		font-family: var(--ess-font-mono);
	}
	.who:focus-visible {
		outline: 3px solid var(--ess-focus-ring);
		border-radius: 4px;
	}
	.strong {
		font-weight: 700;
	}
	.bad {
		color: var(--ess-danger);
	}
	.mark {
		color: var(--ess-primary);
		margin-left: 3px;
	}
	.remarks {
		max-width: 280px;
		white-space: normal;
		color: var(--ess-text-secondary);
	}
	.block {
		margin: 0;
		padding: 12px 14px 6px;
		font-size: 13px;
		font-weight: 700;
	}
	.add {
		display: flex;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--ess-border);
	}
	.add .ess-select {
		max-width: 320px;
	}
	.empty {
		text-align: center;
		padding: 28px;
		color: var(--ess-text-secondary);
		cursor: default;
	}
</style>
