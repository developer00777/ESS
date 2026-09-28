<script lang="ts">
	import PostDetail from './PostDetail.svelte';
	import { isUrgentNow, summaryOf, type FeedPost } from '$lib/announcements';

	/**
	 * A post waiting on this person: an urgent notice ("Got it"), or one that
	 * asks to be confirmed (open it, then "I've read this").
	 */
	let {
		post,
		now,
		open = false,
		busy = false,
		preview = false,
		ontoggle,
		ondismiss,
		onconfirm
	}: {
		post: FeedPost;
		now: Date;
		open?: boolean;
		busy?: boolean;
		preview?: boolean;
		ontoggle?: () => void;
		ondismiss?: () => void;
		onconfirm?: () => void;
	} = $props();

	const urgent = $derived(isUrgentNow(post, now) && !post.dismissed);
</script>

<div class="need" class:urgent>
	<span class="stripe" aria-hidden="true"></span>
	<div class="text">
		<strong>{post.title}</strong>
		<span class="sum">{summaryOf(post)}</span>
	</div>
	<div class="act">
		{#if urgent}
			<button
				type="button"
				class="ess-btn ess-btn--secondary ess-btn--sm"
				disabled={busy || preview}
				onclick={ondismiss}
			>
				Got it
			</button>
		{:else if !open}
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={preview} onclick={ontoggle}>
				Read and confirm
			</button>
		{/if}
	</div>
	{#if open && !urgent}
		<div class="more">
			<PostDetail {post} {now} {preview} />
			<div class="confirm">
				<button
					type="button"
					class="ess-btn ess-btn--primary ess-btn--sm"
					disabled={busy || preview}
					onclick={onconfirm}
				>
					I've read this
				</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={ontoggle}>Later</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.need {
		display: grid;
		grid-template-columns: 4px minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 14px 16px 14px 0;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-raised-bg);
		box-shadow: var(--ess-glass-shadow);
		overflow: hidden;
	}
	.stripe {
		align-self: stretch;
		background: var(--ess-warning);
	}
	.urgent .stripe {
		background: var(--ess-danger);
	}
	.text {
		display: grid;
		min-width: 0;
	}
	.text strong {
		font-weight: 600;
	}
	.sum {
		font-size: 13px;
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
			grid-template-columns: 4px minmax(0, 1fr);
		}
		.act,
		.more {
			grid-column: 2;
		}
	}
</style>
