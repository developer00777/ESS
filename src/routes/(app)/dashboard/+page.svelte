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
	import StatCard from '$lib/components/StatCard.svelte';
	import QuickActionRow from '$lib/components/QuickActionRow.svelte';
	import IconChip from '$lib/components/IconChip.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Dashboard — Champ HR ESS Portal</title>
</svelte:head>

<div class="dashboard">
	<div class="welcome-bar">
		<h1 class="ess-page-title">Welcome back, {data.user.fullName.split(' ')[0]}</h1>
		<div class="bell-chip"><Bell size={18} /></div>
	</div>

	<div class="dashboard-grid">
		<section class="left">
			<div class="stat-grid">
				<StatCard icon={Calendar} label="Leave Balance" value="{data.leaveBalance} Days" />
				<StatCard icon={Clock} label="Attendance" value="{data.attendancePct}%" />
				<StatCard icon={Wallet} label="Latest Payslip" value="Not yet generated" />
				<StatCard icon={Clipboard} label="Pending Requests" value="{data.pendingCount} Open" />
			</div>

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
			<span class="ess-eyebrow">Quick Actions</span>
			<div class="action-list">
				<QuickActionRow icon={Calendar} label="Apply Leave" href="/leave/apply" />
				<QuickActionRow icon={Clock} label="Mark Attendance" href="/attendance" />
				<QuickActionRow icon={Wallet} label="View Payslip" href="/payroll" />
				<QuickActionRow icon={User} label="Update Profile" href="/profile" />
			</div>

			<span class="ess-eyebrow also-visible">Also Visible</span>
			<div class="action-list">
				<QuickActionRow icon={Megaphone} label="Company Announcements" />
				<QuickActionRow icon={Bell} label="HR Notifications" />
			</div>
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

	.stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
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
		margin-bottom: 8px;
	}

	.also-visible {
		margin-top: 8px;
	}

	@media (max-width: 980px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
