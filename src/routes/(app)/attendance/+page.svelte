<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AttendanceCalendar from '$lib/components/AttendanceCalendar.svelte';
	import CompOffClaim from '$lib/components/CompOffClaim.svelte';
	import DeviationRequest from '$lib/components/DeviationRequest.svelte';
	import SopReviewQueue from '$lib/components/SopReviewQueue.svelte';

	let { data } = $props();

	let busy = $state(false);
	let error = $state('');
	const today = $derived(data.today);

	const monthLabel = $derived(
		new Date(Number(data.viewMonth.slice(0, 4)), Number(data.viewMonth.slice(5, 7)) - 1, 1)
			.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
	);
	const statPeriod = $derived(data.isCurrentMonth ? 'this month' : `in ${monthLabel}`);

	function getPosition(): Promise<GeolocationPosition | null> {
		return new Promise((resolve) => {
			if (!navigator.geolocation) return resolve(null);
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve(pos),
				() => resolve(null),
				{ timeout: 5000 }
			);
		});
	}

	async function checkIn() {
		error = '';
		busy = true;
		try {
			const pos = await getPosition();
			const res = await fetch('/api/attendance/checkin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lat: pos?.coords.latitude ?? null,
					lng: pos?.coords.longitude ?? null
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message ?? 'Could not check in';
				return;
			}
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function checkOut() {
		error = '';
		busy = true;
		try {
			const pos = await getPosition();
			const res = await fetch('/api/attendance/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lat: pos?.coords.latitude ?? null,
					lng: pos?.coords.longitude ?? null
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message ?? 'Could not check out';
				return;
			}
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	function formatTime(value: string | Date | null | undefined) {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function elapsedSince(value: string | Date | null | undefined) {
		if (!value) return null;
		const ms = Date.now() - new Date(value).getTime();
		const hrs = Math.floor(ms / 3_600_000);
		const mins = Math.floor((ms % 3_600_000) / 60_000);
		return `${hrs}h ${mins}m elapsed`;
	}

	function formatHours(hrs: number) {
		const h = Math.floor(hrs);
		const m = Math.round((hrs - h) * 60);
		return `${h}h ${m}m`;
	}

	const hasLocation = $derived(!!today?.checkInLat);
</script>

<svelte:head>
	<title>Attendance — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Attendance Management</h1>
	<p class="ess-page-sub">Accurate, real-time attendance without manual chasing</p>
</header>

<div class="top-grid">
	<div class="today-card">
		<span class="today-eyebrow">Today · {new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
		<div class="today-time-row">
			<span class="today-time">{today?.checkInAt ? formatTime(today.checkInAt) : '—'}</span>
			<span class="today-label">{today?.checkOutAt ? 'checked out' : today?.checkInAt ? 'checked in' : 'not checked in'}</span>
		</div>
		<p class="today-meta">
			{#if hasLocation}location verified · {/if}{elapsedSince(today?.checkInAt) ?? 'no activity yet today'}
		</p>
		<div class="today-actions">
			<button class="ess-btn action-btn" onclick={checkIn} disabled={busy || !!today?.checkInAt}>
				Check In
			</button>
			<button
				class="ess-btn action-btn-outline"
				onclick={checkOut}
				disabled={busy || !today?.checkInAt || !!today?.checkOutAt}
			>
				Check Out
			</button>
		</div>
	</div>

	<div class="ess-stat">
		<span class="ess-stat__label">Present days</span>
		<span class="ess-stat__value"
			>{data.presentDays}{#if data.businessDaysSoFar > 0}
				<span class="stat-of">/ {data.businessDaysSoFar}</span>{/if}</span
		>
		<!-- Names the denominator and says week offs are in it: "23 / 23" is
		     otherwise puzzling for someone who only worked the weekdays. -->
		<span class="ess-stat__meta"
			>{#if data.businessDaysSoFar > 0}of {data.businessDaysSoFar} days {statPeriod} · week offs
				included{:else}{statPeriod}{/if}</span
		>
	</div>

	<div class="ess-stat">
		<span class="ess-stat__label">Avg hours</span>
		<span class="ess-stat__value">{formatHours(data.avgHours)}</span>
		<span class="ess-stat__meta">per completed shift {statPeriod}</span>
	</div>
</div>

{#if error}
	<p class="ess-error section-gap">{error}</p>
{/if}

<AttendanceCalendar
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

<!-- SOP: comp-off and attendance-deviation self-service. Placed below the
     calendar so the record itself is read first, then corrected. -->
<div class="sop-grid">
	<CompOffClaim credits={data.compOffCredits} />

	<div class="sop-panel">
		<div class="sop-head">
			<strong>Attendance deviations</strong>
			<span class="sop-tally">{data.deviationMonthlyUsed} of {data.deviationMonthlyCap} used this month</span>
		</div>
		{#if data.myDeviations.length > 0}
			<ul class="dev-list">
				{#each data.myDeviations.slice(0, 5) as d (d.id)}
					<li>
						<span class="d-date">{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
						<span class="d-reason">{d.reason.replace(/_/g, ' ')}</span>
						<span class="ess-badge ess-badge--{d.status === 'approved' ? 'present' : d.status === 'rejected' ? 'absent' : 'restricted'}">
							{d.status.replace(/_/g, ' ')}
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="sop-empty">No correction requests raised yet.</p>
		{/if}
		<DeviationRequest
			monthlyUsed={data.deviationMonthlyUsed}
			monthlyCap={data.deviationMonthlyCap}
		/>
	</div>
</div>

{#if data.canReview}
	<SopReviewQueue deviations={data.deviationQueue} compOffs={data.compOffQueue} />
{/if}

<style>
	.sop-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 14px;
		margin-top: 1.5rem;
	}

	.sop-panel {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1rem 1.1rem;
	}

	.sop-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}

	.sop-head strong {
		font-size: 0.92rem;
		color: var(--ess-text);
	}

	.sop-tally {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--ess-text-secondary);
	}

	.sop-empty {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		margin: 0 0 0.5rem;
	}

	.dev-list {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.dev-list li {
		display: grid;
		grid-template-columns: 4.5rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.dev-list li:last-child {
		border-bottom: 0;
	}

	.d-date {
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	.d-reason {
		color: var(--ess-text-secondary);
		text-transform: capitalize;
	}

	.page-header {
		margin-bottom: 1.75rem;
	}

	.top-grid {
		display: grid;
		grid-template-columns: minmax(280px, 1.2fr) repeat(auto-fit, minmax(200px, 1fr));
		gap: 14px;
		margin-bottom: 2rem;
	}

	.today-card {
		background: var(--ess-inverse);
		color: var(--ess-text-inverse);
		border-radius: var(--ess-radius-lg);
		padding: 22px 24px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.today-eyebrow {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-green-400);
	}

	.today-time-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-top: 6px;
	}

	.today-time {
		font-family: var(--ess-font-display);
		font-size: 2.5rem;
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.today-label {
		font-size: 14px;
		color: var(--ess-text-inverse-secondary);
	}

	.today-meta {
		font-size: 12px;
		color: var(--ess-text-inverse-secondary);
		margin-top: 6px;
	}

	.today-actions {
		display: flex;
		gap: 10px;
		margin-top: 16px;
	}

	.action-btn {
		background: linear-gradient(180deg, color-mix(in oklab, var(--acc) 82%, #fff), var(--acc));
		color: var(--ess-text-on-primary);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			0 10px 26px -12px var(--glow);
	}

	.action-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.7),
			0 16px 34px -12px var(--glow);
	}

	.action-btn:disabled {
		opacity: 1;
		background: rgba(255, 255, 255, 0.35);
		color: rgba(255, 255, 255, 0.9);
		box-shadow: none;
	}

	.action-btn-outline {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: var(--ess-text-inverse);
	}

	.action-btn-outline:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}

	.action-btn-outline:disabled {
		opacity: 1;
		color: rgba(255, 255, 255, 0.5);
		border-color: rgba(255, 255, 255, 0.1);
	}

	/* Light (Opal): the hero band is a light pane now, so the white-alpha
	   disabled/outline treatments (correct on the dark Onyx band) become
	   ink-alpha. Scoped to the default palette; dark keeps the above. */
	:global(:root:not([data-ess-theme='dark'])) .action-btn:disabled {
		background: rgba(20, 18, 35, 0.08);
		color: rgba(20, 18, 35, 0.4);
	}
	:global(:root:not([data-ess-theme='dark'])) .action-btn-outline {
		border-color: rgba(20, 18, 35, 0.18);
	}
	:global(:root:not([data-ess-theme='dark'])) .action-btn-outline:hover:not(:disabled) {
		background: rgba(20, 18, 35, 0.06);
	}
	:global(:root:not([data-ess-theme='dark'])) .action-btn-outline:disabled {
		color: rgba(20, 18, 35, 0.4);
		border-color: rgba(20, 18, 35, 0.1);
	}

	.stat-of {
		font-size: 16px;
		color: var(--ess-text-secondary);
		font-weight: 600;
	}

	.section-gap {
		display: block;
		margin-bottom: 0.75rem;
	}

	@media (max-width: 980px) {
		.top-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
