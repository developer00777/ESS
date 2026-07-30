<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let showCreateForm = $state(false);
	let search = $state('');
	let filter = $state<'all' | 'present' | 'absent'>('all');

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
</style>
