<script lang="ts">
	import Hash from '@lucide/svelte/icons/hash';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import FileText from '@lucide/svelte/icons/file-text';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Users from '@lucide/svelte/icons/users';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import NeedCard from '$lib/components/hub/NeedCard.svelte';
	import TaskRow from '$lib/components/hub/TaskRow.svelte';
	import DayStrip from '$lib/components/hub/DayStrip.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import { dueTone } from '$lib/hub/format';

	let { data } = $props();

	const t = $derived(data.today);
	const dueToday = $derived(t.needs.filter((n) => n.kind === 'due' && n.detail === 'Due today').length);

	/** "Thu" and "8 Oct" for the timeline's date column. */
	function dateCol(iso: string | null) {
		if (!iso) return { wd: '', d: 'No date' };
		const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
		return {
			wd: d.toLocaleDateString('en-IN', { weekday: 'short' }),
			d: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
		};
	}
</script>

<svelte:head><title>Today · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="ess-split today">
	<div class="ess-stack">
		<section class="ess-card" aria-labelledby="needs-h">
			<div class="ess-card-head">
				<h2 id="needs-h" class="ess-h2">Needs you{#if t.needs.length}<span class="n">{t.needs.length}</span>{/if}</h2>
				<a class="ess-link" href="/hub/tasks">All tasks <ChevronRight size={14} /></a>
			</div>
			<div class="ess-rows">
				{#each t.needs as item (item.key)}
					<NeedCard {item} />
				{:else}
					<p class="empty">Nothing is waiting on you. Leave approvals, task requests, meeting minutes and mentions show up here.</p>
				{/each}
			</div>
		</section>

		<section class="ess-card" aria-labelledby="week-h">
			<div class="ess-card-head">
				<h2 id="week-h" class="ess-h2">Due this week</h2>
				<a class="ess-link" href="/hub/tasks">View all tasks <ChevronRight size={14} /></a>
			</div>
			<ol class="timeline">
				{#each t.dueThisWeek as task (task.id)}
					{@const col = dateCol(task.dueDate)}
					<li class="tl" data-tone={dueTone(task.dueDate, task.status === 'done')}>
						<span class="date"><strong>{col.wd}</strong><small>{col.d}</small></span>
						<span class="dot" aria-hidden="true"></span>
						<div class="tl-row"><TaskRow {task} /></div>
					</li>
				{:else}
					<li class="empty">Nothing else is due in the next seven days.</li>
				{/each}
			</ol>
		</section>
	</div>

	<aside class="ess-stack">
		<section class="ess-card" aria-labelledby="meet-h">
			<div class="ess-card-head">
				<h2 id="meet-h" class="ess-h2">Upcoming meeting</h2>
				<a class="ess-link" href="/hub/meetings">View calendar <ChevronRight size={14} /></a>
			</div>
			<DayStrip meetings={t.meetingsToday} {dueToday} />
		</section>

		<section class="ess-card" aria-labelledby="chats-h">
			<div class="ess-card-head">
				<h2 id="chats-h" class="ess-h2">Unread chats</h2>
				<a class="ess-link" href="/hub/chats">View all chats <ChevronRight size={14} /></a>
			</div>
			<div class="ess-rows">
				{#each t.unreadChats as c (c.id)}
					<a class="ess-row chat" href="/hub/c/{c.id}">
						<span class="ess-tile ess-tile--sm" class:ess-tile--neutral={c.kind !== 'announcements'}>
							{#if c.kind === 'channel'}<Hash size={16} />{:else if c.kind === 'announcements'}<Megaphone size={16} />{:else}<MessageSquare size={16} />{/if}
						</span>
						<span class="ess-row__body">
							<span class="ess-row__title">{c.name}</span>
							{#if c.last}<span class="ess-row__meta">{c.last}</span>{/if}
						</span>
						<span class="ess-row__end"><span class="count">{c.kind === 'channel' && c.mentions ? `${c.mentions} @` : c.unread}</span></span>
					</a>
				{:else}
					<p class="empty">All caught up.</p>
				{/each}
			</div>
		</section>

		<section class="ess-card" aria-labelledby="quick-h">
			<div class="ess-card-head">
				<h2 id="quick-h" class="ess-h2">Quick actions</h2>
			</div>
			<div class="quick">
				<button type="button" class="qa" onclick={() => (hub.newTaskOpen = true)}>
					<span class="ess-tile ess-tile--sm"><FileText size={17} /></span>
					<span>Create new task</span>
				</button>
				<a class="qa" href="/hub/meetings?schedule=1">
					<span class="ess-tile ess-tile--sm"><Calendar size={17} /></span>
					<span>Schedule a meeting</span>
				</a>
				<a class="qa" href={data.hub.isLead ? '/hub/team' : '/team'}>
					<span class="ess-tile ess-tile--sm"><Users size={17} /></span>
					<span>View team</span>
				</a>
			</div>
		</section>
	</aside>
</div>

<style>
	.today {
		--ess-aside-width: 400px;
	}
	.n {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 7px;
		margin-left: 10px;
		border-radius: 99px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-family: var(--ess-font-sans);
		font-size: 12px;
		font-weight: 600;
		vertical-align: middle;
	}
	.empty {
		margin: 0;
		padding: 18px 0;
		font-size: 13.5px;
		color: var(--ess-text-muted);
		list-style: none;
	}
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.tl {
		position: relative;
		display: grid;
		grid-template-columns: 64px 24px minmax(0, 1fr);
		align-items: center;
		gap: 0 8px;
		padding: 8px 0;
	}
	.tl::before {
		content: '';
		position: absolute;
		left: 75px;
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
	.date {
		display: grid;
		line-height: 1.2;
		color: var(--ess-text-secondary);
		font-size: 13px;
	}
	.date strong {
		font-weight: 500;
		color: var(--ess-text);
	}
	.date small {
		font-size: 12.5px;
	}
	.dot {
		position: relative;
		z-index: 1;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ess-border-strong);
		justify-self: center;
		box-shadow: 0 0 0 3px var(--ess-surface);
	}
	.tl[data-tone='overdue'] .dot {
		background: var(--ess-danger);
	}
	.tl[data-tone='soon'] .dot {
		background: var(--ess-warning);
	}
	.tl[data-tone=''] .dot {
		background: var(--ess-primary);
	}
	.tl-row {
		min-width: 0;
	}
	.chat .ess-row__meta {
		font-size: 12.5px;
	}
	.count {
		min-width: 22px;
		height: 20px;
		padding: 0 6px;
		border-radius: 99px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font-size: 11px;
		font-weight: 600;
		display: grid;
		place-items: center;
	}
	.quick {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.qa {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 14px 8px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		text-align: center;
		cursor: pointer;
		transition: border-color var(--ess-t-fast);
	}
	.qa:hover {
		border-color: var(--ess-primary);
		color: var(--ess-primary-text);
	}
	@media (max-width: 720px) {
		.tl {
			grid-template-columns: 56px 18px minmax(0, 1fr);
		}
		.tl::before {
			left: 64px;
		}
	}
</style>
