<script lang="ts">
	import DateTile from './DateTile.svelte';
	import PostDetail from './PostDetail.svelte';
	import { relativeDay, summaryOf, timeAgo, type ComingUpItem } from '$lib/announcements';

	/**
	 * One line in "Coming up" (with a date tile) or "Updates" (with an unread
	 * dot). Tapping opens the details underneath; holidays have none to show.
	 * Without `ontoggle` it is inert, which is how the HR preview uses it.
	 */
	let {
		item,
		now,
		variant,
		open = false,
		muted = false,
		ontoggle
	}: {
		item: ComingUpItem;
		now: Date;
		variant: 'event' | 'update';
		open?: boolean;
		muted?: boolean;
		ontoggle?: () => void;
	} = $props();

	const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MO[Number(d.slice(5, 7)) - 1]}`;

	const post = $derived(item.kind === 'holiday' ? null : item);
	const read = $derived(!post || post.read || muted);
	const line = $derived(post ? summaryOf(post) : 'Office closed');
	const interactive = $derived(!!post && !!ontoggle);
</script>

{#snippet inner()}
	{#if variant === 'event' && item.eventDate}
		<DateTile date={item.eventDate} {now} holiday={!post} />
	{:else}
		<span class="dot" aria-hidden="true"></span>
	{/if}
	<span class="text">
		<span class="t">
			{item.title}
			{#if !post}<span class="hol">Holiday</span>{/if}
			{#if !read}<span class="sr-only">(unread)</span>{/if}
		</span>
		<span class="s">{line}</span>
	</span>
	<span class="rel">
		{#if variant === 'event' && item.eventDate}
			<b>{relativeDay(item.eventDate, now)}</b>
			{#if post?.eventTime}{post.eventTime}{/if}
		{:else if post}
			{post.kind === 'event' && post.eventDate ? shortDate(post.eventDate) : timeAgo(post.publishAt, now)}
		{/if}
	</span>
{/snippet}

<div class="row" class:read class:open>
	{#if interactive}
		<button type="button" class="row-main" aria-expanded={open} onclick={ontoggle}>{@render inner()}</button>
	{:else}
		<div class="row-main">{@render inner()}</div>
	{/if}
	{#if open && post}
		<div class="more" class:update={variant === 'update'}>
			<PostDetail {post} {now} preview={!ontoggle} />
		</div>
	{/if}
</div>

<style>
	.row {
		border-top: 1px solid var(--ess-border-subtle);
	}
	.row:first-child {
		border-top: 0;
	}
	.row-main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		width: 100%;
		padding: 10px 14px;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	button.row-main {
		cursor: pointer;
	}
	button.row-main:hover {
		background: var(--ess-surface-hover);
	}
	button.row-main:focus-visible {
		outline: none;
		box-shadow: inset var(--ess-focus-ring);
	}
	.text {
		min-width: 0;
		display: grid;
	}
	.t {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.read .t {
		font-weight: 500;
		color: var(--ess-text-secondary);
	}
	.open .t,
	.open .s {
		white-space: normal;
	}
	.s {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rel {
		display: grid;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
		white-space: nowrap;
		text-align: right;
	}
	.rel b {
		color: var(--ess-text-secondary);
		font-weight: 600;
	}
	.hol {
		margin-left: 6px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ess-success);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ess-primary);
	}
	.read .dot {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--ess-border-strong);
	}
	.more {
		padding: 0 14px 14px 78px;
	}
	.more.update {
		padding-left: 34px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 560px) {
		.t,
		.s {
			white-space: normal;
		}
		.more,
		.more.update {
			padding-left: 14px;
		}
	}
</style>
