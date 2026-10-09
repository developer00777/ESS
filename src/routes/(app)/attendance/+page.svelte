<script lang="ts">
	import { page } from '$app/state';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import AttendanceCalendar from '$lib/components/AttendanceCalendar.svelte';
	import CompOffClaim from '$lib/components/CompOffClaim.svelte';
	import DeviationRequest from '$lib/components/DeviationRequest.svelte';
	import SopReviewQueue from '$lib/components/SopReviewQueue.svelte';

	let { data } = $props();

	const today = $derived(data.today);

	const monthLabel = $derived(
		new Date(Number(data.viewMonth.slice(0, 4)), Number(data.viewMonth.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
	);
	const statPeriod = $derived(data.isCurrentMonth ? 'this month' : `in ${monthLabel}`);

	const OFFICE_TZ = 'Asia/Kolkata';
	function formatTime(value: string | Date | null | undefined) {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString('en-IN', { timeZone: OFFICE_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
	}

	function formatHours(hrs: number) {
		const h = Math.floor(hrs);
		const m = Math.round((hrs - h) * 60);
		return `${h}h ${m}m`;
	}

	function fmtDay(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	/* ---------- tabs, selection, drawers ---------- */

	let view = $state<'calendar' | 'records'>('calendar');
	let selectedKey = $state<string | null>(null);

	let raiseOpen = $state(false);
	let raiseDate = $state('');
	let compOffOpen = $state(false);

	function raise(date: string) {
		raiseDate = date;
		raiseOpen = true;
	}

	// /attendance?raise=YYYY-MM-DD (from Today's "Review") opens the drawer on that day.
	$effect(() => {
		const r = page.url.searchParams.get('raise');
		if (r && /^\d{4}-\d{2}-\d{2}$/.test(r)) {
			selectedKey = r;
			raise(r);
		}
	});

	const recordsByDate = $derived(new Map(data.records.map((r) => [r.date, r])));
	function recordFor(date: string) {
		const r = recordsByDate.get(date);
		if (!r) return null;
		return { checkIn: r.checkInAt ? formatTime(r.checkInAt) : null, checkOut: r.checkOutAt ? formatTime(r.checkOutAt) : null };
	}

	const DEVIATION_STATUS: Record<string, { label: string; tone: string; dot: string }> = {
		pending: { label: 'Pending', tone: 'pending', dot: 'warn' },
		needs_manager_approval: { label: 'Needs manager', tone: 'pending', dot: 'warn' },
		manager_approved: { label: 'With HR', tone: 'info', dot: 'info' },
		approved: { label: 'Approved', tone: 'approved', dot: 'ok' },
		rejected: { label: 'Rejected', tone: 'rejected', dot: 'bad' }
	};
	const devStatus = (s: string) => DEVIATION_STATUS[s] ?? { label: s.replace(/_/g, ' '), tone: 'neutral', dot: 'neutral' };
	const reasonLabel = (r: string) => {
		const t = r.replace(/_/g, ' ');
		return t.charAt(0).toUpperCase() + t.slice(1);
	};
</script>

<svelte:head>
	<title>Attendance — Champ HR ESS Portal</title>
</svelte:head>

<PageHeader crumb={['Attendance']} title="Attendance, made clear." sub="Track your attendance, view your records and raise corrections when needed." compact />

<div class="ess-tabs tabs" role="tablist" aria-label="Attendance views">
	<button type="button" role="tab" class="ess-tab" aria-selected={view === 'calendar'} onclick={() => (view = 'calendar')}><CalendarDays size={16} strokeWidth={1.75} /> Calendar</button>
	<button type="button" role="tab" class="ess-tab" aria-selected={view === 'records'} onclick={() => (view = 'records')}><BarChart3 size={16} strokeWidth={1.75} /> Records</button>
</div>

<div class="ess-split layout">
	<div class="ess-stack">
		{#if view === 'calendar'}
			<div class="metrics">
				<!--
					Read-only. Attendance is recorded by the biometric terminals and ProHance,
					never typed in here — a self-service button is a second, unverified source
					for the same fact. A missed or mis-read punch is raised as an attendance
					correction, which HR approves, rather than overwritten by hand.
				-->
				<div class="ess-metric">
					<span class="ess-tile" class:ess-tile--ok={!!today?.checkInAt} class:ess-tile--neutral={!today?.checkInAt}><CalendarCheck size={20} strokeWidth={1.75} /></span>
					<div class="ess-metric__body">
						<span class="ess-metric__label">Today’s check-in</span>
						<span class="ess-metric__value">{today?.checkInAt ? formatTime(today.checkInAt) : '—'}</span>
						<span class="ess-metric__meta">
							{#if today?.checkOutAt}Checked out {formatTime(today.checkOutAt)}{:else if today?.checkInAt}{today.source === 'biometric' ? 'Biometric check-in recorded' : 'Recorded in the portal'}{:else}No punch recorded yet today{/if}
						</span>
					</div>
				</div>
				<div class="ess-metric">
					<span class="ess-tile"><CalendarDays size={20} strokeWidth={1.75} /></span>
					<div class="ess-metric__body">
						<span class="ess-metric__label">Present</span>
						<span class="ess-metric__value">{data.presentDays}{#if data.businessDaysSoFar > 0} <small>of {data.businessDaysSoFar}</small>{/if}</span>
						<!-- Names the denominator and says week offs are in it: "23 of 23" is
						     otherwise puzzling for someone who only worked the weekdays. -->
						<span class="ess-metric__meta">{#if data.businessDaysSoFar > 0}Eligible days {statPeriod} · week offs included{:else}{statPeriod}{/if}</span>
					</div>
				</div>
				<div class="ess-metric">
					<span class="ess-tile ess-tile--ok"><BarChart3 size={20} strokeWidth={1.75} /></span>
					<div class="ess-metric__body">
						<span class="ess-metric__label">Average shift</span>
						<span class="ess-metric__value">{formatHours(data.avgHours)}</span>
						<span class="ess-metric__meta">Per completed shift {statPeriod}</span>
					</div>
				</div>
			</div>

			<AttendanceCalendar
				mode="grid"
				bind:selectedKey
				month={data.viewMonth}
				records={data.records}
				punchDays={data.punchDays}
				holidays={data.monthHolidays}
				leaves={data.monthLeaves}
				prohanceDays={data.monthProhance}
				prohanceEnabled={data.prohanceEnabled}
				shifts={data.shifts}
				weekOffRosters={data.weekOffRosters}
				weekOffAssignments={data.weekOffAssignments}
			/>
		{:else}
			<AttendanceCalendar
				mode="records"
				bind:selectedKey
				onraise={raise}
				month={data.viewMonth}
				records={data.records}
				punchDays={data.punchDays}
				holidays={data.monthHolidays}
				leaves={data.monthLeaves}
				prohanceDays={data.monthProhance}
				prohanceEnabled={data.prohanceEnabled}
				shifts={data.shifts}
				weekOffRosters={data.weekOffRosters}
				weekOffAssignments={data.weekOffAssignments}
			/>
		{/if}
	</div>

	<aside class="ess-stack">
		<AttendanceCalendar
			mode="detail"
			bind:selectedKey
			onraise={raise}
			month={data.viewMonth}
			records={data.records}
			punchDays={data.punchDays}
			holidays={data.monthHolidays}
			leaves={data.monthLeaves}
			prohanceDays={data.monthProhance}
			prohanceEnabled={data.prohanceEnabled}
			shifts={data.shifts}
			weekOffRosters={data.weekOffRosters}
			weekOffAssignments={data.weekOffAssignments}
		/>

		<CompOffClaim credits={data.compOffCredits} bind:open={compOffOpen} />

		<section class="ess-card" aria-labelledby="dev-h">
			<div class="ess-card-head">
				<h2 id="dev-h" class="ess-h2">Recent deviations</h2>
				<button type="button" class="ess-link as-btn" onclick={() => (view = 'records')}>View all records <ChevronRight size={14} /></button>
			</div>
			<p class="allowance">Corrections allowance · <strong>{data.deviationMonthlyUsed} of {data.deviationMonthlyCap}</strong> used this month</p>
			<div class="ess-rows">
				{#each data.myDeviations.slice(0, 5) as d (d.id)}
					{@const s = devStatus(d.status)}
					<div class="ess-row dev">
						<span class="dev-date">{fmtDay(d.date)}</span>
						<i class="dev-dot" data-tone={s.dot}></i>
						<div class="ess-row__body">
							<span class="ess-row__title">{reasonLabel(d.reason)}</span>
							<span class="ess-row__meta">{d.claimedCheckIn || d.claimedCheckOut ? `Reported ${d.claimedCheckIn ?? '—'} → ${d.claimedCheckOut ?? '—'}` : d.description}</span>
						</div>
						<span class="ess-badge ess-badge--{s.tone}">{s.label}</span>
					</div>
				{:else}
					<p class="empty">No correction requests raised yet. Pick a day with a missing punch and raise one from there.</p>
				{/each}
			</div>
			<button type="button" class="ess-btn ess-btn--outline raise-any" onclick={() => raise(selectedKey ?? '')}>Raise correction</button>
		</section>
	</aside>
</div>

<!-- SOP: the reviewer's queue — corrections and comp-off claims from the
     people who report to the viewer. -->
{#if data.canReview}
	<div class="queue-wrap">
		<SopReviewQueue deviations={data.deviationQueue} compOffs={data.compOffQueue} />
	</div>
{/if}

<DeviationRequest
	bind:open={raiseOpen}
	initialDate={raiseDate}
	monthlyUsed={data.deviationMonthlyUsed}
	monthlyCap={data.deviationMonthlyCap}
	{recordFor}
	oncompoff={() => (compOffOpen = true)}
/>

<style>
	.tabs {
		margin-bottom: 20px;
	}
	.layout {
		--ess-aside-width: 380px;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
	}
	.ess-metric__value small {
		font-size: 16px;
		font-weight: 500;
		color: var(--ess-text-secondary);
	}

	.as-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
	}

	.allowance {
		font-size: 13px;
		color: var(--ess-text-secondary);
		margin: -6px 0 6px;
	}
	.allowance strong {
		color: var(--ess-text);
		font-weight: 500;
	}

	.dev {
		gap: 12px;
	}
	.dev-date {
		min-width: 76px;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.dev-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
		background: var(--ess-border-strong);
	}
	.dev-dot[data-tone='ok'] {
		background: var(--ess-success);
	}
	.dev-dot[data-tone='warn'] {
		background: var(--ess-warning);
	}
	.dev-dot[data-tone='bad'] {
		background: var(--ess-danger);
	}
	.dev-dot[data-tone='info'] {
		background: var(--ess-info);
	}

	.empty {
		margin: 0;
		padding: 10px 0;
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	.raise-any {
		width: 100%;
		margin-top: 12px;
	}

	.queue-wrap {
		margin-top: 20px;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
