<script lang="ts">
	import { page } from '$app/state';
	import Umbrella from '@lucide/svelte/icons/umbrella';
	import FileText from '@lucide/svelte/icons/file-text';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Search from '@lucide/svelte/icons/search';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Info from '@lucide/svelte/icons/info';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { WORKPLACE_POLICIES, WORKPLACE_POLICY_INTRO } from '$lib/workplace-policies';

	let { data } = $props();

	type Tab = 'holidays' | 'leave' | 'workplace';
	const TABS: { id: Tab; label: string; icon: typeof Umbrella }[] = [
		{ id: 'holidays', label: 'Holiday calendar', icon: Umbrella },
		{ id: 'leave', label: 'Leave policy', icon: FileText },
		{ id: 'workplace', label: 'Workplace policies', icon: ShieldCheck }
	];
	const initial = page.url.searchParams.get('tab');
	let tab = $state<Tab>(initial === 'leave' || initial === 'workplace' ? initial : 'holidays');
	let q = $state('');
	const needle = $derived(q.trim().toLowerCase());

	const typeBadge: Record<string, string> = {
		PUBLIC: 'ess-badge--public',
		RESTRICTED: 'ess-badge--restricted',
		OPTIONAL: 'ess-badge--optional'
	};
	const typeLabel: Record<string, string> = { PUBLIC: 'Public holiday', RESTRICTED: 'Restricted holiday', OPTIONAL: 'Optional holiday' };

	function longDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	}
	function tile(d: string) {
		const dt = new Date(d + 'T00:00:00');
		return { day: dt.getDate(), mon: dt.toLocaleDateString(undefined, { month: 'short' }) };
	}
	const todayIso = new Date().toISOString().slice(0, 10);

	/* ---------- holidays ---------- */
	const allHolidays = $derived(data.resolvedCalendar?.holidays ?? []);
	const upcoming = $derived(allHolidays.filter((h) => h.date >= todayIso).slice(0, 4));
	const shownHolidays = $derived(needle ? allHolidays.filter((h) => h.name.toLowerCase().includes(needle)) : allHolidays);
	const publishedOn = $derived(
		data.resolvedCalendar?.publishedAt ? new Date(data.resolvedCalendar.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
	);

	/* ---------- leave policy ---------- */
	type LeaveType = (typeof data.leaveTypes)[number];
	const entitlement = (lt: LeaveType) =>
		lt.fixedDays ? `${lt.fixedDays} days, event-based` : lt.monthlyQuotaDays ? `${Number(lt.monthlyQuotaDays)} days each month` : `${Number(lt.accrualPerMonth)} days accrue each month`;
	const shownLeave = $derived(needle ? data.leaveTypes.filter((lt) => lt.name.toLowerCase().includes(needle) || (lt.code ?? '').toLowerCase().includes(needle)) : data.leaveTypes);
	let leaveId = $state<string | null>(null);
	const leave = $derived(shownLeave.find((lt) => lt.id === leaveId) ?? shownLeave[0] ?? null);

	/* ---------- workplace ---------- */
	const shownWorkplace = $derived(
		needle ? WORKPLACE_POLICIES.filter((p) => p.title.toLowerCase().includes(needle) || p.rules.some((r) => r.toLowerCase().includes(needle))) : WORKPLACE_POLICIES
	);
	let workplaceId = $state<string | null>(null);
	const workplace = $derived(shownWorkplace.find((p) => p.id === workplaceId) ?? shownWorkplace[0] ?? null);
	const workplaceIndex = $derived(workplace ? WORKPLACE_POLICIES.findIndex((p) => p.id === workplace.id) + 1 : 0);

	const crumbTab = $derived(tab === 'holidays' ? 'Holidays' : tab === 'leave' ? 'Leave policy' : 'Workplace policies');
</script>

<svelte:head>
	<title>Policies — Champ HR</title>
</svelte:head>

<PageHeader crumb={['Policies', crumbTab]} title="Answers for your workday." sub="Find leave rules, company policies and holiday information." compact />

<div class="toolbar">
	<div class="ess-tabs" role="tablist" aria-label="Policy sections">
		{#each TABS as t (t.id)}
			<button type="button" role="tab" class="ess-tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
				<t.icon size={17} strokeWidth={1.75} />
				{t.label}
			</button>
		{/each}
	</div>
	<div class="ess-search search">
		<Search size={17} />
		<input class="ess-input" type="search" placeholder="Search policies, e.g. leave, comp-off, dress code…" bind:value={q} aria-label="Search policies" />
	</div>
</div>

<div class="ess-split layout">
	<div class="main">
		<!-- ===== Holiday calendar ===== -->
		{#if tab === 'holidays'}
			<section class="ess-card doc">
				{#if !data.hasShiftAssignment}
					<div class="ess-notice">
						<span class="ess-notice__icon"><AlertTriangle size={16} /></span>
						<div class="ess-notice__body"><strong>Your shift group isn't set yet</strong>Ask HR to assign one so your holiday calendar can be shown here.</div>
					</div>
				{:else if !data.resolvedCalendar}
					<div class="ess-notice ess-notice--info">
						<span class="ess-notice__icon"><Info size={16} /></span>
						<div class="ess-notice__body"><strong>No holiday calendar yet</strong>No holiday calendar has been published for your shift group.</div>
					</div>
				{:else}
					<div class="doc-head">
						<div>
							<span class="ess-eyebrow">Holiday calendar</span>
							<h2 class="doc-title">{data.resolvedCalendar.year} holidays</h2>
							<p class="doc-sub">For <strong>{data.resolvedCalendar.shiftGroupName}</strong>, as published by HR.</p>
						</div>
						{#if publishedOn}
							<div class="doc-meta"><span>Published</span><strong>{publishedOn}</strong></div>
						{/if}
					</div>
					<div class="ess-rows">
						{#each shownHolidays as h (h.id)}
							{@const t = tile(h.date)}
							<div class="ess-row holiday" class:past={h.date < todayIso}>
								<span class="ess-date-tile"><strong>{t.day}</strong><small>{t.mon}</small></span>
								<span class="ess-row__body">
									<span class="ess-row__title">{h.name}</span>
									<span class="ess-row__meta">{longDate(h.date)}</span>
								</span>
								<span class="ess-row__end"><span class="ess-badge {typeBadge[h.type] ?? 'ess-badge--public'}">{typeLabel[h.type] ?? h.type}</span></span>
							</div>
						{:else}
							<p class="empty">No holiday matches “{q}”.</p>
						{/each}
					</div>
				{/if}
			</section>

		<!-- ===== Leave policy ===== -->
		{:else if tab === 'leave'}
			<div class="docs">
				<nav class="ess-card list" aria-label="Policy documents">
					<h3 class="ess-h2 list-h">Policy documents</h3>
					{#each shownLeave as lt (lt.id)}
						<button type="button" class="doc-link" aria-current={leave?.id === lt.id ? 'true' : undefined} onclick={() => (leaveId = lt.id)}>
							<span class="ess-tile ess-tile--sm"><FileText size={16} /></span>
							<span class="ess-row__body">
								<span class="ess-row__title">{lt.name}</span>
								<span class="ess-row__meta">{entitlement(lt)}</span>
							</span>
							<ChevronRight size={16} class="chev" />
						</button>
					{:else}
						<p class="empty">{data.leaveTypes.length === 0 ? 'No leave policy has been published yet.' : `Nothing matches “${q}”.`}</p>
					{/each}
				</nav>

				{#if leave}
					<article class="ess-card doc">
						<div class="doc-head">
							<div>
								<span class="ess-eyebrow">Leave policy{#if leave.code} · {leave.code}{/if}</span>
								<h2 class="doc-title">{leave.name}</h2>
								<p class="doc-sub">{entitlement(leave)}.</p>
							</div>
						</div>
						<dl class="ess-kv rules">
							<dt>Entitlement</dt><dd>{entitlement(leave)}</dd>
							{#if Number(leave.carryForwardCap) > 0}<dt>Carry-forward cap</dt><dd>{leave.carryForwardCap} days</dd>{/if}
							{#if leave.monthlyUsageCap}<dt>Monthly usage cap</dt><dd>{Number(leave.monthlyUsageCap)} days in a calendar month</dd>{/if}
							<dt>Encashment</dt><dd>{leave.encashmentEligible ? 'Eligible' : 'Not eligible'}</dd>
							{#if leave.eligibility}<dt>Eligibility</dt><dd class="cap">{leave.eligibility.replace(/_/g, ' ')}</dd>{/if}
							<dt>Documentation</dt><dd>{leave.requiresDocumentation ? `Required${leave.documentationNote ? `: ${leave.documentationNote}` : ''}` : 'Not required'}</dd>
						</dl>
						<div class="ess-notice ess-notice--info">
							<span class="ess-notice__icon"><Info size={16} /></span>
							<div class="ess-notice__body">
								<strong>See the published policy</strong>
								These values come from the leave policy HR published. For the full wording, including accrual and carry-forward detail, refer to the policy document HR circulated.
							</div>
						</div>
					</article>
				{/if}
			</div>

		<!-- ===== Workplace policies ===== -->
		{:else}
			<div class="docs">
				<nav class="ess-card list" aria-label="Workplace policies">
					<h3 class="ess-h2 list-h">Policy documents</h3>
					{#each shownWorkplace as p (p.id)}
						<button type="button" class="doc-link" aria-current={workplace?.id === p.id ? 'true' : undefined} onclick={() => (workplaceId = p.id)}>
							<span class="ess-tile ess-tile--sm" aria-hidden="true">{p.icon}</span>
							<span class="ess-row__body">
								<span class="ess-row__title">{p.title}</span>
								<span class="ess-row__meta">{p.rules.length} rule{p.rules.length === 1 ? '' : 's'}</span>
							</span>
							<ChevronRight size={16} class="chev" />
						</button>
					{:else}
						<p class="empty">Nothing matches “{q}”.</p>
					{/each}
				</nav>

				{#if workplace}
					<article class="ess-card doc">
						<div class="doc-head">
							<div>
								<span class="ess-eyebrow">Workplace policy · {workplaceIndex} of {WORKPLACE_POLICIES.length}</span>
								<h2 class="doc-title">{workplace.title}</h2>
								<p class="doc-sub">{WORKPLACE_POLICY_INTRO}</p>
							</div>
						</div>
						<ol class="rule-list">
							{#each workplace.rules as rule (rule)}
								<li>{rule}</li>
							{/each}
						</ol>
					</article>
				{/if}
			</div>
		{/if}
	</div>

	<aside class="ess-stack">
		<section class="ess-card">
			<div class="ess-card-head">
				<h3 class="ess-h2">Upcoming holidays</h3>
				{#if tab !== 'holidays' && allHolidays.length}
					<button type="button" class="ess-link link-btn" onclick={() => (tab = 'holidays')}>View calendar <ChevronRight size={14} /></button>
				{/if}
			</div>
			<div class="ess-rows">
				{#each upcoming as h (h.id)}
					{@const t = tile(h.date)}
					<div class="ess-row">
						<span class="ess-date-tile"><strong>{t.day}</strong><small>{t.mon}</small></span>
						<span class="ess-row__body">
							<span class="ess-row__title">{h.name}</span>
							<span class="ess-row__meta">{typeLabel[h.type] ?? h.type}</span>
						</span>
					</div>
				{:else}
					<p class="empty">
						{#if !data.hasShiftAssignment}Your holiday calendar appears once HR sets your shift group.{:else if !data.resolvedCalendar}No holiday calendar has been published yet.{:else}No more holidays this year.{/if}
					</p>
				{/each}
			</div>
		</section>

		<section class="ess-card">
			<h3 class="ess-h2 aside-h">Related</h3>
			<div class="ess-rows">
				<a class="ess-row" href="/leave/apply">
					<span class="ess-tile ess-tile--sm"><FileText size={16} /></span>
					<span class="ess-row__body"><span class="ess-row__title">Apply for leave</span><span class="ess-row__meta">Uses the balances from this policy</span></span>
					<ChevronRight size={16} class="chev" />
				</a>
				<a class="ess-row" href="/hr-contacts">
					<span class="ess-tile ess-tile--sm ess-tile--neutral"><Info size={16} /></span>
					<span class="ess-row__body"><span class="ess-row__title">Ask HR</span><span class="ess-row__meta">For anything a policy does not answer</span></span>
					<ChevronRight size={16} class="chev" />
				</a>
			</div>
		</section>
	</aside>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.search {
		flex: 1;
		max-width: 420px;
		min-width: 240px;
	}

	.layout {
		--ess-aside-width: 340px;
	}
	.main {
		min-width: 0;
	}

	.docs {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	.list {
		padding: 16px 12px;
		display: grid;
		gap: 2px;
	}
	.list-h {
		font-size: 19px;
		padding: 2px 8px 12px;
	}
	.doc-link {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 10px;
		border: none;
		border-radius: var(--ess-radius-md);
		background: transparent;
		font: inherit;
		color: var(--ess-text);
		text-align: left;
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}
	.doc-link:hover {
		background: var(--ess-sunken);
	}
	.doc-link[aria-current='true'] {
		background: var(--ess-primary-soft);
	}
	.doc-link .ess-row__meta {
		white-space: normal;
	}
	:global(.doc-link .chev),
	:global(.ess-row .chev) {
		margin-left: auto;
		flex: none;
		color: var(--ess-text-muted);
	}

	.doc {
		display: grid;
		gap: 20px;
		padding: 24px 28px;
	}
	.doc-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 18px;
		border-bottom: 1px solid var(--ess-border);
	}
	.doc-title {
		font-family: var(--ess-font-display);
		font-size: 36px;
		font-weight: 600;
		line-height: 1.1;
		margin-top: 6px;
		color: var(--ess-text);
	}
	.doc-sub {
		margin-top: 6px;
		font-size: 15px;
		color: var(--ess-text-secondary);
		max-width: 60ch;
	}
	.doc-meta {
		display: grid;
		text-align: right;
		font-size: 13px;
		color: var(--ess-text-secondary);
		flex: none;
	}
	.doc-meta strong {
		color: var(--ess-text);
		font-weight: 500;
	}
	.rules {
		grid-template-columns: 200px 1fr;
		row-gap: 12px;
	}
	.cap {
		text-transform: capitalize;
	}
	.rule-list {
		margin: 0;
		padding-left: 22px;
		display: grid;
		gap: 10px;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ess-text);
	}
	.rule-list li::marker {
		color: var(--ess-primary-text);
		font-weight: 600;
	}

	.holiday.past {
		opacity: 0.6;
	}

	.empty {
		padding: 14px 4px;
		font-size: 13.5px;
		color: var(--ess-text-muted);
	}
	.aside-h {
		font-size: 19px;
		margin-bottom: 10px;
	}
	.link-btn {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}

	@media (max-width: 900px) {
		.docs {
			grid-template-columns: 1fr;
		}
		.rules {
			grid-template-columns: 1fr;
			row-gap: 4px;
		}
		.rules dd {
			margin-bottom: 8px;
		}
		.doc-title {
			font-size: 28px;
		}
	}
</style>
