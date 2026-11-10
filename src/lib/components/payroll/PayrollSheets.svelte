<script lang="ts">
	/**
	 * The salary report's sheets, in the columns of HR's "Salary Report"
	 * workbook: Leave Balance, To Be Paid, LOP, Stop Salary, HR Comments.
	 * Rows open the person; the same data downloads as CSV or .xlsx.
	 */
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import SortButton from '$lib/components/table/SortButton.svelte';
	import TablePager from '$lib/components/table/TablePager.svelte';
	import { TableView } from '$lib/ui/table-view.svelte';
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

	/* Sorting and paging, one view per sheet (the stop-salary blocks stay as they are). */
	const tenureMs = (doj: string | null) => (doj ? Date.parse(report.asOf) - Date.parse(doj) : null);
	const balanceView = new TableView(() => employees, {
		name: (e) => e.name,
		designation: (e) => e.designation,
		department: (e) => e.department,
		team: (e) => e.team,
		tenure: (e) => tenureMs(e.doj),
		doj: (e) => e.doj,
		opening: (e) => e.balance.opening,
		el: (e) => e.balance.el,
		sl: (e) => e.balance.sl,
		compOff: (e) => e.balance.compOff,
		availed: (e) => e.balance.availed,
		closing: (e) => e.balance.closing,
		lwd: (e) => e.lwd,
		remarks: (e) => e.remarks
	});
	const paidView = new TableView(() => paid, {
		name: (e) => e.name,
		designation: (e) => e.designation,
		team: (e) => e.team,
		doj: (e) => e.doj,
		paidDays: (e) => e.balance.paidDays,
		lopDays: (e) => e.balance.lopDays || null
	});
	const lopView = new TableView(() => lop, {
		name: (e) => e.name,
		designation: (e) => e.designation,
		team: (e) => e.team,
		lop: (e) => e.balance.lopDays,
		absent: (e) => e.summary.absent,
		halfDay: (e) => e.summary.halfDay,
		leave: (e) => e.summary.leave
	});
	const commentView = new TableView(() => commented, {
		name: (e) => e.name,
		comment: (e) => e.comment,
		remarks: (e) => e.remarks
	});
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
					<th aria-sort={balanceView.ariaSort('name')}><SortButton view={balanceView} key="name">Employee</SortButton></th>
					<th aria-sort={balanceView.ariaSort('designation')}><SortButton view={balanceView} key="designation">Designation</SortButton></th>
					<th aria-sort={balanceView.ariaSort('department')}><SortButton view={balanceView} key="department">Department</SortButton></th>
					<th aria-sort={balanceView.ariaSort('team')}><SortButton view={balanceView} key="team">Team</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('tenure')}><SortButton view={balanceView} key="tenure">Tenure (yrs)</SortButton></th>
					<th aria-sort={balanceView.ariaSort('doj')}><SortButton view={balanceView} key="doj">DOJ</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('opening')}><SortButton view={balanceView} key="opening">Op Leave Bal</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('el')}><SortButton view={balanceView} key="el">EL</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('sl')}><SortButton view={balanceView} key="sl">SL</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('compOff')}><SortButton view={balanceView} key="compOff">Comp off</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('availed')}><SortButton view={balanceView} key="availed">Availed</SortButton></th>
					<th class="ess-num" aria-sort={balanceView.ariaSort('closing')}><SortButton view={balanceView} key="closing">CL</SortButton></th>
					<th aria-sort={balanceView.ariaSort('lwd')}><SortButton view={balanceView} key="lwd">LWD</SortButton></th>
					<th aria-sort={balanceView.ariaSort('remarks')}><SortButton view={balanceView} key="remarks">Remarks</SortButton></th>
				</tr>
			</thead>
			<tbody>
				{#each balanceView.rows as e (e.userId)}
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
			<thead>
				<tr>
					<th class="ess-num">Sl</th>
					<th aria-sort={paidView.ariaSort('name')}><SortButton view={paidView} key="name">Employee</SortButton></th>
					<th aria-sort={paidView.ariaSort('designation')}><SortButton view={paidView} key="designation">Designation</SortButton></th>
					<th aria-sort={paidView.ariaSort('team')}><SortButton view={paidView} key="team">Team</SortButton></th>
					<th aria-sort={paidView.ariaSort('doj')}><SortButton view={paidView} key="doj">DOJ</SortButton></th>
					<th class="ess-num" aria-sort={paidView.ariaSort('paidDays')}><SortButton view={paidView} key="paidDays">Paid days</SortButton></th>
					<th class="ess-num" aria-sort={paidView.ariaSort('lopDays')}><SortButton view={paidView} key="lopDays">LOP days</SortButton></th>
				</tr>
			</thead>
			<tbody>
				{#each paidView.rows as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{paidView.from + i}</td><td>{@render person(e)}</td><td>{e.designation || '—'}</td><td>{e.team || '—'}</td><td>{fmtDate(e.doj)}</td>
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
			<thead>
				<tr>
					<th class="ess-num">Sl</th>
					<th aria-sort={lopView.ariaSort('name')}><SortButton view={lopView} key="name">Employee</SortButton></th>
					<th aria-sort={lopView.ariaSort('designation')}><SortButton view={lopView} key="designation">Designation</SortButton></th>
					<th aria-sort={lopView.ariaSort('team')}><SortButton view={lopView} key="team">Team</SortButton></th>
					<th class="ess-num" aria-sort={lopView.ariaSort('lop')}><SortButton view={lopView} key="lop">LOP</SortButton></th>
					<th class="ess-num" aria-sort={lopView.ariaSort('absent')}><SortButton view={lopView} key="absent">Absent</SortButton></th>
					<th class="ess-num" aria-sort={lopView.ariaSort('halfDay')}><SortButton view={lopView} key="halfDay">Half days</SortButton></th>
					<th class="ess-num" aria-sort={lopView.ariaSort('leave')}><SortButton view={lopView} key="leave">Leave</SortButton></th>
				</tr>
			</thead>
			<tbody>
				{#each lopView.rows as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{lopView.from + i}</td><td>{@render person(e)}</td><td>{e.designation || '—'}</td><td>{e.team || '—'}</td>
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
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={!pick} onclick={() => { onopen(pick); pick = ''; }}><MessageSquarePlus size={14} /> Add comment</button>
			</div>
		{/if}
		<table class="ess-table">
			<thead>
				<tr>
					<th class="ess-num">S.No</th>
					<th aria-sort={commentView.ariaSort('name')}><SortButton view={commentView} key="name">Employee</SortButton></th>
					<th aria-sort={commentView.ariaSort('comment')}><SortButton view={commentView} key="comment">Comment</SortButton></th>
					<th aria-sort={commentView.ariaSort('remarks')}><SortButton view={commentView} key="remarks">Remarks</SortButton></th>
				</tr>
			</thead>
			<tbody>
				{#each commentView.rows as e, i (e.userId)}
					<tr onclick={() => onopen(e.userId)}>
						<td class="ess-num">{commentView.from + i}</td><td>{@render person(e)}</td><td>{e.comment || '—'}</td><td class="remarks">{e.remarks}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="empty">No HR comments this month{canManage ? ' — open anyone to add one' : ''}.</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
{#if sheet === 'leave-balance'}
	<TablePager view={balanceView} noun="people" />
{:else if sheet === 'to-be-paid'}
	<TablePager view={paidView} noun="people" />
{:else if sheet === 'lop'}
	<TablePager view={lopView} noun="people" />
{:else if sheet === 'hr-comments'}
	<TablePager view={commentView} noun="comments" />
{/if}

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
