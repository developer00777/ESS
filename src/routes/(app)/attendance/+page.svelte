<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import LogOut from '@lucide/svelte/icons/log-out';

	let { data } = $props();

	let today = $state(data.today);
	let busy = $state(false);
	let error = $state('');

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
</script>

<svelte:head>
	<title>Attendance — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Attendance Management</h1>
	<p class="ess-page-sub">Accurate, real-time attendance without manual chasing</p>
</header>

<div class="action-cards">
	<div class="action-card">
		<div class="card-icon"><Clock size={22} /></div>
		<h3>Check In</h3>
		<p>{today?.checkInAt ? `Checked in at ${formatTime(today.checkInAt)}` : 'Not checked in yet'}</p>
		<button class="ess-btn action-btn" onclick={checkIn} disabled={busy || !!today?.checkInAt}>
			Check In
		</button>
	</div>

	<div class="action-card">
		<div class="card-icon"><LogOut size={22} /></div>
		<h3>Check Out</h3>
		<p>{today?.checkOutAt ? `Checked out at ${formatTime(today.checkOutAt)}` : 'Not checked out yet'}</p>
		<button
			class="ess-btn action-btn"
			onclick={checkOut}
			disabled={busy || !today?.checkInAt || !!today?.checkOutAt}
		>
			Check Out
		</button>
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
	</div>
	{#each data.history as row (row.id)}
		<div class="history-row">
			<span>{row.date}</span>
			<span>{formatTime(row.checkInAt)}</span>
			<span>{formatTime(row.checkOutAt)}</span>
		</div>
	{:else}
		<p class="ess-empty">No attendance recorded yet this month.</p>
	{/each}
</div>

<style>
	.page-header {
		margin-bottom: 1.75rem;
	}

	.action-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(220px, 320px));
		gap: 1.25rem;
		margin-bottom: 2rem;
	}

	.action-card {
		background: var(--ess-primary);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem;
		color: var(--ess-text-on-primary);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.card-icon {
		width: 48px;
		height: 48px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-text-on-primary);
		color: var(--ess-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.action-card h3 {
		font-size: 1.05rem;
		font-weight: 700;
	}

	.action-card p {
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.85);
		min-height: 2.2em;
	}

	.action-btn {
		background: var(--ess-text-on-primary);
		color: var(--ess-text);
		justify-content: center;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--ess-n-100);
	}

	.section-gap {
		display: block;
		margin-bottom: 0.75rem;
	}

	.history-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 12px 16px;
		font-size: var(--ess-fs-body);
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
</style>
