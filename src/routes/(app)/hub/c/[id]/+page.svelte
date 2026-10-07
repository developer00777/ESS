<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Info from '@lucide/svelte/icons/info';
	import Hash from '@lucide/svelte/icons/hash';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Headset from '@lucide/svelte/icons/headset';
	import Bell from '@lucide/svelte/icons/bell';
	import Users from '@lucide/svelte/icons/users';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Avatar from '$lib/components/Avatar.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import ThreadPanel from '$lib/components/chat/ThreadPanel.svelte';
	import InfoPanel from '$lib/components/chat/InfoPanel.svelte';
	import AnnouncementFeed from '$lib/components/announcements/AnnouncementFeed.svelte';
	import AnnouncementAdmin from '$lib/components/announcements/AnnouncementAdmin.svelte';
	import ChampPanel from '$lib/components/champ/ChampPanel.svelte';
	import SideSheet from '$lib/components/hub/SideSheet.svelte';
	import NewTaskDialog from '$lib/components/hub/NewTaskDialog.svelte';
	import { chat, channelLabel, type SidebarChannel } from '$lib/chat/client.svelte';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	let { data, form } = $props();

	const me = $derived(data.me);
	const channels = $derived<SidebarChannel[]>(chat.channels.length ? chat.channels : (data.sidebar.channels as SidebarChannel[]));

	/* ---------- which conversation ---------- */

	const want = $derived(page.params.id ?? '');
	const activeId = $derived.by(() => {
		if (want === 'champ') return 'champ';
		if (want === 'announcements') return channels.find((c) => c.kind === 'announcements')?.id ?? null;
		if (want === 'ess') return channels.find((c) => c.kind === 'system')?.id ?? null;
		return channels.some((c) => c.id === want) ? want : null;
	});
	const active = $derived(channels.find((c) => c.id === activeId) ?? null);
	const champOpen = $derived(activeId === 'champ');

	$effect(() => {
		chat.openChannelId = activeId;
		return () => (chat.openChannelId = null);
	});

	/** The strip above the conversation: the open one, then the most recent, unread first. */
	const recent = $derived(
		[...channels]
			.sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId) || Number(b.unread > 0 && !b.muted) - Number(a.unread > 0 && !a.muted) || b.lastMessageAt.localeCompare(a.lastMessageAt))
			.slice(0, 10)
	);
	const pillLabel = (c: SidebarChannel) => (c.kind === 'channel' ? '#' : '') + channelLabel(c, me.id);

	/* ---------- sheets ---------- */

	let sheet = $state<'thread' | 'info' | null>(null);
	let thread = $state<ChatMessageView | null>(null);
	let manageAnnouncements = $state(page.url.searchParams.has('compose'));
	let makeFrom = $state<{ messageId: string; text: string; mentionIds: string[] } | null>(null);
	const draft = $derived.by(() => {
		try {
			const d = page.url.searchParams.get('draft');
			return d ? JSON.parse(d) : null;
		} catch {
			return null;
		}
	});

	function openThread(m: ChatMessageView) {
		thread = m;
		sheet = 'thread';
	}
	function closeSheet() {
		sheet = null;
		thread = null;
		if (page.url.searchParams.has('t')) {
			const url = new URL(page.url);
			url.searchParams.delete('t');
			replaceState(url, {});
		}
	}

	// ?t=<id> opens a thread (from a notification about a reply).
	$effect(() => {
		const t = page.url.searchParams.get('t');
		if (!t || thread?.id === t) return;
		void fetch(`/api/chat/messages?ids=${t}`).then(async (r) => {
			const [m] = r.ok ? await r.json() : [];
			if (m) openThread(m);
		});
	});

	/* ---------- members and presence ---------- */

	let members = $state<{ id: string; fullName: string }[]>([]);
	$effect(() => {
		const id = activeId;
		if (!id || id === 'champ' || active?.kind === 'announcements' || active?.kind === 'system') {
			members = [];
			return;
		}
		void fetch(`/api/chat/channels/${id}/members`).then(async (r) => {
			if (r.ok && activeId === id) members = (await r.json()).filter((m: { id: string; isActive: boolean }) => m.id !== me.id && m.isActive);
		});
	});

	type Presence = { id: string; label: string; state: string; online: boolean };
	let presence = $state(new Map<string, Presence>());
	$effect(() => {
		const ids = members.map((m) => m.id).slice(0, 300);
		if (!ids.length) return;
		const load = async () => {
			const r = await fetch(`/api/chat/presence?ids=${ids.join(',')}`);
			if (!r.ok) return;
			const next = new Map(presence);
			for (const p of (await r.json()) as Presence[]) next.set(p.id, p);
			presence = next;
		};
		void load();
		const t = setInterval(load, 60_000);
		return () => clearInterval(t);
	});
	const statusOf = (id: string) => presence.get(id) ?? null;

	/* ---------- composer rules ---------- */

	const other = $derived(active?.kind === 'dm' ? active.others[0] : null);
	const disabledReason = $derived.by(() => {
		if (!active) return 'Pick a conversation';
		if (active.kind === 'system') return 'This is your ESS feed: requests to approve, decisions and reminders. Nothing is posted here.';
		if (other && !other.isActive) return `${other.fullName} has left, so this conversation is read-only.`;
		return null;
	});
	const placeholder = $derived(active ? (active.kind === 'channel' ? `Message #${active.name}  ·  /task @name to give a task` : active.kind === 'desk' ? (active.deskOwnerId === me.id ? 'Ask HR a question' : 'Reply to this question') : `Message ${channelLabel(active, me.id)}`) : 'Message');
	const canMentionAll = $derived(!!active && active.kind === 'channel' && (data.can.mentionAll || (me.role === 'team_lead' && (active.teamId === me.teamId || (active.source === 'team' && !!me.teamId)))));
	// Tasks come from conversations between people, not from feeds.
	const canMakeTasks = $derived(!!active && (active.kind === 'channel' || active.kind === 'dm' || active.kind === 'group' || active.kind === 'desk'));

	let list = $state<ReturnType<typeof MessageList> | null>(null);

	async function refreshFeed() {
		await invalidateAll();
		await chat.refresh();
	}
</script>

<svelte:head>
	<title>{champOpen ? 'Champ' : active ? pillLabel(active) : 'Chat'} · Champ Hub — Champ HR ESS Portal</title>
</svelte:head>

<div class="conv">
	<nav class="strip" aria-label="Recent conversations">
		<a class="back" href="/hub/chats" aria-label="All chats"><ArrowLeft size={15} /></a>
		<a class="pill champ" href="/hub/c/champ" aria-current={champOpen ? 'page' : undefined}><span class="ch">CH</span>Champ</a>
		{#each recent as c (c.id)}
			<a class="pill" href="/hub/c/{c.id}" aria-current={c.id === activeId ? 'page' : undefined} class:unread={c.unread > 0 && !c.muted}>
				<span>{pillLabel(c)}</span>
				{#if !c.muted && (c.kind === 'channel' ? c.mentions : c.unread) > 0}<span class="n">{c.kind === 'channel' ? c.mentions : c.unread}</span>{/if}
			</a>
		{/each}
	</nav>

	<section class="main" aria-label="Conversation">
		{#if champOpen}
			<div class="champ-view">
				<ChampPanel firstName={me.fullName.split(' ')[0]} initialQuestion={page.url.searchParams.get('ask') ?? ''} />
			</div>
		{:else if active}
			<header class="head">
				<span class="head-ic">
					{#if active.kind === 'announcements'}<Megaphone size={17} />
					{:else if active.kind === 'system'}<Bell size={17} />
					{:else if active.kind === 'desk'}<Headset size={17} />
					{:else if active.kind === 'group'}<Users size={17} />
					{:else if other}<Avatar userId={other.id} fullName={other.fullName} size="sm" />
					{:else}<Hash size={17} />{/if}
				</span>
				<div class="title">
					<strong>{channelLabel(active, me.id)}</strong>
					<small>
						{#if other}
							{statusOf(other.id)?.label ?? ''}{statusOf(other.id)?.online ? ' · online' : ''}{active.pinnedAs ? ` · ${active.pinnedAs === 'manager' ? 'Your reporting manager' : 'Your concerned HR'}` : ''}
						{:else if active.kind === 'desk'}
							{active.deskOwnerId === me.id ? 'Private to you and HR · goes to your concerned HR first' : `Question from ${channelLabel(active, me.id)}`} · {active.deskStatus === 'resolved' ? 'Resolved' : 'Open'}
						{:else if active.kind === 'announcements'}
							Notices from HR: what needs you, what is coming up, updates
						{:else if active.kind === 'system'}
							Requests waiting on you, decisions on yours, reminders
						{:else}
							{active.topic || (active.source === 'team' ? 'Team channel' : active.source === 'shift' ? 'Shift channel' : '')}
						{/if}
					</small>
				</div>
				{#if active.kind === 'announcements' && data.can.postAnnouncements}
					<button type="button" class="ess-btn ess-btn--sm {manageAnnouncements ? 'ess-btn--secondary' : 'ess-btn--primary'}" onclick={() => (manageAnnouncements = !manageAnnouncements)}>
						<PenLine size={14} /> {manageAnnouncements ? 'Back to the feed' : 'Post & manage'}
					</button>
				{/if}
				{#if active.kind !== 'announcements'}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" aria-label="Details" aria-pressed={sheet === 'info'} onclick={() => (sheet = sheet === 'info' ? null : 'info')}><Info size={16} /></button>
				{/if}
			</header>

			{#if active.kind === 'announcements'}
				<div class="ann">
					{#if manageAnnouncements && data.announcementAdmin}
						<AnnouncementAdmin data={data.announcementAdmin} {form} {draft} />
					{:else}
						<AnnouncementFeed feed={data.feed} now={data.now} onchanged={refreshFeed} />
					{/if}
				</div>
			{:else}
				{#key active.id}
					<MessageList
						bind:this={list}
						channelId={active.id}
						meId={me.id}
						meName={me.fullName}
						{statusOf}
						onreply={openThread}
						onmaketask={canMakeTasks ? (m) => (makeFrom = { messageId: m.id, text: m.body, mentionIds: m.mentions }) : undefined}
						emptyText={active.kind === 'system' ? 'Nothing here yet. Leave requests to approve and decisions on yours will appear here.' : active.kind === 'desk' ? 'Ask HR anything here. Only you and HR can see it.' : 'No messages yet. Say hello.'}
					/>
					<Composer channelId={active.id} {members} {placeholder} {disabledReason} {canMentionAll} onsent={(m) => m && list?.upsert([m])} />
				{/key}
			{/if}
		{:else if channels.length}
			<div class="none">
				<p>That conversation isn't available to you. It may have been archived, or you may have left it.</p>
				<a class="ess-btn ess-btn--secondary" href="/hub/chats">All chats</a>
			</div>
		{:else}
			<div class="none"><p>Loading…</p></div>
		{/if}
	</section>
</div>

{#if sheet === 'thread' && thread && active}
	<SideSheet label="Thread" onclose={closeSheet}>
		{#key thread.id}
			<ThreadPanel root={thread} meId={me.id} meName={me.fullName} {members} canPost={!disabledReason} {statusOf} onclose={closeSheet} />
		{/key}
	</SideSheet>
{:else if sheet === 'info' && active}
	<SideSheet label="Conversation details" onclose={closeSheet}>
		<InfoPanel
			channel={active}
			meId={me.id}
			meName={me.fullName}
			can={{ hrDesk: data.can.hrDesk, export: data.can.export, createChannels: data.can.createChannels }}
			{statusOf}
			onclose={closeSheet}
			onleft={() => {
				closeSheet();
				void chat.refresh().then(() => goto('/hub/chats'));
			}}
		/>
	</SideSheet>
{/if}
{#if makeFrom}
	<NewTaskDialog meId={me.id} from={makeFrom} onclose={() => (makeFrom = null)} />
{/if}

<style>
	.conv {
		--h: calc(100dvh - 2 * var(--ess-page-pad-y) - 72px);
		height: var(--h);
		min-height: 460px;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg);
		overflow: hidden;
		background: var(--ess-glass-bg);
		box-shadow: var(--ess-glass-shadow);
	}
	.strip {
		display: flex;
		align-items: center;
		gap: 6px;
		overflow-x: auto;
		padding: 8px 12px;
		border-bottom: 1px solid var(--ess-border-subtle);
		flex: none;
	}
	.back {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		color: var(--ess-text-secondary);
		flex: none;
	}
	.back:hover {
		background: var(--ess-surface-hover);
	}
	.pill {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 200px;
		padding: 4px 11px;
		border-radius: 99px;
		border: 1px solid var(--ess-border);
		color: var(--ess-text-secondary);
		font-size: 12.5px;
		font-weight: 500;
	}
	.pill span:not(.n):not(.ch) {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pill.unread {
		color: var(--ess-text);
		font-weight: 700;
	}
	.pill[aria-current='page'] {
		border-color: var(--ess-primary);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.pill.champ {
		padding-left: 5px;
	}
	.ch {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		font-size: 8.5px;
		font-weight: 800;
	}
	.n {
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 99px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font-size: 10px;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px 8px 16px;
		min-height: 56px;
		border-bottom: 1px solid var(--ess-border);
	}
	.head-ic {
		color: var(--ess-text-muted);
		display: inline-flex;
	}
	.title {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.title strong {
		font-family: var(--ess-font-display);
		font-size: 15.5px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.title small {
		font-size: 12px;
		color: var(--ess-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ann {
		flex: 1;
		overflow-y: auto;
		padding: 18px 20px 40px;
		display: grid;
		gap: 18px;
		align-content: start;
	}
	.champ-view {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.none {
		margin: auto;
		display: grid;
		gap: 12px;
		justify-items: center;
		text-align: center;
		color: var(--ess-text-muted);
		padding: 24px;
	}
	@media (max-width: 720px) {
		.conv {
			--h: calc(100dvh - 140px);
			border-radius: var(--ess-radius-md);
		}
	}
</style>
