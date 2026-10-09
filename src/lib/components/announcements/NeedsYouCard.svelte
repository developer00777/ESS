<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import PostDetail from './PostDetail.svelte';
	import { isUrgentNow, summaryOf, type FeedPost } from '$lib/announcements';

	/**
	 * A post waiting on this person: an urgent notice ("Got it"), or one that
	 * asks to be confirmed (open it, then "I've read this"). `selected` only
	 * highlights the row; the feed then shows the details in its own pane.
	 */
	let {
		post,
		now,
		open = false,
		selected = false,
		busy = false,
		preview = false,
		ontoggle,
		ondismiss,
		onconfirm
	}: {
		post: FeedPost;
		now: Date;
		open?: boolean;
		selected?: boolean;
		busy?: boolean;
		preview?: boolean;
		ontoggle?: () => void;
		ondismiss?: () => void;
		onconfirm?: () => void;
	} = $props();

	const urgent = $derived(isUrgentNow(post, now) && !post.dismissed);
</script>

<div class="need" class:urgent class:selected={selected || open}>
	<span class="ess-tile" class:ess-tile--bad={urgent} class:ess-tile--warn={!urgent} aria-hidden="true">
		{#if urgent}<TriangleAlert size={19} />{:else}<FileCheck size={19} />{/if}
	</span>
	{#if ontoggle && !urgent}
		<button type="button" class="text as-btn" onclick={ontoggle} aria-expanded={open || selected}>
			<strong>{post.title} <span class="ess-badge ess-badge--warn tag">Action required</span></strong>
			<span class="sum">{summaryOf(post)}</span>
		</button>
	{:else}
		<div class="text">
			<strong>{post.title} <span class="ess-badge tag" class:ess-badge--bad={urgent} class:ess-badge--warn={!urgent}>{urgent ? 'Urgent' : 'Action required'}</span></strong>
			<span class="sum">{summaryOf(post)}</span>
		</div>
	{/if}
	<div class="act">
		{#if urgent}
			<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy || preview} onclick={ondismiss}>Got it</button>
		{:else if !open && !selected}
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={preview} onclick={ontoggle}>Read and confirm</button>
		{/if}
	</div>
	{#if open && !urgent}
		<div class="more">
			<PostDetail {post} {now} {preview} />
			<div class="confirm">
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy || preview} onclick={onconfirm}>I've read this</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={ontoggle}>Later</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.need {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 14px 16px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		box-shadow: var(--ess-elev-1);
		overflow: hidden;
	}
	.need.selected {
		background: var(--ess-primary-softer);
		border-color: var(--ess-primary-soft);
	}
	.need.selected::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--ess-primary);
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.as-btn {
		border: 0;
		padding: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.as-btn:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}
	.text strong {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
		line-height: 1.25;
		color: var(--ess-text);
	}
	.tag {
		font-family: var(--ess-font-sans);
		height: 20px;
		font-size: 11px;
	}
	.sum {
		font-size: 13.5px;
		color: var(--ess-text-secondary);
	}
	.more {
		grid-column: 2 / 4;
		display: grid;
		gap: 12px;
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.need {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.act,
		.more {
			grid-column: 2;
		}
	}
</style>
