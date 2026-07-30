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

	let { data } = $props();
</script>

<svelte:head>
	<title>Dashboard — Champ HR ESS Portal</title>
</svelte:head>

<div class="dashboard-grid">
	<section class="left">
		<div class="welcome-bar">
			<h1>Welcome back, {data.user.fullName.split(' ')[0]}</h1>
			<div class="bell-chip"><Bell size={18} /></div>
		</div>

		<div class="stat-grid">
			<StatCard icon={Calendar} label="Leave Balance" value="{data.leaveBalance} Days" />
			<StatCard icon={Clock} label="Attendance" value="{data.attendancePct}%" />
			<StatCard icon={Wallet} label="Latest Payslip" value="Not yet generated" />
			<StatCard icon={Clipboard} label="Pending Requests" value="{data.pendingCount} Open" />
		</div>

		<div class="quick-links">
			<span class="eyebrow eyebrow-light">Quick Links</span>
			<a href="/policies" class="link-card">
				<span class="link-icon"><BookOpen size={20} /></span>
				<span class="link-text">
					<strong>Company Policies</strong>
					<span>Centralized access to every HR policy document</span>
				</span>
			</a>
			<a href="/hr-contacts" class="link-card">
				<span class="link-icon"><Headset size={20} /></span>
				<span class="link-text">
					<strong>HR Contacts</strong>
					<span>Direct line to the right HR representative</span>
				</span>
			</a>
		</div>
	</section>

	<aside class="right">
		<span class="eyebrow">Quick Actions</span>
		<div class="action-list">
			<QuickActionRow icon={Calendar} label="Apply Leave" href="/leave/apply" />
			<QuickActionRow icon={Clock} label="Mark Attendance" href="/attendance" />
			<QuickActionRow icon={Wallet} label="View Payslip" href="/payroll" />
			<QuickActionRow icon={User} label="Update Profile" href="/profile" />
		</div>

		<span class="eyebrow also-visible">Also Visible</span>
		<div class="action-list">
			<QuickActionRow icon={Megaphone} label="Company Announcements" />
			<QuickActionRow icon={Bell} label="HR Notifications" />
		</div>
	</aside>
</div>

<style>
	.dashboard-grid {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 1.75rem;
		align-items: start;
	}

	.left {
		background: var(--color-ink);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.welcome-bar {
		background: var(--color-panel);
		border-radius: var(--radius-md);
		padding: 1rem 1.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.welcome-bar h1 {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-inverse);
	}

	.bell-chip {
		width: 34px;
		height: 34px;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-white);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.quick-links {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.eyebrow-light {
		color: rgba(242, 248, 247, 0.6);
	}

	.link-card {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		background: var(--color-panel);
		border-radius: var(--radius-md);
		padding: 0.9rem 1.1rem;
		text-decoration: none;
		transition: background 0.15s ease;
	}

	.link-card:hover {
		background: #064a4f;
	}

	.link-icon {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		background: var(--color-white);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.link-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.link-text strong {
		font-size: 0.92rem;
		color: var(--color-text-inverse);
	}

	.link-text span {
		font-size: 0.78rem;
		color: rgba(242, 248, 247, 0.65);
	}

	.right {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		box-shadow: var(--shadow-card);
	}

	.action-list {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 0.5rem;
	}

	.also-visible {
		margin-top: 0.5rem;
	}

	@media (max-width: 980px) {
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
