<script lang="ts">
	import { tick } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import MessageItem from './MessageItem.svelte';
	import { chat } from '$lib/chat/client.svelte';
	import { dayKey, dayLabel } from '$lib/chat/format';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	/**
	 * The messages of one conversation, or of one thread when `threadRootId`
	 * is set. Loads the latest page, older pages on scrolling up, and applies
	 * live events: new, edited, reacted, card decided, reconnected.
	 */
	let {
		channelId,
		threadRootId = null,
		meId,
		meName,
		statusOf,
		onreply,
		onrootchanged,
		onmaketask,
		emptyText = 'No messages yet. Say hello.'
	}: {
		channelId: string;
		threadRootId?: string | null;
		meId: string;
		meName: string;
		statusOf: (id: string) => { label: string; state: string; online: boolean } | null;
		onreply?: (m: ChatMessageView) => void;
		onrootchanged?: () => void;
		/** Champ Hub: turn a message into a task. */
		onmaketask?: (m: ChatMessageView) => void;
		emptyText?: string;
	} = $props();

	let messages = $state<ChatMessageView[]>([]);
	let more = $state(false);
	let loading = $state(true);
	let error = $state('');
	let scroller = $state<HTMLDivElement | null>(null);
	let atBottom = $state(true);
	let newBelow = $state(0);
	let typing = $state<Record<string, { name: string; until: number }>>({});
	let loadedFor = '';

	const typingNames = $derived(Object.values(typing).filter((t) => t.until > Date.now()).map((t) => t.name));

	async function load() {
		const key = `${channelId}|${threadRootId}`;
		loadedFor = key;
		loading = true;
		error = '';
		const url = `/api/chat/channels/${channelId}/messages${threadRootId ? `?thread=${threadRootId}` : ''}`;
		try {
			const res = await fetch(url);
			if (loadedFor !== key) return;
			if (!res.ok) {
				error = (await res.json().catch(() => ({}))).message ?? 'This conversation could not be opened';
				messages = [];
				return;
			}
			const r = await res.json();
			messages = r.messages;
			more = r.more;
			await tick();
			scrollToBottom(false);
			if (!threadRootId) void chat.markRead(channelId);
		} finally {
			if (loadedFor === key) loading = false;
		}
	}

	async function loadOlder() {
		if (!more || !messages.length) return;
		const first = messages[0];
		const prevHeight = scroller?.scrollHeight ?? 0;
		const res = await fetch(`/api/chat/channels/${channelId}/messages?before=${encodeURIComponent(first.createdAt)}${threadRootId ? `&thread=${threadRootId}` : ''}`);
		if (!res.ok) return;
		const r = await res.json();
		messages = [...r.messages, ...messages];
		more = r.more;
		await tick();
		if (scroller) scroller.scrollTop = scroller.scrollHeight - prevHeight;
	}

	async function fetchIds(ids: string[]): Promise<ChatMessageView[]> {
		if (!ids.length) return [];
		const res = await fetch(`/api/chat/messages?ids=${ids.join(',')}`);
		return res.ok ? res.json() : [];
	}

	/** Add or replace messages we were told about, keeping time order. */
	export function upsert(list: ChatMessageView[]) {
		let appended = false;
		for (const m of list) {
			if (m.channelId !== channelId || (m.threadRootId ?? null) !== (threadRootId ?? null)) continue;
			const i = messages.findIndex((x) => x.id === m.id);
			if (i >= 0) messages[i] = m;
			else {
				messages.push(m);
				appended = true;
			}
		}
		if (appended) {
			messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
			if (atBottom) void tick().then(() => scrollToBottom(true));
			else newBelow++;
			if (!threadRootId && document.visibilityState === 'visible') void chat.markRead(channelId);
		}
	}

	function scrollToBottom(smooth: boolean) {
		scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
		newBelow = 0;
	}

	function onScroll() {
		if (!scroller) return;
		atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
		if (atBottom) newBelow = 0;
		if (scroller.scrollTop < 60 && more && !loading) void loadOlder();
	}

	$effect(() => {
		void channelId;
		void threadRootId;
		void load();
	});

	$effect(() => {
		const off = chat.on(async (e) => {
			if (e.type === 'reconnected') return void load();
			if (e.channelId !== channelId) {
				if (e.type === 'card.updated') {
					const hit = messages.filter((m) => m.card && 'id' in m.card && m.card.id === e.cardId);
					if (hit.length) upsert(await fetchIds(hit.map((m) => m.id)));
				}
				return;
			}
			if (e.type === 'message.created') {
				if ((e.threadRootId ?? null) !== (threadRootId ?? null)) return;
				upsert(await fetchIds([String(e.messageId)]));
				if (e.authorId) delete typing[String(e.authorId)];
			} else if (e.type === 'message.updated') {
				const id = String(e.messageId);
				if (messages.some((m) => m.id === id)) upsert(await fetchIds([id]));
				if (id === threadRootId) onrootchanged?.();
			} else if (e.type === 'typing') {
				if ((e.threadRootId ?? null) !== (threadRootId ?? null) || e.userId === meId) return;
				typing[String(e.userId)] = { name: String(e.name), until: Date.now() + 6000 };
				setTimeout(() => (typing = { ...typing }), 6100);
			}
		});
		return off;
	});

	const refresh = async (id: string) => upsert(await fetchIds([id]));

	/** Same author within 5 minutes, and no day change: shown as one block. */
	function grouped(i: number): boolean {
		if (i === 0) return false;
		const a = messages[i - 1];
		const b = messages[i];
		return (
			!!a.author &&
			a.author.id === b.author?.id &&
			dayKey(a.createdAt) === dayKey(b.createdAt) &&
			Date.parse(b.createdAt) - Date.parse(a.createdAt) < 5 * 60_000 &&
			!a.card &&
			a.kind === b.kind
		);
	}
</script>

<div class="wrap">
	<div class="list" bind:this={scroller} onscroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
		{#if more}<button type="button" class="older" onclick={loadOlder}>Load earlier messages</button>{/if}
		{#if loading && messages.length === 0}
			<p class="note">Loading…</p>
		{:else if error}
			<p class="note err">{error}</p>
		{:else if messages.length === 0}
			<p class="note">{emptyText}</p>
		{/if}
		{#each messages as m, i (m.id)}
			{#if i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt)}
				<div class="day"><span>{dayLabel(m.createdAt)}</span></div>
			{/if}
			<MessageItem
				message={m}
				{meId}
				{meName}
				grouped={grouped(i)}
				inThread={!!threadRootId}
				status={m.author ? statusOf(m.author.id) : null}
				{onreply}
				{onmaketask}
				onchanged={refresh}
			/>
		{/each}
	</div>
	{#if newBelow > 0}
		<button type="button" class="jump" onclick={() => scrollToBottom(true)}><ArrowDown size={14} /> {newBelow} new</button>
	{/if}
	<p class="typing" aria-live="polite">
		{#if typingNames.length}{typingNames.slice(0, 2).join(' and ')}{typingNames.length > 2 ? ' and others' : ''} {typingNames.length === 1 ? 'is' : 'are'} typing…{/if}
	</p>
</div>

<style>
	.wrap {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 12px 0 8px;
		overscroll-behavior: contain;
	}
	.older {
		display: block;
		margin: 4px auto 10px;
		border: 1px solid var(--ess-border);
		background: var(--ess-surface);
		border-radius: 99px;
		padding: 5px 14px;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.older:hover {
		border-color: var(--ess-border-strong);
		color: var(--ess-text);
	}
	.day {
		display: flex;
		justify-content: center;
		margin: 14px 0 8px;
		position: relative;
	}
	.day::before {
		content: '';
		position: absolute;
		left: 20px;
		right: 20px;
		top: 50%;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.day span {
		position: relative;
		font-size: 13px;
		color: var(--ess-text-secondary);
		padding: 0 14px;
		background: var(--ess-surface);
	}
	.note {
		margin: 40px 16px;
		text-align: center;
		color: var(--ess-text-muted);
		font-size: 13.5px;
	}
	.err {
		color: var(--ess-danger);
	}
	.jump {
		position: absolute;
		left: 50%;
		bottom: 30px;
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 0;
		border-radius: 99px;
		padding: 6px 14px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		box-shadow: var(--ess-elev-2);
		cursor: pointer;
	}
	.typing {
		margin: 0;
		min-height: 18px;
		padding: 0 20px;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
</style>
