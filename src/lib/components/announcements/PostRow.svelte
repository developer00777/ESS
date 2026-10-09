<script lang="ts">
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import PartyPopper from '@lucide/svelte/icons/party-popper';
	import DateTile from './DateTile.svelte';
	import PostDetail from './PostDetail.svelte';
	import { relativeDay, summaryOf, timeAgo, type ComingUpItem } from '$lib/announcements';

	/**
	 * One line in "Coming up" (with a date tile) or "Updates" (with an unread
	 * dot). Tapping selects it; `open` additionally shows the details
	 * underneath (used by the HR preview), `selected` only highlights the row
	 * (the feed shows the details in its own pane). Holidays have no details.
	 * Without `ontoggle` it is inert, which is how the HR preview uses it.
	 */
	let {
		item,
		now,
		variant,
		open = false,
		selected = false,
		muted = false,
		ontoggle
	}: {
		item: ComingUpItem;
		now: Date;
		variant: 'event' | 'update';
		open?: boolean;
		selected?: boolean;
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
		<span class="ess-tile ess-tile--sm" class:ess-tile--neutral={read} aria-hidden="true"><Megaphone size={16} /></span>
	{/if}
	{#if variant === 'event'}
		<span class="ess-tile ess-tile--sm kind" class:ess-tile--ok={!post} aria-hidden="true">
			{#if post}<CalendarDays size={16} />{:else}<PartyPopper size={16} />{/if}
		</span>
	{/if}
	<span class="text">
		<span class="t">
			{item.title}
			{#if !post}<span class="ess-badge ess-badge--ok hol">Holiday</span>{/if}
			{#if !read}<span class="unread" aria-hidden="true"></span><span class="sr-only">(unread)</span>{/if}
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

<div class="row" class:read class:open class:selected={selected || open}>
	{#if interactive}
		<button type="button" class="row-main" aria-expanded={open || selected} aria-current={selected ? 'true' : undefined} onclick={ontoggle}>{@render inner()}</button>
	{:else}
		<div class="row-main">{@render inner()}</div>
	{/if}
	{#if open && post}
		<div class="more">
			<PostDetail {post} {now} preview={!ontoggle} />
		</div>
	{/if}
</div>

<style>
	.row {
		position: relative;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.row:first-child {
		border-top: 0;
	}
	.row.selected {
		background: var(--ess-primary-softer);
	}
	.row.selected::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--ess-primary);
	}
	.row-main {
		display: flex;
		gap: 14px;
		align-items: center;
		width: 100%;
		padding: 14px 16px;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	.kind {
		margin-left: -4px;
	}
	button.row-main {
		cursor: pointer;
	}
	button.row-main:hover {
		background: var(--ess-surface-hover);
	}
	.selected button.row-main:hover {
		background: var(--ess-primary-softer);
	}
	button.row-main:focus-visible {
		outline: none;
		box-shadow: inset var(--ess-focus-ring);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.t {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
		line-height: 1.25;
		color: var(--ess-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.read .t {
		color: var(--ess-text-secondary);
	}
	.selected .t {
		color: var(--ess-text);
	}
	.open .t,
	.open .s {
		white-space: normal;
	}
	.s {
		font-size: 13.5px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rel {
		display: grid;
		flex: none;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
		white-space: nowrap;
		text-align: right;
	}
	.rel b {
		color: var(--ess-text-secondary);
		font-weight: 500;
	}
	.hol {
		font-family: var(--ess-font-sans);
		height: 20px;
		font-size: 11px;
	}
	.unread {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ess-primary);
	}
	.more {
		padding: 0 16px 16px 84px;
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
		.more {
			padding-left: 16px;
		}
		.kind {
			display: none;
		}
	}
</style>
