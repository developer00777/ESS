<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();

	let leaveTypeId = $state(data.types[0]?.id ?? '');
	let startDate = $state('');
	let endDate = $state('');
	let reason = $state('');
	let error = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			const res = await fetch('/api/leave', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ leaveTypeId, startDate, endDate, reason })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message ?? 'Could not submit leave application';
				return;
			}
			await goto('/leave');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Apply Leave — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="section-title">Apply for Leave</h1>
	<p class="section-subtitle">Submit a request — it routes to your manager automatically</p>
</header>

<form class="apply-card" onsubmit={handleSubmit}>
	<label>
		<span>Leave Type</span>
		<select bind:value={leaveTypeId} required>
			{#each data.types as type (type.id)}
				<option value={type.id}>{type.name}</option>
			{/each}
		</select>
	</label>

	<div class="date-row">
		<label>
			<span>Start Date</span>
			<input type="date" bind:value={startDate} required />
		</label>
		<label>
			<span>End Date</span>
			<input type="date" bind:value={endDate} required />
		</label>
	</div>

	<label>
		<span>Reason (optional)</span>
		<textarea bind:value={reason} rows="4" placeholder="Add any context for your manager"></textarea>
	</label>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<div class="actions">
		<button type="submit" class="btn btn-primary" disabled={submitting}>
			{submitting ? 'Submitting…' : 'Submit Request'}
		</button>
		<a href="/leave" class="btn btn-ghost">Cancel</a>
	</div>
</form>

<style>
	.page-header {
		margin-bottom: 1.75rem;
	}

	.apply-card {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 1.75rem;
		max-width: 560px;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.date-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	input,
	select,
	textarea {
		border: 1px solid #d7e6e4;
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		font-family: inherit;
	}

	textarea {
		resize: vertical;
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.actions a {
		text-decoration: none;
	}
</style>
