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

<PageHeader crumb={['Policies', crumbTab]} title="Answers for your workday." sub="Find leave rules, company policies and holiday information." compact>
	{#snippet tabs()}
		<div class="ess-tabs" role="tablist" aria-label="Policy sections">
			{#each TABS as t (t.id)}
				<button type="button" role="tab" class="ess-tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
					<t.icon size={17} strokeWidth={1.75} />
					{t.label}
				</button>
			{/each}
		</div>
	{/snippet}
	<div class="ess-search search">
		<Search size={17} />
		<input class="ess-input" type="search" placeholder="Search policies, e.g. leave, comp-off, dress code…" bind:value={q} aria-label="Search policies" />
	</div>
</PageHeader>

<div class="ess-split ess-fill layout">
	<div class="main">
		<!-- ===== Holiday calendar ===== -->
		{#if tab === 'holidays'}
			<section class="ess-card ess-fill-card doc holidays-doc">
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
					<div class="ess-rows ess-scroll holiday-list">
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
			<div class="docs docs--leave">
				<nav class="ess-card list list--chips" aria-label="Policy documents">
					<h3 class="ess-h2 list-h">Policy documents</h3>
					{#each shownLeave as lt (lt.id)}
						<button type="button" class="doc-link" class:ess-pink-wash={!!lt.monthlyQuotaDays} aria-current={leave?.id === lt.id ? 'true' : undefined} onclick={() => (leaveId = lt.id)}>
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
					<article class="ess-card doc" class:ess-pink-wash={!!leave.monthlyQuotaDays}>
						<div class="doc-head">
							<div>
								<span class="ess-eyebrow">Leave policy{#if leave.code} · {leave.code}{/if}</span>
								<h2 class="doc-title">{leave.name}</h2>
								<p class="doc-sub">{entitlement(leave)}.</p>
							</div>
						</div>
						<!-- Each rule is a small fact tile, several to a row. -->
						<dl class="facts">
							<div class="fact"><dt>Entitlement</dt><dd>{entitlement(leave)}</dd></div>
							{#if Number(leave.carryForwardCap) > 0}<div class="fact"><dt>Carry-forward cap</dt><dd>{leave.carryForwardCap} days</dd></div>{/if}
							{#if leave.monthlyUsageCap}<div class="fact"><dt>Monthly usage cap</dt><dd>{Number(leave.monthlyUsageCap)} days in a calendar month</dd></div>{/if}
							<div class="fact"><dt>Encashment</dt><dd>{leave.encashmentEligible ? 'Eligible' : 'Not eligible'}</dd></div>
							{#if leave.eligibility}<div class="fact"><dt>Eligibility</dt><dd class="cap">{leave.eligibility.replace(/_/g, ' ')}</dd></div>{/if}
							<div class="fact"><dt>Documentation</dt><dd>{leave.requiresDocumentation ? `Required${leave.documentationNote ? `: ${leave.documentationNote}` : ''}` : 'Not required'}</dd></div>
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
			<div class="docs docs--workplace">
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
							{#each workplace.rules as rule, i (rule)}
								<li><span class="rule-n" aria-hidden="true">{i + 1}</span><span>{rule}</span></li>
							{/each}
						</ol>
					</article>
				{/if}
			</div>
		{/if}
	</div>

	<aside class="fill-col">
		<section class="ess-card ess-fill-card grow">
			<div class="ess-card-head">
				<h3 class="ess-h2">Upcoming holidays</h3>
				{#if tab !== 'holidays' && allHolidays.length}
					<button type="button" class="ess-link link-btn" onclick={() => (tab = 'holidays')}>View calendar <ChevronRight size={14} /></button>
				{/if}
			</div>
			<div class="ess-rows ess-scroll upcoming-list">
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
					<p class="empty fill-empty">
						<span class="empty-icon" aria-hidden="true"><Umbrella size={18} strokeWidth={1.75} /></span>
						{#if !data.hasShiftAssignment}Your holiday calendar appears once HR sets your shift group.{:else if !data.resolvedCalendar}No holiday calendar has been published yet.{:else}No more holidays this year.{/if}
					</p>
				{/each}
			</div>
		</section>

		<section class="ess-card">
			<h3 class="ess-h2 aside-h">Related</h3>
			<div class="ess-rows">
				<a class="ess-row apply-row" href="/leave/apply">
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
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.search {
		flex: 1;
		max-width: 400px;
		min-width: 240px;
	}
	.search .ess-input {
		height: 36px;
		font-size: 13.5px;
	}

	.layout {
		--ess-aside-width: 320px;
	}
	.main {
		min-width: 0;
	}

	/* ---------- fit-to-screen layout ----------
	   The document column and the aside both reach the bottom of the
	   workspace; long holiday lists, policy lists and rule lists scroll
	   inside their own card. */
	.fill-col {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	.docs {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 12px;
		align-items: start;
	}
	.list {
		padding: 12px 10px;
		display: grid;
		gap: 2px;
	}
	.list-h {
		font-size: 15px;
		padding: 2px 8px 8px;
	}
	.doc-link {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 8px;
		border: none;
		border-radius: var(--ess-radius-md);
		background: transparent;
		font: inherit;
		color: var(--ess-text);
		text-align: left;
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}
	.doc-link .ess-tile--sm {
		width: 30px;
		height: 30px;
	}
	.doc-link .ess-row__title {
		font-size: 13.5px;
	}
	.doc-link .ess-row__meta {
		font-size: 12px;
	}
	.doc-link:hover {
		background: var(--ess-sunken);
	}
	.doc-link[aria-current='true'] {
		background: var(--ess-primary-soft);
	}
	.doc-link .ess-row__meta,
	.doc-link .ess-row__title {
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
		gap: 14px;
		align-content: start;
		padding: 16px 20px;
	}
	.holidays-doc {
		gap: 10px;
	}
	.doc-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--ess-border);
	}
	.doc-title {
		font-family: var(--ess-font-display);
		font-size: 21px;
		font-weight: 600;
		line-height: 1.15;
		margin-top: 4px;
		color: var(--ess-text);
	}
	.doc-sub {
		margin-top: 4px;
		font-size: 13.5px;
		color: var(--ess-text-secondary);
		max-width: 70ch;
	}
	.doc-meta {
		display: grid;
		text-align: right;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		flex: none;
	}
	.doc-meta strong {
		color: var(--ess-text);
		font-weight: 500;
	}
	.cap {
		text-transform: capitalize;
	}

	/* Leave policy: the few leave types sit as chips in one strip above the
	   document instead of a tall, mostly empty side list. */
	.docs--leave {
		grid-template-columns: minmax(0, 1fr);
	}
	.list--chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
	}
	.list--chips .list-h {
		padding: 0 8px 0 4px;
		margin-right: 4px;
	}
	.list--chips .doc-link {
		width: auto;
		padding: 5px 10px 5px 6px;
		border: 1px solid var(--ess-border);
		gap: 8px;
	}
	.list--chips .doc-link[aria-current='true'] {
		border-color: transparent;
	}
	.list--chips .doc-link .ess-tile--sm {
		width: 26px;
		height: 26px;
	}
	.list--chips .doc-link .ess-row__body {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
	}
	.list--chips :global(.chev) {
		display: none;
	}
	.list--chips .empty {
		padding: 4px;
	}

	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 10px;
	}
	.fact {
		padding: 9px 13px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		display: grid;
		gap: 3px;
		align-content: start;
	}
	.fact dt {
		margin: 0;
		font-size: 12px;
		color: var(--ess-text-secondary);
	}
	.fact dd {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--ess-text);
	}

	/* Workplace rules: numbered rows, each in its own soft panel. */
	.rule-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ess-text);
	}
	.rule-list li {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 9px 14px 9px 10px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
	}
	.rule-n {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-size: 12px;
		font-weight: 600;
	}
	.empty-icon {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		margin: 0 auto 8px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	/* Holiday rows, two to a line on a wide screen. */
	.holiday-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		align-content: start;
		column-gap: 20px;
	}
	.holiday-list .ess-row,
	.upcoming-list .ess-row {
		padding: 7px 0;
		gap: 12px;
	}
	.holiday-list .ess-row:last-child {
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.holiday-list .ess-date-tile,
	.upcoming-list .ess-date-tile {
		width: 44px;
		padding: 4px 0;
	}
	.holiday-list .ess-date-tile strong,
	.upcoming-list .ess-date-tile strong {
		font-size: 16px;
	}
	.holiday-list .ess-row__title,
	.upcoming-list .ess-row__title {
		font-size: 13.5px;
	}
	.holiday-list .ess-row__meta,
	.upcoming-list .ess-row__meta {
		font-size: 12px;
	}
	.holiday-list > .empty {
		grid-column: 1 / -1;
	}

	.holiday.past {
		opacity: 0.6;
	}

	.empty {
		padding: 10px 4px;
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	.aside-h {
		font-size: 15px;
		margin-bottom: 6px;
	}
	.fill-col .ess-row .ess-tile--sm {
		width: 30px;
		height: 30px;
	}
	.fill-col a.ess-row {
		padding: 8px 0;
	}
	.fill-col a.ess-row .ess-row__title {
		font-size: 13.5px;
	}
	.fill-col a.ess-row .ess-row__meta {
		font-size: 12px;
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
		.doc-title {
			font-size: 19px;
		}
	}
	@media (max-width: 560px) {
		.holiday-list {
			grid-template-columns: minmax(0, 1fr);
		}
		.facts {
			grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		}
		.search {
			min-width: 0;
			max-width: none;
			flex-basis: 100%;
		}
	}
	@media (min-width: 1101px) and (min-height: 480px) {
		.layout {
			grid-template-rows: minmax(0, 1fr);
		}
		.main {
			display: flex;
			flex-direction: column;
			min-height: 0;
		}
		.main > * {
			flex: 1 1 0%;
			min-height: 0;
		}
		.docs {
			grid-template-rows: minmax(0, 1fr);
			align-items: stretch;
		}
		.docs > .list,
		.docs > .doc {
			min-height: 0;
			overflow: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
		}
		.docs > .list {
			align-content: start;
		}
		.docs--leave {
			grid-template-rows: auto minmax(0, 1fr);
		}
		/* Eleven long titles: a denser list, the rule count beside the
		   title instead of under it. */
		.docs--workplace {
			grid-template-columns: 280px minmax(0, 1fr);
		}
		.docs--workplace .list {
			padding: 10px 8px;
			gap: 1px;
		}
		.docs--workplace .list-h {
			padding: 0 8px 6px;
		}
		.docs--workplace .doc-link {
			padding: 5px 8px;
			gap: 9px;
		}
		.docs--workplace .doc-link .ess-tile--sm {
			width: 26px;
			height: 26px;
			font-size: 13px;
		}
		.docs--workplace .doc-link .ess-row__body {
			display: flex;
			align-items: baseline;
			gap: 8px;
		}
		.docs--workplace .doc-link .ess-row__title {
			flex: 1 1 auto;
			line-height: 1.3;
		}
		.docs--workplace .doc-link .ess-row__meta {
			flex: none;
			font-size: 11.5px;
			color: var(--ess-text-muted);
		}
		.docs--workplace .list :global(.chev) {
			display: none;
		}
		.docs--leave > .list--chips {
			overflow: visible;
		}
		.fill-col {
			min-height: 0;
		}
		.fill-col > .grow {
			flex: 1 1 0%;
			min-height: 120px;
		}
		.fill-col > :not(.grow) {
			flex: none;
		}
		.upcoming-list {
			display: flex;
			flex-direction: column;
		}
		.upcoming-list > .fill-empty {
			margin: auto 0;
			text-align: center;
		}
		/* A lone notice (no shift group / no calendar) sits in the middle
		   of the card rather than at the top of an empty one. */
		.holidays-doc:has(> .ess-notice:only-child) {
			align-content: center;
			justify-content: center;
		}
		.holidays-doc > .ess-notice:only-child {
			max-width: 560px;
		}
	}
	@media (min-width: 1101px) and (min-height: 480px) and (max-height: 760px) {
		.doc {
			gap: 10px;
			padding: 12px 16px;
		}
		.doc-head {
			padding-bottom: 8px;
		}
		.doc-title {
			font-size: 18px;
		}
		.doc-sub {
			font-size: 13px;
		}
		.doc .ess-notice {
			padding: 9px 12px;
			font-size: 13px;
		}
		.rule-list {
			gap: 6px;
			font-size: 13.5px;
			line-height: 1.45;
		}
		.rule-list li {
			padding: 7px 12px 7px 9px;
		}
	}

	/* "Apply for leave" under Related reads as the page's blue button. */
	.apply-row {
		margin-bottom: 4px;
		border-radius: 12px;
		background: linear-gradient(180deg, color-mix(in srgb, var(--ess-primary) 78%, #fff), var(--ess-primary) 55%, color-mix(in srgb, var(--ess-primary) 88%, #000));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.3),
			0 8px 20px -8px color-mix(in srgb, var(--ess-primary) 85%, transparent);
		transition:
			filter var(--ess-t-fast),
			transform var(--ess-t-fast);
	}
	.apply-row:hover {
		filter: brightness(1.07);
		transform: translateY(-1px);
	}
	.apply-row :global(.ess-row__title),
	.apply-row :global(.ess-row__meta),
	.apply-row :global(.chev) {
		color: #fff;
	}
	.apply-row :global(.ess-row__meta) {
		opacity: 0.85;
	}
	.apply-row :global(.ess-tile) {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
	}
	@media (prefers-reduced-motion: reduce) {
		.apply-row:hover {
			transform: none;
		}
	}
</style>
