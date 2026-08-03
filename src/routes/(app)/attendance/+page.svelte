<script lang="ts">
	let { data } = $props();

	let busy = $state(false);
	let error = $state('');
	let today = $state(data.today);

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
			const body = await res.json();
			today = body.attendance;
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
			const body = await res.json();
			today = body.attendance;
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
		<span class="ess-stat__value">{data.presentDays} <span class="stat-of">/ {data.businessDaysSoFar}</span></span>
		<span class="ess-stat__meta">this month</span>
	</div>

	<div class="ess-stat">
		<span class="ess-stat__label">Avg hours</span>
		<span class="ess-stat__value">{formatHours(data.avgHours)}</span>
		<span class="ess-stat__meta">per completed shift</span>
	</div>
</div>

{#if error}
	<p class="ess-error section-gap">{error}</p>
{/if}

<span class="ess-eyebrow section-gap">This Month</span>
<div class="ess-table-shell">
	<div class="history-row history-head">
		<span>Date</span>
		<span>Check In</span>
		<span>Check Out</span>
		<span class="align-right">Status</span>
	</div>
	{#each data.history as row (row.id)}
		{@const status = row.checkOutAt ? 'checked-out' : row.checkInAt ? 'present' : 'absent'}
		<div class="history-row">
			<span>{row.date}</span>
			<span>{formatTime(row.checkInAt)}</span>
			<span>{formatTime(row.checkOutAt)}</span>
			<span class="align-right">
				<span class="ess-badge ess-badge--{status === 'present' ? 'present' : status === 'checked-out' ? 'cancelled' : 'absent'}">
					{status === 'present' ? 'Present' : status === 'checked-out' ? 'Checked out' : 'Absent'}
				</span>
			</span>
		</div>
	{:else}
		<p class="ess-empty">No attendance recorded yet this month.</p>
	{/each}
</div>

<style>
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

	.stat-of {
		font-size: 16px;
		color: var(--ess-text-secondary);
		font-weight: 600;
	}

	.section-gap {
		display: block;
		margin-bottom: 0.75rem;
	}

	.history-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr) 1fr;
		padding: 12px 16px;
		font-size: var(--ess-fs-body);
		align-items: center;
	}

	.history-row:not(:last-child) {
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.history-head {
		font-weight: 700;
		color: var(--ess-text-secondary);
		font-size: var(--ess-fs-eyebrow);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--ess-sunken);
		border-bottom: 1px solid var(--ess-border);
	}

	.align-right {
		text-align: right;
	}

	@media (max-width: 980px) {
		.top-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
