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
	<h1 class="section-title">Team Roster</h1>
	<p class="section-subtitle">Live status and pending approvals for your team</p>
</header>

<div class="summary-row">
	<div class="summary-card">
		<span class="eyebrow">Team Size</span>
		<span class="summary-value">{data.roster.length}</span>
	</div>
	<div class="summary-card">
		<span class="eyebrow">Pending Approvals</span>
		<span class="summary-value">{data.pendingApprovals}</span>
	</div>
	<button class="btn btn-primary create-btn" onclick={() => (showCreateForm = !showCreateForm)}>
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
		<label>
			<span>Full Name</span>
			<input name="fullName" required />
		</label>
		<label>
			<span>Email</span>
			<input name="email" type="email" required />
		</label>
		{#if data.creatableRoles.length > 1}
			<label>
				<span>Role</span>
				<select name="role">
					{#each data.creatableRoles as role (role)}
						<option value={role}>{role.replace('_', ' ')}</option>
					{/each}
				</select>
			</label>
		{:else}
			<input type="hidden" name="role" value={data.creatableRoles[0]} />
		{/if}
		<button type="submit" class="btn btn-primary">Create Login</button>
	</form>
	{#if form?.success}
		<p class="temp-pass">
			Created {form.email} — temporary password: <code>{form.tempPassword}</code>
		</p>
	{:else if form?.message}
		<p class="error">{form.message}</p>
	{/if}
{/if}

<div class="roster-table">
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
			<span class="status-pill status-{person.status}">{statusLabel[person.status]}</span>
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
		background: var(--color-mint);
		border-radius: var(--radius-md);
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 160px;
	}

	.summary-value {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.create-btn {
		margin-left: auto;
	}

	.create-card {
		background: var(--color-white);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 1.25rem;
		display: flex;
		gap: 1rem;
		align-items: end;
		margin-bottom: 1rem;
	}

	.create-card label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		flex: 1;
	}

	.create-card input {
		border: 1px solid #d7e6e4;
		border-radius: var(--radius-sm);
		padding: 0.55rem 0.7rem;
	}

	.temp-pass {
		background: var(--color-mint);
		border-radius: var(--radius-sm);
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.roster-table {
		background: var(--color-white);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.roster-row {
		display: grid;
		grid-template-columns: 1.2fr 1.5fr 0.8fr 0.8fr;
		padding: 0.8rem 1.1rem;
		font-size: 0.88rem;
		align-items: center;
	}

	.roster-row:not(:last-child) {
		border-bottom: 1px solid var(--color-mint);
	}

	.roster-head {
		font-weight: 700;
		color: var(--color-text-soft);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.role {
		text-transform: capitalize;
		color: var(--color-text-soft);
	}

	.status-pill {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		width: fit-content;
	}

	.status-present {
		background: #d5f5ec;
		color: #027a5f;
	}

	.status-left {
		background: var(--color-mint);
		color: var(--color-text-soft);
	}

	.status-absent {
		background: #fbe0e0;
		color: #c0392b;
	}
</style>
