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
	<h1 class="section-title">Attendance Management</h1>
	<p class="section-subtitle">Accurate, real-time attendance without manual chasing</p>
</header>

<div class="action-cards">
	<div class="action-card">
		<div class="card-icon"><Clock size={22} /></div>
		<h3>Check In</h3>
		<p>{today?.checkInAt ? `Checked in at ${formatTime(today.checkInAt)}` : 'Not checked in yet'}</p>
		<button class="btn btn-ghost" onclick={checkIn} disabled={busy || !!today?.checkInAt}>
			Check In
		</button>
	</div>

	<div class="action-card">
		<div class="card-icon"><LogOut size={22} /></div>
		<h3>Check Out</h3>
		<p>{today?.checkOutAt ? `Checked out at ${formatTime(today.checkOutAt)}` : 'Not checked out yet'}</p>
		<button
			class="btn btn-ghost"
			onclick={checkOut}
			disabled={busy || !today?.checkInAt || !!today?.checkOutAt}
		>
			Check Out
		</button>
	</div>
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

<span class="eyebrow section-gap">This Month</span>
<div class="history-table">
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
		<p class="empty">No attendance recorded yet this month.</p>
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
		background: var(--color-primary);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		color: var(--color-white);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.card-icon {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-sm);
		background: var(--color-white);
		color: var(--color-primary);
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

	.action-card .btn {
		background: var(--color-white);
		color: var(--color-ink);
		justify-content: center;
	}

	.action-card .btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.section-gap {
		display: block;
		margin-bottom: 0.75rem;
	}

	.history-table {
		background: var(--color-white);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.history-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 0.75rem 1.1rem;
		font-size: 0.88rem;
	}

	.history-row:not(:last-child) {
		border-bottom: 1px solid var(--color-mint);
	}

	.history-head {
		font-weight: 700;
		color: var(--color-text-soft);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.empty {
		padding: 1rem 1.1rem;
		color: var(--color-text-soft);
		font-size: 0.9rem;
	}
</style>
