<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Settings from '@lucide/svelte/icons/settings';
	import PersonSettingsPanel from '$lib/components/PersonSettingsPanel.svelte';
	import { WEEKDAY_LABELS } from '$lib/week-off';

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

	// Two-step inline confirm rather than a native confirm() dialog — deleting
	// someone should take a deliberate second click, not a reflexive OK.
	let confirmingDelete = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let deleteError = $state('');

	async function deleteEmployee(userId: string) {
		deleteError = '';
		deletingId = userId;
		try {
			const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				deleteError = body.message ?? 'Could not delete this employee';
				return;
			}
			confirmingDelete = null;
			await invalidateAll();
		} finally {
			deletingId = null;
		}
	}

	/* Admin-issued password reset. Passwords are Argon2-hashed and cannot be
	   read back, so the only recovery path is to set a new one — issued here,
	   shown once for hand-off, and forced to change on the user's next login. */
	let resettingId = $state<string | null>(null);
	let resetFor = $state<{ id: string; name: string } | null>(null);
	let resetValue = $state('');
	let resetError = $state('');
	let resetIssued = $state<{ name: string; password: string } | null>(null);

	function openReset(person: { id: string; fullName: string }) {
		resetFor = { id: person.id, name: person.fullName };
		resetValue = generatePassword();
		resetError = '';
		resetIssued = null;
	}

	function generatePassword() {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
		const pick = new Uint32Array(12);
		crypto.getRandomValues(pick);
		return 'Champ@' + [...pick].map((n) => chars[n % chars.length]).join('').slice(0, 8);
	}

	async function submitReset() {
		if (!resetFor) return;
		resetError = '';
		if (resetValue.length < 8) {
			resetError = 'Password must be at least 8 characters';
			return;
		}
		resettingId = resetFor.id;
		try {
			const res = await fetch(`/api/admin/users/${resetFor.id}/password`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ newPassword: resetValue })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				resetError = body.message ?? 'Could not reset this password';
				return;
			}
			resetIssued = { name: resetFor.name, password: resetValue };
			resetFor = null;
			resetValue = '';
			await invalidateAll();
		} finally {
			resettingId = null;
		}
	}

	/* Role, reporting line, HR, shift and week off are all edited together in the
	   person panel rather than as inline dropdowns: they are related settings,
	   and one Save is both easier to reason about and one write instead of six.
	   Selecting a row opens it; `person` is keyed by id so switching rows
	   remounts the panel with that person's values. */
	let editingPerson = $state<(typeof data.roster)[number] | null>(null);

	// --- Roster authoring (Super Admin) ---
	let showRosterEditor = $state(false);
	let rosterName = $state('');
	let rosterDescription = $state('');
	let rosterPattern = $state<'fixed' | 'rotational'>('fixed');
	let rosterWeekdays = $state<number[]>([0, 6]);
	let rosterTeamId = $state('');
	let rosterAnchor = $state(new Date().toISOString().slice(0, 10));
	let rotationWeeks = $state<number[][]>([[0], [0, 6]]);
	let editingRosterId = $state<string | null>(null);
	let rosterSaving = $state(false);
	let rosterError = $state('');

	function toggleFixedDay(day: number) {
		rosterWeekdays = rosterWeekdays.includes(day)
			? rosterWeekdays.filter((d) => d !== day)
			: [...rosterWeekdays, day].sort();
	}

	function toggleRotationDay(weekIndex: number, day: number) {
		rotationWeeks = rotationWeeks.map((week, i) => {
			if (i !== weekIndex) return week;
			return week.includes(day) ? week.filter((d) => d !== day) : [...week, day].sort();
		});
	}

	function addRotationWeek() {
		if (rotationWeeks.length < 12) rotationWeeks = [...rotationWeeks, []];
	}

	function removeRotationWeek(index: number) {
		if (rotationWeeks.length > 2) rotationWeeks = rotationWeeks.filter((_, i) => i !== index);
	}

	function resetRosterForm() {
		editingRosterId = null;
		rosterName = '';
		rosterDescription = '';
		rosterPattern = 'fixed';
		rosterWeekdays = [0, 6];
		rosterTeamId = '';
		rosterAnchor = new Date().toISOString().slice(0, 10);
		rotationWeeks = [[0], [0, 6]];
		rosterError = '';
	}

	function editRoster(roster: (typeof data.weekOffRosters)[number]) {
		editingRosterId = roster.id;
		rosterName = roster.name;
		rosterDescription = roster.description ?? '';
		rosterPattern = roster.pattern;
		rosterWeekdays = roster.weekdays ?? [0, 6];
		rosterTeamId = roster.teamId ?? '';
		rosterAnchor = roster.rotationAnchorDate ?? new Date().toISOString().slice(0, 10);
		rotationWeeks = roster.rotationWeeks ?? [[0], [0, 6]];
		rosterError = '';
		showRosterEditor = true;
	}

	async function saveRoster() {
		rosterError = '';
		rosterSaving = true;
		try {
			const payload = {
				name: rosterName,
				description: rosterDescription,
				pattern: rosterPattern,
				weekdays: rosterWeekdays,
				rotationWeeks,
				rotationAnchorDate: rosterAnchor,
				teamId: rosterTeamId || null
			};
			const res = await fetch(
				editingRosterId ? `/api/admin/week-off-rosters/${editingRosterId}` : '/api/admin/week-off-rosters',
				{
					method: editingRosterId ? 'PUT' : 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				rosterError = body.message ?? 'Could not save this roster';
				return;
			}
			resetRosterForm();
			showRosterEditor = false;
			await invalidateAll();
		} finally {
			rosterSaving = false;
		}
	}

	async function togglePublish(roster: (typeof data.weekOffRosters)[number]) {
		rosterError = '';
		const res = await fetch(`/api/admin/week-off-rosters/${roster.id}/publish`, {
			method: roster.status === 'published' ? 'DELETE' : 'POST'
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			rosterError = body.message ?? 'Could not change the published state';
			return;
		}
		await invalidateAll();
	}

	async function deleteRoster(rosterId: string) {
		rosterError = '';
		const res = await fetch(`/api/admin/week-off-rosters/${rosterId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			rosterError = body.message ?? 'Could not delete this roster';
			return;
		}
		await invalidateAll();
	}

	const filteredRoster = $derived(
		data.roster.filter((person) => {
			const q = search.trim().toLowerCase();
			// Employee code is the primary way HR looks someone up, so it searches
			// alongside name and email.
			if (
				q &&
				!person.fullName.toLowerCase().includes(q) &&
				!person.email.toLowerCase().includes(q) &&
				!(person.employeeCode ?? '').toLowerCase().includes(q)
			) {
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
	<input
		class="ess-input search-input"
		placeholder="Search name, employee code, or email"
		bind:value={search}
	/>
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

{#if deleteError}
	<p class="ess-error section-gap">{deleteError}</p>
{/if}

{#if resetFor}
	<div class="reset-panel">
		<div class="reset-head">
			<KeyRound size={16} />
			<strong>Reset password — {resetFor.name}</strong>
		</div>
		<p class="reset-note">
			Existing passwords are one-way hashed and can never be read back, so a reset issues a new
			one. It is shown once here for hand-off, and {resetFor.name} must change it at next login.
		</p>
		<div class="reset-controls">
			<input
				class="ess-input reset-input"
				bind:value={resetValue}
				spellcheck="false"
				autocomplete="off"
				aria-label="New password"
			/>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (resetValue = generatePassword())}>
				Regenerate
			</button>
			<button
				type="button"
				class="ess-btn ess-btn--sm"
				onclick={submitReset}
				disabled={resettingId !== null}
			>
				{resettingId ? 'Resetting…' : 'Reset password'}
			</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (resetFor = null)}>
				Cancel
			</button>
		</div>
		{#if resetError}<p class="ess-error">{resetError}</p>{/if}
	</div>
{/if}

{#if resetIssued}
	<div class="reset-issued">
		<strong>Password reset for {resetIssued.name}.</strong>
		Share this once — it won't be shown again:
		<code>{resetIssued.password}</code>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (resetIssued = null)}>
			Dismiss
		</button>
	</div>
{/if}

<!-- Save errors surface inside the panel, next to the fields that caused them. -->

{#if editingPerson}
	{#key editingPerson.id}
		<PersonSettingsPanel
			person={editingPerson}
			people={data.allPeople}
			shiftGroups={data.allShiftGroups}
			rosters={data.weekOffRosters}
			roles={ROLES}
			currentUserId={data.currentUserId}
			onclose={() => (editingPerson = null)}
			onsaved={async () => {
				editingPerson = null;
				await invalidateAll();
			}}
		/>
	{/key}
{/if}

<div class="ess-table-shell roster-shell">
	<div class="roster-row roster-head">
		<span>Name</span>
		<span>Emp code</span>
		<span>Role</span>
		<span>Reports to</span>
		<span>Concerned HR</span>
		<span>Shift</span>
		<span>Week off</span>
		<span>Status</span>
		<span class="align-right">Leave left</span>
		<span class="align-right">{data.isSuperAdmin ? '' : ''}</span>
	</div>
	{#each filteredRoster as person (person.id)}
		<!-- The whole row opens the settings panel for Super Admins. Keyboard
		     users get the same via the Settings button in the last cell, so the
		     row itself carries no tab stop and no duplicate announcement. -->
		<div
			class="roster-row"
			class:clickable={data.isSuperAdmin}
			onclick={data.isSuperAdmin ? () => (editingPerson = person) : undefined}
			onkeydown={undefined}
			role={data.isSuperAdmin ? 'presentation' : undefined}
		>
			<span class="name-cell">
				<Avatar
					userId={person.id}
					fullName={person.fullName}
					hasPicture={person.hasPicture}
					size="sm"
				/>
				{person.fullName}
			</span>
			<span class="code-cell">
				{#if person.employeeCode}
					{person.employeeCode}
				{:else}
					<span class="code-missing" title="No employee code — biometric attendance can't be matched"
						>Not set</span
					>
				{/if}
			</span>
			<span class="role">{person.role.replace('_', ' ')}</span>
			<span class="link-cell">
				{#if person.reportsToName}
					{person.reportsToName}
				{:else}
					<span class="code-missing" title="No reporting manager — approvals fall back to HR">
						Not set
					</span>
				{/if}
			</span>
			<span class="link-cell">
				{person.hrName ?? 'Any admin'}
			</span>
			<span class="shift-cell">
				{#if person.shiftGroupName}
					{person.shiftGroupName}
				{:else}
					<span class="code-missing">Not set</span>
				{/if}
			</span>
			<span class="weekoff-cell">
				{person.weekOffName ?? 'Sat + Sun'}
				<span class="weekoff-summary">{person.weekOffSummary}</span>
			</span>
			<span><span class="ess-badge ess-badge--{person.status}">{statusLabel[person.status]}</span></span>
			<span class="align-right">{person.leaveLeft}</span>
			<!-- Buttons sit inside the clickable row, so each stops its click from
			     also opening the panel. -->
			<span class="align-right" onclick={(e) => e.stopPropagation()} role="presentation">
				{#if data.isSuperAdmin}
					<button
						type="button"
						class="row-reset"
						onclick={() => (editingPerson = person)}
						aria-label="Settings for {person.fullName}"
						title="Settings for {person.fullName}"
					>
						<Settings size={15} />
					</button>
				{/if}
				{#if data.isSuperAdmin && person.id !== data.currentUserId}
					{#if confirmingDelete === person.id}
						<span class="confirm-delete">
							<button
								type="button"
								class="ess-btn ess-btn--sm ess-btn--danger"
								onclick={() => deleteEmployee(person.id)}
								disabled={deletingId === person.id}
							>
								{deletingId === person.id ? 'Deleting…' : 'Confirm'}
							</button>
							<button
								type="button"
								class="ess-btn ess-btn--sm ess-btn--ghost"
								onclick={() => (confirmingDelete = null)}
								disabled={deletingId === person.id}
							>
								Cancel
							</button>
						</span>
					{:else}
						<button
							type="button"
							class="row-reset"
							onclick={() => openReset(person)}
							aria-label="Reset password for {person.fullName}"
							title="Reset password for {person.fullName}"
						>
							<KeyRound size={15} />
						</button>
						<button
							type="button"
							class="row-delete"
							onclick={() => (confirmingDelete = person.id)}
							aria-label="Delete {person.fullName}"
							title="Delete {person.fullName}"
						>
							<Trash2 size={15} />
						</button>
					{/if}
				{/if}
			</span>
		</div>
	{:else}
		<p class="ess-empty">No employees match this search.</p>
	{/each}
	<div class="table-foot">
		<span>{filteredRoster.length} of {data.teamSize} employees</span>
	</div>
</div>

<section class="weekoff-section">
	<div class="section-head">
		<div>
			<h2 class="section-title">Week-off Rosters</h2>
			<p class="section-sub">
				{#if data.isSuperAdmin}
					Save a week-off pattern once — all Sundays, Saturday + Sunday, or a rotation that repeats over
					several weeks — then publish it so team managers can apply it. Assigning a roster in the table
					above reflects on that employee's leave calendar straight away.
				{:else}
					Patterns published by the Super Admin. Apply one to anyone on your team from the Week off column
					above; their leave calendar updates immediately.
				{/if}
			</p>
		</div>
		{#if data.isSuperAdmin}
			<button
				class="ess-btn ess-btn--secondary"
				onclick={() => {
					if (showRosterEditor) resetRosterForm();
					showRosterEditor = !showRosterEditor;
				}}
			>
				<CalendarDays size={16} />
				{showRosterEditor ? 'Close' : 'New Roster'}
			</button>
		{/if}
	</div>

	{#if rosterError}
		<p class="ess-error section-gap">{rosterError}</p>
	{/if}

	{#if data.isSuperAdmin && showRosterEditor}
		<div class="create-card roster-editor">
			<label class="ess-field">
				<span class="ess-label">Roster name</span>
				<input class="ess-input" bind:value={rosterName} placeholder="e.g. All Sundays" />
			</label>
			<label class="ess-field">
				<span class="ess-label">Description (optional)</span>
				<input class="ess-input" bind:value={rosterDescription} placeholder="Who this is for" />
			</label>
			<label class="ess-field">
				<span class="ess-label">Applies to</span>
				<select class="ess-select" bind:value={rosterTeamId}>
					<option value="">All teams</option>
					{#each data.allTeams as team (team.id)}
						<option value={team.id}>{team.name}</option>
					{/each}
				</select>
			</label>
			<label class="ess-field">
				<span class="ess-label">Pattern</span>
				<select class="ess-select" bind:value={rosterPattern}>
					<option value="fixed">Same every week</option>
					<option value="rotational">Rotational</option>
				</select>
			</label>

			{#if rosterPattern === 'fixed'}
				<div class="ess-field day-field">
					<span class="ess-label">Days off every week</span>
					<div class="day-picker">
						{#each WEEKDAY_LABELS as label, day (label)}
							<button
								type="button"
								class="day-chip"
								class:selected={rosterWeekdays.includes(day)}
								onclick={() => toggleFixedDay(day)}
								aria-pressed={rosterWeekdays.includes(day)}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<label class="ess-field">
					<span class="ess-label">Week 1 starts</span>
					<input class="ess-input" type="date" bind:value={rosterAnchor} />
				</label>
				<div class="ess-field rotation-field">
					<span class="ess-label">Rotation ({rotationWeeks.length} weeks, then repeats)</span>
					{#each rotationWeeks as week, i (i)}
						<div class="rotation-row">
							<span class="rotation-label">Week {i + 1}</span>
							<div class="day-picker">
								{#each WEEKDAY_LABELS as label, day (label)}
									<button
										type="button"
										class="day-chip"
										class:selected={week.includes(day)}
										onclick={() => toggleRotationDay(i, day)}
										aria-pressed={week.includes(day)}
									>
										{label}
									</button>
								{/each}
							</div>
							{#if rotationWeeks.length > 2}
								<button type="button" class="row-delete" onclick={() => removeRotationWeek(i)} aria-label="Remove week {i + 1}">
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					{/each}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm add-week" onclick={addRotationWeek}>
						Add week
					</button>
				</div>
			{/if}

			<div class="roster-actions">
				<button type="button" class="ess-btn ess-btn--primary" onclick={saveRoster} disabled={rosterSaving}>
					{rosterSaving ? 'Saving…' : editingRosterId ? 'Save changes' : 'Save roster'}
				</button>
				<button
					type="button"
					class="ess-btn ess-btn--ghost"
					onclick={() => {
						resetRosterForm();
						showRosterEditor = false;
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if data.weekOffRosters.length > 0}
		<div class="roster-list">
			{#each data.weekOffRosters as roster (roster.id)}
				<div class="roster-card">
					<div class="roster-card-main">
						<div class="roster-card-head">
							<strong>{roster.name}</strong>
							<span class="ess-badge ess-badge--{roster.status === 'published' ? 'approved' : 'pending'}">
								{roster.status === 'published' ? 'Published' : 'Draft'}
							</span>
							{#if roster.teamId}
								<span class="scope-chip">
									{data.allTeams.find((t) => t.id === roster.teamId)?.name ?? 'Team-specific'}
								</span>
							{:else}
								<span class="scope-chip">All teams</span>
							{/if}
						</div>
						<span class="roster-summary">{roster.summary}</span>
						{#if roster.pattern === 'rotational'}
							<span class="roster-weeks">{roster.weeks.join(' · ')}</span>
						{/if}
						{#if roster.description}
							<span class="roster-desc">{roster.description}</span>
						{/if}
					</div>
					{#if data.isSuperAdmin}
						<div class="roster-card-actions">
							<button type="button" class="ess-btn ess-btn--sm ess-btn--ghost" onclick={() => editRoster(roster)}>
								Edit
							</button>
							<button type="button" class="ess-btn ess-btn--sm ess-btn--secondary" onclick={() => togglePublish(roster)}>
								{roster.status === 'published' ? 'Unpublish' : 'Publish'}
							</button>
							<button
								type="button"
								class="row-delete"
								onclick={() => deleteRoster(roster.id)}
								aria-label="Delete {roster.name}"
								title="Delete {roster.name}"
							>
								<Trash2 size={15} />
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="ess-empty">
			{data.isSuperAdmin
				? 'No week-off rosters yet — everyone is on the default Saturday + Sunday.'
				: 'No published rosters yet. Everyone on your team is on the default Saturday + Sunday.'}
		</p>
	{/if}
</section>

{#if data.isSuperAdmin}
	<section class="bulk-import-section">
		<div class="section-head">
			<div>
				<h2 class="section-title">Bulk Import Logins</h2>
				<p class="section-sub">
					Upload any HR spreadsheet — the sheet and columns are detected automatically. New logins use <code>Champ@123</code> and must
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
			{#if form?.bulkImportSheet}
				<p class="mapping-note">
					Read sheet <strong>"{form.bulkImportSheet}"</strong>
					{#if form.bulkImportStrategy === 'ai-mapped'}
						— columns were matched automatically, so check the rows below carefully.
					{:else}
						using known column names.
					{/if}
					{#if form.bulkImportNote}<br /><em>{form.bulkImportNote}</em>{/if}
				</p>
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
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
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
		flex-wrap: wrap;
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

	/* The 5-column roster can't compress below ~640px and stay readable, so
	   it scrolls inside its own shell instead of overflowing the page. */
	.roster-shell {
		overflow-x: auto;
	}

	.roster-row {
		display: grid;
		grid-template-columns: 1.5fr 0.8fr 0.9fr 1.1fr 1.1fr 1fr 1.2fr 0.9fr 0.6fr 0.8fr;
		padding: 0.7rem 1.1rem;
		font-size: var(--ess-fs-body);
		align-items: center;
		min-width: 1280px;
	}

	/* The whole row opens the settings panel, so it reads as a target. */
	.roster-row.clickable {
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}

	.roster-row.clickable:hover {
		background: var(--ess-sunken);
	}

	.link-cell {
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.weekoff-cell {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* The pattern in words under the roster name — "Rotational A" means nothing
	   on its own, "Week 2: Sat + Sun" is what the manager actually needs. */
	.weekoff-summary {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shift-cell {
		min-width: 0;
	}

	.shift-select {
		width: 100%;
		max-width: 150px;
		background: var(--ess-field-bg);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-xs);
		color: var(--ess-text);
		font-size: var(--ess-fs-caption);
		padding: 4px 6px;
		cursor: pointer;
	}

	.shift-select:hover:not(:disabled) {
		border-color: var(--ess-primary);
	}

	.shift-select:disabled {
		opacity: 0.5;
	}

	/* Unassigned is a real problem — it leaves the employee with no holiday
	   calendar — so it reads as a warning rather than a neutral empty value. */
	.shift-select.shift-unset {
		color: var(--ess-warning);
		border-color: var(--ess-warning);
	}

	.code-cell {
		font-family: var(--ess-font-mono);
		font-size: var(--ess-fs-caption);
		letter-spacing: 0.02em;
		color: var(--ess-text);
	}

	.code-missing {
		font-family: var(--ess-font-sans);
		color: var(--ess-warning);
	}

	.row-delete {
		background: transparent;
		border: none;
		color: var(--ess-text-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		display: inline-flex;
		transition:
			color var(--ess-t-fast),
			background var(--ess-t-fast);
	}

	.reset-panel {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		padding: 16px 18px;
		margin-bottom: 14px;
	}

	.reset-head {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ess-text);
		margin-bottom: 6px;
	}

	.reset-note {
		color: var(--ess-text-secondary);
		font-size: var(--ess-fs-caption);
		margin: 0 0 12px;
		max-width: 74ch;
	}

	.reset-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.reset-input {
		font-family: var(--ess-font-mono);
		max-width: 260px;
	}

	.reset-issued {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		background: var(--ess-success-bg);
		border: 1px solid var(--ess-success);
		color: var(--ess-text);
		border-radius: var(--ess-radius-md);
		padding: 12px 16px;
		margin-bottom: 14px;
		font-size: var(--ess-fs-caption);
	}

	.reset-issued code {
		font-family: var(--ess-font-mono);
		font-size: var(--ess-fs-body);
		font-weight: 600;
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-xs);
		padding: 4px 10px;
		user-select: all;
	}

	.row-reset {
		background: transparent;
		border: none;
		color: var(--ess-text-muted);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		display: inline-flex;
		margin-right: 2px;
		transition:
			color var(--ess-t-fast),
			background var(--ess-t-fast);
	}

	.row-reset:hover {
		color: var(--ess-primary-text);
		background: var(--ess-primary-soft);
	}

	.row-delete:hover {
		color: var(--ess-danger);
		background: var(--ess-danger-bg);
	}

	.confirm-delete {
		display: inline-flex;
		gap: 0.35rem;
		justify-content: flex-end;
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

	.email-cell {
		color: var(--ess-text-secondary);
	}

	.role {
		text-transform: capitalize;
		color: var(--ess-text-secondary);
		min-width: 0;
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

	.weekoff-section,
	.bulk-import-section,
	.password-activity-section {
		margin-top: 2rem;
	}

	.roster-editor {
		align-items: flex-start;
	}

	.day-field,
	.rotation-field {
		flex-basis: 100%;
	}

	.day-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	/* A row of weekday toggles reads faster than a multi-select, and makes the
	   selected pattern legible at a glance while it's being built. */
	.day-chip {
		min-width: 46px;
		padding: 6px 10px;
		border-radius: var(--ess-radius-pill);
		border: 1px solid var(--ess-border);
		background: var(--ess-field-bg);
		color: var(--ess-text-secondary);
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition:
			background var(--ess-t-fast),
			color var(--ess-t-fast),
			border-color var(--ess-t-fast);
	}

	.day-chip:hover {
		border-color: var(--ess-primary);
	}

	.day-chip.selected {
		background: var(--ess-primary);
		border-color: var(--ess-primary);
		color: var(--ess-text-on-primary);
	}

	.rotation-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.rotation-label {
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		color: var(--ess-text-secondary);
		min-width: 4.2rem;
	}

	.add-week {
		margin-top: 4px;
	}

	.roster-actions {
		display: flex;
		gap: 8px;
		flex-basis: 100%;
	}

	.roster-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.roster-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.8rem 1rem;
	}

	.roster-card-main {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.roster-card-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.scope-chip {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-pill);
		padding: 0.1rem 0.5rem;
	}

	.roster-summary {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text);
	}

	.roster-weeks,
	.roster-desc {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	.roster-card-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
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

	.mapping-note {
		display: block;
		margin-bottom: 1rem;
		padding: 0.6rem 0.9rem;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-info-bg);
		color: var(--ess-info);
		font-size: var(--ess-fs-caption);
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
