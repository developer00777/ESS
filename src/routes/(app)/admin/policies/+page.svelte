<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import FileText from '@lucide/svelte/icons/file-text';
	import CheckCircle from '@lucide/svelte/icons/check-circle';

	let { data } = $props();

	type Kind = 'holiday_calendar' | 'leave_policy';

	let kind = $state<Kind>('holiday_calendar');
	let file = $state<File | null>(null);
	let uploading = $state(false);
	let extracting = $state(false);
	let publishing = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	let documentId = $state<string | null>(null);
	let holidayTables = $state<
		Array<{ shift_group_key: string; shift_group_label: string; holidays: Array<{ date: string; name: string; type: string }> }>
	>([]);
	let leaveTypesDraft = $state<
		Array<{
			code: string;
			name: string;
			accrual_per_month: number | null;
			eligibility: string | null;
			carry_forward_cap_days: number | null;
			requires_documentation: boolean;
			documentation_note: string | null;
			fixed_days: number | null;
			notes: string | null;
		}>
	>([]);

	let calendarYear = $state(new Date().getFullYear() + 1);
	let effectiveFrom = $state(`${new Date().getFullYear() + 1}-01-01`);

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		file = input.files?.[0] ?? null;
	}

	async function handleUpload(e: SubmitEvent) {
		e.preventDefault();
		if (!file) return;
		errorMsg = '';
		successMsg = '';
		documentId = null;
		holidayTables = [];
		leaveTypesDraft = [];
		uploading = true;
		extracting = true;
		try {
			const form = new FormData();
			form.set('file', file);
			form.set('kind', kind);
			const res = await fetch('/api/admin/policy-documents', { method: 'POST', body: form });
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Upload failed';
				return;
			}
			documentId = body.documentId;
			if (kind === 'holiday_calendar') {
				holidayTables = body.extracted.tables;
			} else {
				leaveTypesDraft = body.extracted.leave_types;
			}
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			extracting = false;
		}
	}

	async function handlePublishHolidayCalendar() {
		if (!documentId) return;
		publishing = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/admin/policy-documents/${documentId}/publish-holiday-calendar`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ year: calendarYear, effectiveFrom, tables: holidayTables })
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Publish failed';
				return;
			}
			successMsg = `Published ${body.publishedCalendars.length} shift-group calendar(s) for ${calendarYear}.`;
			documentId = null;
			holidayTables = [];
		} finally {
			publishing = false;
		}
	}

	async function handlePublishLeavePolicy() {
		if (!documentId) return;
		publishing = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/admin/policy-documents/${documentId}/publish-leave-policy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ effectiveFrom, leaveTypes: leaveTypesDraft })
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Publish failed';
				return;
			}
			successMsg = `Published ${body.leaveTypes.length} leave type(s).`;
			documentId = null;
			leaveTypesDraft = [];
		} finally {
			publishing = false;
		}
	}

	function addHolidayRow(tableIdx: number) {
		holidayTables[tableIdx].holidays.push({ date: '', name: '', type: 'PUBLIC' });
	}

	function removeHolidayRow(tableIdx: number, rowIdx: number) {
		holidayTables[tableIdx].holidays.splice(rowIdx, 1);
	}
</script>

<svelte:head>
	<title>Publish Policies — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Publish Holiday Calendar &amp; Leave Policy</h1>
	<p class="ess-page-sub">
		Upload the source document once — it's parsed automatically and, after your review, becomes the
		live calendar/policy every employee sees, resolved by their own shift assignment.
	</p>
</header>

<div class="upload-card">
	<div class="kind-tabs">
		<button class:active={kind === 'holiday_calendar'} onclick={() => (kind = 'holiday_calendar')}>
			<CalendarDays size={16} /> Holiday Calendar
		</button>
		<button class:active={kind === 'leave_policy'} onclick={() => (kind = 'leave_policy')}>
			<FileText size={16} /> Leave Policy
		</button>
	</div>

	<form class="upload-form" onsubmit={handleUpload}>
		<label class="file-drop">
			<UploadCloud size={22} />
			<span>{file ? file.name : 'Choose a JPEG, PNG, or PDF'}</span>
			<input type="file" accept="image/jpeg,image/png,application/pdf" onchange={onFileChange} />
		</label>
		<button type="submit" class="primary" disabled={!file || uploading}>
			{extracting ? 'Extracting with AI…' : 'Upload & Extract'}
		</button>
	</form>

	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}
	{#if successMsg}
		<p class="success"><CheckCircle size={16} /> {successMsg}</p>
	{/if}
</div>

{#if kind === 'holiday_calendar' && holidayTables.length > 0}
	<div class="review-card">
		<h2>Review extracted holidays</h2>
		<p class="hint">Edit any row before publishing. Each table below becomes its own shift-group calendar.</p>

		<div class="publish-meta">
			<label>
				<span>Calendar Year</span>
				<input type="number" bind:value={calendarYear} />
			</label>
			<label>
				<span>Effective From</span>
				<input type="date" bind:value={effectiveFrom} />
			</label>
		</div>

		{#each holidayTables as table, tableIdx (table.shift_group_key)}
			<div class="table-block">
				<div class="table-head">
					<input class="group-label" bind:value={table.shift_group_label} />
					<code>{table.shift_group_key}</code>
				</div>
				<table>
					<thead>
						<tr><th>Date</th><th>Name</th><th>Type</th><th></th></tr>
					</thead>
					<tbody>
						{#each table.holidays as row, rowIdx (rowIdx)}
							<tr>
								<td><input type="date" bind:value={row.date} /></td>
								<td><input type="text" bind:value={row.name} /></td>
								<td>
									<select bind:value={row.type}>
										<option value="PUBLIC">Public</option>
										<option value="RESTRICTED">Restricted</option>
										<option value="OPTIONAL">Optional</option>
									</select>
								</td>
								<td>
									<button type="button" class="link-danger" onclick={() => removeHolidayRow(tableIdx, rowIdx)}
										>Remove</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<button type="button" class="link" onclick={() => addHolidayRow(tableIdx)}>+ Add holiday row</button>
			</div>
		{/each}

		<button class="primary" onclick={handlePublishHolidayCalendar} disabled={publishing}>
			{publishing ? 'Publishing…' : 'Publish Calendar'}
		</button>
	</div>
{/if}

{#if kind === 'leave_policy' && leaveTypesDraft.length > 0}
	<div class="review-card">
		<h2>Review extracted leave types</h2>
		<p class="hint">Edit any field before publishing. Publishing upserts by leave type code.</p>

		<label class="single-meta">
			<span>Effective From</span>
			<input type="date" bind:value={effectiveFrom} />
		</label>

		{#each leaveTypesDraft as lt, idx (idx)}
			<div class="leave-type-block">
				<div class="lt-row">
					<label><span>Code</span><input type="text" bind:value={lt.code} /></label>
					<label><span>Name</span><input type="text" bind:value={lt.name} /></label>
				</div>
				<div class="lt-row">
					<label><span>Accrual / month</span><input type="number" step="0.1" bind:value={lt.accrual_per_month} /></label>
					<label><span>Fixed days</span><input type="number" bind:value={lt.fixed_days} /></label>
					<label><span>Carry-forward cap</span><input type="number" bind:value={lt.carry_forward_cap_days} /></label>
				</div>
				<label class="checkbox-row">
					<input type="checkbox" bind:checked={lt.requires_documentation} />
					<span>Requires documentation</span>
				</label>
				{#if lt.requires_documentation}
					<label><span>Documentation note</span><input type="text" bind:value={lt.documentation_note} /></label>
				{/if}
				<label><span>Notes</span><textarea bind:value={lt.notes}></textarea></label>
			</div>
		{/each}

		<button class="primary" onclick={handlePublishLeavePolicy} disabled={publishing}>
			{publishing ? 'Publishing…' : 'Publish Leave Policy'}
		</button>
	</div>
{/if}

<div class="current-state">
	<h2>Currently published</h2>
	<div class="current-grid">
		{#each data.publishedCalendars as cal (cal.id)}
			<div class="current-card">
				<strong>{cal.year} · v{cal.version}</strong>
				<span>{cal.holidays.length} holidays</span>
			</div>
		{/each}
		{#if data.publishedCalendars.length === 0}
			<p class="empty">No holiday calendar published yet.</p>
		{/if}
	</div>

	<div class="current-grid">
		{#each data.leaveTypes as lt (lt.id)}
			<div class="current-card">
				<strong>{lt.code ?? lt.name}</strong>
				<span>{lt.name} · v{lt.policyVersion}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
		max-width: 640px;
	}

	.upload-card,
	.review-card,
	.current-state {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		max-width: 780px;
	}

	.kind-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.kind-tabs button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		border-radius: var(--ess-radius-md);
		border: 1px solid transparent;
		background: var(--ess-surface);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.kind-tabs button.active {
		border-color: var(--ess-primary);
		color: var(--ess-primary);
		font-weight: 700;
	}

	.upload-form {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.file-drop {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.file-drop input {
		display: none;
	}

	button.primary {
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		border: none;
		padding: 0.7rem 1.25rem;
		border-radius: var(--ess-radius-md);
		cursor: pointer;
		font-weight: 600;
		white-space: nowrap;
	}

	button.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: var(--ess-danger);
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}

	.success {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--ess-success);
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}

	.hint {
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
		margin-bottom: 1rem;
	}

	.publish-meta,
	.single-meta {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.publish-meta label,
	.single-meta {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
	}

	.table-block {
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.table-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.6rem;
	}

	.group-label {
		font-weight: 700;
		border: none;
		background: transparent;
		font-size: 0.95rem;
	}

	.table-head code {
		font-size: 0.7rem;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}

	th {
		text-align: left;
		color: var(--ess-text-secondary);
		font-weight: 600;
		padding: 0.3rem;
	}

	td {
		padding: 0.25rem;
	}

	td input,
	td select {
		width: 100%;
		border: 1px solid var(--ess-border-strong);
		border-radius: 4px;
		padding: 0.3rem;
	}

	.link,
	.link-danger {
		background: none;
		border: none;
		font-size: 0.78rem;
		cursor: pointer;
		padding: 0.2rem 0;
	}

	.link {
		color: var(--ess-primary);
	}

	.link-danger {
		color: var(--ess-danger);
	}

	.leave-type-block {
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 1rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.lt-row {
		display: flex;
		gap: 1rem;
	}

	.lt-row label,
	.leave-type-block > label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.78rem;
		flex: 1;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}

	input,
	select,
	textarea {
		font-family: inherit;
		padding: 0.45rem;
		border-radius: 6px;
		border: 1px solid var(--ess-border-strong);
		color: var(--ess-text);
		background: var(--ess-surface);
	}

	.current-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.current-card {
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		min-width: 140px;
	}

	.empty {
		font-size: 0.82rem;
		color: var(--ess-text-secondary);
	}
</style>
