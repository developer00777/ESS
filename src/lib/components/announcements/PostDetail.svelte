<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import { timeAgo, type FeedPost } from '$lib/announcements';

	/**
	 * What a post shows once tapped: the details, the file, who posted it.
	 * `preview` renders the same thing in the HR composer, with inert links.
	 */
	let { post, now, preview = false }: { post: FeedPost; now: Date; preview?: boolean } = $props();
</script>

<div class="detail">
	{#if post.body.trim()}
		<p class="body">{post.body.trim()}</p>
	{/if}
	{#if post.attachmentName}
		{#if preview}
			<span class="attach"><Paperclip size={14} />{post.attachmentName}</span>
		{:else}
			<a class="attach" href="/api/announcements/{post.id}/attachment" target="_blank" rel="noopener">
				<Paperclip size={14} />{post.attachmentName}
			</a>
		{/if}
	{/if}
	<span class="by">
		{post.authorName ? `${post.authorName}, HR` : 'HR'} · {timeAgo(post.publishAt, now)}{post.editedAt
			? ' · Edited'
			: ''}
	</span>
	{#if post.kind === 'event' && post.eventDate && !preview}
		<a class="ess-btn ess-btn--secondary ess-btn--sm" href="/api/announcements/{post.id}/calendar" download>
			<CalendarPlus size={14} /> Add to my calendar
		</a>
	{/if}
</div>

<style>
	.detail {
		display: grid;
		gap: 10px;
		justify-items: start;
	}
	.body {
		margin: 0;
		max-width: 64ch;
		color: var(--ess-text-secondary);
		white-space: pre-line;
	}
	.attach {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-xs);
		background: var(--ess-surface);
		color: var(--ess-primary-text);
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.by {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}
</style>
