<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import { timeAgo, type FeedPost } from '$lib/announcements';

	/**
	 * What a post shows once opened: the details, the file, who posted it.
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
			<span class="attach">
				<span class="ess-tile ess-tile--sm ess-tile--neutral"><Paperclip size={16} /></span>
				<span class="attach-text"><strong>{post.attachmentName}</strong><small>Attachment</small></span>
			</span>
		{:else}
			<a class="attach" href="/api/announcements/{post.id}/attachment" target="_blank" rel="noopener">
				<span class="ess-tile ess-tile--sm"><FileText size={16} /></span>
				<span class="attach-text"><strong>{post.attachmentName}</strong><small>Open attachment</small></span>
				<Download size={17} class="dl" />
			</a>
		{/if}
	{/if}
	<span class="by">
		{post.authorName ? `${post.authorName}, HR` : 'HR'} · {timeAgo(post.publishAt, now)}{post.editedAt ? ' · Edited' : ''}
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
		gap: 14px;
		justify-items: start;
	}
	.body {
		margin: 0;
		max-width: 68ch;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ess-text);
		white-space: pre-line;
	}
	.attach {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		max-width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	a.attach:hover {
		border-color: var(--ess-border-strong);
	}
	.attach-text {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.attach-text strong {
		font-size: 14px;
		font-weight: 500;
	}
	.attach-text small {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.attach :global(.dl) {
		color: var(--ess-text-secondary);
		flex: none;
	}
	.by {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}
</style>
