<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
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

	const anySelected = $derived(
		seededLeaveTypes || leaveAndAttendanceData || otherEmployees || bulkImportHistory
	);
	// Typing DELETE is the guard for an irreversible bulk action — a single
	// click is too easy to do by accident on a page like this.
	const canRun = $derived(anySelected && confirmText.trim().toUpperCase() === 'DELETE' && !running);

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
	<title>Data Cleanup — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Data Cleanup</h1>
	<p class="ess-page-sub">
		Remove seeded and test data so the portal reflects only real records. Your own account
		(<strong>{data.currentUserName}</strong>) is always kept. Everything here is permanent.
	</p>
</header>

<p class="warn-banner">
	<AlertTriangle size={16} />
	These actions cannot be undone. Take a database backup first if you're unsure.
</p>

<div class="ess-panel options">
	<label class="opt">
		<input type="checkbox" bind:checked={seededLeaveTypes} />
		<span class="opt-body">
			<strong>Seeded leave types ({data.preview.seededLeaveTypes.length})</strong>
			<span class="ess-caption">
				Duplicates left by the setup seed. Types published from a real policy document have a code
				(EL, SL, MATERNITY…) and are never touched.
				{#if data.preview.seededLeaveTypes.length > 0}
					<br />{data.preview.seededLeaveTypes.map((t) => t.name).join(', ')}
				{/if}
			</span>
		</span>
	</label>

	<label class="opt">
		<input type="checkbox" bind:checked={leaveAndAttendanceData} />
		<span class="opt-body">
			<strong>Leave &amp; attendance records</strong>
			<span class="ess-caption">
				{data.preview.staleAllocations} allocation(s), {data.preview.leaveApplications} application(s)
				and {data.preview.attendanceRows} attendance row(s). This is what makes stale balances like "12
				/ 12.00" keep showing.
			</span>
		</span>
	</label>

	<label class="opt">
		<input type="checkbox" bind:checked={otherEmployees} />
		<span class="opt-body">
			<strong>All other employees ({data.preview.otherEmployees.length})</strong>
			<span class="ess-caption">
				Deletes every login except your own, with their profiles, leave and attendance. They can be
				re-imported from the HR spreadsheet afterwards.
			</span>
		</span>
	</label>

	<label class="opt">
		<input type="checkbox" bind:checked={bulkImportHistory} />
		<span class="opt-body">
			<strong>Bulk import history ({data.preview.bulkImports})</strong>
			<span class="ess-caption">Past spreadsheet uploads and their reviewed rows.</span>
		</span>
	</label>
</div>

<div class="ess-panel run-panel">
	<label class="ess-field confirm-field">
		<span class="ess-label">Type DELETE to confirm</span>
		<input class="ess-input" bind:value={confirmText} placeholder="DELETE" disabled={!anySelected} />
	</label>
	<button type="button" class="ess-btn ess-btn--danger" onclick={run} disabled={!canRun}>
		<Trash2 size={15} />
		{running ? 'Cleaning up…' : 'Delete selected data'}
	</button>
</div>

{#if errorMsg}
	<p class="ess-error section-gap">{errorMsg}</p>
{/if}

{#if result}
	<div class="ess-panel result">
		<strong>Cleanup complete</strong>
		<ul>
			{#each Object.entries(result) as [key, count] (key)}
				<li>{key}: <strong>{count}</strong> removed</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.page-header {
		margin-bottom: 1rem;
		max-width: 720px;
	}

	.warn-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
		padding: 0.7rem 1rem;
		border-radius: var(--ess-radius-sm);
		font-size: var(--ess-fs-body);
		margin-bottom: 1.25rem;
		max-width: 720px;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 720px;
		margin-bottom: 1.25rem;
	}

	.opt {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		cursor: pointer;
	}

	.opt input {
		margin-top: 0.25rem;
		flex-shrink: 0;
	}

	.opt-body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.run-panel {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
		max-width: 720px;
	}

	.confirm-field {
		flex: 1;
		min-width: 200px;
	}

	.section-gap {
		display: block;
		margin-top: 1rem;
	}

	.result {
		margin-top: 1.25rem;
		max-width: 720px;
	}

	.result ul {
		margin: 0.6rem 0 0;
		padding-left: 1.1rem;
		font-size: var(--ess-fs-body);
		color: var(--ess-text-secondary);
	}
</style>
