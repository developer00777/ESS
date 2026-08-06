<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import StepTracker from '$lib/components/StepTracker.svelte';
	import LeaveCalendar from '$lib/components/LeaveCalendar.svelte';

	let { data } = $props();

	const canSeeNames = data.user?.role === 'team_lead' || data.user?.role === 'super_admin';
	const canApprove = data.user?.role === 'team_lead' || data.user?.role === 'super_admin';

	const calendarLeaveEvents = data.leaveEvents.map((row) => ({
		id: row.application.id,
		startDate: row.application.startDate,
		endDate: row.application.endDate,
		status: row.application.status,
		applicantName: row.applicant.fullName,
		typeName: row.type.name
	}));

	type Tab = 'mine' | 'calendar' | 'approvals';
	let tab = $state<Tab>('mine');

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

<div class="ess-tabs page-tabs">
	<button type="button" class="ess-tab" aria-selected={tab === 'mine'} onclick={() => (tab = 'mine')}>
		My leave
	</button>
	<button
		type="button"
		class="ess-tab"
		aria-selected={tab === 'calendar'}
		onclick={() => (tab = 'calendar')}
	>
		{canSeeNames ? 'Team calendar' : 'Calendar'}
	</button>
	{#if canApprove}
		<button
			type="button"
			class="ess-tab"
			aria-selected={tab === 'approvals'}
			onclick={() => (tab = 'approvals')}
		>
			Approvals
			{#if data.approvalQueue.length > 0}
				<span class="tab-badge">{data.approvalQueue.length}</span>
			{/if}
		</button>
	{/if}
</div>

{#if tab === 'mine'}
	<div class="balance-grid">
		{#each data.allocations as row (row.allocation.id)}
			{@const remaining = Number(row.allocation.allocatedDays) - Number(row.allocation.usedDays)}
			{@const pct = Math.max(0, Math.min(100, (remaining / Number(row.allocation.allocatedDays)) * 100))}
			<div class="balance-card">
				<span class="balance-label">{row.type.name}</span>
				<div class="balance-value-row">
					<span class="balance-value">{remaining}</span>
					<span class="balance-cap">/ {row.allocation.allocatedDays}</span>
				</div>
				<div class="balance-bar"><div class="balance-bar-fill" style="width:{pct}%"></div></div>
			</div>
		{/each}

		{#each data.monthlyBalances as row (row.typeId)}
			{@const pct = Math.max(0, Math.min(100, (row.remaining / row.quota) * 100))}
			<div class="balance-card">
				<span class="balance-label">{row.name}</span>
				<div class="balance-value-row">
					<span class="balance-value">{row.remaining}</span>
					<span class="balance-cap">/ {row.quota} this month</span>
				</div>
				<div class="balance-bar">
					<div class="balance-bar-fill balance-bar-fill--monthly" style="width:{pct}%"></div>
				</div>
				<span class="balance-note">Resets monthly · doesn't carry over</span>
			</div>
		{/each}
	</div>

	<div class="layout">
		<section>
			<span class="ess-eyebrow">
				{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
			</span>
			<LeaveCalendar
				holidays={data.calendarHolidays}
				leaveEvents={calendarLeaveEvents}
				showNames={false}
				weekOffRosters={data.weekOffRosters}
				weekOffAssignments={data.weekOffAssignments}
				weekOffLabel={data.myWeekOff?.summary ?? null}
			/>

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
		</aside>
	</div>
{:else if tab === 'calendar'}
	<section class="calendar-section">
		<LeaveCalendar
			holidays={data.calendarHolidays}
			leaveEvents={calendarLeaveEvents}
			showNames={canSeeNames}
			size="large"
			weekOffRosters={data.weekOffRosters}
			weekOffAssignments={data.weekOffAssignments}
			weekOffLabel={data.myWeekOff?.summary ?? null}
		/>
	</section>
{:else if tab === 'approvals'}
	<section class="approvals-section">
		<span class="ess-eyebrow">Pending Approvals</span>
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
			{:else}
				<p class="ess-empty">No pending approvals right now.</p>
			{/each}
		</div>
	</section>
{/if}

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

	.page-tabs {
		margin-bottom: 1.5rem;
	}

	.tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		margin-left: 6px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
		font-size: 10px;
		font-weight: 700;
	}

	.calendar-section {
		margin-bottom: 2.5rem;
	}

	.section-gap {
		display: block;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
	}

	.approvals-section .ess-eyebrow {
		display: block;
		margin-bottom: 0.75rem;
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(260px, 1fr);
		gap: 2rem;
		align-items: start;
	}

	/* Grid items default to min-width:auto, which refuses to shrink below their
	   content and pushes the page wide on phones. */
	.layout > * {
		min-width: 0;
	}

	.balance-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.85rem;
		margin-bottom: 1.5rem;
	}

	.balance-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.balance-label {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-text-secondary);
	}

	.balance-value-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.balance-value {
		font-family: var(--ess-font-display);
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	.balance-cap {
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
	}

	.balance-bar {
		height: 4px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		overflow: hidden;
	}

	.balance-bar-fill {
		height: 100%;
		background: var(--ess-primary);
	}

	/* Monthly-quota leave reads differently from an annual balance, so it gets
	   its own accent and a note that it expires. */
	.balance-bar-fill--monthly {
		background: #ec4899;
	}

	.balance-note {
		font-size: var(--ess-fs-eyebrow);
		color: var(--ess-text-secondary);
		margin-top: 0.35rem;
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

	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
