<script lang="ts">
	/**
	 * One person's payroll month: how the days went, how the leave balance
	 * moved, and — with "Edit payroll" — Finance's entries for the month:
	 * salary action, last working day, opening balance, HR comment.
	 */
	import { invalidateAll } from '$app/navigation';
	import X from '@lucide/svelte/icons/x';
	import type { PayrollEmployee, PayrollReport } from '$lib/server/payroll';
	import { SALARY_ACTIONS, salaryActionLabel } from '$lib/payroll';
	import { fmtDate, fmtDays } from './codes';

	let { person, report, canManage, onclose }: { person: PayrollEmployee; report: PayrollReport; canManage: boolean; onclose: () => void } = $props();

	const p = $derived(person);
	let action = $state('');
	let lwd = $state('');
	let opening = $state('');
	let comment = $state('');
	let remarks = $state('');
	let saving = $state(false);
	let error = $state('');

	// Reset the form whenever a different person is opened.
	$effect(() => {
		action = p.actionChosen ? p.action : '';
		lwd = p.lwd ?? '';
		opening = p.balance.openingOverridden ? String(p.balance.opening) : '';
		comment = p.comment;
		remarks = p.remarks;
		error = '';
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		error = '';
		try {
			const res = await fetch('/api/payroll/adjustments', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cycleKey: report.cycleKey,
					userId: p.userId,
					salaryAction: action || null,
					lastWorkingDay: lwd || null,
					openingBalance: opening === '' ? null : Number(opening),
					comment: comment || null,
					remarks: remarks || null
				})
			});
			if (!res.ok) {
				error = (await res.json().catch(() => ({}))).message ?? 'Could not save';
				return;
			}
			await invalidateAll();
			onclose();
		} finally {
			saving = false;
		}
	}

	const COMMENTS = ['Maternity Leave', 'Salary revert', 'Salary deduction', 'Notice period', 'Sabbatical leave', 'Absconding', 'Full & final pending'];
	const autoAction = $derived(p.lwd && p.lwd <= report.endDate ? 'Stop salary (left on ' + fmtDate(p.lwd) + ')' : 'Pay');

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="ess-scrim" role="presentation" onclick={onclose}></div>
<div class="ess-drawer sheet" role="dialog" aria-modal="true" aria-labelledby="pp-title">
	<header class="head">
		<div>
			<h2 id="pp-title" class="ess-h2">{p.name}</h2>
			<p class="sub">{[p.empCode, p.designation, p.team || p.department].filter(Boolean).join(' · ')}</p>
			<p class="sub">Joined {fmtDate(p.doj)}{p.lwd ? ` · last working day ${fmtDate(p.lwd)}` : ''} · {report.shortLabel} ({report.cycleLabel})</p>
		</div>
		<button type="button" class="ess-icon-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
	</header>

	<div class="body">
		<section>
			<h3>Days this month</h3>
			<dl class="stats">
				<div><dt>Present</dt><dd>{p.summary.present}</dd></div>
				<div><dt>Half days</dt><dd>{p.summary.halfDay}</dd></div>
				<div><dt>Absent</dt><dd class:bad={p.summary.absent > 0}>{p.summary.absent}</dd></div>
				<div><dt>Leave</dt><dd>{p.summary.leave}</dd></div>
				<div><dt>Week offs</dt><dd>{p.summary.weekOff}</dd></div>
				<div><dt>Holidays</dt><dd>{p.summary.holidays}</dd></div>
				<div><dt>Comp off</dt><dd>{fmtDays(p.summary.compOffDays)}</dd></div>
				<div><dt>Pink leave</dt><dd>{p.summary.pink}</dd></div>
				<div><dt>Total days</dt><dd class="strong">{fmtDays(p.summary.totalDays)}</dd></div>
			</dl>
		</section>

		<section>
			<h3>Leave balance and pay</h3>
			<table class="bal">
				<tbody>
					<tr><td>Opening balance{p.balance.openingOverridden ? ' (set by Finance)' : ''}</td><td>{fmtDays(p.balance.opening)}</td></tr>
					<tr><td>+ Earned leave credited</td><td>{fmtDays(p.balance.el)}</td></tr>
					<tr><td>+ Sick leave credited</td><td>{fmtDays(p.balance.sl)}</td></tr>
					<tr><td>+ Comp off earned</td><td>{fmtDays(p.balance.compOff)}</td></tr>
					<tr><td>− Availed (leave, absences, half days)</td><td>{fmtDays(p.balance.availed)}</td></tr>
					<tr class="total"><td>Closing balance</td><td class:bad={p.balance.closing < 0}>{fmtDays(p.balance.closing)}</td></tr>
					<tr><td>Loss of pay</td><td class:bad={p.balance.lopDays > 0}>{fmtDays(p.balance.lopDays)} days</td></tr>
					<tr class="total"><td>Paid days of {p.summary.cycleDays}</td><td>{fmtDays(p.balance.paidDays)}</td></tr>
					<tr><td>Salary</td><td>{salaryActionLabel(p.action)}{p.actionChosen ? '' : ' (automatic)'}</td></tr>
				</tbody>
			</table>
		</section>

		{#if canManage}
			<form onsubmit={save} class="form">
				<h3>Finance entries for {report.shortLabel}</h3>
				<label class="ess-field">
					<span class="ess-label">Salary</span>
					<select class="ess-select" bind:value={action}>
						<option value="">Automatic — {autoAction}</option>
						{#each SALARY_ACTIONS as a (a.value)}<option value={a.value}>{a.label}</option>{/each}
					</select>
				</label>
				<label class="ess-field">
					<span class="ess-label">Last working day</span>
					<input class="ess-input" type="date" bind:value={lwd} />
				</label>
				<label class="ess-field">
					<span class="ess-label">Opening leave balance</span>
					<input class="ess-input" type="number" step="0.5" bind:value={opening} placeholder={p.balance.openingOverridden ? 'Leave blank to use the computed figure' : `Computed: ${fmtDays(p.balance.opening)}`} />
				</label>
				<label class="ess-field">
					<span class="ess-label">HR comment</span>
					<input class="ess-input" list="pp-comments" bind:value={comment} maxlength="120" placeholder="e.g. Maternity Leave" />
					<datalist id="pp-comments">{#each COMMENTS as c (c)}<option value={c}></option>{/each}</datalist>
				</label>
				<label class="ess-field">
					<span class="ess-label">Remarks</span>
					<textarea class="ess-input ess-textarea" rows="3" bind:value={remarks} maxlength="500" placeholder="e.g. Revert back 1 day's salary from Aug'26 payroll"></textarea>
				</label>
				{#if error}<p class="err" role="alert">{error}</p>{/if}
				<div class="actions">
					<button type="button" class="ess-btn ess-btn--secondary" onclick={onclose}>Cancel</button>
					<button type="submit" class="ess-btn ess-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
				</div>
			</form>
		{:else if p.comment || p.remarks}
			<section>
				<h3>HR comment</h3>
				<p>{p.comment}{p.comment && p.remarks ? ' — ' : ''}{p.remarks}</p>
			</section>
		{/if}
	</div>
</div>

<style>
	.sheet {
		z-index: 60;
	}
	.ess-scrim {
		z-index: 59;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px 14px;
		border-bottom: 1px solid var(--ess-border);
	}
	.sub {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.body {
		flex: 1 1 auto;
		overflow-y: auto;
		padding: 16px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 700;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 0;
	}
	.stats div {
		padding: 8px 10px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
	}
	.stats dt {
		font-size: 11.5px;
		color: var(--ess-text-secondary);
	}
	.stats dd {
		margin: 2px 0 0;
		font-size: 17px;
		font-weight: 600;
	}
	.bal {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.bal td {
		padding: 5px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.bal td:last-child {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bal .total td {
		font-weight: 700;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 4px;
		border-top: 1px solid var(--ess-border);
	}
	.form h3 {
		margin-top: 14px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.strong {
		font-weight: 700;
	}
	.bad {
		color: var(--ess-danger);
	}
	.err {
		margin: 0;
		color: var(--ess-danger);
		font-size: 13px;
	}
</style>
