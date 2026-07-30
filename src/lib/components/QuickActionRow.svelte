<script lang="ts">
	import type { Component } from 'svelte';
	import IconChip from './IconChip.svelte';

	interface Props {
		icon: Component;
		label: string;
		href?: string;
		onclick?: () => void;
	}

	let { icon, label, href, onclick }: Props = $props();
</script>

{#snippet content()}
	<IconChip {icon} size="sm" />
	<span class="label">{label}</span>
{/snippet}

{#if href}
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
</style>
