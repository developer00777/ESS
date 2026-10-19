<script lang="ts">
	/**
	 * Payroll for those who run it: the month's overview, HR's attendance
	 * tracker and the salary report's sheets, filtered together, each
	 * downloadable as CSV, with the whole report as one .xlsx.
	 */
	import { goto } from '$app/navigation';
	import Download from '@lucide/svelte/icons/download';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Search from '@lucide/svelte/icons/search';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PayrollReport } from '$lib/server/payroll';
	import PayrollOverview from './PayrollOverview.svelte';
	import PayrollTracker from './PayrollTracker.svelte';
	import PayrollSheets from './PayrollSheets.svelte';
	import PayrollPersonSheet from './PayrollPersonSheet.svelte';

	let { report, canManage, cycles }: { report: PayrollReport; canManage: boolean; cycles: { key: string; label: string }[] } = $props();

	type Tab = 'overview' | 'tracker' | 'leave-balance' | 'to-be-paid' | 'lop' | 'stop-salary' | 'hr-comments';
	const TABS: { key: Tab; label: string }[] = [
		{ key: 'overview', label: 'Overview' },
		{ key: 'tracker', label: 'Tracker' },
		{ key: 'leave-balance', label: 'Leave balance' },
		{ key: 'to-be-paid', label: 'To be paid' },
		{ key: 'lop', label: 'LOP' },
		{ key: 'stop-salary', label: 'Stop salary' },
		{ key: 'hr-comments', label: 'HR comments' }
	];
	let tab = $state<Tab>('overview');
	let query = $state('');
	let team = $state('');
	let openId = $state<string | null>(null);

	const teams = $derived([...new Set(report.employees.map((e) => e.team || e.department).filter(Boolean))].sort());
	const employees = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return report.employees.filter(
			(e) =>
				(!team || (e.team || e.department) === team) &&
				(!q || e.name.toLowerCase().includes(q) || e.empCode.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q))
		);
	});
	const counts = $derived({
		lop: report.employees.filter((e) => e.action === 'pay' && e.balance.lopDays > 0).length,
		stop: report.employees.filter((e) => e.action !== 'pay').length,
		comments: report.employees.filter((e) => e.comment || e.remarks).length
	});
	const opened = $derived(openId ? report.employees.find((e) => e.userId === openId) ?? null : null);

	const exportUrl = (sheet: string) => `/api/payroll/export?cycle=${report.cycleKey}&sheet=${sheet}`;
	const csvSheet = $derived(tab === 'overview' ? 'tracker' : tab);
	const csvLabel = $derived(TABS.find((t) => t.key === csvSheet)?.label ?? '');
</script>

<PageHeader crumb={['Payroll']} title={`Payroll · ${report.shortLabel}`} sub={report.cycleLabel} compact>
	{#snippet tabs()}
		<div class="ess-tabs page-tabs" role="tablist">
			{#each TABS as t (t.key)}
				<button type="button" class="ess-tab" role="tab" aria-selected={tab === t.key} onclick={() => (tab = t.key)}>
					{t.label}
					{#if t.key === 'lop' && counts.lop}<span class="ess-count">{counts.lop}</span>{/if}
					{#if t.key === 'stop-salary' && counts.stop}<span class="ess-count">{counts.stop}</span>{/if}
					{#if t.key === 'hr-comments' && counts.comments}<span class="ess-count">{counts.comments}</span>{/if}
				</button>
			{/each}
		</div>
	{/snippet}
</PageHeader>

<div class="toolbar">
	<label class="month">
		<span class="ess-label">Payroll month</span>
		<select class="ess-select" value={report.cycleKey} onchange={(e) => goto(`?month=${e.currentTarget.value}`, { noScroll: true })}>
			{#each cycles as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
			{#if !cycles.some((c) => c.key === report.cycleKey)}<option value={report.cycleKey}>{report.shortLabel} · {report.cycleLabel}</option>{/if}
		</select>
	</label>
	<label class="ess-search find">
		<Search size={15} />
		<input class="ess-input" type="search" placeholder="Search name, code or designation" bind:value={query} aria-label="Search people" />
	</label>
	<select class="ess-select team" bind:value={team} aria-label="Team">
		<option value="">All teams</option>
		{#each teams as t (t)}<option value={t}>{t}</option>{/each}
	</select>
	<span class="count">{employees.length} of {report.employees.length} people</span>
	<div class="downloads">
		<a class="ess-btn ess-btn--secondary ess-btn--sm" href={exportUrl(csvSheet)} download title={`Download ${csvLabel} as CSV`}>
			<Download size={15} /> {csvLabel} CSV
		</a>
		<a class="ess-btn ess-btn--primary ess-btn--sm" href={exportUrl('workbook')} download title="The salary report and attendance tracker as one Excel workbook">
			<FileSpreadsheet size={15} /> Salary report (.xlsx)
		</a>
	</div>
</div>

<div class="body">
	{#if report.employees.length === 0}
		<div class="ess-card empty">No one is on the payroll for {report.cycleLabel}.</div>
	{:else if tab === 'overview'}
		<PayrollOverview {report} {employees} />
	{:else if tab === 'tracker'}
		<PayrollTracker {report} {employees} onopen={(id) => (openId = id)} />
	{:else}
		<PayrollSheets sheet={tab} {report} {employees} {canManage} onopen={(id) => (openId = id)} />
	{/if}
</div>

{#if opened}
	<PayrollPersonSheet person={opened} {report} {canManage} onclose={() => (openId = null)} />
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
		margin-bottom: 10px;
	}
	.month {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.month .ess-select {
		min-width: 260px;
	}
	.find {
		flex: 0 1 300px;
	}
	.team {
		max-width: 220px;
	}
	.count {
		margin-left: auto;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.downloads {
		display: flex;
		gap: 8px;
	}
	.body {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1 1 auto;
	}
	.empty {
		padding: 32px;
		text-align: center;
		color: var(--ess-text-secondary);
	}
</style>
