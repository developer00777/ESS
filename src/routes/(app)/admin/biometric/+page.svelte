<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import Moon from '@lucide/svelte/icons/moon';

	let { data } = $props();

	type Effect = 'create' | 'update' | 'no-change';

	interface PreviewDay {
		empCode: string;
		employeeName: string | null;
		matchedName: string | null;
		matched: boolean;
		date: string;
		inTime: string | null;
		outTime: string | null;
		crossesMidnight: boolean;
		effect: Effect;
		existingIn: string | null;
		existingOut: string | null;
		sourceRow: number;
		notes: string[];
	}

	interface Preview {
		filename: string;
		sheetName: string;
		layout: 'long' | 'day-wise' | 'matrix';
		dateSource: string;
		unmappedHeaders: string[];
		skippedRows: { row: number; empCode: string; reason: string }[];
		rowCount: number;
		matchedCount: number;
		unmatchedCount: number;
		createCount: number;
		updateCount: number;
		noChangeCount: number;
		unmatchedCodes: string[];
		dateRange: { from: string; to: string } | null;
		days: PreviewDay[];
	}

	let file = $state<File | null>(null);
	// Only used when a single-day sheet states no date of its own; the sheet's own
	// date and the filename both win over it.
	let fallbackDate = $state(new Date().toISOString().slice(0, 10));
	let overwrite = $state(false);

	let checking = $state(false);
	let applying = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');
	let preview = $state<Preview | null>(null);
	let showOnlyProblems = $state(false);

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		file = input.files?.[0] ?? null;
		preview = null;
		errorMsg = '';
		successMsg = '';
	}

	function buildForm(): FormData {
		const form = new FormData();
		form.set('file', file!);
		form.set('date', fallbackDate);
		return form;
	}

	async function handleCheck(e: SubmitEvent) {
		e.preventDefault();
		if (!file) return;
		errorMsg = '';
		successMsg = '';
		preview = null;
		checking = true;
		try {
			const res = await fetch('/api/admin/biometric-upload', {
				method: 'POST',
				body: buildForm()
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Could not read that file';
				return;
			}
			preview = body;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			checking = false;
		}
	}

	async function handleApply() {
		if (!file || !preview) return;
		errorMsg = '';
		applying = true;
		try {
			const form = buildForm();
			form.set('overwrite', String(overwrite));
			const res = await fetch('/api/admin/biometric-upload/apply', {
				method: 'POST',
				body: form
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.message ?? 'Could not apply the report';
				return;
			}
			successMsg =
				`Applied ${body.matchedCount} of ${body.rowCount} rows — ` +
				`${body.createdCount} day(s) added, ${body.updatedCount} updated, ` +
				`${body.unchangedCount} already matched.` +
				(body.unmatchedCount > 0
					? ` ${body.unmatchedCount} row(s) had an unknown employee code and were stored but not applied.`
					: '');
			preview = null;
			file = null;
			// Refresh the recent-uploads list below.
			setTimeout(() => location.reload(), 2500);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Apply failed';
		} finally {
			applying = false;
		}
	}

	const LAYOUT_LABEL: Record<Preview['layout'], string> = {
		long: 'One row per employee per day (date column found)',
		'day-wise': 'Single day’s report (one date for the whole sheet)',
		matrix: 'Monthly grid (dates across the top)'
	};

	const DATE_SOURCE_LABEL: Record<string, string> = {
		column: 'read from the sheet’s date column',
		'sheet-banner': 'read from the heading above the table',
		filename: 'read from the file name',
		supplied: 'taken from the date you picked',
		'matrix-header': 'read from the dates across the top'
	};

	// A row worth a second look: unmatched code, an overnight shift, a missing
	// punch, or a value that would change what is already on file.
	const isProblem = (d: PreviewDay) =>
		!d.matched || d.crossesMidnight || d.notes.length > 0 || d.effect === 'update';

	let visibleDays = $derived(
		showOnlyProblems ? (preview?.days ?? []).filter(isProblem) : (preview?.days ?? [])
	);

	// Long reports are truncated on screen; the counts above always describe the
	// whole file, and applying is never limited to what is shown.
	const MAX_SHOWN = 300;

	const fmtTime = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleTimeString('en-IN', {
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
					timeZone: 'Asia/Kolkata'
				})
			: '—';
</script>

<header class="page-header">
	<h1><Fingerprint size={22} /> Upload Biometric Report</h1>
	<p>
		For the days the biometric machine never sent through. Upload its Excel report and the in/out
		times are matched to employees by employee code, then written to their attendance — the same
		place the device’s own feed lands.
	</p>
</header>

<div class="upload-card">
	<form class="upload-form" onsubmit={handleCheck}>
		<label class="file-drop">
			<UploadCloud size={22} />
			<span>{file ? file.name : 'Choose the biometric report (.xlsx or .xls)'}</span>
			<input
				type="file"
				accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
				onchange={onFileChange}
			/>
		</label>
		<button type="submit" class="primary" disabled={!file || checking}>
			{checking ? 'Reading…' : 'Check file'}
		</button>
	</form>

	<div class="options">
		<label class="date-fallback">
			<span>If the sheet is one single day and doesn’t say which</span>
			<input type="date" bind:value={fallbackDate} />
		</label>
		<p class="hint">
			A date column, a “Date: …” heading, or a date in the file name is always used first — this is
			only the fallback.
		</p>
	</div>

	<details class="formats">
		<summary>Which sheet layouts are accepted?</summary>
		<p>Any of these, with column names matched loosely (“In Time”, “InTime”, “First In”, “Punch In”…):</p>
		<ul>
			<li>
				<strong>Day-wise</strong> — <code>Emp Code | In Time | Out Time</code>, one date for the whole
				sheet.
			</li>
			<li>
				<strong>Date range</strong> — <code>Emp Code | Date | In Time | Out Time</code>, as many dates
				as you like in one file.
			</li>
			<li><strong>Monthly grid</strong> — employee codes down the side, dates across the top.</li>
		</ul>
		<p>
			An out time earlier than the in time is read as a night shift and credited to the next day.
			Cells like <code>Absent</code>, <code>--:--</code> or <code>WO</code> are treated as no punch.
		</p>
	</details>

	{#if errorMsg}
		<p class="error"><AlertTriangle size={16} /> {errorMsg}</p>
	{/if}
	{#if successMsg}
		<p class="success"><CheckCircle size={16} /> {successMsg}</p>
	{/if}
</div>

{#if preview}
	<div class="review-card">
		<h2>Review before applying</h2>
		<p class="hint">
			<strong>{preview.sheetName}</strong> — {LAYOUT_LABEL[preview.layout]}, dates {DATE_SOURCE_LABEL[
				preview.dateSource
			] ?? preview.dateSource}.
			{#if preview.dateRange}
				Covering {preview.dateRange.from}
				{#if preview.dateRange.to !== preview.dateRange.from}→ {preview.dateRange.to}{/if}.
			{/if}
		</p>

		<div class="stat-row">
			<div class="stat"><strong>{preview.rowCount}</strong><span>rows read</span></div>
			<div class="stat ok"><strong>{preview.createCount}</strong><span>days to add</span></div>
			<div class="stat warn"><strong>{preview.updateCount}</strong><span>to change</span></div>
			<div class="stat"><strong>{preview.noChangeCount}</strong><span>already match</span></div>
			<div class="stat" class:danger={preview.unmatchedCount > 0}>
				<strong>{preview.unmatchedCount}</strong><span>unknown code</span>
			</div>
		</div>

		{#if preview.unmatchedCodes.length > 0}
			<div class="callout danger">
				<AlertTriangle size={16} />
				<div>
					<strong>These employee codes matched nobody in the portal:</strong>
					<p class="codes">{preview.unmatchedCodes.join(', ')}</p>
					<p>
						Their rows are stored with the upload but not applied to anyone’s attendance. Set the
						code on the employee’s profile, then upload this same file again — nothing is
						double-counted.
					</p>
				</div>
			</div>
		{/if}

		{#if preview.skippedRows.length > 0}
			<div class="callout">
				<strong>{preview.skippedRows.length} row(s) skipped</strong>
				<p>
					{preview.skippedRows
						.slice(0, 8)
						.map((s) => `row ${s.row} (${s.empCode}): ${s.reason}`)
						.join('; ')}{preview.skippedRows.length > 8 ? '…' : ''}
				</p>
			</div>
		{/if}

		{#if preview.unmappedHeaders.length > 0}
			<p class="hint">
				Columns ignored: {preview.unmappedHeaders.slice(0, 12).join(', ')}
			</p>
		{/if}

		<div class="table-controls">
			<label class="checkbox-row">
				<input type="checkbox" bind:checked={showOnlyProblems} />
				<span>Show only rows needing attention</span>
			</label>
			<span class="showing">Showing {Math.min(visibleDays.length, MAX_SHOWN)} of {preview.rowCount}</span>
		</div>

		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th>Emp Code</th>
						<th>Employee</th>
						<th>Date</th>
						<th>In</th>
						<th>Out</th>
						<th>Currently on file</th>
						<th>Effect</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleDays.slice(0, MAX_SHOWN) as day (`${day.sourceRow}-${day.empCode}-${day.date}`)}
						<tr class:unmatched={!day.matched}>
							<td><code>{day.empCode}</code></td>
							<td>
								{#if day.matched}
									{day.matchedName}
								{:else}
									<span class="danger-text">not found{day.employeeName ? ` — sheet says “${day.employeeName}”` : ''}</span>
								{/if}
							</td>
							<td>
								{day.date}
								{#if day.crossesMidnight}
									<span class="night" title="Night shift — out time falls on the next day">
										<Moon size={12} /> overnight
									</span>
								{/if}
							</td>
							<td>{day.inTime ?? '—'}</td>
							<td>{day.outTime ?? '—'}</td>
							<td class="existing">
								{#if day.existingIn || day.existingOut}
									{fmtTime(day.existingIn)} → {fmtTime(day.existingOut)}
								{:else}
									<span class="muted">nothing</span>
								{/if}
							</td>
							<td>
								{#if !day.matched}
									<span class="pill danger">not applied</span>
								{:else if day.effect === 'create'}
									<span class="pill ok">add</span>
								{:else if day.effect === 'update'}
									<span class="pill warn">change</span>
								{:else}
									<span class="pill muted">no change</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if visibleDays.length > MAX_SHOWN}
			<p class="hint">
				Only the first {MAX_SHOWN} rows are listed. Applying still covers all {preview.rowCount}.
			</p>
		{/if}

		<label class="checkbox-row overwrite">
			<input type="checkbox" bind:checked={overwrite} />
			<span>
				<strong>Overwrite times already on file.</strong> Off by default: a check-in only moves
				earlier and a check-out only later, so re-uploading an overlapping report never shortens
				anyone’s recorded day. Turn this on only to correct a wrong record on purpose.
			</span>
		</label>

		<div class="apply-row">
			<button class="primary" onclick={handleApply} disabled={applying || preview.matchedCount === 0}>
				{applying
					? 'Applying…'
					: `Apply to ${preview.matchedCount} employee-day${preview.matchedCount === 1 ? '' : 's'}`}
			</button>
			<button type="button" class="link" onclick={() => (preview = null)}>Cancel</button>
		</div>
		{#if preview.matchedCount === 0}
			<p class="hint">Nothing can be applied until at least one employee code matches.</p>
		{/if}
	</div>
{/if}

<div class="current-state">
	<h2>Recent manual uploads</h2>
	{#if data.recentUploads.length === 0}
		<p class="hint">No biometric report has been uploaded by hand yet.</p>
	{:else}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th>When</th>
						<th>File</th>
						<th>By</th>
						<th>Rows</th>
						<th>Applied</th>
						<th>Unmatched</th>
					</tr>
				</thead>
				<tbody>
					{#each data.recentUploads as up (up.id)}
						<tr>
							<td>{new Date(up.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
							<td>{up.filename ?? '—'}</td>
							<td>{up.uploadedByName ?? '—'}</td>
							<td>{up.rowCount}</td>
							<td>{up.matchedCount}</td>
							<td class:danger-text={up.unmatchedCount > 0}>{up.unmatchedCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
		max-width: 680px;
	}

	.page-header h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.page-header p {
		font-size: 0.85rem;
		color: var(--ess-text-secondary);
		margin-top: 0.35rem;
	}

	.upload-card,
	.review-card,
	.current-state {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		max-width: 1040px;
	}

	.upload-form {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
	}

	.file-drop {
		flex: 1;
		min-width: 260px;
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

	button.link {
		background: none;
		border: none;
		color: var(--ess-text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		text-decoration: underline;
	}

	.options {
		margin-top: 1rem;
	}

	.date-fallback {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.8rem;
		flex-wrap: wrap;
	}

	.formats {
		margin-top: 1rem;
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
	}

	.formats summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--ess-text-primary);
	}

	.formats ul {
		margin: 0.5rem 0 0.5rem 1.1rem;
		display: grid;
		gap: 0.3rem;
	}

	.formats p {
		margin: 0.5rem 0;
	}

	.hint {
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
		margin: 0.5rem 0 1rem;
	}

	.error,
	.success {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}

	.error {
		color: var(--ess-danger);
	}

	.success {
		color: var(--ess-success);
	}

	.stat-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.stat {
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 0.6rem 0.9rem;
		display: flex;
		flex-direction: column;
		min-width: 96px;
		border-left: 3px solid var(--ess-border-strong);
	}

	.stat strong {
		font-size: 1.2rem;
	}

	.stat span {
		font-size: 0.7rem;
		color: var(--ess-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat.ok {
		border-left-color: var(--ess-success);
	}

	.stat.warn {
		border-left-color: var(--ess-warning);
	}

	.stat.danger {
		border-left-color: var(--ess-danger);
	}

	.callout {
		display: flex;
		gap: 0.6rem;
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 0.9rem 1rem;
		margin-bottom: 1rem;
		font-size: 0.8rem;
		border-left: 3px solid var(--ess-border-strong);
	}

	.callout.danger {
		border-left-color: var(--ess-danger);
	}

	.callout p {
		margin: 0.35rem 0 0;
		color: var(--ess-text-secondary);
	}

	.callout .codes {
		font-family: var(--ess-font-mono, monospace);
		color: var(--ess-text-primary);
	}

	.table-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.showing {
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
	}

	.checkbox-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8rem;
	}

	.checkbox-row input {
		margin-top: 0.15rem;
	}

	.overwrite {
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
		padding: 0.8rem 1rem;
		margin: 1rem 0;
		max-width: 720px;
	}

	.table-scroll {
		overflow-x: auto;
		background: var(--ess-surface);
		border-radius: var(--ess-radius-md);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	th,
	td {
		text-align: left;
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--ess-border);
		white-space: nowrap;
	}

	th {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--ess-text-secondary);
	}

	tr.unmatched {
		background: color-mix(in srgb, var(--ess-danger) 7%, transparent);
	}

	.existing {
		color: var(--ess-text-secondary);
	}

	.muted {
		color: var(--ess-text-secondary);
	}

	.danger-text {
		color: var(--ess-danger);
	}

	.night {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.65rem;
		color: var(--ess-text-secondary);
		margin-left: 0.3rem;
	}

	.pill {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.pill.ok {
		background: color-mix(in srgb, var(--ess-success) 18%, transparent);
		color: var(--ess-success);
	}

	.pill.warn {
		background: color-mix(in srgb, var(--ess-warning) 20%, transparent);
		color: var(--ess-warning-text, var(--ess-text-primary));
	}

	.pill.danger {
		background: color-mix(in srgb, var(--ess-danger) 15%, transparent);
		color: var(--ess-danger);
	}

	.pill.muted {
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}

	.apply-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	code {
		font-family: var(--ess-font-mono, monospace);
		font-size: 0.75rem;
	}
</style>
