<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let showCreateForm = $state(false);

	const statusLabel: Record<string, string> = {
		present: 'Present',
		left: 'Checked out',
		absent: 'Absent'
	};
</script>

<svelte:head>
	<title>Team — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Team Roster</h1>
	<p class="ess-page-sub">Live status and pending approvals for your team</p>
</header>

<div class="summary-row">
	<div class="summary-card">
		<span class="ess-eyebrow">Team Size</span>
		<span class="summary-value">{data.roster.length}</span>
	</div>
	<div class="summary-card">
		<span class="ess-eyebrow">Pending Approvals</span>
		<span class="summary-value">{data.pendingApprovals}</span>
	</div>
	<button class="ess-btn ess-btn--primary create-btn" onclick={() => (showCreateForm = !showCreateForm)}>
		<Users size={16} />
		Add Employee
	</button>
</div>

{#if showCreateForm}
	<form
		method="POST"
		action="?/createEmployee"
		use:enhance
		class="create-card"
	>
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
		<button type="submit" class="ess-btn ess-btn--primary">Create Login</button>
	</form>
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
	</div>
	{#each data.roster as person (person.id)}
		<div class="roster-row">
			<span>{person.fullName}</span>
			<span>{person.email}</span>
			<span class="role">{person.role.replace('_', ' ')}</span>
			<span class="ess-badge ess-badge--{person.status}">{statusLabel[person.status]}</span>
		</div>
	{/each}
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.summary-row {
		display: flex;
		gap: 1rem;
		align-items: stretch;
		margin-bottom: 1.5rem;
	}

	.summary-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 160px;
	}

	.summary-value {
		font-family: var(--ess-font-display);
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--ess-text);
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
		gap: 1rem;
		align-items: end;
		margin-bottom: 1rem;
	}

	.create-card .ess-field {
		flex: 1;
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
		grid-template-columns: 1.2fr 1.5fr 0.8fr 0.8fr;
		padding: 0.8rem 1.1rem;
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

	.role {
		text-transform: capitalize;
		color: var(--ess-text-secondary);
	}
</style>
