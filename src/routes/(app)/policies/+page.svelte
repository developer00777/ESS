<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { WORKPLACE_POLICIES, WORKPLACE_POLICY_INTRO } from '$lib/workplace-policies';

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
	<p class="ess-page-sub">
		Workplace policies for everyone, plus the holiday calendar and leave policy resolved for your
		own shift assignment
	</p>
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
		<ul class="policy-list">
			{#each data.leaveTypes as lt (lt.id)}
				<li class="policy-item">
					<div class="policy-item-head">
						<strong>{lt.name}</strong>
						<span class="entitlement">
							{#if lt.fixedDays}
								{lt.fixedDays} days (event-based)
							{:else}
								{lt.accrualPerMonth} days / month
							{/if}
						</span>
					</div>
					<ul class="rule-list">
						{#if lt.carryForwardCap}
							<li>Carry-forward cap: {lt.carryForwardCap} days</li>
						{/if}
						{#if lt.requiresDocumentation}
							<li>Requires documentation{lt.documentationNote ? `: ${lt.documentationNote}` : ''}</li>
						{/if}
						{#if lt.eligibility}
							<li>Eligibility: {lt.eligibility.replace('_', ' ')}</li>
						{/if}
					</ul>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="block">
	<h2><ShieldCheck size={18} /> Workplace Policies</h2>
	<p class="policy-intro">{WORKPLACE_POLICY_INTRO}</p>
	<ol class="policy-list">
		{#each WORKPLACE_POLICIES as policy (policy.id)}
			<li class="policy-item">
				<div class="policy-item-head">
					<strong><span class="policy-icon" aria-hidden="true">{policy.icon}</span> {policy.title}</strong>
				</div>
				<ul class="rule-list">
					{#each policy.rules as rule (rule)}
						<li>{rule}</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ol>
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

	.muted {
		color: var(--ess-text-secondary);
		font-size: 0.75rem;
	}

	.policy-intro {
		font-size: 0.85rem;
		font-style: italic;
		color: var(--ess-text-secondary);
		margin: 0 0 1rem;
		padding-left: 0.75rem;
		border-left: 2px solid var(--ess-primary);
	}

	/* List, not cards: these are read top-to-bottom as a document, and a card
	   grid fragments a numbered policy set into unordered tiles. */
	.policy-list {
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: policy;
	}

	.policy-item {
		counter-increment: policy;
		padding: 0.9rem 0 0.9rem 2.25rem;
		border-bottom: 1px solid var(--ess-border-subtle);
		position: relative;
	}

	.policy-item:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.policy-item::before {
		content: counter(policy);
		position: absolute;
		left: 0;
		top: 0.9rem;
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.policy-item-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}

	.policy-item-head strong {
		font-size: 0.92rem;
		color: var(--ess-text);
	}

	.policy-icon {
		margin-right: 0.35rem;
	}

	.entitlement {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ess-primary-text);
		white-space: nowrap;
	}

	.rule-list {
		margin: 0;
		padding-left: 1.05rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.rule-list li {
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--ess-text-secondary);
		max-width: 72ch;
	}

	.rule-list:empty {
		display: none;
	}

	.empty {
		font-size: 0.85rem;
		color: var(--ess-text-secondary);
	}
</style>
