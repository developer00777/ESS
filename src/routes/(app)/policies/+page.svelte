<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

	let { data } = $props();

	const typeBadge: Record<string, string> = {
		PUBLIC: 'ess-badge--public',
		RESTRICTED: 'ess-badge--restricted',
		OPTIONAL: 'ess-badge--optional'
	};

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			day: '2-digit',
			month: 'short',
			weekday: 'short'
		});
	}
</script>

<svelte:head>
	<title>Company Policies — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Company Policies</h1>
	<p class="ess-page-sub">Your holiday calendar and leave policy — resolved for your own shift assignment</p>
</header>

<section class="block">
	<h2><CalendarDays size={18} /> Holiday Calendar</h2>

	{#if !data.hasShiftAssignment}
		<div class="notice">
			<AlertTriangle size={18} />
			<span>Your shift group isn't set yet — ask HR to assign one so your holiday calendar can be shown here.</span>
		</div>
	{:else if !data.resolvedCalendar}
		<div class="notice">
			<AlertTriangle size={18} />
			<span>No holiday calendar has been published yet for your shift group.</span>
		</div>
	{:else}
		<p class="calendar-meta">
			Showing <strong>{data.resolvedCalendar.year}</strong> holidays for
			<strong>{data.resolvedCalendar.shiftGroupName}</strong>
		</p>
		<div class="ess-table-shell">
			<table class="ess-table">
				<thead>
					<tr><th>Date</th><th>Holiday</th><th>Type</th></tr>
				</thead>
				<tbody>
					{#each data.resolvedCalendar.holidays.sort((a, b) => a.date.localeCompare(b.date)) as h (h.id)}
						<tr>
							<td>{formatDate(h.date)}</td>
							<td>{h.name}</td>
							<td><span class="ess-badge {typeBadge[h.type] ?? 'ess-badge--public'}">{h.type}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="block">
	<h2><BookOpen size={18} /> Leave Policy</h2>
	{#if data.leaveTypes.length === 0}
		<p class="empty">No leave policy has been published yet.</p>
	{:else}
		<div class="leave-grid">
			{#each data.leaveTypes as lt (lt.id)}
				<div class="leave-card">
					<strong>{lt.name}</strong>
					{#if lt.fixedDays}
						<span>{lt.fixedDays} days (event-based)</span>
					{:else}
						<span>{lt.accrualPerMonth} days / month</span>
					{/if}
					{#if lt.carryForwardCap}
						<span class="muted">Carry-forward cap: {lt.carryForwardCap} days</span>
					{/if}
					{#if lt.requiresDocumentation}
						<span class="muted">Requires documentation{lt.documentationNote ? `: ${lt.documentationNote}` : ''}</span>
					{/if}
					{#if lt.eligibility}
						<span class="muted">Eligibility: {lt.eligibility.replace('_', ' ')}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.block {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		max-width: 780px;
	}

	.block h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.05rem;
		margin-bottom: 1rem;
		color: var(--ess-text);
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.9rem 1rem;
		font-size: 0.85rem;
		color: var(--ess-text-secondary);
	}

	.calendar-meta {
		font-size: 0.85rem;
		color: var(--ess-text-secondary);
		margin-bottom: 0.75rem;
	}

	.leave-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.leave-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.9rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.82rem;
		min-width: 220px;
		flex: 1;
	}

	.leave-card strong {
		font-size: 0.9rem;
	}

	.muted {
		color: var(--ess-text-secondary);
		font-size: 0.75rem;
	}

	.empty {
		font-size: 0.85rem;
		color: var(--ess-text-secondary);
	}
</style>
