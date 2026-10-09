<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Info from '@lucide/svelte/icons/info';
	import Save from '@lucide/svelte/icons/save';
	import Avatar from '$lib/components/Avatar.svelte';
	import UploadSteps from '$lib/components/UploadSteps.svelte';
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
	/* Choose → review → applied, for the shared step indicator. */
	const step = $derived(preview ? 1 : successMsg ? 3 : 0);
	let showOnlyProblems = $state(false);

	/* The toolbar's search and type filter narrow both the preview and the
	   history below; they never change what gets applied. */
	let q = $state('');
	let typeFilter = $state('');

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
			const res = await fetch('/api/admin/leave-balances/apply', { method: 'POST', body: formBody() });
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

	const matches = (text: (string | null | undefined)[]) => {
		const needle = q.trim().toLowerCase();
		return !needle || text.some((t) => t?.toLowerCase().includes(needle));
	};

	const problemRows = $derived(preview ? preview.rows.filter((r) => !r.applicable || r.notes.length > 0) : []);
	const visibleRows = $derived(
		preview
			? (showOnlyProblems ? problemRows : preview.rows).filter((r) => matches([r.empCode, r.employeeName]) && (!typeFilter || r.leaveTypeId === typeFilter || r.leaveTypeName === typeFilter))
			: []
	);
	const visibleHistory = $derived(data.hrSet.filter((r) => matches([r.employeeCode, r.employeeName]) && (!typeFilter || r.leaveTypeName === balanceTypes.find((t) => t.id === typeFilter)?.name)));

	const applicable = $derived(preview ? preview.createCount + preview.updateCount : 0);

	function fmtDays(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(1);
	}

	function fmtWhen(v: string | Date | null): { d: string; t: string } {
		if (!v) return { d: '—', t: '' };
		const date = new Date(v);
		return {
			d: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
			t: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
		};
	}

	const initialsId = (s: string) => s || 'x';
</script>

<svelte:head>
	<title>Leave balances — Champ HR</title>
</svelte:head>

<!-- Title and description come from the Admin Controls layout (src/lib/admin-tabs.ts). -->

<div class="toolbar">
	<label class="ess-field year">
		<span class="ess-sr-only">Leave year</span>
		<input class="ess-input" type="number" bind:value={year} min={data.year - 5} max={data.year + 1} aria-label="Leave year" />
	</label>
	<label class="ess-search grow">
		<span class="ess-sr-only">Search</span>
		<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
		<input class="ess-input" type="search" bind:value={q} placeholder="Search by name or employee code…" />
	</label>
	<select class="ess-select type" bind:value={typeFilter} aria-label="Leave type">
		<option value="">All leave types</option>
		{#each balanceTypes as t (t.id)}
			<option value={t.id}>{t.name}</option>
		{/each}
	</select>
	<a class="ess-btn ess-btn--secondary" href="#import"><UploadCloud size={16} /> Import balances</a>
</div>

<div class="ess-split page">
	<div class="ess-stack">
		<!-- ---------- import ---------- -->
		<section class="ess-card" id="import" aria-labelledby="import-h">
			<div class="ess-card-head">
				<div>
					<h2 class="ess-h2" id="import-h">Import balances</h2>
					<p class="ess-caption">Carry-forward from HRone or a correction, from a spreadsheet. Monthly accrual is already computed from the published policy; a balance set here is kept as set and no longer recalculated.</p>
				</div>
			</div>

			<UploadSteps steps={['Upload', 'Review', 'Apply']} hints={['Choose the sheet', 'Check the balances', 'Write to the portal']} current={step} />

			{#if balanceTypes.length === 0}
				<div class="ess-notice ess-notice--danger">
					<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
					<div class="ess-notice__body"><strong>No leave type holds a balance yet.</strong> Publish the leave policy first; an upload has nothing to set until then.</div>
				</div>
			{:else}
				<div class="format">
					<span class="format-label">Accepted column headings</span>
					<p>
						<code>Employee Code</code> plus one column per leave type — use the code or the full name:
						{#each balanceTypes as t (t.id)}<code class="chip">{t.code ?? t.name}</code>{/each}
					</p>
					<p class="muted">Or one row per entitlement, with <code>Employee Code</code>, <code>Leave Type</code> and <code>Balance</code> columns. Blank cells are left as they are; only figures you fill in are changed.</p>
				</div>

				<div class="upload-form">
					<label class="file-drop" class:has-file={!!file}>
						<span class="ess-tile" class:ess-tile--ok={!!file}>
							{#if file}<FileSpreadsheet size={20} strokeWidth={1.75} />{:else}<UploadCloud size={20} strokeWidth={1.75} />{/if}
						</span>
						<span class="file-text">
							<strong>{file ? file.name : 'Choose the balance sheet'}</strong>
							<span>{file ? `${(file.size / 1024).toFixed(0)} KB` : '.csv or .xlsx'}</span>
						</span>
						<span class="ess-btn ess-btn--secondary ess-btn--sm">{file ? 'Replace file' : 'Browse'}</span>
						<input type="file" accept=".csv,.xlsx,.xls" onchange={onFileChange} />
					</label>
					<label class="ess-field note-field">
						<span class="ess-label">Note (optional)</span>
						<input class="ess-input" type="text" bind:value={note} placeholder="e.g. 2025 carry-forward from HRone" />
					</label>
					<button type="button" class="ess-btn ess-btn--primary" onclick={check} disabled={!file || checking || applying}>
						{checking ? 'Checking…' : 'Check file'}
					</button>
				</div>
			{/if}

			{#if errorMsg}<p class="ess-error msg"><AlertTriangle size={15} /> {errorMsg}</p>{/if}
			{#if successMsg}
				<div class="ess-notice ess-notice--success">
					<span class="ess-notice__icon"><CheckCircle size={15} /></span>
					<div class="ess-notice__body"><strong>Applied.</strong> {successMsg}</div>
				</div>
			{/if}
		</section>

		<!-- ---------- preview table ---------- -->
		{#if preview}
			<section class="ess-card" aria-labelledby="prev-h">
				<div class="ess-card-head">
					<div>
						<h2 class="ess-h2" id="prev-h">Employee balances</h2>
						<p class="ess-caption">
							{preview.filename} · {preview.layout === 'wide' ? 'one column per leave type' : 'one row per entitlement'} · leave year {preview.year} · showing {visibleRows.length} of {preview.rows.length} rows
						</p>
					</div>
					{#if problemRows.length > 0}
						<label class="filter">
							<input type="checkbox" bind:checked={showOnlyProblems} />
							Only the {problemRows.length} row{problemRows.length === 1 ? '' : 's'} needing attention
						</label>
					{/if}
				</div>

				{#if applicable === 0}
					<div class="ess-notice ess-notice--danger">
						<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
						<div class="ess-notice__body"><strong>Nothing in this file can be applied.</strong> Fix the rows listed below and upload it again.</div>
					</div>
				{/if}
				{#if preview.unmatchedCodes.length > 0}
					<div class="ess-notice">
						<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
						<div class="ess-notice__body"><strong>No employee on file has {preview.unmatchedCodes.length === 1 ? 'the code' : 'these codes'}: <span class="codes">{preview.unmatchedCodes.join(', ')}</span></strong> Those rows will be skipped.</div>
					</div>
				{/if}
				{#if preview.unmatchedTypes.length > 0}
					<div class="ess-notice">
						<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
						<div class="ess-notice__body"><strong>No published leave type matches: <span class="codes">{preview.unmatchedTypes.join(', ')}</span></strong> Those rows will be skipped.</div>
					</div>
				{/if}
				{#if preview.unmappedHeaders.length > 0}
					<p class="ess-help">Columns ignored: <span class="codes">{preview.unmappedHeaders.join(', ')}</span></p>
				{/if}
				{#if preview.skippedRows.length > 0}
					<div class="ess-notice ess-notice--info">
						<span class="ess-notice__icon"><Info size={15} /></span>
						<div class="ess-notice__body">
							<strong>Rows that could not be read</strong>
							{preview.skippedRows.map((s) => `row ${s.row} (${s.empCode || 'no code'}): ${s.reason}`).join('; ')}
						</div>
					</div>
				{/if}

				<div class="ess-table-shell tall">
					<table class="ess-table">
						<thead>
							<tr>
								<th>Employee</th>
								<th>Leave type</th>
								<th class="ess-num">Current</th>
								<th class="ess-num">Taken</th>
								<th class="ess-num">New balance</th>
								<th>Effect</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleRows as r (`${r.empCode}:${r.leaveTypeToken}`)}
								<tr class:bad={!r.applicable} class:warn-row={r.belowUsed}>
									<td>
										<span class="person">
											<Avatar userId={initialsId(r.userId ?? r.empCode)} fullName={r.employeeName ?? r.empCode} size="sm" />
											<span class="person-text">
												<strong>{r.employeeName ?? r.empCode}</strong>
												<span>{r.empCode}{#if !r.userId} · <span class="bad-text">not on file</span>{/if}</span>
											</span>
										</span>
									</td>
									<td>
										{r.leaveTypeName ?? r.leaveTypeToken}
										{#if !r.leaveTypeId}<span class="sub bad-text">not a published type</span>{/if}
									</td>
									<td class="ess-num">{r.existingDays === null ? '—' : fmtDays(r.existingDays)}</td>
									<td class="ess-num">{r.usedDays === 0 ? '—' : fmtDays(r.usedDays)}</td>
									<td class="ess-num strong">{fmtDays(r.days)}</td>
									<td>
										{#if !r.applicable}
											<span class="ess-badge ess-badge--bad">Skipped</span>
										{:else if r.effect === 'create'}
											<span class="ess-badge ess-badge--ok">New</span>
										{:else if r.effect === 'update'}
											<span class="ess-badge ess-badge--warn">Change</span>
										{:else}
											<span class="ess-badge">No change</span>
										{/if}
										{#each r.notes as n (n)}<span class="note-chip">{n}</span>{/each}
									</td>
								</tr>
							{:else}
								<tr><td colspan="6" class="muted center">No rows match.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		<!-- ---------- history ---------- -->
		<section class="ess-card" aria-labelledby="hist-h">
			<div class="ess-card-head">
				<div>
					<h2 class="ess-h2" id="hist-h">Adjustment history</h2>
					<p class="ess-caption">Balances set by hand. These are kept as set and not recalculated from the policy.</p>
				</div>
			</div>
			{#if visibleHistory.length === 0}
				<p class="ess-help">{data.hrSet.length === 0 ? 'No balance has been set by hand yet.' : 'Nothing matches the search.'}</p>
			{:else}
				<ol class="history">
					{#each visibleHistory as r, i (`${r.employeeCode}-${r.leaveTypeName}-${r.year}-${i}`)}
						{@const w = fmtWhen(r.hrSetAt)}
						<li class="h">
							<span class="when"><span>{w.d}</span><span class="t">{w.t}</span></span>
							<span class="dot" aria-hidden="true"></span>
							<span class="h-body">
								<strong>{r.leaveTypeName} balance set for {r.employeeName}</strong>
								<span class="ess-num">{fmtDays(r.allocatedDays)} days for {r.year}{#if r.usedDays > 0} · {fmtDays(r.usedDays)} already taken{/if}{#if r.employeeCode} · {r.employeeCode}{/if}</span>
								{#if r.hrSetNote}<span>Reason: {r.hrSetNote}</span>{/if}
							</span>
							<span class="actor">
								{#if r.setByName}
									<Avatar userId={r.setByName} fullName={r.setByName} size="sm" />
									<span>{r.setByName}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>

	<!-- ---------- right: what applying does ---------- -->
	<aside class="ess-stack aside">
		<section class="ess-card" aria-labelledby="apply-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="apply-h">Apply balances</h2>
			</div>
			{#if preview}
				<div class="summary">
					<div class="sum"><strong>{preview.createCount}</strong><span>To create</span></div>
					<div class="sum"><strong>{preview.updateCount}</strong><span>To change</span></div>
					<div class="sum"><strong class="muted">{preview.noChangeCount}</strong><span>Already correct</span></div>
				</div>
				<dl class="ess-kv effects">
					<dt>Leave year</dt><dd>{preview.year}</dd>
					{#if note.trim()}<dt>Note</dt><dd>{note.trim()}</dd>{/if}
					{#if preview.unmatchedCodes.length > 0}<dt>Unknown codes</dt><dd class="warn-text">{preview.unmatchedCodes.length}</dd>{/if}
					{#if preview.unmatchedTypes.length > 0}<dt>Unknown types</dt><dd class="warn-text">{preview.unmatchedTypes.length}</dd>{/if}
					{#if preview.belowUsedCount > 0}<dt>Below days taken</dt><dd class="warn-text">{preview.belowUsedCount}</dd>{/if}
				</dl>
				<button type="button" class="ess-btn ess-btn--primary ess-btn--lg apply" onclick={apply} disabled={applying || applicable === 0}>
					<Save size={18} /> {applying ? 'Applying…' : `Apply ${applicable} balance${applicable === 1 ? '' : 's'}`}
				</button>
				<button type="button" class="ess-btn ess-btn--ghost cancel" onclick={() => (preview = null)}>Cancel</button>
			{:else}
				<p class="ess-help">Choose a sheet and check it. What it would change appears here before anything is written.</p>
			{/if}
		</section>

		<section class="ess-card" aria-labelledby="types-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="types-h">Leave types</h2>
			</div>
			<ul class="types">
				{#each data.leaveTypes as t (t.id)}
					<li>
						<span class="ess-figure__dot" class:ess-figure__dot--ok={t.holdsBalance} class:ess-figure__dot--neutral={!t.holdsBalance}></span>
						<span class="type-text">
							<strong>{t.name}</strong>
							<span>{t.code ?? '—'} · {t.holdsBalance ? `${fmtDays(Number(t.accrualPerMonth))} / month` : t.monthlyQuotaDays != null ? `${fmtDays(Number(t.monthlyQuotaDays))} per month, no balance` : t.fixedDays != null ? `${t.fixedDays} fixed days` : 'does not hold a balance'}</span>
						</span>
					</li>
				{/each}
			</ul>
		</section>
	</aside>
</div>

<style>
	.page {
		--ess-aside-width: 340px;
	}
	.toolbar {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.toolbar .year {
		width: 120px;
	}
	.toolbar .grow {
		flex: 1;
		min-width: 240px;
	}
	.toolbar .type {
		width: 220px;
	}

	.format {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-md);
		padding: 12px 14px;
		margin-bottom: 14px;
		font-size: 13px;
		display: grid;
		gap: 4px;
	}
	.format-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.format p {
		margin: 0;
		line-height: 1.6;
	}
	code {
		font-family: var(--ess-font-mono);
		font-size: 12px;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-xs);
		padding: 1px 6px;
	}
	.chip {
		margin-left: 4px;
	}
	.muted {
		color: var(--ess-text-muted);
	}
	.center {
		text-align: center;
	}

	.upload-form {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(200px, 1fr) auto;
		gap: 12px;
		align-items: end;
	}
	.file-drop {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border: 1px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		cursor: pointer;
		transition: border-color var(--ess-t-fast);
	}
	.file-drop:hover {
		border-color: var(--ess-primary);
	}
	.file-drop.has-file {
		border-style: solid;
		border-color: var(--ess-border);
		background: var(--ess-surface);
	}
	.file-drop input {
		display: none;
	}
	.file-text {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.file-text strong {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.file-text span {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
	}
	.ess-notice {
		margin-top: 12px;
	}
	.codes {
		font-family: var(--ess-font-mono);
		font-size: 12px;
	}
	.filter {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
	}
	.filter input {
		accent-color: var(--ess-primary);
	}

	/* A balance sheet can be hundreds of rows; the table scrolls in its own box. */
	.tall {
		max-height: 32rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin-top: 12px;
	}
	.tall th {
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.person {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.person-text {
		display: grid;
	}
	.person-text strong {
		font-weight: 500;
	}
	.person-text span,
	.sub {
		display: block;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.strong {
		font-weight: 600;
	}
	.bad-text {
		color: var(--ess-danger);
	}
	.warn-text {
		color: var(--ess-warning);
	}
	tr.bad td {
		background: var(--ess-danger-bg);
	}
	tr.warn-row td {
		background: var(--ess-warning-bg);
	}
	.note-chip {
		display: inline-block;
		margin-left: 6px;
		font-size: 11.5px;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-xs);
		padding: 1px 6px;
	}

	/* ---------- history ---------- */
	.history {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.h {
		position: relative;
		display: grid;
		grid-template-columns: 96px 20px minmax(0, 1fr) auto;
		gap: 14px;
		align-items: start;
		padding: 12px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.h:last-child {
		border-bottom: 0;
	}
	.h::before {
		content: '';
		position: absolute;
		left: calc(96px + 14px + 9px);
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--ess-border-subtle);
	}
	.h:first-child::before {
		top: 18px;
	}
	.h:last-child::before {
		bottom: calc(100% - 18px);
	}
	.when {
		display: grid;
		font-size: 13px;
		color: var(--ess-text-secondary);
		line-height: 1.35;
	}
	.when .t {
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		position: relative;
		z-index: 1;
		width: 12px;
		height: 12px;
		margin: 5px 4px;
		border-radius: 50%;
		background: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ess-surface);
	}
	.h-body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.h-body strong {
		font-size: 14px;
		font-weight: 500;
	}
	.h-body span {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.actor {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13.5px;
	}

	/* ---------- aside ---------- */
	.aside {
		position: sticky;
		top: 64px;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		margin-bottom: 14px;
	}
	.sum {
		display: grid;
		gap: 2px;
		padding: 14px 12px;
		text-align: center;
	}
	.sum + .sum {
		border-left: 1px solid var(--ess-border);
	}
	.sum strong {
		font-family: var(--ess-font-display);
		font-size: 28px;
		font-weight: 600;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
	}
	.sum span {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.effects {
		margin-bottom: 14px;
		font-size: 13.5px;
	}
	.apply,
	.cancel {
		width: 100%;
	}
	.cancel {
		margin-top: 6px;
	}
	.types {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.types li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.types li:last-child {
		border-bottom: none;
	}
	.type-text {
		display: grid;
		min-width: 0;
	}
	.type-text strong {
		font-size: 14px;
		font-weight: 500;
	}
	.type-text span {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}

	@media (max-width: 1100px) {
		.aside {
			position: static;
		}
	}
	@media (max-width: 860px) {
		.upload-form {
			grid-template-columns: 1fr;
		}
		.h {
			grid-template-columns: 20px minmax(0, 1fr);
		}
		.h::before {
			left: 9px;
		}
		.when,
		.actor {
			grid-column: 2;
		}
	}
</style>
