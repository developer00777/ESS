<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();

	let showCreateForm = $state(false);
	let search = $state('');
	let filter = $state<'all' | 'present' | 'absent'>('all');

	// --- Bulk import (Super Admin only) ---
	const ROLES = ['employee', 'team_lead', 'admin', 'super_admin'] as const;

	let showBulkImport = $state(false);
	let bulkImportFile = $state<File | null>(null);
	let uploadingBulk = $state(false);
	let selectedImportId = $state<string | null>(null);

	type ReviewRow = {
		id: string;
		employeeCode: string | null;
		fullName: string;
		designation: string | null;
		officialEmail: string;
		reportingAuthorityRaw: string | null;
		reportsToRowId: string | null;
		existingUserId: string | null;
		existingUser: { id: string; fullName: string; email: string } | null;
		role: 'super_admin' | 'admin' | 'team_lead' | 'employee';
		status: 'ready' | 'needs_review' | 'created' | 'skipped_existing';
	};

	let reviewImport = $state<{ id: string; filename: string; status: string; appliedAt: string | null } | null>(null);
	let reviewRows = $state<ReviewRow[]>([]);
	let loadingReview = $state(false);
	let savingRowId = $state<string | null>(null);
	let applyingBulk = $state(false);

	let needsReviewCount = $derived(reviewRows.filter((r) => r.status === 'needs_review').length);
	let readyCount = $derived(reviewRows.filter((r) => r.status === 'ready').length);
	let rowById = $derived(new Map(reviewRows.map((r) => [r.id, r])));

	function onBulkFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		bulkImportFile = input.files?.[0] ?? null;
	}

	async function loadReview(importId: string) {
		loadingReview = true;
		try {
			const res = await fetch(`/api/admin/bulk-imports/${importId}`);
			const body = await res.json();
			if (res.ok) {
				reviewImport = body.import;
				reviewRows = body.rows;
				selectedImportId = importId;
			}
		} finally {
			loadingReview = false;
		}
	}

	async function patchRow(rowId: string, patch: Record<string, unknown>) {
		if (!selectedImportId) return;
		savingRowId = rowId;
		try {
			const res = await fetch(`/api/admin/bulk-imports/${selectedImportId}/rows/${rowId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const body = await res.json();
			if (res.ok) {
				reviewRows = reviewRows.map((r) => (r.id === rowId ? { ...r, ...body.row } : r));
			}
		} finally {
			savingRowId = null;
		}
	}

	function onEmailBlur(rowId: string, e: FocusEvent) {
		const value = (e.target as HTMLInputElement).value.trim();
		const row = rowById.get(rowId);
		if (row && value && value !== row.officialEmail) patchRow(rowId, { officialEmail: value });
	}

	function onRoleChange(rowId: string, e: Event) {
		patchRow(rowId, { role: (e.target as HTMLSelectElement).value });
	}

	function onManagerChange(rowId: string, e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		patchRow(rowId, { reportsToRowId: value === '' ? null : value });
	}

	function resolveDuplicate(rowId: string, decision: 'link' | 'create_new') {
		patchRow(rowId, { duplicateDecision: decision });
	}

	function managerName(row: ReviewRow): string {
		if (!row.reportsToRowId) return '—';
		return rowById.get(row.reportsToRowId)?.fullName ?? 'Unknown';
	}

	const statusLabel: Record<string, string> = {
		present: 'Present',
		left: 'Checked out',
		absent: 'Absent'
	};

	function initials(name: string) {
		return name
			.split(' ')
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	const filteredRoster = $derived(
		data.roster.filter((person) => {
			const q = search.trim().toLowerCase();
			if (q && !person.fullName.toLowerCase().includes(q) && !person.email.toLowerCase().includes(q)) {
				return false;
			}
			if (filter === 'present' && person.status !== 'present') return false;
			if (filter === 'absent' && person.status !== 'absent') return false;
			return true;
		})
	);
</script>

<svelte:head>
	<title>Team — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Team Roster</h1>
	<p class="ess-page-sub">Live status and pending approvals for your team</p>
</header>

<div class="stat-grid">
	<div class="ess-stat">
		<span class="ess-stat__label">Team size</span>
		<span class="ess-stat__value">{data.teamSize}</span>
	</div>
	<div class="ess-stat">
		<span class="ess-stat__label">Present now</span>
		<span class="ess-stat__value stat-success">{data.presentNow}</span>
	</div>
	<div class="ess-stat">
		<span class="ess-stat__label">On leave</span>
		<span class="ess-stat__value">{data.onLeave}</span>
	</div>
	<div class="ess-stat">
		<span class="ess-stat__label">Pending approvals</span>
		<span class="ess-stat__value stat-warning">{data.pendingApprovals}</span>
	</div>
</div>

<div class="toolbar">
	<input class="ess-input search-input" placeholder="Search name or email" bind:value={search} />
	<div class="ess-segmented">
		<button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
		<button type="button" aria-pressed={filter === 'present'} onclick={() => (filter = 'present')}>Present</button>
		<button type="button" aria-pressed={filter === 'absent'} onclick={() => (filter = 'absent')}>On leave</button>
	</div>
	<button class="ess-btn ess-btn--primary create-btn" onclick={() => (showCreateForm = !showCreateForm)}>
		<Users size={16} />
		Add Employee
	</button>
</div>

{#if showCreateForm}
	<form method="POST" action="?/createEmployee" use:enhance class="create-card">
		<label class="ess-field">
			<span class="ess-label">Full Name</span>
			<input class="ess-input" name="fullName" required />
		</label>
		<label class="ess-field">
			<span class="ess-label">Email</span>
			<input class="ess-input" name="email" type="email" required />
		</label>
		{#if data.creatableRoles.length > 1}
			<label class="ess-field">
				<span class="ess-label">Role</span>
				<select class="ess-select" name="role">
					{#each data.creatableRoles as role (role)}
						<option value={role}>{role.replace('_', ' ')}</option>
					{/each}
				</select>
			</label>
		{:else}
			<input type="hidden" name="role" value={data.creatableRoles[0]} />
		{/if}
		<label class="ess-field">
			<span class="ess-label">Shift Group</span>
			{#if data.shiftGroups.length > 0}
				<select class="ess-select" name="shiftGroupId" required>
					{#each data.shiftGroups as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			{:else}
				<select class="ess-select" disabled>
					<option>No published holiday calendar yet</option>
				</select>
			{/if}
		</label>
		<button type="submit" class="ess-btn ess-btn--primary" disabled={data.shiftGroups.length === 0}>
			Create Login
		</button>
	</form>
	{#if data.shiftGroups.length === 0}
		<p class="ess-error section-gap">
			Publish a holiday calendar for at least one shift group before creating logins.
		</p>
	{/if}
	{#if form?.success}
		<p class="temp-pass">
			Created {form.email} — temporary password: <code>{form.tempPassword}</code>
		</p>
	{:else if form?.message}
		<p class="ess-error">{form.message}</p>
	{/if}
{/if}

<div class="ess-table-shell">
	<div class="roster-row roster-head">
		<span>Name</span>
		<span>Email</span>
		<span>Role</span>
		<span>Status</span>
		<span class="align-right">Leave left</span>
	</div>
	{#each filteredRoster as person (person.id)}
		<div class="roster-row">
			<span class="name-cell">
				<span class="avatar">{initials(person.fullName)}</span>
				{person.fullName}
			</span>
			<span class="email-cell">{person.email}</span>
			<span class="role">{person.role.replace('_', ' ')}</span>
			<span><span class="ess-badge ess-badge--{person.status}">{statusLabel[person.status]}</span></span>
			<span class="align-right">{person.leaveLeft}</span>
		</div>
	{:else}
		<p class="ess-empty">No employees match this search.</p>
	{/each}
	<div class="table-foot">
		<span>{filteredRoster.length} of {data.teamSize} employees</span>
	</div>
</div>

{#if data.isSuperAdmin}
	<section class="bulk-import-section">
		<div class="section-head">
			<div>
				<h2 class="section-title">Bulk Import Logins</h2>
				<p class="section-sub">
					Upload a spreadsheet with an "HR Team Master data" sheet — new logins use <code>Champ@123</code> and must
					be changed on first login.
				</p>
			</div>
			<button class="ess-btn ess-btn--secondary" onclick={() => (showBulkImport = !showBulkImport)}>
				<UploadCloud size={16} />
				{showBulkImport ? 'Close' : 'Import from Spreadsheet'}
			</button>
		</div>

		{#if showBulkImport}
			<form
				method="POST"
				action="?/uploadBulkImport"
				enctype="multipart/form-data"
				use:enhance={() => {
					uploadingBulk = true;
					return async ({ result, update }) => {
						uploadingBulk = false;
						await update({ reset: false });
						if (result.type === 'success' && result.data?.bulkImportUploaded) {
							await invalidateAll();
							await loadReview(result.data.bulkImportUploaded as string);
						}
					};
				}}
				class="create-card"
			>
				<label class="ess-field bulk-file-field">
					<span class="ess-label">Spreadsheet (.xlsx)</span>
					<input
						class="ess-input"
						type="file"
						name="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						onchange={onBulkFileChange}
						required
					/>
				</label>
				<button type="submit" class="ess-btn ess-btn--primary" disabled={uploadingBulk}>
					{uploadingBulk ? 'Parsing…' : 'Upload & Review'}
				</button>
			</form>
			{#if form?.bulkImportError}
				<p class="ess-error section-gap">{form.bulkImportError}</p>
			{/if}
			{#if form?.bulkImportApplied}
				<p class="temp-pass">
					Created {form.bulkImportApplied.createdCount} login(s). {form.bulkImportApplied.skippedCount} already
					existed and were left untouched.
				</p>
			{/if}
		{/if}

		{#if data.bulkImports.length > 0}
			<div class="import-list">
				{#each data.bulkImports as imp (imp.id)}
					<button type="button" class="import-row" onclick={() => loadReview(imp.id)}>
						<span class="import-main">
							<strong>{imp.filename}</strong>
							<span class="meta">{imp.rowCount} row(s)</span>
						</span>
						<span class="ess-badge ess-badge--{imp.status === 'applied' ? 'approved' : 'pending'}">
							{imp.status === 'applied' ? 'Applied' : 'Pending review'}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if loadingReview}
			<p class="ess-empty">Loading review…</p>
		{/if}

		{#if reviewImport}
			{@const locked = reviewImport.status === 'applied'}
			<div class="review-block">
				{#if needsReviewCount > 0 && !locked}
					<p class="ess-error section-gap">
						{needsReviewCount} row(s) need a decision before applying — either a reporting-line manager couldn't be
						confidently matched, or the name closely matches an existing account under a different email.
					</p>
				{/if}

				<div class="ess-table-shell review-table-shell">
					<table class="ess-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Code</th>
								<th>Email</th>
								<th>Role</th>
								<th>Reports to</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each reviewRows as row (row.id)}
								<tr>
									<td>{row.fullName}</td>
									<td>{row.employeeCode ?? '—'}</td>
									<td>
										{#if locked || row.status === 'skipped_existing'}
											{row.officialEmail}
										{:else}
											<input
												class="ess-input"
												type="email"
												value={row.officialEmail}
												onblur={(e) => onEmailBlur(row.id, e)}
												disabled={savingRowId === row.id}
											/>
										{/if}
									</td>
									<td>
										{#if locked || row.status === 'skipped_existing'}
											{row.role.replace('_', ' ')}
										{:else}
											<select
												class="ess-select"
												value={row.role}
												onchange={(e) => onRoleChange(row.id, e)}
												disabled={savingRowId === row.id}
											>
												{#each ROLES as r (r)}
													<option value={r}>{r.replace('_', ' ')}</option>
												{/each}
											</select>
										{/if}
									</td>
									<td>
										{#if locked || row.status === 'skipped_existing'}
											{managerName(row)}
										{:else}
											<select
												class="ess-select"
												value={row.reportsToRowId ?? ''}
												onchange={(e) => onManagerChange(row.id, e)}
												disabled={savingRowId === row.id}
											>
												<option value="">— none —</option>
												{#each reviewRows.filter((r) => r.id !== row.id) as candidate (candidate.id)}
													<option value={candidate.id}>{candidate.fullName}</option>
												{/each}
											</select>
											{#if row.reportingAuthorityRaw}
												<span class="raw-hint">sheet said: "{row.reportingAuthorityRaw}"</span>
											{/if}
										{/if}
									</td>
									<td>
										<span
											class="ess-badge ess-badge--{row.status === 'needs_review'
												? 'pending'
												: row.status === 'skipped_existing'
													? 'cancelled'
													: 'approved'}"
										>
											{row.status.replace('_', ' ')}
										</span>
									</td>
								</tr>
								{#if row.status === 'needs_review' && row.existingUser}
									<tr class="duplicate-row">
										<td colspan="6">
											<div class="duplicate-banner">
												<span>
													"{row.fullName}" closely matches an existing account:
													<strong>{row.existingUser.fullName}</strong> ({row.existingUser.email}). Same person?
												</span>
												<div class="duplicate-actions">
													<button
														type="button"
														class="ess-btn ess-btn--sm ess-btn--secondary"
														onclick={() => resolveDuplicate(row.id, 'link')}
														disabled={savingRowId === row.id}
													>
														Yes, same person — skip
													</button>
													<button
														type="button"
														class="ess-btn ess-btn--sm ess-btn--ghost"
														onclick={() => resolveDuplicate(row.id, 'create_new')}
														disabled={savingRowId === row.id}
													>
														No, create as new
													</button>
												</div>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
					<div class="ess-table-foot">
						<span>{readyCount} ready · {needsReviewCount} needs review</span>
						{#if !locked}
							<form
								method="POST"
								action="?/applyBulkImport"
								use:enhance={() => {
									applyingBulk = true;
									return async ({ update }) => {
										applyingBulk = false;
										await update();
										await invalidateAll();
										if (selectedImportId) await loadReview(selectedImportId);
									};
								}}
							>
								<input type="hidden" name="importId" value={reviewImport.id} />
								<button
									type="submit"
									class="ess-btn ess-btn--primary"
									disabled={applyingBulk || needsReviewCount > 0 || readyCount === 0}
								>
									{applyingBulk ? 'Creating logins…' : `Create ${readyCount} login(s)`}
								</button>
							</form>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</section>

	<section class="password-activity-section">
		<h2 class="section-title">Password Activity</h2>
		<p class="section-sub">
			Who changed or reset whose password, and when. Actual passwords are never stored or shown — they're one-way
			hashed and cannot be recovered by anyone, including a Super Admin.
		</p>
		<div class="ess-table-shell">
			<table class="ess-table">
				<thead>
					<tr>
						<th>When</th>
						<th>Action</th>
						<th>By</th>
						<th>For</th>
					</tr>
				</thead>
				<tbody>
					{#each data.passwordActivity as entry, i (i)}
						<tr>
							<td>{new Date(entry.createdAt).toLocaleString()}</td>
							<td>{entry.label}</td>
							<td>{entry.actorName ?? 'Unknown'}</td>
							<td>{entry.targetName ?? entry.targetEmail ?? '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="ess-empty">No password activity recorded yet.</td></tr>
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

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 1.5rem;
	}

	.stat-success {
		color: var(--ess-success);
	}

	.stat-warning {
		color: var(--ess-warning);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 1rem;
	}

	.search-input {
		flex: 1;
		max-width: 280px;
	}

	.create-btn {
		margin-left: auto;
	}

	.create-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1.25rem;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: end;
		margin-bottom: 1rem;
	}

	.create-card .ess-field {
		flex: 1;
		min-width: 160px;
	}

	.section-gap {
		display: block;
		margin-bottom: 1rem;
	}

	.temp-pass {
		background: var(--ess-success-bg);
		color: var(--ess-success);
		border-radius: var(--ess-radius-sm);
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.roster-row {
		display: grid;
		grid-template-columns: 1.5fr 1.6fr 0.9fr 1fr 0.8fr;
		padding: 0.7rem 1.1rem;
		font-size: var(--ess-fs-body);
		align-items: center;
	}

	.roster-row:not(:last-child) {
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.roster-head {
		font-weight: 700;
		color: var(--ess-text-secondary);
		font-size: var(--ess-fs-eyebrow);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--ess-sunken);
		border-bottom: 1px solid var(--ess-border);
	}

	.name-cell {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 500;
	}

	.avatar {
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--ess-green-400);
		color: var(--ess-teal-900);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
	}

	.email-cell {
		color: var(--ess-text-secondary);
	}

	.role {
		text-transform: capitalize;
		color: var(--ess-text-secondary);
	}

	.align-right {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.table-foot {
		padding: 10px 16px;
		border-top: 1px solid var(--ess-border);
		background: var(--ess-sunken);
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	@media (max-width: 980px) {
		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.bulk-import-section,
	.password-activity-section {
		margin-top: 2rem;
	}

	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.section-title {
		font-size: var(--ess-fs-h3);
		font-weight: 700;
		margin-bottom: 0.25rem;
	}

	.section-sub {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		max-width: 560px;
	}

	.section-sub code {
		background: var(--ess-sunken);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.bulk-file-field {
		flex: 1;
		min-width: 220px;
	}

	.import-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.import-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.7rem 1rem;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.import-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.import-main .meta {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	.review-block {
		margin-top: 1rem;
	}

	.review-table-shell {
		overflow-x: auto;
	}

	.review-table-shell .ess-table td input,
	.review-table-shell .ess-table td select {
		min-width: 150px;
	}

	.raw-hint {
		display: block;
		font-size: 0.7rem;
		color: var(--ess-text-secondary);
		margin-top: 0.2rem;
	}

	.duplicate-row td {
		padding: 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.duplicate-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
		padding: 0.6rem 1rem;
		font-size: 0.8rem;
	}

	.duplicate-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
</style>
