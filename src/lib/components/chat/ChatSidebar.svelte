<script lang="ts">
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Hash from '@lucide/svelte/icons/hash';
	import Lock from '@lucide/svelte/icons/lock';
	import Bell from '@lucide/svelte/icons/bell';
	import Headset from '@lucide/svelte/icons/headset';
	import Users from '@lucide/svelte/icons/users';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Settings from '@lucide/svelte/icons/settings';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Avatar from '$lib/components/Avatar.svelte';
	import { channelLabel, type SidebarChannel } from '$lib/chat/client.svelte';

	let {
		channels,
		activeId,
		meId,
		isHr,
		presence,
		champWaiting = 0,
		onselect,
		onnew,
		onfind,
		onsettings
	}: {
		channels: SidebarChannel[];
		activeId: string | null;
		meId: string;
		isHr: boolean;
		presence: Map<string, { state: string; online: boolean; label: string }>;
		/** Approvals and tasks waiting in Champ's Requests tab. */
		champWaiting?: number;
		onselect: (id: string) => void;
		onnew: () => void;
		onfind: (mode: 'search' | 'saved') => void;
		onsettings: () => void;
	} = $props();

	let filter = $state('');

	const labelOf = channelLabel;

	const q = $derived(filter.trim().toLowerCase());
	const match = (c: SidebarChannel) => !q || labelOf(c, meId).toLowerCase().includes(q);
	const byRecent = (a: SidebarChannel, b: SidebarChannel) => b.lastMessageAt.localeCompare(a.lastMessageAt);

	const top = $derived(channels.filter((c) => (c.kind === 'announcements' || c.kind === 'system') && match(c)).sort((a) => (a.kind === 'announcements' ? -1 : 1)));
	const chans = $derived(
		channels
			.filter((c) => c.kind === 'channel' && match(c))
			.sort((a, b) => Number(a.source === 'manual') - Number(b.source === 'manual') || a.name.localeCompare(b.name))
	);
	const dms = $derived(
		channels
			.filter((c) => (c.kind === 'dm' || c.kind === 'group') && match(c))
			.sort((a, b) => Number(!!b.pinnedAs) - Number(!!a.pinnedAs) || byRecent(a, b))
	);
	const desks = $derived(channels.filter((c) => c.kind === 'desk' && match(c)).sort((a, b) => Number(a.deskStatus === 'resolved') - Number(b.deskStatus === 'resolved') || byRecent(a, b)));
	const openDesks = $derived(desks.filter((d) => d.deskStatus !== 'resolved').length);
</script>

{#snippet row(c: SidebarChannel)}
	{@const other = c.kind === 'dm' ? c.others[0] : null}
	{@const st = other ? presence.get(other.id) : null}
	<button
		type="button"
		class="row"
		class:on={c.id === activeId}
		class:unread={c.unread > 0 && !c.muted}
		class:left={other && !other.isActive}
		onclick={() => onselect(c.id)}
		aria-current={c.id === activeId ? 'page' : undefined}
	>
		<span class="ic">
			{#if c.kind === 'announcements'}<Megaphone size={15} />
			{:else if c.kind === 'system'}<Bell size={15} />
			{:else if c.kind === 'desk'}<Headset size={15} />
			{:else if c.kind === 'group'}<Users size={15} />
			{:else if other}
				<span class="av-wrap">
					<Avatar userId={other.id} fullName={other.fullName} size="sm" />
					{#if st}<span class="dot" data-state={st.state} class:online={st.online}></span>{/if}
				</span>
			{:else if c.isPrivate}<Lock size={14} />
			{:else}<Hash size={15} />{/if}
		</span>
		<span class="name">
			<span class="label">{labelOf(c, meId)}</span>
			{#if c.pinnedAs}<span class="pin">{c.pinnedAs === 'manager' ? 'Manager' : 'Your HR'}</span>{/if}
			{#if other && !other.isActive}<span class="pin">Left</span>{/if}
			{#if c.kind === 'desk' && c.deskStatus === 'resolved'}<span class="pin">Resolved</span>{/if}
		</span>
		{#if c.muted}<BellOff size={12} class="muted-ic" />{/if}
		{#if !c.muted && (c.kind === 'channel' ? c.mentions : c.unread) > 0}
			<span class="cnt" class:hot={c.kind === 'announcements' && c.mentions > 0}>{c.kind === 'channel' ? c.mentions : c.unread}</span>
		{:else if c.source !== 'manual' && c.kind === 'channel'}
			<span class="auto">{c.source === 'team' ? 'TEAM' : c.source === 'shift' ? 'SHIFT' : ''}</span>
		{/if}
	</button>
{/snippet}

<nav class="side" aria-label="Conversations">
	<div class="tools">
		<label class="filter">
			<Search size={14} />
			<input bind:value={filter} placeholder="Find a conversation" aria-label="Find a conversation" />
		</label>
		<button type="button" class="ess-btn ess-btn--primary ess-btn--sm new" onclick={onnew} aria-label="New conversation"><Plus size={15} /></button>
	</div>
	<div class="quick">
		<button type="button" onclick={() => onfind('search')}><Search size={13} /> Search messages</button>
		<button type="button" onclick={() => onfind('saved')}><Bookmark size={13} /> Saved</button>
		<button type="button" onclick={onsettings} aria-label="Chat settings"><Settings size={13} /></button>
	</div>
	<div class="scroll">
		<!-- Champ lives here, in Champ Chat, rather than floating over every page. -->
		<button type="button" class="row champ" class:on={activeId === 'champ'} onclick={() => onselect('champ')} aria-current={activeId === 'champ' ? 'page' : undefined}>
			<span class="ic sparkle"><Sparkles size={15} /></span>
			<span class="name"><span class="label">Champ</span><span class="pin">Assistant</span></span>
			{#if champWaiting > 0}<span class="cnt">{champWaiting}</span>{/if}
		</button>
		{#each top as c (c.id)}{@render row(c)}{/each}

		<h3>Channels</h3>
		{#each chans as c (c.id)}{@render row(c)}{/each}
		{#if chans.length === 0}<p class="empty">No channels match.</p>{/if}

		<h3>Direct messages</h3>
		{#each dms as c (c.id)}{@render row(c)}{/each}
		{#if dms.length === 0}<p class="empty">Start one with the + button.</p>{/if}

		{#if desks.length}
			<h3>{isHr ? `Ask HR desk${openDesks ? ` · ${openDesks} open` : ''}` : 'Ask HR'}</h3>
			{#each desks as c (c.id)}{@render row(c)}{/each}
		{/if}
	</div>
</nav>

<style>
	.side {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--ess-inverse);
		border-right: 1px solid var(--ess-border);
	}
	.tools {
		display: flex;
		gap: 6px;
		padding: 12px 12px 6px;
	}
	.filter {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		height: 32px;
		border: 1px solid var(--ess-border);
		border-radius: 9px;
		background: var(--ess-field-bg);
		color: var(--ess-text-muted);
		min-width: 0;
	}
	.filter input {
		border: 0;
		background: none;
		outline: none;
		font: inherit;
		font-size: 13px;
		color: var(--ess-text);
		width: 100%;
	}
	.new {
		width: 32px;
		height: 32px;
		padding: 0;
	}
	.quick {
		display: flex;
		gap: 4px;
		padding: 0 12px 6px;
	}
	.quick button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 0;
		background: none;
		padding: 4px 6px;
		border-radius: 6px;
		font: inherit;
		font-size: 12px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.quick button:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.quick button:last-child {
		margin-left: auto;
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: 4px 8px 16px;
		overscroll-behavior: contain;
	}
	h3 {
		margin: 14px 8px 4px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 34px;
		padding: 4px 8px;
		border: 0;
		border-radius: 8px;
		background: none;
		font: inherit;
		font-size: 13.5px;
		color: var(--ess-text-secondary);
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.row.on {
		background: var(--ess-primary-soft);
		color: var(--ess-text);
		font-weight: 600;
	}
	.row.unread {
		color: var(--ess-text);
		font-weight: 700;
	}
	.row.left {
		opacity: 0.6;
	}
	.row:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}
	.sparkle {
		color: #e879a6;
	}
	.ic {
		width: 22px;
		display: grid;
		place-items: center;
		color: var(--ess-text-muted);
		flex-shrink: 0;
	}
	.av-wrap {
		position: relative;
		display: inline-flex;
		transform: scale(0.8);
	}
	.dot {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--ess-canvas);
		background: var(--ess-text-muted);
	}
	.dot[data-state='in'] {
		background: var(--ess-success);
	}
	.dot[data-state='leave'],
	.dot[data-state='holiday'] {
		background: var(--ess-warning);
	}
	.dot[data-state='night'] {
		background: #8b74f2;
	}
	.dot[data-state='weekoff'],
	.dot[data-state='off'],
	.dot[data-state='left'] {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--ess-text-muted);
	}
	.name {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pin {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0 5px;
		border-radius: 4px;
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
		flex-shrink: 0;
	}
	.cnt {
		min-width: 19px;
		height: 19px;
		padding: 0 5px;
		border-radius: 99px;
		display: inline-grid;
		place-items: center;
		font-size: 10.5px;
		font-weight: 700;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		flex-shrink: 0;
	}
	.cnt.hot {
		background: var(--ess-danger);
		color: #fff;
	}
	.auto {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--ess-text-muted);
	}
	.row :global(.muted-ic) {
		color: var(--ess-text-muted);
		flex-shrink: 0;
	}
	.empty {
		margin: 2px 8px;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
</style>
