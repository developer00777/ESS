<script lang="ts">
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import Video from '@lucide/svelte/icons/video';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Avatar from '$lib/components/Avatar.svelte';
	import PasteNotesDialog from '$lib/components/hub/PasteNotesDialog.svelte';
	import ScheduleMeetingDialog from '$lib/components/hub/ScheduleMeetingDialog.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { longDay, timeIst } from '$lib/hub/format';
	import type { MeetingRowView } from '$lib/tasks/types';

	let { data } = $props();

	let pasteFor = $state<{ id: string | null; topic: string } | null>(null);
	let scheduling = $state(false);
	let cancelling = $state<string | null>(null);

	// Soonest first for what is coming, newest first for what is done.
	const upcoming = $derived(data.meetings.filter((m) => m.state === 'upcoming').sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
	const past = $derived(data.meetings.filter((m) => m.state !== 'upcoming'));

	async function cancel(id: string) {
		const r = await api(`/api/meetings/${id}/cancel`, 'POST', {});
		cancelling = null;
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		hub.say('Cancelled. Everyone invited was told.');
		hub.changed(0);
	}
	const date = (iso: string) => new Date(iso);
	const dayNum = (iso: string) => date(iso).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' });
	const mon = (iso: string) => date(iso).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
</script>

<svelte:head><title>Meetings · Champ Hub — Champ HR ESS Portal</title></svelte:head>

{#snippet row(m: MeetingRowView)}
	<article class="m">
		<div class="date"><b>{dayNum(m.startedAt)}</b><span>{mon(m.startedAt)}</span></div>
		<div class="main">
			<strong>{m.topic}</strong>
			<div class="meta">
				<span>{longDay(m.startedAt)}, {timeIst(m.startedAt)} IST{m.durationMin ? ` · ${m.durationMin} min` : ''}</span>
				{#if m.attendees.length}
					<span class="stack">{#each m.attendees.slice(0, 5) as p (p.id)}<Avatar userId={p.id} fullName={p.fullName} size="sm" />{/each}</span>
				{/if}
				{#if m.guestCount}<span>+{m.guestCount} {m.guestCount === 1 ? 'guest' : 'guests'}</span>{/if}
				{#if m.source === 'pasted'}<span>From notes</span>{/if}
			</div>
			<div>
				{#if m.state === 'upcoming'}
					<span class="chip accent">{m.isHost ? 'You scheduled this' : `From ${m.host?.fullName ?? 'a colleague'}`}</span>
				{:else if m.state === 'waiting'}
					<span class="chip warn"><span class="pulse"></span>Waiting for the summary</span>
				{:else if m.state === 'ready' && m.isHost}
					<span class="chip info"><Sparkles size={12} />{m.itemCount} action {m.itemCount === 1 ? 'item' : 'items'} to review{m.itemsNeedingOwner ? `, ${m.itemsNeedingOwner} without an owner` : ''}</span>
				{:else if m.state === 'ready'}
					<span class="chip warn">{m.host?.fullName.split(' ')[0] ?? 'The host'} is reviewing the minutes</span>
				{:else if m.state === 'published'}
					<span class="chip ok"><CircleCheck size={12} />{m.isHost ? `${m.publishedCount} tasks published` : `${m.mine.length} ${m.mine.length === 1 ? 'task' : 'tasks'} for you`}</span>
				{:else}
					<span class="chip">No summary for this meeting</span>
				{/if}
			</div>
			{#if m.state === 'upcoming' && m.agenda}<p class="agenda">{m.agenda}</p>{/if}
		</div>
		<div class="acts">
			{#if m.state === 'upcoming'}
				{#if m.canJoin}<a class="ess-btn ess-btn--primary ess-btn--sm" href="/hub/meetings/{m.id}/join" target="_blank" rel="noopener" data-sveltekit-reload><Video size={14} /> {m.isHost ? 'Start' : 'Join'}</a>{/if}
				{#if m.isHost}
					{#if cancelling === m.id}
						<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" onclick={() => cancel(m.id)}>Cancel meeting</button>
						<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (cancelling = null)}>Keep</button>
					{:else}
						<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (cancelling = m.id)}>Cancel</button>
					{/if}
				{/if}
			{:else if m.isHost && m.state === 'ready'}
				<a class="ess-btn ess-btn--primary ess-btn--sm" href="/hub/meetings/{m.id}">Review</a>
			{:else if m.isHost && m.state === 'published'}
				<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/meetings/{m.id}">View</a>
			{:else if m.isHost && (m.state === 'no_summary' || m.state === 'waiting')}
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={() => (pasteFor = { id: m.id, topic: m.topic })}><ClipboardPaste size={14} /> Paste notes</button>
			{:else if m.mine.length}
				<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/tasks?task={m.mine[0].taskId}">Open my task</a>
			{/if}
		</div>
	</article>
{/snippet}

<div class="page">
	<header class="ess-page-head head">
		<div>
			<h1 class="ess-page-title">Meetings</h1>
			<p class="ess-page-sub">
				{data.hub.zoom
					? 'Schedule a meeting, join from here, and the summary comes back to the person who scheduled it a few minutes after it ends. Nothing reaches anyone until they publish.'
					: 'Video calls are not switched on yet, so meetings are listed without a call to join and minutes come from pasted notes. HR can switch them on in Admin Controls.'}
			</p>
		</div>
		<div class="tools">
			<button type="button" class="ess-btn ess-btn--secondary" onclick={() => (pasteFor = { id: null, topic: '' })}><ClipboardPaste size={15} /> Minutes from notes</button>
			<button type="button" class="ess-btn ess-btn--primary" onclick={() => (scheduling = true)}><CalendarPlus size={15} /> Schedule meeting</button>
		</div>
	</header>

	{#if upcoming.length}
		<section class="sec">
			<h2 class="label">Coming up</h2>
			{#each upcoming as m (m.id)}{@render row(m)}{/each}
		</section>
	{/if}

	<section class="sec">
		<h2 class="label">Past 45 days</h2>
		{#each past as m (m.id)}
			{@render row(m)}
		{:else}
			<p class="empty">No meetings yet. Schedule one, or use Minutes from notes to turn a meeting into tasks.</p>
		{/each}
	</section>
</div>

{#if scheduling}
	<ScheduleMeetingDialog meId={data.hubMe.id} onclose={() => (scheduling = false)} />
{/if}
{#if pasteFor}
	<PasteNotesDialog meetingId={pasteFor.id} topic={pasteFor.topic} onclose={() => (pasteFor = null)} />
{/if}

<style>
	.page {
		max-width: 960px;
		margin-inline: auto;
		display: grid;
		gap: 18px;
	}
	.head {
		margin-bottom: 0;
		flex-wrap: wrap;
	}
	.sec {
		display: grid;
		gap: 8px;
	}
	.label {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.m {
		display: grid;
		grid-template-columns: 54px minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
	}
	.date {
		text-align: center;
		border-radius: 10px;
		background: var(--ess-sunken);
		padding: 6px 0;
		line-height: 1.1;
	}
	.date b {
		display: block;
		font-family: var(--ess-font-display);
		font-size: 19px;
	}
	.date span {
		font-size: 10.5px;
		color: var(--ess-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.main {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.main strong {
		font-size: 14.5px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		align-items: center;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.stack {
		display: inline-flex;
	}
	.stack :global(> *:not(:first-child)) {
		margin-left: -7px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 9px;
		border-radius: 99px;
		font-size: 11.5px;
		font-weight: 600;
		background: var(--ess-neutral-bg);
		color: var(--ess-neutral);
	}
	.chip.ok {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.chip.info {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.chip.warn {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.chip.accent {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.pulse {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.tools {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.agenda {
		margin: 2px 0 0;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		white-space: pre-line;
	}
	.empty {
		padding: 22px;
		text-align: center;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
	@media (max-width: 640px) {
		.m {
			grid-template-columns: 46px minmax(0, 1fr);
		}
		.acts {
			grid-column: 1 / -1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}
</style>
