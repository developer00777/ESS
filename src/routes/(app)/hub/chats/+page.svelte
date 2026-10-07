<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Hash from '@lucide/svelte/icons/hash';
	import Lock from '@lucide/svelte/icons/lock';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Bell from '@lucide/svelte/icons/bell';
	import Headset from '@lucide/svelte/icons/headset';
	import Users from '@lucide/svelte/icons/users';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Settings from '@lucide/svelte/icons/settings';
	import Avatar from '$lib/components/Avatar.svelte';
	import NewChatDialog from '$lib/components/chat/NewChatDialog.svelte';
	import ChatPrefs from '$lib/components/chat/ChatPrefs.svelte';
	import FindPanel from '$lib/components/chat/FindPanel.svelte';
	import SideSheet from '$lib/components/hub/SideSheet.svelte';
	import { chat, channelLabel, type SidebarChannel } from '$lib/chat/client.svelte';
	import { ago } from '$lib/hub/format';

	/**
	 * Every conversation as one list, in place of Champ Chat's left sidebar.
	 * Opening one shows it full width, with a strip of recent conversations
	 * above it for switching.
	 */
	let { data } = $props();
	const meId = $derived(data.hubMe.id);
	const channels = $derived<SidebarChannel[]>(chat.channels.length ? chat.channels : (data.sidebar.channels as SidebarChannel[]));

	type Filter = 'all' | 'unread' | 'channels' | 'people' | 'hr';
	let filter = $state<Filter>('all');
	let q = $state('');
	let newOpen = $state(false);
	let prefsOpen = $state(false);
	let find = $state<{ mode: 'search' | 'saved'; q: string } | null>(page.url.searchParams.get('search') ? { mode: 'search', q: page.url.searchParams.get('search')! } : null);

	const label = (c: SidebarChannel) => (c.kind === 'channel' ? '#' : '') + channelLabel(c, meId);
	const count = (c: SidebarChannel) => (c.muted ? 0 : c.kind === 'channel' ? c.mentions : c.unread);
	const bold = (c: SidebarChannel) => !c.muted && c.unread > 0;

	const shown = $derived(
		channels
			.filter((c) => {
				if (q.trim() && !label(c).toLowerCase().includes(q.trim().toLowerCase())) return false;
				if (filter === 'unread') return bold(c);
				if (filter === 'channels') return c.kind === 'channel';
				if (filter === 'people') return c.kind === 'dm' || c.kind === 'group';
				if (filter === 'hr') return c.kind === 'system' || c.kind === 'desk' || c.kind === 'announcements';
				return true;
			})
			// What needs reading first, then the most recent.
			.sort((a, b) => Number(count(b) > 0) - Number(count(a) > 0) || Number(!!b.pinnedAs) - Number(!!a.pinnedAs) || b.lastMessageAt.localeCompare(a.lastMessageAt))
	);

	const nameOf = (cid: string) => {
		const c = channels.find((x) => x.id === cid);
		return c ? label(c) : 'Conversation';
	};
</script>

<svelte:head><title>Chats · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<header class="ess-page-head head">
		<div>
			<h1 class="ess-page-title">Chats</h1>
			<p class="ess-page-sub">Channels, direct messages, your ESS feed, Ask HR and Champ.</p>
		</div>
		<div class="tools">
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (find = { mode: 'search', q: '' })}><Search size={14} /> Search messages</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (find = { mode: 'saved', q: '' })}><Bookmark size={14} /> Saved</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (prefsOpen = true)} aria-label="Chat settings"><Settings size={14} /></button>
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => (newOpen = true)}><Plus size={14} /> New chat</button>
		</div>
	</header>

	<div class="bar">
		<input class="ess-input find" bind:value={q} placeholder="Find a conversation" aria-label="Find a conversation" />
		<div class="filters" role="group" aria-label="Show">
			{#each [['all', 'All'], ['unread', 'Unread'], ['channels', 'Channels'], ['people', 'People'], ['hr', 'ESS & HR']] as [k, l] (k)}
				<button type="button" class="f" aria-pressed={filter === k} onclick={() => (filter = k as Filter)}>{l}</button>
			{/each}
		</div>
	</div>

	<div class="list">
		{#if filter === 'all' && !q.trim()}
			<a class="row champ" href="/hub/c/champ">
				<span class="ic champ-ic">CH</span>
				<span class="b"><strong>Champ</strong><small>Ask about leave, holidays, your tasks or your team</small></span>
				<span class="tag">Assistant</span>
			</a>
		{/if}
		{#each shown as c (c.id)}
			{@const other = c.kind === 'dm' ? c.others[0] : null}
			<a class="row" class:unread={bold(c)} href="/hub/c/{c.id}">
				<span class="ic">
					{#if other}<Avatar userId={other.id} fullName={other.fullName} size="sm" />
					{:else if c.kind === 'announcements'}<Megaphone size={16} />
					{:else if c.kind === 'system'}<Bell size={16} />
					{:else if c.kind === 'desk'}<Headset size={16} />
					{:else if c.kind === 'group'}<Users size={16} />
					{:else if c.isPrivate}<Lock size={15} />
					{:else}<Hash size={16} />{/if}
				</span>
				<span class="b">
					<strong>{label(c)}</strong>
					<small>
						{#if c.pinnedAs}{c.pinnedAs === 'manager' ? 'Your manager' : 'Your HR'} · {/if}
						{#if c.kind === 'desk'}{c.deskStatus === 'resolved' ? 'Resolved' : 'Open'} · {/if}
						{#if other && !other.isActive}Left · {/if}
						{c.kind === 'channel' && c.source !== 'manual' ? (c.source === 'team' ? 'Team channel · ' : c.source === 'shift' ? 'Shift channel · ' : '') : ''}{ago(c.lastMessageAt)}
					</small>
				</span>
				{#if c.muted}<BellOff size={13} class="muted" />{/if}
				{#if count(c) > 0}<span class="n" class:hot={c.kind === 'announcements' && c.mentions > 0}>{count(c)}</span>{/if}
			</a>
		{:else}
			<p class="empty">{q.trim() ? 'No conversation matches.' : filter === 'unread' ? 'All caught up.' : 'Nothing here yet.'}</p>
		{/each}
	</div>
</div>

{#if newOpen}
	<NewChatDialog scope={data.can.createChannels as 'anywhere' | 'team' | 'none'} onclose={() => (newOpen = false)} onopen={async (id) => { newOpen = false; await chat.refresh(); await goto(`/hub/c/${id}`); }} />
{/if}
{#if prefsOpen}<ChatPrefs onclose={() => (prefsOpen = false)} />{/if}
{#if find}
	{@const f = find}
	<SideSheet label={f.mode === 'saved' ? 'Saved messages' : 'Search messages'} onclose={() => (find = null)}>
		<FindPanel mode={f.mode} initialQuery={f.q} {meId} meName={data.hubMe.fullName} {nameOf} onopen={(m) => goto(`/hub/c/${m.channelId}${m.threadRootId ? `?t=${m.threadRootId}` : ''}`)} onclose={() => (find = null)} />
	</SideSheet>
{/if}

<style>
	.page {
		max-width: 900px;
		margin-inline: auto;
		display: grid;
		gap: 14px;
	}
	.head {
		margin-bottom: 0;
		flex-wrap: wrap;
	}
	.tools {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.bar {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	.find {
		flex: 1;
		min-width: 200px;
	}
	.filters {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.f {
		border: 1px solid var(--ess-border);
		background: transparent;
		border-radius: 99px;
		padding: 4px 12px;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.f[aria-pressed='true'] {
		background: var(--ess-text);
		color: var(--ess-canvas);
		border-color: var(--ess-text);
	}
	.list {
		display: grid;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-border-subtle);
		color: var(--ess-text);
	}
	.row:hover {
		border-color: var(--ess-border-strong);
	}
	.ic {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
		flex: none;
	}
	.champ-ic {
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		font-size: 11px;
		font-weight: 800;
	}
	.b {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.b strong {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.unread .b strong {
		font-weight: 700;
	}
	.b small {
		font-size: 12px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tag {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
		background: var(--ess-primary-soft);
		border-radius: 99px;
		padding: 2px 8px;
	}
	.n {
		min-width: 20px;
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
	.n.hot {
		background: var(--ess-danger);
		color: #fff;
	}
	.row :global(.muted) {
		color: var(--ess-text-muted);
	}
	.empty {
		padding: 22px;
		text-align: center;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
</style>
