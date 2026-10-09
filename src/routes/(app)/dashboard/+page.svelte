<script lang="ts">
	import Overview from './Overview.svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Video from '@lucide/svelte/icons/video';
	import FileText from '@lucide/svelte/icons/file-text';
	import Plane from '@lucide/svelte/icons/plane';
	import Bell from '@lucide/svelte/icons/bell';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import User from '@lucide/svelte/icons/user';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Headset from '@lucide/svelte/icons/headset';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Info from '@lucide/svelte/icons/info';
	import Check from '@lucide/svelte/icons/check';
	import Avatar from '$lib/components/Avatar.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import QuickActionRow from '$lib/components/QuickActionRow.svelte';
	import { timeIst } from '$lib/hub/format';

	let { data } = $props();

	const canApprove = $derived(data.user.role === 'team_lead' || data.user.role === 'super_admin');

	const OFFICE_TZ = 'Asia/Kolkata';
	const now = new Date();
	const todayLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: OFFICE_TZ });

	/** Mon–Fri of the current week, today marked. */
	const week = (() => {
		const d = new Date(now);
		const dow = (d.getDay() + 6) % 7; // Monday = 0
		d.setDate(d.getDate() - dow);
		return Array.from({ length: 5 }, (_, i) => {
			const day = new Date(d);
			day.setDate(d.getDate() + i);
			return { label: day.toLocaleDateString('en-IN', { weekday: 'short' }), num: day.getDate(), isToday: day.toDateString() === now.toDateString() };
		});
	})();

	function fmtTime(value: string | null | undefined) {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString('en-IN', { timeZone: OFFICE_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
	}
	function fmtDay(key: string) {
		return new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	}
	function fmtRange(a: string, b: string) {
		const s = new Date(a + 'T00:00:00');
		const e = new Date(b + 'T00:00:00');
		if (a === b) return s.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
		const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
		return `${s.toLocaleDateString('en-IN', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
	}
	function fmtHolidayDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
	}
	function activityWhen(iso: string) {
		const d = new Date(iso);
		return d.toDateString() === now.toDateString() ? timeIst(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: OFFICE_TZ });
	}

	const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
		pending: { label: 'Pending', tone: 'pending' },
		needs_manager_approval: { label: 'Needs manager', tone: 'pending' },
		manager_approved: { label: 'Under review', tone: 'pending' },
		escalated: { label: 'With HR', tone: 'info' },
		approved: { label: 'Approved', tone: 'approved' },
		rejected: { label: 'Rejected', tone: 'rejected' },
		cancelled: { label: 'Cancelled', tone: 'cancelled' },
		present: { label: 'On time', tone: 'present' }
	};
	const badge = (status: string) => STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' };

	/** Submitted › Manager review › Decision, from the latest request's status. */
	const steps = $derived.by(() => {
		const r = data.latestRequest;
		if (!r) return [];
		const submitted = new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: OFFICE_TZ });
		const decided = r.decidedAt ? new Date(r.decidedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: OFFICE_TZ }) : null;
		const s = r.status;
		return [
			{ label: 'Submitted', meta: submitted, state: 'done' },
			{ label: 'Manager review', meta: s === 'pending' ? 'In progress' : 'Done', state: s === 'pending' ? 'current' : 'done' },
			{
				label: s === 'escalated' ? 'HR decision' : 'Decision',
				meta: s === 'approved' ? `Approved${decided ? ` · ${decided}` : ''}` : s === 'rejected' ? `Rejected${decided ? ` · ${decided}` : ''}` : s === 'cancelled' ? 'Cancelled' : s === 'escalated' ? 'With HR' : 'Pending',
				state: s === 'approved' || s === 'rejected' || s === 'cancelled' ? 'done' : s === 'escalated' ? 'current' : 'todo'
			}
		];
	});

	async function decide(applicationId: string, decision: 'approve' | 'reject') {
		const res = await fetch(`/api/leave/${applicationId}/approve`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ decision })
		});
		if (res.ok) {
			location.reload();
		} else {
			const body = await res.json().catch(() => ({}));
			alert(body.message ?? 'Could not process this request');
		}
	}

	const joins = (m: (typeof data.meetingsToday)[number]) => m.state === 'upcoming' && m.canJoin;
	const meetingHref = (m: (typeof data.meetingsToday)[number]) => (joins(m) ? `/hub/meetings/${m.id}/join` : m.isHost && m.state !== 'upcoming' ? `/hub/meetings/${m.id}` : '/hub/meetings');

	/** Everything on today's timeline, in time order. */
	const timeline = $derived.by(() => {
		type Entry = { key: string; at: number; time: string; tone: 'ok' | 'accent' | 'warn' | 'muted'; title: string; detail: string; badge?: { label: string; tone: string }; action?: { label: string; href: string; primary?: boolean; newTab?: boolean }; highlight?: boolean };
		const out: Entry[] = [];
		const a = data.todayAttendance;
		if (a?.checkInAt) {
			out.push({ key: 'in', at: Date.parse(a.checkInAt), time: fmtTime(a.checkInAt), tone: 'ok', title: 'Shift started', detail: `You checked in at ${fmtTime(a.checkInAt)}${a.source === 'biometric' ? ' at the biometric terminal' : ''}. Have a great day!`, badge: { label: 'Recorded', tone: 'present' } });
			if (a.checkOutAt) out.push({ key: 'out', at: Date.parse(a.checkOutAt), time: fmtTime(a.checkOutAt), tone: 'muted', title: 'Shift ended', detail: `Checked out at ${fmtTime(a.checkOutAt)}.`, badge: { label: 'Recorded', tone: 'neutral' } });
		} else {
			out.push({ key: 'in', at: 0, time: '—', tone: 'muted', title: 'No check-in recorded yet', detail: 'Attendance comes from your biometric punch. Nothing has arrived for today so far.', action: { label: 'Attendance', href: '/attendance' } });
		}
		for (const m of data.meetingsToday) {
			const upcoming = m.state === 'upcoming';
			out.push({
				key: `m-${m.id}`,
				at: Date.parse(m.startedAt),
				time: timeIst(m.startedAt),
				tone: upcoming ? 'accent' : 'muted',
				title: m.topic,
				detail: `${m.durationMin ?? 30} min · ${m.source === 'zoom' ? 'Zoom' : 'Notes'}${m.attendees.length ? ` · ${m.attendees.length + 1} people` : ''}`,
				badge: upcoming ? undefined : { label: m.state === 'ready' ? 'Minutes ready' : m.state === 'waiting' ? 'Summary pending' : m.state === 'published' ? 'Tasks published' : 'Ended', tone: m.state === 'ready' ? 'info' : 'neutral' },
				action: upcoming ? { label: m.canJoin ? (m.isHost ? 'Start meeting' : 'Join meeting') : 'Open', href: meetingHref(m), primary: true, newTab: joins(m) } : m.isHost ? { label: 'Review', href: meetingHref(m) } : undefined
			});
		}
		for (const mc of data.missingCheckOuts.slice(0, 2)) {
			out.push({ key: `mc-${mc.date}`, at: Date.now() + 1, time: '', tone: 'warn', title: 'Attendance correction needs review', detail: `Your ${fmtDay(mc.date)} check-out time seems to be missing.`, badge: { label: 'Action required', tone: 'pending' }, action: { label: 'Review', href: `/attendance?raise=${mc.date}` }, highlight: true });
		}
		return out.sort((x, y) => x.at - y.at);
	});
</script>

<svelte:head>
	<title>Today — Champ HR ESS Portal</title>
</svelte:head>

<PageHeader crumb={['Home', 'Employee workspace']} title="Your workday, at a glance" sub={todayLine}>
	{#snippet actions()}
		<a href="/leave/apply" class="ess-btn ess-btn--primary"><Calendar size={17} /> Apply leave</a>
	{/snippet}
</PageHeader>

<Overview {data} />

<details class="workspace-details">
<summary>Daily timeline, request progress and more</summary>
<div class="ess-split today">
	<div class="ess-stack">
		<div class="ess-daystrip" aria-label="This week">
			<a class="ess-daystrip__nav" href="/attendance" aria-label="Attendance calendar"><ChevronLeft size={16} /></a>
			<div class="ess-daystrip__days">
				{#each week as d (d.num)}
					<span class="ess-day quiet" aria-current={d.isToday ? 'date' : undefined}>
						<span>{d.label}</span>
						<strong>{d.num}</strong>
					</span>
				{/each}
			</div>
			<a class="ess-daystrip__nav" href="/hub/meetings" aria-label="Meetings"><ChevronRight size={16} /></a>
		</div>

		<section class="ess-card" aria-labelledby="tl-h">
			<div class="ess-card-head">
				<h2 id="tl-h" class="ess-h2">Today’s timeline</h2>
				<a class="ess-link" href="/hub">View full day <ChevronRight size={14} /></a>
			</div>
			<ol class="timeline">
				{#each timeline as e (e.key)}
					<li class="tl" class:highlight={e.highlight} data-tone={e.tone}>
						<span class="tl-time">{e.time}</span>
						<span class="tl-dot" aria-hidden="true"></span>
						<div class="tl-body">
							<strong>{e.title}</strong>
							<span>{e.detail}</span>
						</div>
						<div class="tl-end">
							{#if e.badge}<span class="ess-badge ess-badge--{e.badge.tone}">{e.badge.label}</span>{/if}
							{#if e.action}
								<a class="ess-btn ess-btn--sm {e.action.primary ? 'ess-btn--primary' : 'ess-btn--secondary'}" href={e.action.href} target={e.action.newTab ? '_blank' : undefined} rel={e.action.newTab ? 'noopener' : undefined} data-sveltekit-reload={e.action.newTab ? true : undefined}>
									{#if e.action.primary}<Video size={14} />{/if}{e.action.label}
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</section>

		{#if canApprove}
			<section class="ess-card" aria-labelledby="needs-h">
				<div class="ess-card-head">
					<h2 id="needs-h" class="ess-h2">Needs your attention</h2>
					<a class="ess-link" href="/leave">View all {data.approvalQueue.length} <ChevronRight size={14} /></a>
				</div>
				<div class="ess-rows">
					{#each data.approvalQueue as row (row.application.id)}
						<div class="ess-row">
							<Avatar userId={row.applicant.id} fullName={row.applicant.fullName} hasPicture={row.applicantHasPicture} size="md" />
							<div class="ess-row__body">
								<span class="ess-row__title">{row.applicant.fullName}</span>
								<span class="ess-row__meta">{row.type.name} · {fmtRange(String(row.application.startDate).slice(0, 10), String(row.application.endDate).slice(0, 10))} · {Number(row.application.days)} day{Number(row.application.days) === 1 ? '' : 's'}</span>
							</div>
							<div class="ess-row__end">
								<button class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => decide(row.application.id, 'approve')}>Approve</button>
								<button class="ess-btn ess-btn--outline ess-btn--sm" onclick={() => decide(row.application.id, 'reject')}>Reject</button>
							</div>
						</div>
					{:else}
						<p class="empty">No pending approvals right now.</p>
					{/each}
				</div>
			</section>
		{/if}

		<section class="ess-card" aria-labelledby="act-h">
			<div class="ess-card-head">
				<h2 id="act-h" class="ess-h2">Recent activity</h2>
				<a class="ess-link" href="/attendance">View all activity <ChevronRight size={14} /></a>
			</div>
			<div class="ess-rows">
				{#each data.activity as a (a.key)}
					{@const b = badge(a.status)}
					<div class="ess-row activity">
						<span class="when">{activityWhen(a.at)}</span>
						<span class="ess-tile ess-tile--sm ess-tile--neutral">
							{#if a.kind === 'checkin'}<Clock size={16} />{:else if a.kind === 'leave'}<Plane size={16} />{:else}<FileText size={16} />{/if}
						</span>
						<div class="ess-row__body">
							<span class="ess-row__title">{a.title}</span>
							<span class="ess-row__meta">{a.detail}</span>
						</div>
						<div class="ess-row__end"><span class="ess-badge ess-badge--{b.tone}">{b.label}</span></div>
					</div>
				{:else}
					<p class="empty">Nothing yet. Your check-ins, leave requests and corrections appear here.</p>
				{/each}
			</div>
		</section>
	</div>

	<aside class="ess-stack">
		<section class="ess-card" aria-labelledby="hr-h">
			<div class="ess-card-head">
				<h2 id="hr-h" class="ess-h2">Your HR summary</h2>
			</div>
			<div class="summary">
				<div class="summary-top">
					<div>
						<span class="s-label">Attendance</span>
						<span class="s-value">{data.attendancePct}<small>%</small></span>
						<span class="s-meta">This month · {data.daysWithCheckIn} of {data.businessDaysSoFar} days</span>
					</div>
					<div class="spark" aria-hidden="true">
						{#each data.attendanceSpark as h, i (i)}
							<span style="height:{Math.max(10, Math.min(100, h))}%"></span>
						{/each}
					</div>
				</div>
				<div class="summary-grid">
					<a href="/leave" class="s-cell">
						<span class="s-head"><Calendar size={15} /> Leave balance</span>
						<span class="s-value">{data.leaveBalance} <small>days</small></span>
						<span class="s-meta">{data.leaveAllocated ? `out of ${data.leaveAllocated}` : `${data.leaveTypeCount} type${data.leaveTypeCount === 1 ? '' : 's'}`}</span>
					</a>
					<a href="/leave" class="s-cell">
						<span class="s-head"><FileText size={15} /> Requests</span>
						<span class="s-value">{data.pendingCount} <small>pending</small></span>
						<span class="s-meta">{data.approvedThisMonth} approved this month</span>
					</a>
				</div>
			</div>
		</section>

		<section class="ess-card" aria-labelledby="req-h">
			<div class="ess-card-head">
				<h2 id="req-h" class="ess-h2">Request progress</h2>
				<a class="ess-link" href="/leave" aria-label="All requests"><ChevronRight size={16} /></a>
			</div>
			{#if data.latestRequest}
				{@const r = data.latestRequest}
				<div class="req">
					<span class="ess-tile"><Plane size={20} strokeWidth={1.75} /></span>
					<div class="req-body">
						<strong>{r.typeName}</strong>
						<span>{fmtRange(r.startDate, r.endDate)}</span>
					</div>
					<span class="ess-badge ess-badge--accent">{r.days} day{r.days === 1 ? '' : 's'}</span>
				</div>
				<ol class="ess-stepper">
					{#each steps as s (s.label)}
						<li class="ess-step" data-state={s.state}>
							<span class="ess-step__dot">{#if s.state === 'done'}<Check size={12} strokeWidth={3} />{/if}</span>
							<span class="ess-step__label">{s.label}</span>
							<span class="ess-step__meta">{s.meta}</span>
						</li>
					{/each}
				</ol>
				{#if r.status === 'pending'}
					<div class="ess-notice ess-notice--info">
						<span class="ess-notice__icon"><Info size={15} /></span>
						<div class="ess-notice__body"><strong>Your manager is reviewing your request.</strong>We’ll notify you as soon as there’s an update.</div>
					</div>
				{:else if r.status === 'escalated'}
					<div class="ess-notice ess-notice--info">
						<span class="ess-notice__icon"><Info size={15} /></span>
						<div class="ess-notice__body"><strong>Your manager approved it; HR decides next.</strong>We’ll notify you as soon as there’s an update.</div>
					</div>
				{/if}
			{:else}
				<p class="empty">No leave requests yet. <a href="/leave/apply">Apply for leave</a> and track it here.</p>
			{/if}
		</section>

		{#if data.upcomingHolidays.length > 0}
			<section class="ess-card" aria-labelledby="hol-h">
				<div class="ess-card-head">
					<h2 id="hol-h" class="ess-h2">Coming up</h2>
					<a class="ess-link" href="/policies">Holiday calendar <ChevronRight size={14} /></a>
				</div>
				<div class="ess-rows">
					{#each data.upcomingHolidays as holiday (holiday.id)}
						<div class="ess-row">
							<span class="ess-date-tile"><strong>{new Date(holiday.date + 'T00:00:00').getDate()}</strong><small>{new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</small></span>
							<div class="ess-row__body">
								<span class="ess-row__title">{holiday.name}</span>
								<span class="ess-row__meta">{fmtHolidayDate(holiday.date)}</span>
							</div>
							<span class="ess-badge ess-badge--{holiday.type.toLowerCase() === 'restricted' ? 'info' : 'accent'}">{holiday.type.toLowerCase()} holiday</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="ess-card" aria-labelledby="qa-h">
			<div class="ess-card-head">
				<h2 id="qa-h" class="ess-h2">Quick actions</h2>
			</div>
			<div class="action-list">
				<QuickActionRow icon={Calendar} label="Apply leave" href="/leave/apply" />
				<QuickActionRow icon={Clock} label="My attendance" href="/attendance" />
				<QuickActionRow icon={User} label="Update profile" href="/profile" />
				<QuickActionRow icon={Megaphone} label="Company announcements" href="/chat?c=announcements" count={data.announcementBadge.count} urgent={data.announcementBadge.urgent} />
				<QuickActionRow icon={Bell} label="HR notifications" href="/hub/c/ess" />
				<QuickActionRow icon={BookOpen} label="Company policies" href="/policies" />
				<QuickActionRow icon={Headset} label="HR contacts" href="/hr-contacts" />
			</div>
		</section>
	</aside>
</div>

</details>

<style>
	:global(.ess-content:has(.overview)) { display:flex; flex-direction:column; overflow:hidden; gap:0; }
	:global(.ess-content:has(.overview) > .ess-page-head) { flex-shrink:0; }
	:global(.ess-content:has(.overview) > .overview) { flex:1; min-height:0; }
	:global(.ess-content:has(.workspace-details[open]) > .overview) { display:none; }
	.workspace-details { flex:0 1 auto; min-height:0; max-height:100%; overflow:auto; overscroll-behavior:contain; }
	.workspace-details > summary { position:sticky; top:0; background:var(--ess-canvas); z-index:2; }
	:global(.ess-content:has(.overview)) { padding-top:12px; padding-bottom:12px; }
	:global(.ess-content:has(.overview) .ess-page-head) { margin-bottom:12px; }
	:global(.ess-content:has(.overview) .ess-page-title) { font-size:clamp(24px,2.2vw,34px); }
	.workspace-details { margin-top: 6px; }
	.workspace-details > summary { cursor: pointer; padding: 12px 0; color: var(--ess-primary-text); font-weight: 500; }
	.workspace-details[open] > summary { margin-bottom: 12px; }
	.today {
		--ess-aside-width: 400px;
	}

	.ess-day.quiet {
		cursor: default;
	}

	.empty {
		margin: 0;
		padding: 14px 0;
		font-size: 13.5px;
		color: var(--ess-text-muted);
	}

	/* ---------- timeline ---------- */
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.tl {
		position: relative;
		display: grid;
		grid-template-columns: 52px 20px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.tl:last-child {
		border-bottom: none;
	}
	.tl::before {
		content: '';
		position: absolute;
		left: 73px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--ess-border-subtle);
	}
	.tl:first-child::before {
		top: 50%;
	}
	.tl:last-child::before {
		bottom: 50%;
	}
	.tl-time {
		font-size: 13px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.tl-dot {
		position: relative;
		z-index: 1;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		justify-self: center;
		background: var(--ess-border-strong);
		box-shadow: 0 0 0 3px var(--ess-surface);
	}
	.tl[data-tone='ok'] .tl-dot {
		background: var(--ess-success);
	}
	.tl[data-tone='accent'] .tl-dot {
		background: var(--ess-primary);
	}
	.tl[data-tone='warn'] .tl-dot {
		background: var(--ess-warning);
	}
	.tl-body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.tl-body strong {
		font-size: 15px;
		font-weight: 500;
	}
	.tl-body span {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.tl-end {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.tl.highlight {
		background: var(--ess-warning-bg);
		border-radius: var(--ess-radius-md);
		padding-left: 12px;
		padding-right: 12px;
		margin: 4px -12px;
		border-bottom: none;
	}
	.tl.highlight::before {
		left: 85px;
	}

	/* ---------- activity ---------- */
	.activity .when {
		min-width: 52px;
		font-size: 13px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	/* ---------- HR summary ---------- */
	.summary {
		display: grid;
		gap: 0;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		overflow: hidden;
	}
	.summary-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px;
		border-bottom: 1px solid var(--ess-border);
	}
	.summary-top > div:first-child {
		display: grid;
		gap: 2px;
	}
	.s-label,
	.s-head {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13.5px;
		color: var(--ess-text-secondary);
	}
	.s-value {
		font-family: var(--ess-font-display);
		font-size: 30px;
		font-weight: 600;
		line-height: 1.1;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.s-value small {
		font-size: 16px;
		font-weight: 500;
		margin-left: 2px;
	}
	.s-meta {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.spark {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 36px;
		width: 110px;
	}
	.spark span {
		flex: 1;
		border-radius: 3px;
		background: var(--ess-primary);
		opacity: 0.7;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.s-cell {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
		color: inherit;
		transition: background var(--ess-t-fast);
	}
	.s-cell:first-child {
		border-right: 1px solid var(--ess-border);
	}
	.s-cell:hover {
		background: var(--ess-sunken);
	}
	.s-cell .s-value {
		font-size: 24px;
	}

	/* ---------- request progress ---------- */
	.req {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		margin-bottom: 16px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-primary-softer);
	}
	.req-body {
		flex: 1;
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.req-body strong {
		font-size: 15px;
		font-weight: 500;
	}
	.req-body span {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.ess-stepper {
		margin-bottom: 16px;
	}

	.action-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: -6px -10px;
	}

	@media (max-width: 720px) {
		.tl {
			grid-template-columns: 44px 20px minmax(0, 1fr);
		}
		.tl::before {
			left: 65px;
		}
		.tl-end {
			grid-column: 3;
			justify-content: flex-start;
			margin-top: 8px;
		}
		.summary-grid {
			grid-template-columns: 1fr;
		}
		.s-cell:first-child {
			border-right: none;
			border-bottom: 1px solid var(--ess-border);
		}
	}
</style>
