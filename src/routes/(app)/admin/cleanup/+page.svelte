<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Calendar from '@lucide/svelte/icons/calendar';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import Clock from '@lucide/svelte/icons/clock';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let seededLeaveTypes = $state(false);
	let leaveAndAttendanceData = $state(false);
	let otherEmployees = $state(false);
	let bulkImportHistory = $state(false);

	let confirmText = $state('');
	let running = $state(false);
	let errorMsg = $state('');
	let result = $state<Record<string, number> | null>(null);

	const anySelected = $derived(seededLeaveTypes || leaveAndAttendanceData || otherEmployees || bulkImportHistory);
	// Typing DELETE is the guard for an irreversible bulk action — a single
	// click is too easy to do by accident on a page like this.
	const typed = $derived(confirmText.trim().toUpperCase() === 'DELETE');
	const canRun = $derived(anySelected && typed && !running);

	const recordRows = $derived(data.preview.staleAllocations + data.preview.leaveApplications + data.preview.attendanceRows);
	const fmt = (n: number) => n.toLocaleString('en-IN');

	type Chosen = { label: string; count: number };
	const chosen = $derived.by((): Chosen[] => {
		const out: Chosen[] = [];
		if (seededLeaveTypes) out.push({ label: 'Seeded leave types', count: data.preview.seededLeaveTypes.length });
		if (leaveAndAttendanceData) out.push({ label: 'Leave and attendance records', count: recordRows });
		if (otherEmployees) out.push({ label: 'Other employee accounts', count: data.preview.otherEmployees.length });
		if (bulkImportHistory) out.push({ label: 'Import history', count: data.preview.bulkImports });
		return out;
	});
	const chosenTotal = $derived(chosen.reduce((n, c) => n + c.count, 0));

	async function run() {
		errorMsg = '';
		result = null;
		running = true;
		try {
			const res = await fetch('/api/admin/cleanup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seededLeaveTypes,
					leaveAndAttendanceData,
					otherEmployees,
					bulkImportHistory
				})
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Cleanup failed';
				return;
			}
			result = body.counts;
			confirmText = '';
			seededLeaveTypes = leaveAndAttendanceData = otherEmployees = bulkImportHistory = false;
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Cleanup failed';
		} finally {
			running = false;
		}
	}
</script>

<svelte:head>
	<title>Data cleanup — Champ HR ESS Portal</title>
</svelte:head>

<div class="ess-split">
	<div class="ess-stack">
		<div class="ess-notice">
			<span class="ess-notice__icon"><AlertTriangle size={16} /></span>
			<span class="ess-notice__body">
				<strong>These actions cannot be undone.</strong>
				Permanently deleted data cannot be recovered. Take a database backup first if you're unsure, and review each option before proceeding.
			</span>
		</div>

		<section class="ess-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Select data to delete</h2>
			</div>
			<p class="ess-caption">Choose one or more kinds of data to permanently remove from Champ HR.</p>

			<div class="ess-rows opts">
				<label class="ess-row opt">
					<input type="checkbox" class="box" bind:checked={seededLeaveTypes} />
					<span class="ess-tile"><Calendar size={20} strokeWidth={1.75} /></span>
					<span class="ess-row__body">
						<span class="title">Seeded leave types</span>
						<span class="hint">
							Duplicates left by the setup seed. Types published from a real policy document have a code (EL, SL, MATERNITY…) and are never touched.
							{#if data.preview.seededLeaveTypes.length > 0}
								<br /><em>{data.preview.seededLeaveTypes.map((t) => t.name).join(', ')}</em>
							{/if}
						</span>
					</span>
					<span class="count"><strong class="ess-num">{fmt(data.preview.seededLeaveTypes.length)}</strong><small>{data.preview.seededLeaveTypes.length === 1 ? 'type' : 'types'}</small></span>
				</label>

				<label class="ess-row opt">
					<input type="checkbox" class="box" bind:checked={leaveAndAttendanceData} />
					<span class="ess-tile"><FileText size={20} strokeWidth={1.75} /></span>
					<span class="ess-row__body">
						<span class="title">Leave and attendance records</span>
						<span class="hint">
							{fmt(data.preview.staleAllocations)} allocation{data.preview.staleAllocations === 1 ? '' : 's'}, {fmt(data.preview.leaveApplications)} application{data.preview.leaveApplications === 1 ? '' : 's'} and {fmt(data.preview.attendanceRows)} attendance row{data.preview.attendanceRows === 1 ? '' : 's'}. This is what makes stale balances keep showing.
						</span>
					</span>
					<span class="count"><strong class="ess-num">{fmt(recordRows)}</strong><small>records</small></span>
				</label>

				<label class="ess-row opt">
					<input type="checkbox" class="box" bind:checked={otherEmployees} />
					<span class="ess-tile"><Users size={20} strokeWidth={1.75} /></span>
					<span class="ess-row__body">
						<span class="title">Other employee accounts</span>
						<span class="hint">Deletes every login except your own, with their profiles, leave and attendance. They can be re-imported from the HR spreadsheet afterwards.</span>
					</span>
					<span class="count"><strong class="ess-num">{fmt(data.preview.otherEmployees.length)}</strong><small>{data.preview.otherEmployees.length === 1 ? 'account' : 'accounts'}</small></span>
				</label>

				<label class="ess-row opt">
					<input type="checkbox" class="box" bind:checked={bulkImportHistory} />
					<span class="ess-tile"><Clock size={20} strokeWidth={1.75} /></span>
					<span class="ess-row__body">
						<span class="title">Import history</span>
						<span class="hint">Past spreadsheet uploads and their reviewed rows.</span>
					</span>
					<span class="count"><strong class="ess-num">{fmt(data.preview.bulkImports)}</strong><small>{data.preview.bulkImports === 1 ? 'import' : 'imports'}</small></span>
				</label>
			</div>
		</section>

		{#if result}
			<section class="ess-card done">
				<div class="ess-card-head">
					<h2 class="ess-h2"><CircleCheck size={20} class="ok" /> Cleanup complete</h2>
				</div>
				<dl class="ess-kv">
					{#each Object.entries(result) as [key, count] (key)}
						<dt>{key}</dt>
						<dd class="ess-num">{fmt(count)} removed</dd>
					{/each}
				</dl>
			</section>
		{/if}
	</div>

	<aside class="ess-stack">
		<section class="ess-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Selection summary</h2>
			</div>
			{#if chosen.length === 0}
				<div class="ess-empty none">
					<span class="ess-empty__icon ess-tile--round"><FileText size={24} strokeWidth={1.5} /></span>
					<p class="ess-empty__title">No data selected</p>
					<p class="ess-caption">Choose one or more data types on the left to see a summary here.</p>
				</div>
			{:else}
				<ul class="chosen">
					{#each chosen as c (c.label)}
						<li><span>{c.label}</span><strong class="ess-num">{fmt(c.count)}</strong></li>
					{/each}
					<li class="total"><span>Records to delete</span><strong class="ess-num">{fmt(chosenTotal)}</strong></li>
				</ul>
			{/if}
			<div class="kept">
				<span class="ess-tile ess-tile--lg ess-tile--round ess-tile--ok"><ShieldCheck size={24} strokeWidth={1.75} /></span>
				<span>
					<strong>Your account is preserved.</strong>
					<small>{data.currentUserName}'s administrator account and settings will not be deleted.</small>
				</span>
			</div>
		</section>

		<section class="ess-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Type DELETE to confirm</h2>
			</div>
			<p class="ess-caption">To enable deletion, type <strong>DELETE</strong> in the box below.</p>
			<label class="ess-field confirm">
				<span class="ess-sr-only">Type DELETE to confirm</span>
				<input class="ess-input" bind:value={confirmText} placeholder="Type DELETE" disabled={!anySelected} autocomplete="off" />
			</label>
			<button type="button" class="ess-btn ess-btn--danger run" onclick={run} disabled={!canRun}>
				<Trash2 size={16} />
				{running ? 'Deleting…' : 'Delete selected data'}
			</button>
			<p class="ess-help">
				{#if !anySelected}No data selected. Choose at least one data type to continue.
				{:else if !typed}Type DELETE to enable the button.
				{:else}This removes {fmt(chosenTotal)} {chosenTotal === 1 ? 'record' : 'records'} permanently.{/if}
			</p>
			{#if errorMsg}
				<p class="ess-error" role="alert">{errorMsg}</p>
			{/if}
		</section>
	</aside>
</div>

<style>
	.opts {
		margin-top: 10px;
	}
	.opt {
		align-items: flex-start;
		padding: 18px 0;
		cursor: pointer;
	}
	.opt:hover {
		background: transparent;
	}
	.box {
		margin-top: 12px;
		width: 18px;
		height: 18px;
		accent-color: var(--ess-danger);
		flex: none;
	}
	.opt .ess-tile {
		margin-top: 2px;
	}
	.title {
		font-family: var(--ess-font-display);
		font-size: 18px;
		font-weight: 600;
		line-height: 1.2;
	}
	.hint {
		font-size: 13.5px;
		color: var(--ess-text-secondary);
		white-space: normal;
	}
	.hint em {
		font-style: normal;
		color: var(--ess-text-muted);
	}
	.count {
		flex: none;
		display: grid;
		justify-items: end;
		min-width: 72px;
		text-align: right;
	}
	.count strong {
		font-family: var(--ess-font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1.1;
	}
	.count small {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}

	.none {
		padding: 28px 12px;
	}
	.none .ess-empty__icon {
		width: 64px;
		height: 64px;
	}
	.chosen {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.chosen li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
		font-size: 14px;
	}
	.chosen .total {
		border-bottom: none;
		color: var(--ess-danger);
		font-weight: 500;
	}
	.kept {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
		padding-top: 16px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.kept span:last-child {
		display: grid;
		gap: 2px;
	}
	.kept strong {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.kept small {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}

	.confirm {
		margin-top: 14px;
	}
	.confirm .ess-input {
		height: 48px;
		font-size: 15px;
	}
	.run {
		width: 100%;
		height: 48px;
		margin-top: 12px;
	}
	.ess-help {
		margin-top: 8px;
	}
	.ess-error {
		margin-top: 8px;
	}
	.done .ess-h2 {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.done :global(.ok) {
		color: var(--ess-success);
	}
</style>
