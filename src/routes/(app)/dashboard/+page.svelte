<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Clipboard from '@lucide/svelte/icons/clipboard';
	import Bell from '@lucide/svelte/icons/bell';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import User from '@lucide/svelte/icons/user';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Headset from '@lucide/svelte/icons/headset';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import StatCard from '$lib/components/StatCard.svelte';
	import QuickActionRow from '$lib/components/QuickActionRow.svelte';
	import IconChip from '$lib/components/IconChip.svelte';

	let { data } = $props();

	const canApprove = data.user.role === 'team_lead' || data.user.role === 'super_admin';

	function initials(name: string) {
		return name
			.split(' ')
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	function formatHolidayDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			day: '2-digit',
			month: 'short'
		});
	}

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
	<title>Dashboard — Champ HR ESS Portal</title>
</svelte:head>

<div class="dashboard">
	<div class="welcome-bar">
		<h1 class="ess-page-title">Welcome back, {data.user.fullName.split(' ')[0]}</h1>
		<div class="bell-chip"><Bell size={18} /></div>
	</div>

	<div class="stat-grid">
		<StatCard icon={Calendar} label="Leave Balance" value="{data.leaveBalance} Days" />
		<StatCard icon={Clock} label="Attendance" value="{data.attendancePct}%" />
		<StatCard icon={Wallet} label="Latest Payslip" value="Not yet generated" />
		<StatCard icon={Clipboard} label="Pending Requests" value="{data.pendingCount} Open" />
	</div>

	<div class="dashboard-grid">
		<section class="left">
			{#if canApprove}
				<div>
					<div class="section-head">
						<span class="ess-eyebrow">Needs your attention</span>
						<a href="/leave" class="view-all">View all {data.approvalQueue.length}</a>
					</div>
					<div class="attention-list">
						{#each data.approvalQueue as row (row.application.id)}
							<div class="attention-row">
								<div class="avatar">{initials(row.applicant.fullName)}</div>
								<div class="attention-meta">
									<div class="attention-name">{row.applicant.fullName}</div>
									<div class="attention-detail">
										{row.type.name} · {row.application.startDate} – {row.application.endDate} ({row.application.days} days)
									</div>
								</div>
								<div class="attention-actions">
									<button class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => decide(row.application.id, 'approve')}>
										Approve
									</button>
									<button class="ess-btn ess-btn--secondary ess-btn--sm" onclick={() => decide(row.application.id, 'reject')}>
										Reject
									</button>
								</div>
							</div>
						{:else}
							<p class="ess-empty">No pending approvals right now.</p>
						{/each}
					</div>
				</div>
			{/if}

			{#if data.upcomingHolidays.length > 0}
				<div>
					<span class="ess-eyebrow">Coming up</span>
					<div class="coming-up-grid">
						{#each data.upcomingHolidays as holiday (holiday.id)}
							<div class="coming-up-card">
								<div class="coming-up-head">
									<IconChip icon={CalendarDays} size="sm" />
									<strong>{holiday.name}</strong>
								</div>
								<p>{formatHolidayDate(holiday.date)} · {holiday.type.toLowerCase()} holiday</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="quick-links">
				<span class="ess-eyebrow">Quick Links</span>
				<a href="/policies" class="link-card">
					<IconChip icon={BookOpen} size="md" />
					<span class="link-text">
						<strong>Company Policies</strong>
						<span>Centralized access to every HR policy document</span>
					</span>
				</a>
				<a href="/hr-contacts" class="link-card">
					<IconChip icon={Headset} size="md" />
					<span class="link-text">
						<strong>HR Contacts</strong>
						<span>Direct line to the right HR representative</span>
					</span>
				</a>
			</div>
		</section>

		<aside class="right">
			<div class="right-panel">
				<span class="ess-eyebrow">Quick Actions</span>
				<div class="action-list">
					<QuickActionRow icon={Calendar} label="Apply Leave" href="/leave/apply" />
					<QuickActionRow icon={Clock} label="Mark Attendance" href="/attendance" />
					<QuickActionRow icon={Wallet} label="View Payslip" href="/payroll" />
					<QuickActionRow icon={User} label="Update Profile" href="/profile" />
				</div>
			</div>

			<div class="right-panel">
				<span class="ess-eyebrow">Also Visible</span>
				<div class="action-list">
					<QuickActionRow icon={Megaphone} label="Company Announcements" />
					<QuickActionRow icon={Bell} label="HR Notifications" />
				</div>
			</div>

			<a href="/policies" class="policies-row">
				<IconChip icon={BookOpen} size="md" />
				<span class="link-text">
					<strong>Company policies</strong>
					<span>Holiday calendar &amp; leave rules</span>
				</span>
				<ChevronRight size={16} class="chevron" />
			</a>
		</aside>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.welcome-bar {
		background: var(--ess-inverse);
		border-radius: var(--ess-radius-lg);
		padding: 20px 22px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.welcome-bar :global(h1) {
		color: var(--ess-text-inverse);
	}

	.bell-chip {
		width: 34px;
		height: 34px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 20px;
		align-items: start;
	}

	.left {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.view-all {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ess-primary);
		text-decoration: none;
	}

	.attention-list {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		overflow: hidden;
	}

	.attention-list .ess-empty {
		padding: 16px;
	}

	.attention-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
	}

	.attention-row:not(:last-child) {
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.avatar {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--ess-green-400);
		color: var(--ess-teal-900);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.attention-meta {
		min-width: 0;
	}

	.attention-name {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.attention-detail {
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
	}

	.attention-actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.coming-up-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		margin-top: 10px;
	}

	.coming-up-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 16px 18px;
	}

	.coming-up-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.coming-up-head strong {
		font-size: 0.875rem;
	}

	.coming-up-card p {
		font-size: 0.8125rem;
		color: var(--ess-text-secondary);
		text-transform: capitalize;
	}

	.quick-links {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.link-card {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 16px 18px;
		text-decoration: none;
		transition: border-color var(--ess-t-fast);
	}

	.link-card:hover {
		border-color: var(--ess-border-strong);
	}

	.link-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.link-text strong {
		font-size: var(--ess-fs-body);
		color: var(--ess-text);
	}

	.link-text span {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	.right {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.right-panel {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.action-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.policies-row {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 16px 18px;
		text-decoration: none;
		transition: border-color var(--ess-t-fast);
	}

	.policies-row:hover {
		border-color: var(--ess-border-strong);
	}

	.policies-row :global(.chevron) {
		margin-left: auto;
		color: var(--ess-text-muted);
	}

	@media (max-width: 980px) {
		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
		.coming-up-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
