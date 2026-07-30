<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import StepTracker from '$lib/components/StepTracker.svelte';
	import LeaveCalendar from '$lib/components/LeaveCalendar.svelte';

	let { data } = $props();

	const canSeeNames = data.user?.role === 'team_lead' || data.user?.role === 'super_admin';

	const calendarLeaveEvents = data.leaveEvents.map((row) => ({
		id: row.application.id,
		startDate: row.application.startDate,
		endDate: row.application.endDate,
		status: row.application.status,
		applicantName: row.applicant.fullName,
		typeName: row.type.name
	}));

	function statusIndex(status: string): number {
		if (status === 'approved') return 3;
		if (status === 'rejected' || status === 'escalated' || status === 'cancelled') return 1;
		return 0; // pending
	}

	const workflowSteps = [
		{ label: 'Employee Request' },
		{ label: 'Manager Approval' },
		{ label: 'HR Verification' },
		{ label: 'Leave Updated' }
	];

	async function decide(applicationId: string, decision: 'approve' | 'reject') {
		const res = await fetch(`/api/leave/${applicationId}/approve`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ decision })
		});
		if (res.ok) {
			location.reload();
		} else {
			const body = await res.json().catch(() => ({}));
			alert(body.message ?? 'Could not process this request');
		}
	}
</script>

<svelte:head>
	<title>Leave Management — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="section-title">Leave Management</h1>
	<p class="section-subtitle">From request to approval — fully digital</p>
	<a href="/leave/apply" class="btn btn-primary apply-btn">
		<Calendar size={16} />
		Apply Leave
	</a>
</header>

<section class="calendar-section">
	<span class="eyebrow">
		{canSeeNames ? 'Team Leave Calendar' : 'Leave Calendar'}
	</span>
	<LeaveCalendar
		holidays={data.calendarHolidays}
		leaveEvents={calendarLeaveEvents}
		showNames={canSeeNames}
		size="large"
	/>
</section>

<div class="layout">
	<section>
		<span class="eyebrow">Leave Balance</span>
		<div class="balance-grid">
			{#each data.allocations as row (row.allocation.id)}
				<div class="balance-card">
					<span class="balance-label">{row.type.name}</span>
					<span class="balance-value"
						>{Number(row.allocation.allocatedDays) - Number(row.allocation.usedDays)} days</span
					>
				</div>
			{/each}
		</div>

		<span class="eyebrow section-gap">My Applications</span>
		<div class="applications-list">
			{#each data.myApplications as row (row.application.id)}
				<div class="application-row">
					<div class="app-meta">
						<strong>{row.type.name}</strong>
						<span>{row.application.startDate} → {row.application.endDate} ({row.application.days} days)</span>
					</div>
					<span class="status-pill status-{row.application.status}">{row.application.status}</span>
				</div>
			{:else}
				<p class="empty">No leave applications yet.</p>
			{/each}
		</div>
	</section>

	<aside>
		<span class="eyebrow">Approval Workflow</span>
		<StepTracker steps={workflowSteps} currentIndex={0} />

		{#if data.approvalQueue.length > 0}
			<span class="eyebrow section-gap">Pending Approvals</span>
			<div class="applications-list">
				{#each data.approvalQueue as row (row.application.id)}
					<div class="application-row">
						<div class="app-meta">
							<strong>{row.applicant.fullName}</strong>
							<span>{row.type.name} · {row.application.startDate} → {row.application.endDate} ({row.application.days} days)</span>
						</div>
						<div class="approve-actions">
							<button class="btn btn-primary" onclick={() => decide(row.application.id, 'approve')}>
								Approve
							</button>
							<button class="btn btn-ghost" onclick={() => decide(row.application.id, 'reject')}>
								Reject
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</aside>
</div>

<style>
	.page-header {
		margin-bottom: 1.75rem;
		position: relative;
	}

	.apply-btn {
		position: absolute;
		top: 0;
		right: 0;
		text-decoration: none;
	}

	.calendar-section {
		margin-bottom: 2.5rem;
	}

	.calendar-section .eyebrow {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.layout {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 2rem;
		align-items: start;
	}

	.balance-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.85rem;
		margin: 0.75rem 0 1.5rem;
	}

	.balance-card {
		background: var(--color-mint);
		border-radius: var(--radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.balance-label {
		font-size: 0.8rem;
		color: var(--color-text-soft);
	}

	.balance-value {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.section-gap {
		display: block;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
	}

	.applications-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.application-row {
		background: var(--color-white);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 0.9rem 1.1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.app-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.app-meta span {
		font-size: 0.8rem;
		color: var(--color-text-soft);
	}

	.status-pill {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: capitalize;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.status-pending {
		background: #fdf0d5;
		color: #a16207;
	}

	.status-approved {
		background: #d5f5ec;
		color: #027a5f;
	}

	.status-rejected {
		background: #fbe0e0;
		color: #c0392b;
	}

	.status-escalated,
	.status-cancelled {
		background: var(--color-mint);
		color: var(--color-text-soft);
	}

	.approve-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.empty {
		color: var(--color-text-soft);
		font-size: 0.9rem;
	}

	@media (max-width: 980px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
