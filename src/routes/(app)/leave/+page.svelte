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
	<h1 class="ess-page-title">Leave Management</h1>
	<p class="ess-page-sub">From request to approval — fully digital</p>
	<a href="/leave/apply" class="ess-btn ess-btn--primary apply-btn">
		<Calendar size={16} />
		Apply Leave
	</a>
</header>

<section class="calendar-section">
	<span class="ess-eyebrow">
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
		<span class="ess-eyebrow">Leave Balance</span>
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

		<span class="ess-eyebrow section-gap">My Applications</span>
		<div class="applications-list">
			{#each data.myApplications as row (row.application.id)}
				<div class="application-row">
					<div class="app-meta">
						<strong>{row.type.name}</strong>
						<span>{row.application.startDate} → {row.application.endDate} ({row.application.days} days)</span>
					</div>
					<span class="ess-badge ess-badge--{row.application.status}">{row.application.status}</span>
				</div>
			{:else}
				<p class="ess-empty">No leave applications yet.</p>
			{/each}
		</div>
	</section>

	<aside>
		<span class="ess-eyebrow">Approval Workflow</span>
		<StepTracker steps={workflowSteps} currentIndex={0} />

		{#if data.approvalQueue.length > 0}
			<span class="ess-eyebrow section-gap">Pending Approvals</span>
			<div class="applications-list">
				{#each data.approvalQueue as row (row.application.id)}
					<div class="application-row">
						<div class="app-meta">
							<strong>{row.applicant.fullName}</strong>
							<span>{row.type.name} · {row.application.startDate} → {row.application.endDate} ({row.application.days} days)</span>
						</div>
						<div class="approve-actions">
							<button class="ess-btn ess-btn--primary" onclick={() => decide(row.application.id, 'approve')}>
								Approve
							</button>
							<button class="ess-btn ess-btn--ghost" onclick={() => decide(row.application.id, 'reject')}>
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

	.calendar-section .ess-eyebrow {
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
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.balance-label {
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
	}

	.balance-value {
		font-family: var(--ess-font-display);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--ess-text);
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
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
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
		color: var(--ess-text-secondary);
	}

	.approve-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	@media (max-width: 980px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
