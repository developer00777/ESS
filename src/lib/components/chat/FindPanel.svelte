<script lang="ts">
	import { untrack } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import Search from '@lucide/svelte/icons/search';
	import MessageItem from './MessageItem.svelte';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	/** Search across your conversations, or your saved messages. */
	let {
		mode,
		meId,
		meName,
		nameOf,
		onopen,
		onclose,
		initialQuery = ''
	}: {
		mode: 'search' | 'saved';
		meId: string;
		meName: string;
		nameOf: (channelId: string) => string;
		onopen: (m: ChatMessageView) => void;
		onclose: () => void;
		/** Words to search for straight away (Champ Hub's Ctrl K). */
		initialQuery?: string;
	} = $props();

	let q = $state(untrack(() => initialQuery));
	let results = $state<ChatMessageView[]>([]);
	let busy = $state(false);
	let searched = $state(false);

	async function run() {
		busy = true;
		const url = mode === 'saved' ? '/api/chat/saved' : `/api/chat/search?q=${encodeURIComponent(q.trim())}`;
		const r = await fetch(url);
		results = r.ok ? await r.json() : [];
		busy = false;
		searched = true;
	}

	$effect(() => {
		// Only the starting query runs on its own; after that, Search does.
		if (mode === 'saved' || untrack(() => q.trim().length >= 2)) void run();
		else {
			results = [];
			searched = false;
		}
	});
</script>

<aside class="panel" aria-label={mode === 'saved' ? 'Saved messages' : 'Search messages'}>
	<header>
		<strong>{mode === 'saved' ? 'Saved' : 'Search'}</strong>
		<button type="button" class="ess-icon-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
	</header>
	{#if mode === 'search'}
		<form class="bar" onsubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) void run(); }}>
			<Search size={14} />
			<input bind:value={q} placeholder="Words from a message" aria-label="Search messages" />
			<button type="submit" class="ess-btn ess-btn--primary ess-btn--sm" disabled={q.trim().length < 2 || busy}>Search</button>
		</form>
	{/if}
	<div class="body">
		{#if busy}<p class="note">Looking…</p>{/if}
		{#each results as m (m.id)}
			<div class="hit">
				<button type="button" class="where" onclick={() => onopen(m)}>{nameOf(m.channelId)} ›</button>
				<MessageItem message={m} {meId} {meName} inThread onchanged={() => run()} />
			</div>
		{/each}
		{#if searched && !busy && results.length === 0}
			<p class="note">{mode === 'saved' ? 'Nothing saved yet. Hover a message and press the bookmark.' : 'Nothing matched. Messages older than six months are deleted.'}</p>
		{/if}
	</div>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--ess-surface);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 12px 14px 18px;
		border-bottom: 1px solid var(--ess-border);
		min-height: 64px;
	}
	header strong {
		font-family: var(--ess-font-display);
		font-size: 21px;
		font-weight: 600;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 14px 0;
		padding: 4px 4px 4px 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-field-bg);
		color: var(--ess-text-muted);
	}
	.bar:focus-within {
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	.bar input {
		flex: 1;
		border: 0;
		background: none;
		outline: none;
		font: inherit;
		color: var(--ess-text);
		min-width: 0;
	}
	.bar input:focus-visible {
		box-shadow: none;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}
	.hit {
		border-bottom: 1px solid var(--ess-border-subtle);
		padding-bottom: 4px;
	}
	.where {
		border: 0;
		background: none;
		padding: 8px 18px 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--ess-primary-text);
		cursor: pointer;
	}
	.note {
		margin: 20px 16px;
		font-size: 13px;
		color: var(--ess-text-muted);
		text-align: center;
	}
</style>
