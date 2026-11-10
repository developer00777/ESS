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
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import Eye from '@lucide/svelte/icons/eye';
	import History from '@lucide/svelte/icons/history';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import UserX from '@lucide/svelte/icons/user-x';
	import UploadSteps from '$lib/components/UploadSteps.svelte';
	import SortButton from '$lib/components/table/SortButton.svelte';
	import TablePager from '$lib/components/table/TablePager.svelte';
	import { TableView } from '$lib/ui/table-view.svelte';

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

	const previewLabel = (d: PreviewDay) =>
		!d.matched ? 'Unmatched' : d.effect === 'create' ? 'Valid · add' : d.effect === 'update' ? 'Valid · change' : 'Valid · no change';
	const previewView = new TableView(() => visibleDays.slice(0, MAX_SHOWN), {
		code: (d) => d.empCode,
		employee: (d) => (d.matched ? d.matchedName : d.employeeName),
		date: (d) => d.date,
		inTime: (d) => d.inTime,
		outTime: (d) => d.outTime,
		onFile: (d) => d.existingIn ?? d.existingOut,
		validation: (d) => previewLabel(d)
	});

	const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '—');
	const fmtWhen = (v: string | Date) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
	const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

	/* ---------- ProHance sync ----------
	   Status and the last 10 runs come from /api/admin/prohance-sync; "Sync
	   now" pulls the default window (the poller's), a backfill an explicit
	   one. Hidden for anyone without attendance.device_sync. */
	interface ProhanceSync {
		id: string;
		trigger: string;
		rangeFrom: string;
		rangeTo: string;
		status: string;
		rowCount: number;
		matchedCount: number;
		unmatchedCount: number;
		error: string | null;
		startedAt: string;
		finishedAt: string | null;
	}
	interface ProhanceStatus {
		configured: boolean;
		window: { fromDate: string; toDate: string };
		syncs: ProhanceSync[];
	}

	const MAX_BACKFILL_DAYS = 190;
	let ph = $state<ProhanceStatus | null>(null);
	let phHidden = $state(false);
	let phRunning = $state(false);
	let phError = $state('');
	let phResult = $state('');
	let phFrom = $state('');
	let phTo = $state('');

	async function loadProhance() {
		try {
			const res = await fetch('/api/admin/prohance-sync');
			if (res.status === 401 || res.status === 403) {
				phHidden = true;
				return;
			}
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				phError = body.message ?? 'Could not read the ProHance status';
				return;
			}
			ph = body;
			if (!phFrom) {
				phFrom = body.window.fromDate;
				phTo = body.window.toDate;
			}
		} catch (err) {
			phError = err instanceof Error ? err.message : 'Could not read the ProHance status';
		}
	}
	$effect(() => {
		void loadProhance();
	});

	const backfillDays = $derived(phFrom && phTo ? (Date.parse(`${phTo}T00:00:00Z`) - Date.parse(`${phFrom}T00:00:00Z`)) / 86_400_000 + 1 : 0);
	const backfillProblem = $derived(
		!phFrom || !phTo
			? 'Pick both dates.'
			: phFrom > phTo
				? 'The start date is after the end date.'
				: backfillDays > MAX_BACKFILL_DAYS
					? `At most ${MAX_BACKFILL_DAYS} days at a time — this range is ${backfillDays}.`
					: ''
	);

	async function runProhance(range?: { fromDate: string; toDate: string }) {
		phRunning = true;
		phError = '';
		phResult = '';
		try {
			const res = await fetch('/api/admin/prohance-sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: range ? JSON.stringify(range) : undefined
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				phError = body.message ?? 'The ProHance sync failed';
				return;
			}
			phResult =
				`Pulled ${fmtDay(body.fromDate)} → ${fmtDay(body.toDate)}: ${body.rowCount} employee-days, ${body.matchedCount} matched` +
				(body.unmatchedCount > 0 ? `, ${body.unmatchedCount} with an unknown employee code` : '') +
				(body.rematchedCount > 0 ? `; ${body.rematchedCount} earlier day(s) now matched` : '') +
				'.';
			await loadProhance();
		} catch (err) {
			phError = err instanceof Error ? err.message : 'The ProHance sync failed';
		} finally {
			phRunning = false;
		}
	}

	const lastFeedAt = $derived(data.feedTokens.map((t) => t.lastUsedAt).filter(Boolean).sort().at(-1) ?? null);
	const feedMatched = $derived(data.feedImports.reduce((n, i) => n + i.matchedCount, 0));
	const feedUnmatched = $derived(data.feedUnmatched.length);

	const feedImportsView = new TableView(() => data.feedImports, {
		when: (i) => i.createdAt,
		source: (i) => i.tokenLabel,
		batch: (i) => i.filename,
		rows: (i) => i.rowCount,
		applied: (i) => i.matchedCount,
		duplicate: (i) => i.duplicateCount,
		unmatched: (i) => i.unmatchedCount
	});

	const uploadsView = new TableView(() => data.recentUploads, {
		file: (u) => u.filename,
		uploaded: (u) => u.createdAt,
		records: (u) => u.rowCount,
		matched: (u) => u.matchedCount,
		unmatched: (u) => u.unmatchedCount,
		by: (u) => u.uploadedByName,
		status: (u) => (u.unmatchedCount === 0 ? 'Applied' : 'Applied, some unmatched')
	});
</script>

<svelte:head>
	<title>Attendance imports — Champ HR</title>
</svelte:head>

<!-- Title and description come from the Admin Controls layout (src/lib/admin-tabs.ts). -->

<div class="ess-split page ess-fill">
	<div class="ess-stack main-col">
		<!-- ---------- device feed ---------- -->
		<section class="ess-card feed" aria-labelledby="feed-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="feed-h"><Fingerprint size={16} /> Device feed</h2>
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
								<th aria-sort={feedImportsView.ariaSort('when')}><SortButton view={feedImportsView} key="when">When</SortButton></th>
								<th aria-sort={feedImportsView.ariaSort('source')}><SortButton view={feedImportsView} key="source">Source</SortButton></th>
								<th aria-sort={feedImportsView.ariaSort('batch')}><SortButton view={feedImportsView} key="batch">Batch</SortButton></th>
								<th class="ess-num" aria-sort={feedImportsView.ariaSort('rows')}><SortButton view={feedImportsView} key="rows">Rows</SortButton></th>
								<th class="ess-num" aria-sort={feedImportsView.ariaSort('applied')}><SortButton view={feedImportsView} key="applied">Applied</SortButton></th>
								<th class="ess-num" aria-sort={feedImportsView.ariaSort('duplicate')}><SortButton view={feedImportsView} key="duplicate">Already had</SortButton></th>
								<th class="ess-num" aria-sort={feedImportsView.ariaSort('unmatched')}><SortButton view={feedImportsView} key="unmatched">Unmatched</SortButton></th>
							</tr>
						</thead>
						<tbody>
							{#each feedImportsView.rows as imp (imp.id)}
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
				<TablePager view={feedImportsView} noun="batches" />
			{:else if data.feedTokens.length > 0}
				<p class="ess-help">Nothing has arrived from the device feed yet.</p>
			{/if}
		</section>

		<!-- ---------- manual upload ---------- -->
		<section class="ess-card upload-card" aria-labelledby="upload-h">
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
					<FileCheck size={16} />
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
						<h2 class="ess-h2"><Eye size={16} /> Attendance preview</h2>
						<div class="ess-segmented" role="group" aria-label="Filter rows">
							<button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All records ({preview.rowCount})</button>
							<button type="button" aria-pressed={filter === 'matched'} onclick={() => (filter = 'matched')}>Matched ({preview.matchedCount})</button>
							<button type="button" aria-pressed={filter === 'unmatched'} onclick={() => (filter = 'unmatched')}>Unmatched ({preview.unmatchedCount})</button>
							{#if problemCount > 0}
								<button type="button" aria-pressed={filter === 'problems'} onclick={() => (filter = 'problems')}>Needs a look ({problemCount})</button>
							{/if}
						</div>
					</div>

					<div class="ess-table-shell preview-shell">
						<table class="ess-table">
							<thead>
								<tr>
									<th aria-sort={previewView.ariaSort('code')}><SortButton view={previewView} key="code">Employee code</SortButton></th>
									<th aria-sort={previewView.ariaSort('employee')}><SortButton view={previewView} key="employee">Employee</SortButton></th>
									<th aria-sort={previewView.ariaSort('date')}><SortButton view={previewView} key="date">Date</SortButton></th>
									<th aria-sort={previewView.ariaSort('inTime')}><SortButton view={previewView} key="inTime">Check-in</SortButton></th>
									<th aria-sort={previewView.ariaSort('outTime')}><SortButton view={previewView} key="outTime">Check-out</SortButton></th>
									<th aria-sort={previewView.ariaSort('onFile')}><SortButton view={previewView} key="onFile">Currently on file</SortButton></th>
									<th aria-sort={previewView.ariaSort('validation')}><SortButton view={previewView} key="validation">Validation</SortButton></th>
								</tr>
							</thead>
							<tbody>
								{#each previewView.rows as day (`${day.sourceRow}-${day.empCode}-${day.date}`)}
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
					<TablePager view={previewView} noun="records" />

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
		<section class="ess-card ess-fill-card recent-card" aria-labelledby="recent-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="recent-h"><History size={16} /> Recent uploads</h2>
			</div>
			{#if data.recentUploads.length === 0}
				<p class="ess-help">No biometric report has been uploaded by hand yet.</p>
			{:else}
				<div class="ess-table-shell ess-scroll recent-shell">
					<table class="ess-table">
						<thead>
							<tr>
								<th aria-sort={uploadsView.ariaSort('file')}><SortButton view={uploadsView} key="file">File name</SortButton></th>
								<th aria-sort={uploadsView.ariaSort('uploaded')}><SortButton view={uploadsView} key="uploaded">Uploaded on</SortButton></th>
								<th class="ess-num" aria-sort={uploadsView.ariaSort('records')}><SortButton view={uploadsView} key="records">Records</SortButton></th>
								<th class="ess-num" aria-sort={uploadsView.ariaSort('matched')}><SortButton view={uploadsView} key="matched">Matched</SortButton></th>
								<th class="ess-num" aria-sort={uploadsView.ariaSort('unmatched')}><SortButton view={uploadsView} key="unmatched">Unmatched</SortButton></th>
								<th aria-sort={uploadsView.ariaSort('by')}><SortButton view={uploadsView} key="by">Uploaded by</SortButton></th>
								<th aria-sort={uploadsView.ariaSort('status')}><SortButton view={uploadsView} key="status">Status</SortButton></th>
							</tr>
						</thead>
						<tbody>
							{#each uploadsView.rows as up (up.id)}
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
				<TablePager view={uploadsView} noun="uploads" />
			{/if}
		</section>
	</div>

	<!-- ---------- right: apply summary ---------- -->
	<aside class="ess-stack aside">
		<section class="ess-card" aria-labelledby="apply-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="apply-h"><ListChecks size={16} /> Apply summary</h2>
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

		{#if !phHidden}
			<section class="ess-card prohance" aria-labelledby="ph-h">
				<div class="ess-card-head">
					<h2 class="ess-h2" id="ph-h"><RefreshCw size={16} /> ProHance sync</h2>
					{#if ph?.syncs[0]}<span class="ess-caption">Last run {fmtWhen(ph.syncs[0].startedAt)}</span>{/if}
				</div>
				{#if !ph && !phError}
					<p class="ess-help">Reading the sync status…</p>
				{:else if ph && !ph.configured}
					<div class="ess-notice">
						<span class="ess-notice__icon"><AlertTriangle size={15} /></span>
						<div class="ess-notice__body">
							<strong>ProHance isn’t connected.</strong>
							Set PROHANCE_BASE_URL and the credentials on the server; until then nothing can be pulled. Earlier runs stay listed below.
						</div>
					</div>
				{:else if ph}
					<p class="ess-help">Each run pulls {fmtDay(ph.window.fromDate)} → {fmtDay(ph.window.toDate)} — the 25th of last month to today, the same window as the scheduled poll.</p>
					<button type="button" class="ess-btn ess-btn--primary sync-now" onclick={() => runProhance()} disabled={phRunning}>
						<span class="sync-ic" class:spin={phRunning}><RefreshCw size={16} /></span>
						{phRunning ? 'Syncing…' : 'Sync now'}
					</button>
					<details class="backfill">
						<summary>Backfill a date range</summary>
						<div class="backfill-row">
							<label class="ess-field">
								<span class="ess-label">From</span>
								<input class="ess-input" type="date" bind:value={phFrom} max={phTo || undefined} />
							</label>
							<label class="ess-field">
								<span class="ess-label">To</span>
								<input class="ess-input" type="date" bind:value={phTo} min={phFrom || undefined} />
							</label>
						</div>
						<p class="ess-help">Up to {MAX_BACKFILL_DAYS} days, pulled 28 days at a time. Days already on file are refreshed in place, never counted twice.</p>
						{#if backfillProblem}<p class="ess-error">{backfillProblem}</p>{/if}
						<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={phRunning || !!backfillProblem} onclick={() => runProhance({ fromDate: phFrom, toDate: phTo })}>
							<CalendarRange size={14} />
							{phRunning ? 'Syncing…' : `Backfill ${backfillDays || ''} ${backfillDays === 1 ? 'day' : 'days'}`}
						</button>
					</details>
				{/if}

				{#if phError}
					<p class="ess-error msg"><AlertTriangle size={15} /> {phError}</p>
				{/if}
				{#if phResult}
					<div class="ess-notice ess-notice--success">
						<span class="ess-notice__icon"><CheckCircle size={15} /></span>
						<div class="ess-notice__body"><strong>Synced.</strong> {phResult}</div>
					</div>
				{/if}

				{#if ph && ph.syncs.length > 0}
					<div class="ess-rows runs">
						{#each ph.syncs as s (s.id)}
							<div class="ess-row">
								<div class="ess-row__body">
									<span class="ess-row__title">{fmtDay(s.rangeFrom)} → {fmtDay(s.rangeTo)}</span>
									<span class="ess-row__meta">
										{fmtWhen(s.startedAt)} · {s.trigger === 'manual' ? 'by hand' : 'scheduled'} · {s.rowCount} days, {s.matchedCount} matched{s.unmatchedCount > 0 ? `, ${s.unmatchedCount} unmatched` : ''}
									</span>
									{#if s.error}<span class="run-error">{s.error}</span>{/if}
								</div>
								<div class="ess-row__end">
									{#if s.status === 'error'}
										<span class="ess-badge ess-badge--bad">Failed</span>
									{:else if !s.finishedAt}
										<span class="ess-badge ess-badge--pending">Running</span>
									{:else}
										<span class="ess-badge ess-badge--ok">OK</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if ph}
					<p class="ess-help">No ProHance sync has run yet.</p>
				{/if}
			</section>
		{/if}

		{#if preview && unmatchedDays.length > 0}
			<section class="ess-card" aria-labelledby="unm-h">
				<div class="ess-card-head">
					<h2 class="ess-h2" id="unm-h"><UserX size={16} /> Unmatched records ({preview.unmatchedCodes.length})</h2>
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
		gap: 10px;
		padding: 10px 14px;
	}
	.feed .ess-figure .ess-tile {
		width: 34px;
		height: 34px;
	}
	.feed .ess-figure__value {
		font-size: 20px;
	}
	.feed .ess-figure__label {
		font-size: 12.5px;
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
		gap: 12px;
		padding: 8px 12px;
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
	.file-drop .ess-tile {
		width: 36px;
		height: 36px;
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

	.options {
		margin-top: 10px;
		display: grid;
		gap: 4px 16px;
	}
	@media (min-width: 900px) {
		.options {
			grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
			align-items: end;
		}
		.options .ess-help {
			padding-bottom: 8px;
		}
	}
	.date-fallback {
		max-width: 420px;
	}

	.formats {
		margin-top: 8px;
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
		margin-top: 12px;
		padding-top: 12px;
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
		margin-bottom: 10px;
	}
	.sum {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
	}
	.sum + .sum {
		border-left: 1px solid var(--ess-border);
	}
	.sum strong {
		font-family: var(--ess-font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
	}
	.sum span {
		font-size: 13px;
		font-weight: 500;
	}
	.sum small {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.effects {
		margin-bottom: 10px;
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
		padding: 6px 0;
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

	/* ---------- ProHance sync ---------- */
	.sync-now {
		width: 100%;
		margin-top: 4px;
	}
	.sync-ic {
		display: inline-grid;
	}
	/* Lengths are !important: the app shortens every animation under reduced
	   motion, and a spinner that never turns would read as stuck. */
	.sync-ic.spin {
		animation: ph-spin 900ms linear infinite;
		animation-duration: 900ms !important;
	}
	@keyframes ph-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.backfill {
		margin-top: 10px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.backfill summary {
		cursor: pointer;
		font-weight: 500;
		color: var(--ess-text);
	}
	.backfill-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin: 10px 0 6px;
	}
	.backfill .ess-error {
		margin: 4px 0 8px;
	}
	.backfill .ess-btn {
		margin-top: 6px;
	}
	.runs {
		margin-top: 10px;
	}
	.runs .ess-row {
		padding: 10px 0;
	}
	.runs .ess-row__title {
		font-size: 13.5px;
	}
	.runs .ess-row__meta {
		font-size: 12px;
		white-space: normal;
	}
	.run-error {
		font-size: 12px;
		color: var(--ess-danger);
		overflow-wrap: anywhere;
	}

	@media (max-width: 1100px) {
		.aside {
			position: static;
		}
	}

	/* Fill layout: both columns end on the workspace's bottom edge. The
	   upload history scrolls inside its card; a long preview scrolls inside
	   its table. If a preview is open the left column scrolls as a whole. */
	@media (min-width: 1101px) and (min-height: 480px) {
		@container ess-fill (min-width: 0px) {
			.aside {
				position: static;
			}
			.main-col > :not(.recent-card) {
				flex-shrink: 0;
			}
			.main-col > .recent-card {
				flex: 1 1 0px;
				min-height: 120px;
			}
			.main-col .ess-table th {
				position: sticky;
				top: 0;
				z-index: 1;
				padding: 8px 14px;
			}
			.main-col .ess-table td {
				padding: 8px 14px;
			}
			.preview-shell {
				max-height: 420px;
				overflow: auto;
				scrollbar-width: thin;
			}
			.preview-shell .ess-table-foot {
				position: sticky;
				bottom: 0;
				background: var(--ess-glass-solid);
				-webkit-backdrop-filter: blur(16px) saturate(160%);
				backdrop-filter: blur(16px) saturate(160%);
			}
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

	/* Short desktop screens (a 1280x580 browser): the feed note sits beside
	   its title, the upload controls tighten and the date fallback puts its
	   label beside the input, so the upload history keeps a visible card. */
	@media (min-width: 1101px) and (min-height: 480px) and (max-height: 800px) {
		@container ess-fill (min-width: 0px) {
			.feed:has(> .ess-card-head + .ess-help:last-child) {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				column-gap: 14px;
			}
			.feed > .ess-card-head:has(+ .ess-help:last-child) {
				margin-bottom: 0;
			}
			.feed > .ess-card-head + .ess-help:last-child {
				margin: 0;
			}
			.upload-card :global(.steps) {
				margin-bottom: 8px;
			}
			.upload-form {
				gap: 10px;
			}
			.file-drop {
				padding: 5px 10px;
				gap: 10px;
			}
			.file-drop .ess-tile {
				width: 30px;
				height: 30px;
			}
			.file-text span {
				font-size: 12px;
			}
			.options {
				margin-top: 8px;
				align-items: center;
			}
			.options .ess-help {
				padding-bottom: 0;
			}
			.date-fallback {
				flex-direction: row;
				align-items: center;
				gap: 10px;
			}
			.date-fallback .ess-label {
				flex: 1 1 0;
				font-size: 12.5px;
				line-height: 1.3;
			}
			.date-fallback .ess-input {
				flex: 0 0 150px;
			}
			.formats {
				margin-top: 6px;
			}
			.main-col > .recent-card {
				min-height: 90px;
			}
		}
	}
</style>
