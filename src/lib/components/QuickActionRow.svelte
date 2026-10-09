<script lang="ts">
	import type { Component } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface Props {
		icon: Component;
		label: string;
		href?: string;
		onclick?: () => void;
		/* Renders the row inert with a "Soon" badge — for modules that are in
		   the nav but have no route yet, so the row never dead-ends. */
		soon?: boolean;
		/** A small count at the end of the row, such as unread announcements. */
		count?: number;
		/** Shows the count in the urgent colour. */
		urgent?: boolean;
	}

	let { icon: Icon, label, href, onclick, soon = false, count = 0, urgent = false }: Props = $props();
</script>

{#snippet content()}
	<span class="ess-tile ess-tile--sm"><Icon size={17} strokeWidth={1.75} /></span>
	<span class="label">{label}</span>
	{#if soon}<span class="soon-badge">Soon</span>{/if}
	{#if count > 0}<span class="count" class:urgent aria-label="{count} unread">{count}</span>{/if}
	{#if !soon && count === 0}<ChevronRight size={15} class="chev" />{/if}
{/snippet}

{#if soon}
	<span class="row row-soon" aria-disabled="true" title="{label} — coming soon">
		{@render content()}
	</span>
{:else if href}
	<a {href} class="row">
		{@render content()}
	</a>
{:else}
	<button type="button" class="row" {onclick}>
		{@render content()}
	</button>
{/if}

<style>
	.count {
		margin-left: auto;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--ess-radius-pill);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.count.urgent {
		background: var(--ess-danger);
		color: #fff;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: var(--ess-radius-md);
		text-decoration: none;
		color: var(--ess-text);
		background: transparent;
		border: none;
		width: 100%;
		text-align: left;
		font-size: var(--ess-fs-body);
		font-weight: 500;
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}

	.row :global(.chev) {
		margin-left: auto;
		color: var(--ess-text-muted);
	}

	.row:hover {
		background: var(--ess-sunken);
	}

	.row-soon {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.row-soon:hover {
		background: transparent;
	}

	.soon-badge {
		margin-left: auto;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
</style>
