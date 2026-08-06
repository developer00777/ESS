<script lang="ts">
	import type { Component } from 'svelte';
	import IconChip from './IconChip.svelte';

	interface Props {
		icon: Component;
		label: string;
		href?: string;
		onclick?: () => void;
		/* Renders the row inert with a "Soon" badge — for modules that are in
		   the nav but have no route yet, so the row never dead-ends. */
		soon?: boolean;
	}

	let { icon, label, href, onclick, soon = false }: Props = $props();
</script>

{#snippet content()}
	<IconChip {icon} size="sm" />
	<span class="label">{label}</span>
	{#if soon}<span class="soon-badge">Soon</span>{/if}
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
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 10px;
		border-radius: var(--ess-radius-sm);
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
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		white-space: nowrap;
	}
</style>
