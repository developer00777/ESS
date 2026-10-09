<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Download from '@lucide/svelte/icons/download';
	import Info from '@lucide/svelte/icons/info';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Moon from '@lucide/svelte/icons/moon';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import UploadSteps from '$lib/components/UploadSteps.svelte';

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
	/* Choose → review → applied, for the shared step indicator. */
	const step = $derived(preview ? 1 : successMsg ? 3 : 0);
	type Filter = 'all' | 'matched' | 'unmatched' | 'problems';
	let filter = $state<Filter>('all');
	let unmatchedOpen = $state(true);

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
			filter = 'all';
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
				(body.unmatchedCount > 0 ? ` ${body.unmatchedCount} row(s) had an unknown employee code and were stored but not applied.` : '');
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
	const isProblem = (d: PreviewDay) => !d.matched || d.crossesMidnight || d.notes.length > 0 || d.effect === 'update';

	const visibleDays = $derived.by(() => {
		const days = preview?.days ?? [];
		if (filter === 'matched') return days.filter((d) => d.matched);
		if (filter === 'unmatched') return days.filter((d) => !d.matched);
		if (filter === 'problems') return days.filter(isProblem);
		return days;
	});
	const problemCount = $derived((preview?.days ?? []).filter(isProblem).length);
	const unmatchedDays = $derived((preview?.days ?? []).filter((d) => !d.matched));

	// Long reports are truncated on screen; the counts above always describe the
	// whole file, and applying is never limited to what is shown.
	const MAX_SHOWN = 300;

	const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '—');
	const fmtWhen = (v: string | Date) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
	const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

	const lastFeedAt = $derived(data.feedTokens.map((t) => t.lastUsedAt).filter(Boolean).sort().at(-1) ?? null);
	const feedMatched = $derived(data.feedImports.reduce((n, i) => n + i.matchedCount, 0));
	const feedUnmatched = $derived(data.feedUnmatched.length);
</script>

<svelte:head>
	<title>Attendance imports — Champ HR</title>
</svelte:head>

<!-- Title and description come from the Admin Controls layout (src/lib/admin-tabs.ts). -->

<div class="ess-split page">
	<div class="ess-stack">
		<!-- ---------- device feed ---------- -->
		<section class="ess-card feed" aria-labelledby="feed-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="feed-h">Device feed</h2>
				{#if lastFeedAt}<span class="ess-caption">Last synced {fmtWhen(lastFeedAt)}</span>{/if}
			</div>
			{#if data.feedTokens.length === 0}
				<p class="ess-help">No import token is active, so nothing can post punches here yet.</p>
			{:else}
				<div class="ess-figures">
					<div class="ess-figure">
						<span class="ess-tile"><Fingerprint size={20} strokeWidth={1.75} /></span>
						<div><span class="ess-figure__value">{feedMatched}</span><br /><span class="ess-figure__label">Punches matched, recent batches</span></div>
					</div>
					<div class="ess-figure">
						<span class="ess-figure__dot" class:ess-figure__dot--warn={feedUnmatched > 0} class:ess-figure__dot--ok={feedUnmatched === 0}></span>
						<div><span class="ess-figure__value">{feedUnmatched}</span><br /><span class="ess-figure__label">Unmatched codes, last 30 days</span></div>
					</div>
					<div class="ess-figure">
						<span class="ess-figure__dot ess-figure__dot--neutral"></span>
						<div><span class="ess-figure__value">{data.feedTokens.length}</span><br /><span class="ess-figure__label">Active {data.feedTokens.length === 1 ? 'device token' : 'device tokens'}</span></div>
					</div>
				</div>
				<ul class="tokens">
					{#each data.feedTokens as token (token.id)}
						<li><strong>{token.label}</strong> — {token.lastUsedAt ? `last checked in ${fmtWhen(token.lastUsedAt)}` : 'never used'}</li>
					{/each}
				</ul>
			{/if}

			{#if data.feedUnmatched.length > 0}
				<div class="ess-notice">
					<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
					<div class="ess-notice__body">
						<strong>Punches from these employee codes matched nobody in the last 30 days</strong>
						<span class="codes">{data.feedUnmatched.map((u) => `${u.empCode} (${u.punches})`).join(', ')}</span>.
						Set the code on the employee’s profile, then re-send those dates from the EasyTime bridge — punches already applied are skipped, so nothing is double-counted.
					</div>
				</div>
			{/if}

			{#if data.feedImports.length > 0}
				<div class="ess-table-shell sub-table">
					<table class="ess-table">
						<thead>
							<tr>
								<th>When</th>
								<th>Source</th>
								<th>Batch</th>
								<th class="ess-num">Rows</th>
								<th class="ess-num">Applied</th>
								<th class="ess-num">Already had</th>
								<th class="ess-num">Unmatched</th>
							</tr>
						</thead>
						<tbody>
							{#each data.feedImports as imp (imp.id)}
								<tr>
									<td>{fmtWhen(imp.createdAt)}</td>
									<td>{imp.tokenLabel ?? '—'}</td>
									<td class="mono">{imp.filename ?? '—'}</td>
									<td class="ess-num">{imp.rowCount}</td>
									<td class="ess-num">{imp.matchedCount}</td>
									<td class="ess-num">{imp.duplicateCount}</td>
									<td class="ess-num" class:bad-text={imp.unmatchedCount > 0}>{imp.unmatchedCount}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if data.feedTokens.length > 0}
				<p class="ess-help">Nothing has arrived from the device feed yet.</p>
			{/if}
		</section>

		<!-- ---------- manual upload ---------- -->
		<section class="ess-card" aria-labelledby="upload-h">
			<UploadSteps steps={['Upload', 'Review', 'Apply']} hints={['Choose the device report', 'Check and match records', 'Import to attendance']} current={step} />

			<form class="upload-form" onsubmit={handleCheck}>
				<label class="file-drop" class:has-file={!!file}>
					<span class="ess-tile" class:ess-tile--ok={!!file}>
						{#if file}<FileSpreadsheet size={20} strokeWidth={1.75} />{:else}<UploadCloud size={20} strokeWidth={1.75} />{/if}
					</span>
					<span class="file-text">
						<strong>{file ? file.name : 'Choose the biometric report'}</strong>
						<span>{file ? `${(file.size / 1024).toFixed(0)} KB · .xlsx or .xls` : '.xlsx or .xls from the device'}</span>
					</span>
					<span class="ess-btn ess-btn--secondary ess-btn--sm">{file ? 'Replace file' : 'Browse'}</span>
					<input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onchange={onFileChange} />
				</label>
				<button type="submit" class="ess-btn ess-btn--primary" disabled={!file || checking}>
					{checking ? 'Reading…' : 'Check file'}
				</button>
			</form>

			<div class="options">
				<label class="ess-field date-fallback">
					<span class="ess-label">If the sheet is one single day and doesn’t say which</span>
					<input class="ess-input" type="date" bind:value={fallbackDate} />
				</label>
				<p class="ess-help">A date column, a “Date: …” heading, or a date in the file name is always used first — this is only the fallback.</p>
			</div>

			<details class="formats">
				<summary>Which sheet layouts are accepted?</summary>
				<p>Any of these, with column names matched loosely (“In Time”, “InTime”, “First In”, “Punch In”…):</p>
				<ul>
					<li><strong>Day-wise</strong> — <code>Emp Code | In Time | Out Time</code>, one date for the whole sheet.</li>
					<li><strong>Date range</strong> — <code>Emp Code | Date | In Time | Out Time</code>, as many dates as you like in one file.</li>
					<li><strong>Monthly grid</strong> — employee codes down the side, dates across the top.</li>
				</ul>
				<p>An out time earlier than the in time is read as a night shift and credited to the next day. Cells like <code>Absent</code>, <code>--:--</code> or <code>WO</code> are treated as no punch.</p>
			</details>

			{#if errorMsg}
				<p class="ess-error msg"><AlertTriangle size={15} /> {errorMsg}</p>
			{/if}
			{#if successMsg}
				<div class="ess-notice ess-notice--success">
					<span class="ess-notice__icon"><CheckCircle size={15} /></span>
					<div class="ess-notice__body"><strong>Applied.</strong> {successMsg}</div>
				</div>
			{/if}

			{#if preview}
				<div class="preview">
					<p class="ess-help">
						<strong>{preview.sheetName}</strong> — {LAYOUT_LABEL[preview.layout]}, dates {DATE_SOURCE_LABEL[preview.dateSource] ?? preview.dateSource}.
						{#if preview.dateRange}
							Covering {fmtDay(preview.dateRange.from)}{#if preview.dateRange.to !== preview.dateRange.from} → {fmtDay(preview.dateRange.to)}{/if}.
						{/if}
					</p>

					{#if preview.skippedRows.length > 0}
						<div class="ess-notice ess-notice--info">
							<span class="ess-notice__icon"><Info size={15} /></span>
							<div class="ess-notice__body">
								<strong>{preview.skippedRows.length} row(s) skipped</strong>
								{preview.skippedRows.slice(0, 8).map((s) => `row ${s.row} (${s.empCode}): ${s.reason}`).join('; ')}{preview.skippedRows.length > 8 ? '…' : ''}
							</div>
						</div>
					{/if}
					{#if preview.unmappedHeaders.length > 0}
						<p class="ess-help">Columns ignored: {preview.unmappedHeaders.slice(0, 12).join(', ')}</p>
					{/if}

					<div class="ess-card-head preview-head">
						<h2 class="ess-h2">Attendance preview</h2>
						<div class="ess-segmented" role="group" aria-label="Filter rows">
							<button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All records ({preview.rowCount})</button>
							<button type="button" aria-pressed={filter === 'matched'} onclick={() => (filter = 'matched')}>Matched ({preview.matchedCount})</button>
							<button type="button" aria-pressed={filter === 'unmatched'} onclick={() => (filter = 'unmatched')}>Unmatched ({preview.unmatchedCount})</button>
							{#if problemCount > 0}
								<button type="button" aria-pressed={filter === 'problems'} onclick={() => (filter = 'problems')}>Needs a look ({problemCount})</button>
							{/if}
						</div>
					</div>

					<div class="ess-table-shell">
						<table class="ess-table">
							<thead>
								<tr>
									<th>Employee code</th>
									<th>Employee</th>
									<th>Date</th>
									<th>Check-in</th>
									<th>Check-out</th>
									<th>Currently on file</th>
									<th>Validation</th>
								</tr>
							</thead>
							<tbody>
								{#each visibleDays.slice(0, MAX_SHOWN) as day (`${day.sourceRow}-${day.empCode}-${day.date}`)}
									<tr class:unmatched={!day.matched}>
										<td class="mono">{day.empCode}</td>
										<td>
											{#if day.matched}
												{day.matchedName}
											{:else}
												<span class="bad-text">Not found{day.employeeName ? ` — sheet says “${day.employeeName}”` : ''}</span>
											{/if}
										</td>
										<td>
											{fmtDay(day.date)}
											{#if day.crossesMidnight}
												<span class="night" title="Night shift — out time falls on the next day"><Moon size={12} /> overnight</span>
											{/if}
										</td>
										<td class="ess-num">{day.inTime ?? '—'}</td>
										<td class="ess-num">{day.outTime ?? '—'}</td>
										<td class="muted">
											{#if day.existingIn || day.existingOut}
												{fmtTime(day.existingIn)} → {fmtTime(day.existingOut)}
											{:else}
												nothing
											{/if}
										</td>
										<td>
											{#if !day.matched}
												<span class="status warn">Unmatched</span>
											{:else if day.effect === 'create'}
												<span class="status ok">Valid · add</span>
											{:else if day.effect === 'update'}
												<span class="status warn">Valid · change</span>
											{:else}
												<span class="status muted">Valid · no change</span>
											{/if}
											{#each day.notes as n (n)}<span class="note-chip">{n}</span>{/each}
										</td>
									</tr>
								{:else}
									<tr><td colspan="7" class="muted center">No rows match this filter.</td></tr>
								{/each}
							</tbody>
						</table>
						<div class="ess-table-foot">
							<span>Showing {Math.min(visibleDays.length, MAX_SHOWN)} of {preview.rowCount} records{visibleDays.length > MAX_SHOWN ? ` · only the first ${MAX_SHOWN} are listed; applying still covers all ${preview.rowCount}` : ''}</span>
						</div>
					</div>

					<label class="overwrite">
						<input type="checkbox" bind:checked={overwrite} />
						<span>
							<strong>Overwrite times already on file.</strong> Off by default: a check-in only moves earlier and a check-out only later, so re-uploading an overlapping report never shortens anyone’s recorded day. Turn this on only to correct a wrong record on purpose.
						</span>
					</label>
				</div>
			{/if}
		</section>

		<!-- ---------- recent uploads ---------- -->
		<section class="ess-card" aria-labelledby="recent-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="recent-h">Recent uploads</h2>
			</div>
			{#if data.recentUploads.length === 0}
				<p class="ess-help">No biometric report has been uploaded by hand yet.</p>
			{:else}
				<div class="ess-table-shell">
					<table class="ess-table">
						<thead>
							<tr>
								<th>File name</th>
								<th>Uploaded on</th>
								<th class="ess-num">Records</th>
								<th class="ess-num">Matched</th>
								<th class="ess-num">Unmatched</th>
								<th>Uploaded by</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recentUploads as up (up.id)}
								<tr>
									<td><span class="file-cell"><span class="ess-tile ess-tile--sm ess-tile--ok"><FileSpreadsheet size={15} /></span>{up.filename ?? '—'}</span></td>
									<td>{fmtWhen(up.createdAt)}</td>
									<td class="ess-num">{up.rowCount}</td>
									<td class="ess-num">{up.matchedCount}</td>
									<td class="ess-num" class:bad-text={up.unmatchedCount > 0}>{up.unmatchedCount}</td>
									<td>{up.uploadedByName ?? '—'}</td>
									<td><span class="ess-badge" class:ess-badge--ok={up.unmatchedCount === 0} class:ess-badge--warn={up.unmatchedCount > 0}>{up.unmatchedCount === 0 ? 'Applied' : 'Applied, some unmatched'}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>

	<!-- ---------- right: apply summary ---------- -->
	<aside class="ess-stack aside">
		<section class="ess-card" aria-labelledby="apply-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="apply-h">Apply summary</h2>
			</div>
			{#if preview}
				<div class="summary">
					<div class="sum"><strong>{preview.matchedCount}</strong><span>Matched records</span><small>Ready to apply to attendance</small></div>
					<div class="sum"><strong class:warn-text={preview.unmatchedCount > 0}>{preview.unmatchedCount}</strong><span>Unmatched records</span><small>Require an employee code</small></div>
				</div>
				<dl class="ess-kv effects">
					<dt>Days to add</dt><dd>{preview.createCount}</dd>
					<dt>Days to change</dt><dd>{preview.updateCount}</dd>
					<dt>Already match</dt><dd>{preview.noChangeCount}</dd>
				</dl>
				<button type="button" class="ess-btn ess-btn--primary ess-btn--lg apply" onclick={handleApply} disabled={applying || preview.matchedCount === 0}>
					<Download size={18} /> {applying ? 'Applying…' : 'Apply matched records'}
				</button>
				<button type="button" class="ess-btn ess-btn--ghost cancel" onclick={() => (preview = null)}>Cancel</button>
				{#if preview.matchedCount === 0}
					<p class="ess-help">Nothing can be applied until at least one employee code matches.</p>
				{/if}
				<div class="ess-notice ess-notice--info">
					<span class="ess-notice__icon"><Info size={15} /></span>
					<div class="ess-notice__body">
						<strong>Unmatched records will not be imported.</strong>
						Set the code on the employee’s profile and upload the same file again — nothing is double-counted.
					</div>
				</div>
			{:else}
				<p class="ess-help">Choose a report and check it. What it would change appears here before anything is applied.</p>
			{/if}
		</section>

		{#if preview && unmatchedDays.length > 0}
			<section class="ess-card" aria-labelledby="unm-h">
				<div class="ess-card-head">
					<h2 class="ess-h2" id="unm-h">Unmatched records ({preview.unmatchedCodes.length})</h2>
					<button type="button" class="ess-icon-btn" onclick={() => (unmatchedOpen = !unmatchedOpen)} aria-expanded={unmatchedOpen} aria-label={unmatchedOpen ? 'Collapse' : 'Expand'}>
						{#if unmatchedOpen}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
					</button>
				</div>
				{#if unmatchedOpen}
					<ul class="unm">
						{#each unmatchedDays.slice(0, 12) as d (`${d.sourceRow}-${d.empCode}-${d.date}`)}
							<li>
								<span class="ess-figure__dot ess-figure__dot--warn"></span>
								<span class="mono">{d.empCode}</span>
								<span class="muted">{fmtDay(d.date)}</span>
								<span class="muted ess-num">{d.inTime ?? '—'} – {d.outTime ?? '—'}</span>
							</li>
						{/each}
					</ul>
					{#if unmatchedDays.length > 12}
						<button type="button" class="ess-link as-btn" onclick={() => (filter = 'unmatched')}>View all unmatched records ›</button>
					{/if}
					<p class="ess-help">Codes: <span class="codes">{preview.unmatchedCodes.join(', ')}</span>. These rows are stored with the upload but not applied to anyone’s attendance.</p>
				{/if}
			</section>
		{/if}
	</aside>
</div>

<style>
	.page {
		--ess-aside-width: 380px;
	}

	.feed .ess-figure {
		align-items: center;
	}
	.feed .ess-figures {
		margin-bottom: 12px;
	}
	.tokens {
		margin: 0 0 12px;
		padding: 0;
		list-style: none;
		font-size: 13px;
		color: var(--ess-text-secondary);
		display: grid;
		gap: 4px;
	}
	.sub-table {
		margin-top: 12px;
	}

	.upload-form {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
	}
	.file-drop {
		flex: 1;
		min-width: 280px;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 14px;
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
		font-size: 14.5px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.file-text span {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}

	.options {
		margin-top: 14px;
		display: grid;
		gap: 6px;
	}
	.date-fallback {
		max-width: 420px;
	}

	.formats {
		margin-top: 12px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.formats summary {
		cursor: pointer;
		font-weight: 500;
		color: var(--ess-text);
	}
	.formats ul {
		margin: 8px 0 8px 18px;
		display: grid;
		gap: 4px;
	}
	.formats p {
		margin: 8px 0;
	}
	code {
		font-family: var(--ess-font-mono);
		font-size: 12px;
	}
	.mono {
		font-family: var(--ess-font-mono);
		font-size: 12.5px;
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

	.preview {
		margin-top: 18px;
		padding-top: 18px;
		border-top: 1px solid var(--ess-border);
		display: grid;
		gap: 12px;
	}
	.preview-head {
		margin-bottom: 0;
		flex-wrap: wrap;
	}
	tr.unmatched td {
		background: var(--ess-warning-bg);
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		white-space: nowrap;
	}
	.status::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ess-border-strong);
	}
	.status.ok::before {
		background: var(--ess-success);
	}
	.status.warn {
		color: var(--ess-warning);
	}
	.status.warn::before {
		background: var(--ess-warning);
	}
	.status.muted {
		color: var(--ess-text-muted);
	}
	.night {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: var(--ess-text-muted);
		margin-left: 6px;
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
	.muted {
		color: var(--ess-text-muted);
	}
	.center {
		text-align: center;
	}
	.bad-text {
		color: var(--ess-danger);
	}
	.warn-text {
		color: var(--ess-warning);
	}
	.codes {
		font-family: var(--ess-font-mono);
		font-size: 12px;
		color: var(--ess-text);
	}
	.overwrite {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		font-size: 13px;
		color: var(--ess-text-secondary);
		max-width: 760px;
	}
	.overwrite input {
		margin-top: 3px;
		accent-color: var(--ess-primary);
	}
	.overwrite strong {
		color: var(--ess-text);
	}
	.file-cell {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	/* ---------- aside ---------- */
	.aside {
		position: sticky;
		top: 64px;
	}
	.summary {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		margin-bottom: 14px;
	}
	.sum {
		display: grid;
		gap: 2px;
		padding: 16px;
	}
	.sum + .sum {
		border-left: 1px solid var(--ess-border);
	}
	.sum strong {
		font-family: var(--ess-font-display);
		font-size: 30px;
		font-weight: 600;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
	}
	.sum span {
		font-size: 14px;
		font-weight: 500;
	}
	.sum small {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.effects {
		margin-bottom: 14px;
		font-size: 13.5px;
	}
	.apply {
		width: 100%;
	}
	.cancel {
		width: 100%;
		margin-top: 6px;
	}
	.unm {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.unm li {
		display: grid;
		grid-template-columns: 12px auto 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
		font-size: 13px;
	}
	.unm li:last-child {
		border-bottom: none;
	}
	.as-btn {
		background: none;
		border: none;
		padding: 10px 0 0;
		cursor: pointer;
		font: inherit;
	}

	@media (max-width: 1100px) {
		.aside {
			position: static;
		}
	}
	@media (max-width: 720px) {
		.summary {
			grid-template-columns: 1fr;
		}
		.sum + .sum {
			border-left: none;
			border-top: 1px solid var(--ess-border);
		}
	}
</style>
