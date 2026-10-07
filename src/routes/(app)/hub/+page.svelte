<script lang="ts">
	import Hash from '@lucide/svelte/icons/hash';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import NeedCard from '$lib/components/hub/NeedCard.svelte';
	import TaskRow from '$lib/components/hub/TaskRow.svelte';
	import DayStrip from '$lib/components/hub/DayStrip.svelte';
	import { longDay } from '$lib/hub/format';

	let { data } = $props();

	const t = $derived(data.today);
	const dueToday = $derived(t.needs.filter((n) => n.kind === 'due' && n.detail === 'Due today').length);
	const first = $derived(data.hubMe.fullName.split(' ')[0]);
</script>

<svelte:head><title>Today · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="today">
	<header class="head">
		<span class="ess-eyebrow">{longDay(new Date().toISOString())}</span>
		<h1 class="ess-page-title">{t.needs.length ? `${t.needs.length} ${t.needs.length === 1 ? 'thing needs' : 'things need'} you, ${first}` : `You're clear, ${first}`}</h1>
	</header>

	<DayStrip meetings={t.meetingsToday} {dueToday} />

	<section class="sec" aria-labelledby="needs-h">
		<h2 id="needs-h" class="label">Needs you <span>{t.needs.length}</span></h2>
		{#each t.needs as item (item.key)}
			<NeedCard {item} />
		{:else}
			<p class="empty">Nothing is waiting on you. Leave approvals, task requests, meeting minutes and mentions show up here.</p>
		{/each}
	</section>

	<section class="sec" aria-labelledby="week-h">
		<h2 id="week-h" class="label">Due this week <a href="/hub/tasks">All tasks</a></h2>
		{#each t.dueThisWeek as task (task.id)}
			<TaskRow {task} />
		{:else}
			<p class="empty">Nothing else is due in the next seven days.</p>
		{/each}
	</section>

	<section class="sec" aria-labelledby="chats-h">
		<h2 id="chats-h" class="label">Unread chats <a href="/hub/chats">All chats</a></h2>
		{#each t.unreadChats as c (c.id)}
			<a class="chat" href="/hub/c/{c.id}">
				<span class="ic">
					{#if c.kind === 'channel'}<Hash size={15} />{:else if c.kind === 'announcements'}<Megaphone size={15} />{:else}<MessageSquare size={15} />{/if}
				</span>
				<span class="b"><strong>{c.name}</strong>{#if c.last}<small>{c.last}</small>{/if}</span>
				<span class="n">{c.kind === 'channel' && c.mentions ? `${c.mentions} @` : c.unread}</span>
			</a>
		{:else}
			<p class="empty">All caught up.</p>
		{/each}
	</section>
</div>

<style>
	.today {
		max-width: 900px;
		margin-inline: auto;
		display: grid;
		gap: 22px;
	}
	.head {
		display: grid;
		gap: 4px;
	}
	.sec {
		display: grid;
		gap: 8px;
	}
	.label {
		margin: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.label a {
		text-transform: none;
		letter-spacing: 0;
		font-size: 12.5px;
		font-weight: 600;
	}
	.empty {
		margin: 0;
		padding: 18px;
		text-align: center;
		font-size: 13px;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
	.chat {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-border-subtle);
		color: var(--ess-text);
	}
	.chat:hover {
		border-color: var(--ess-border-strong);
	}
	.ic {
		width: 30px;
		height: 30px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
		flex: none;
	}
	.b {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.b strong {
		font-size: 13.5px;
	}
	.b small {
		color: var(--ess-text-secondary);
		font-size: 12.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.n {
		min-width: 22px;
		height: 20px;
		padding: 0 6px;
		border-radius: 99px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font-size: 11px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
</style>
