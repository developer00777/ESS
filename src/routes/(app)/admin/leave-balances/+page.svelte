<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type Effect = 'create' | 'update' | 'no-change';

	interface PreviewRow {
		empCode: string;
		employeeName: string | null;
		userId: string | null;
		leaveTypeToken: string;
		leaveTypeName: string | null;
		leaveTypeId: string | null;
		days: number;
		existingDays: number | null;
		usedDays: number;
		effect: Effect;
		/** False when the row cannot be written — it is shown but never applied. */
		applicable: boolean;
		belowUsed: boolean;
		sourceRow: number;
		notes: string[];
	}

	interface Preview {
		filename: string;
		sheetName: string;
		layout: 'wide' | 'long';
		year: number;
		unmappedHeaders: string[];
		skippedRows: { row: number; empCode: string; reason: string }[];
		rowCount: number;
		matchedCount: number;
		unmatchedCodes: string[];
		unmatchedTypes: string[];
		createCount: number;
		updateCount: number;
		noChangeCount: number;
		belowUsedCount: number;
		rows: PreviewRow[];
	}

	let file = $state<File | null>(null);
	// Seeded from the server's current year. Deliberately a plain $state, not
	// derived: once HR picks a year it is theirs to keep, and a reload must not
	// snap the field back.
	let year = $state(String(data.year));
	let note = $state('');

	let checking = $state(false);
	let applying = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');
	let preview = $state<Preview | null>(null);
	let showOnlyProblems = $state(false);

	const balanceTypes = $derived(data.leaveTypes.filter((t) => t.holdsBalance));

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		file = input.files?.[0] ?? null;
		// A new file invalidates the preview: applying one file after previewing
		// another is the one mistake this screen must make impossible.
		preview = null;
		errorMsg = '';
		successMsg = '';
	}

	function formBody(): FormData {
		const body = new FormData();
		body.set('file', file!);
		body.set('year', year);
		if (note.trim()) body.set('note', note.trim());
		return body;
	}

	async function check() {
		if (!file) return;
		errorMsg = '';
		successMsg = '';
		checking = true;
		preview = null;
		try {
			const res = await fetch('/api/admin/leave-balances', { method: 'POST', body: formBody() });
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = payload.message ?? 'That file could not be read';
				return;
			}
			preview = payload as Preview;
		} catch {
			errorMsg = 'Could not reach the server. Please try again.';
		} finally {
			checking = false;
		}
	}

	async function apply() {
		if (!file || !preview) return;
		errorMsg = '';
		applying = true;
		try {
			const res = await fetch('/api/admin/leave-balances/apply', {
				method: 'POST',
				body: formBody()
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = payload.message ?? 'Could not apply these balances';
				return;
			}
			successMsg = `Applied to ${payload.year}: ${payload.created} balance${payload.created === 1 ? '' : 's'} created, ${payload.updated} updated.`;
			preview = null;
			file = null;
			note = '';
			await invalidateAll();
		} catch {
			errorMsg = 'Could not reach the server. Please try again.';
		} finally {
			applying = false;
		}
	}

	const problemRows = $derived(
		preview ? preview.rows.filter((r) => !r.applicable || r.notes.length > 0) : []
	);
	const visibleRows = $derived(
		preview ? (showOnlyProblems ? problemRows : preview.rows) : []
	);

	const applicable = $derived(preview ? preview.createCount + preview.updateCount : 0);

	function fmtDays(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(1);
	}

	function fmtWhen(v: string | Date | null): string {
		if (!v) return '—';
		return new Date(v).toLocaleString(undefined, {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Leave Balances — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Leave Balances</h1>
	<p class="ess-page-sub">
		Set leave entitlements from a spreadsheet — employee code and the number of days per leave type
	</p>
</header>

<section class="panel">
	<div class="panel-head">
		<strong><UploadCloud size={16} /> Upload a balance sheet</strong>
	</div>

	<p class="hint">
		Monthly accrual is already computed from the published policy. Use this for the figures the
		portal cannot work out on its own — carry-forward from HRone, or a correction. A balance you
		upload here is kept as you set it and is no longer recalculated from the policy.
	</p>

	{#if balanceTypes.length === 0}
		<p class="ess-error">
			No leave types that hold a balance are published yet, so an upload has nothing to set. Publish
			the leave policy first.
		</p>
	{:else}
		<div class="format">
			<span class="format-label">Accepted column headings</span>
			<p class="format-line">
				<code>Employee Code</code> plus one column per leave type — use the code or the full name:
				{#each balanceTypes as t, i (t.id)}<code class="code-chip"
						>{t.code ?? t.name}</code
					>{#if i < balanceTypes.length - 1}{' '}{/if}{/each}
			</p>
			<p class="format-line muted">
				Or one row per entitlement, with <code>Employee Code</code>, <code>Leave Type</code> and
				<code>Balance</code> columns. Blank cells are left as they are; only figures you fill in are
				changed.
			</p>
		</div>

		<div class="controls">
			<label class="field">
				<span>File (.csv or .xlsx)</span>
				<input class="ess-input" type="file" accept=".csv,.xlsx,.xls" onchange={onFileChange} />
			</label>
			<label class="field year-field">
				<span>Leave year</span>
				<input class="ess-input" type="number" bind:value={year} min={data.year - 5} max={data.year + 1} />
			</label>
			<label class="field note-field">
				<span>Note (optional)</span>
				<input
					class="ess-input"
					type="text"
					bind:value={note}
					placeholder="e.g. 2025 carry-forward from HRone"
				/>
			</label>
		</div>

		<div class="actions">
			<button class="ess-btn" onclick={check} disabled={!file || checking || applying}>
				{checking ? 'Checking…' : 'Check file'}
			</button>
			{#if preview && applicable > 0}
				<button class="ess-btn" onclick={apply} disabled={applying}>
					{applying ? 'Applying…' : `Apply ${applicable} balance${applicable === 1 ? '' : 's'}`}
				</button>
			{/if}
		</div>
	{/if}

	{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}
	{#if successMsg}
		<p class="ok"><CheckCircle size={15} /> {successMsg}</p>
	{/if}
</section>

{#if preview}
	<section class="panel">
		<div class="panel-head">
			<strong>{preview.filename}</strong>
			<span class="sub"
				>{preview.layout === 'wide' ? 'one column per leave type' : 'one row per entitlement'} ·
				leave year {preview.year}</span
			>
		</div>

		<div class="tallies">
			<span class="tally"><b>{preview.createCount}</b> to create</span>
			<span class="tally"><b>{preview.updateCount}</b> to change</span>
			<span class="tally muted"><b>{preview.noChangeCount}</b> already correct</span>
			{#if preview.unmatchedCodes.length > 0}
				<span class="tally warn"><b>{preview.unmatchedCodes.length}</b> unknown employee code{preview.unmatchedCodes.length === 1 ? '' : 's'}</span>
			{/if}
			{#if preview.unmatchedTypes.length > 0}
				<span class="tally warn"><b>{preview.unmatchedTypes.length}</b> unknown leave type{preview.unmatchedTypes.length === 1 ? '' : 's'}</span>
			{/if}
			{#if preview.belowUsedCount > 0}
				<span class="tally warn"><b>{preview.belowUsedCount}</b> below days already taken</span>
			{/if}
		</div>

		{#if applicable === 0}
			<p class="ess-error">
				Nothing in this file can be applied. Fix the rows listed below and upload it again.
			</p>
		{/if}

		{#if preview.unmatchedCodes.length > 0}
			<p class="callout">
				<AlertTriangle size={14} /> No employee on file has {preview.unmatchedCodes.length === 1
					? 'the code'
					: 'these codes'}:
				<span class="codes">{preview.unmatchedCodes.join(', ')}</span>. Those rows will be skipped.
			</p>
		{/if}

		{#if preview.unmatchedTypes.length > 0}
			<p class="callout">
				<AlertTriangle size={14} /> No published leave type matches:
				<span class="codes">{preview.unmatchedTypes.join(', ')}</span>. Those rows will be skipped.
			</p>
		{/if}

		{#if preview.unmappedHeaders.length > 0}
			<p class="callout muted">
				Columns ignored: <span class="codes">{preview.unmappedHeaders.join(', ')}</span>
			</p>
		{/if}

		{#if preview.skippedRows.length > 0}
			<div class="skipped">
				<span class="format-label">Rows that could not be read</span>
				<ul>
					{#each preview.skippedRows as s (s.row)}
						<li>Row {s.row} ({s.empCode || 'no code'}) — {s.reason}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if problemRows.length > 0}
			<label class="filter">
				<input type="checkbox" bind:checked={showOnlyProblems} />
				Show only the {problemRows.length} row{problemRows.length === 1 ? '' : 's'} needing attention
			</label>
		{/if}

		<div class="table-wrap">
			<table class="tbl">
				<thead>
					<tr>
						<th>Employee</th>
						<th>Leave type</th>
						<th class="num">Now</th>
						<th class="num">Taken</th>
						<th class="num">New</th>
						<th>Effect</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as r (`${r.empCode}:${r.leaveTypeToken}`)}
						<tr class:bad={!r.applicable} class:warn-row={r.belowUsed}>
							<td>
								<span class="emp">{r.empCode}</span>
								{#if r.employeeName}<span class="sub-cell">{r.employeeName}</span>{/if}
								{#if !r.userId}<span class="sub-cell bad-text">not on file</span>{/if}
							</td>
							<td>
								{r.leaveTypeName ?? r.leaveTypeToken}
								{#if !r.leaveTypeId}<span class="sub-cell bad-text">not a published type</span>{/if}
							</td>
							<td class="num">{r.existingDays === null ? '—' : fmtDays(r.existingDays)}</td>
							<td class="num">{r.usedDays === 0 ? '—' : fmtDays(r.usedDays)}</td>
							<td class="num strong">{fmtDays(r.days)}</td>
							<td>
								{#if !r.applicable}
									<span class="ess-badge ess-badge--absent">skipped</span>
								{:else if r.effect === 'create'}
									<span class="ess-badge ess-badge--present">new</span>
								{:else if r.effect === 'update'}
									<span class="ess-badge ess-badge--restricted">change</span>
								{:else}
									<span class="ess-badge ess-badge--optional">no change</span>
								{/if}
								{#each r.notes as n (n)}
									<span class="note-chip">{n}</span>
								{/each}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

{#if data.hrSet.length > 0}
	<section class="panel">
		<div class="panel-head">
			<strong><CalendarClock size={15} /> Balances set by hand</strong>
			<span class="sub">these are kept as set and not recalculated from the policy</span>
		</div>
		<div class="table-wrap">
			<table class="tbl">
				<thead>
					<tr>
						<th>Employee</th>
						<th>Leave type</th>
						<th class="num">Year</th>
						<th class="num">Days</th>
						<th class="num">Taken</th>
						<th>Set</th>
					</tr>
				</thead>
				<tbody>
					{#each data.hrSet as r, i (`${r.employeeCode}-${r.leaveTypeName}-${r.year}-${i}`)}
						<tr>
							<td>
								<span class="emp">{r.employeeCode ?? '—'}</span>
								<span class="sub-cell">{r.employeeName}</span>
							</td>
							<td>{r.leaveTypeName}</td>
							<td class="num">{r.year}</td>
							<td class="num strong">{fmtDays(r.allocatedDays)}</td>
							<td class="num">{r.usedDays === 0 ? '—' : fmtDays(r.usedDays)}</td>
							<td>
								<span class="sub-cell">{fmtWhen(r.hrSetAt)}</span>
								{#if r.setByName}<span class="sub-cell">by {r.setByName}</span>{/if}
								{#if r.hrSetNote}<span class="note-chip">{r.hrSetNote}</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.panel {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg);
		padding: 1.25rem 1.4rem;
		margin-bottom: 1.25rem;
	}

	.panel-head {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}

	.panel-head strong {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.95rem;
		color: var(--ess-text);
	}

	.sub {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
	}

	.hint {
		font-size: 0.82rem;
		color: var(--ess-text-secondary);
		margin: 0 0 0.9rem;
		max-width: 84ch;
	}

	.format {
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-sm);
		padding: 0.7rem 0.85rem;
		margin-bottom: 1rem;
	}

	.format-label {
		display: block;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--ess-text-secondary);
		margin-bottom: 0.4rem;
	}

	.format-line {
		font-size: 0.8rem;
		color: var(--ess-text);
		margin: 0 0 0.3rem;
		line-height: 1.6;
	}

	.format-line.muted,
	.callout.muted {
		color: var(--ess-text-secondary);
	}

	code {
		font-size: 0.75rem;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-xs);
		padding: 0.05rem 0.3rem;
	}

	.code-chip {
		margin-right: 0.2rem;
	}

	.controls {
		display: grid;
		grid-template-columns: minmax(220px, 1.4fr) 8rem minmax(200px, 1fr);
		gap: 0.7rem;
		margin-bottom: 0.85rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
	}

	.actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.ok {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: var(--ess-success);
		margin: 0.75rem 0 0;
	}

	.tallies {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.85rem;
	}

	.tally {
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
	}

	.tally b {
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	.tally.warn,
	.tally.warn b {
		color: var(--ess-warning);
	}

	.tally.muted b {
		color: var(--ess-text-secondary);
	}

	.callout {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: var(--ess-warning);
		background: var(--ess-warning-bg);
		border-radius: var(--ess-radius-sm);
		padding: 0.5rem 0.7rem;
		margin: 0 0 0.6rem;
	}

	.callout.muted {
		background: var(--ess-sunken);
	}

	.codes {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.skipped {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-sm);
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.8rem;
	}

	.skipped ul {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
	}

	.filter {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		margin-bottom: 0.6rem;
	}

	/* A balance sheet can be hundreds of rows; the table scrolls in its own box
	   rather than stretching the page. */
	.table-wrap {
		overflow-x: auto;
		max-height: 30rem;
		overflow-y: auto;
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-sm);
	}

	.tbl {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.tbl th {
		position: sticky;
		top: 0;
		background: var(--ess-sunken);
		text-align: left;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ess-text-secondary);
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--ess-border);
	}

	.tbl td {
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--ess-border-subtle);
		color: var(--ess-text);
		vertical-align: top;
	}

	.tbl tr:last-child td {
		border-bottom: 0;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.strong {
		font-weight: 700;
	}

	.emp {
		display: block;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.sub-cell {
		display: block;
		font-size: 0.72rem;
		color: var(--ess-text-secondary);
	}

	.bad-text {
		color: var(--ess-danger);
	}

	/* A row that cannot be applied is dimmed rather than hidden — HR needs to see
	   that it was in the file and was not acted on. */
	.tbl tr.bad td {
		background: var(--ess-danger-bg);
	}

	.tbl tr.warn-row td {
		background: var(--ess-warning-bg);
	}

	.note-chip {
		display: inline-block;
		font-size: 0.68rem;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-xs);
		padding: 0.05rem 0.35rem;
		margin-top: 0.2rem;
	}

	@media (max-width: 860px) {
		.controls {
			grid-template-columns: 1fr;
		}
	}
</style>
