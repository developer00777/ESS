<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		label: string;
		href?: string;
		onclick?: () => void;
	}

	let { icon: Icon, label, href, onclick }: Props = $props();
</script>

{#snippet content()}
	<span class="ico-chip">
		<Icon size={16} />
	</span>
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
		gap: 0.85rem;
		padding: 0.55rem 0.6rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--color-text);
		background: transparent;
		border: none;
		width: 100%;
		text-align: left;
		font-size: 0.92rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.12s ease;
	}

	.row:hover {
		background: var(--color-mint);
	}

	.ico-chip {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		background: var(--color-mint);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
</style>
