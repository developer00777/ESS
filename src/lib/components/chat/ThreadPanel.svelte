<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import MessageItem from './MessageItem.svelte';
	import MessageList from './MessageList.svelte';
	import Composer from './Composer.svelte';
	import type { ChatMessageView } from '$lib/server/chat/messages';

	let {
		root,
		meId,
		meName,
		members,
		canPost,
		statusOf,
		onclose
	}: {
		root: ChatMessageView;
		meId: string;
		meName: string;
		members: { id: string; fullName: string }[];
		canPost: boolean;
		statusOf: (id: string) => { label: string; state: string; online: boolean } | null;
		onclose: () => void;
	} = $props();

	let current = $state<ChatMessageView | null>(null);
	const shown = $derived(current?.id === root.id ? current : root);
	let list = $state<ReturnType<typeof MessageList> | null>(null);

	async function refreshRoot() {
		const res = await fetch(`/api/chat/messages?ids=${root.id}`);
		if (res.ok) current = (await res.json())[0] ?? null;
	}
</script>

<aside class="panel" aria-label="Thread">
	<header>
		<strong>Thread</strong>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={onclose} aria-label="Close thread"><X size={16} /></button>
	</header>
	<div class="root">
		<MessageItem message={shown} {meId} {meName} inThread status={shown.author ? statusOf(shown.author.id) : null} onchanged={refreshRoot} />
	</div>
	<MessageList bind:this={list} channelId={root.channelId} threadRootId={root.id} {meId} {meName} {statusOf} onrootchanged={refreshRoot} emptyText="No replies yet." />
	<Composer
		channelId={root.channelId}
		threadRootId={root.id}
		{members}
		placeholder="Reply in thread"
		disabledReason={canPost ? null : 'Replies are not open here'}
		onsent={(m) => m && list?.upsert([m])}
	/>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		border-left: 1px solid var(--ess-border);
		background: var(--ess-canvas);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 10px 16px;
		border-bottom: 1px solid var(--ess-border);
		min-height: 54px;
	}
	.root {
		border-bottom: 1px solid var(--ess-border-subtle);
		padding: 6px 0;
		max-height: 40%;
		overflow-y: auto;
	}
</style>
