<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The page header every screen opens with: a small uppercase crumb
	 * ("LEAVE / MY LEAVE"), the serif title, one line under it, and the page's
	 * primary actions on the right.
	 */
	interface Props {
		/** Crumb segments; a string renders as text, an object as a link. */
		crumb?: (string | { label: string; href: string })[];
		title: string;
		sub?: string;
		/** Buttons on the right of the title. */
		actions?: Snippet;
		/** Rendered under the subtitle, in the same column (e.g. a date). */
		children?: Snippet;
		/** Tightens the gap below the header when tabs follow it. */
		compact?: boolean;
	}

	let { crumb = [], title, sub, actions, children, compact = false }: Props = $props();
</script>

<header class="ess-page-head" class:compact>
	<div class="ess-page-head__text">
		{#if crumb.length}
			<nav class="ess-crumb" aria-label="Breadcrumb">
				{#each crumb as c, i (i)}
					{#if typeof c === 'string'}
						<span>{c}</span>
					{:else}
						<a href={c.href}>{c.label}</a>
					{/if}
				{/each}
			</nav>
		{/if}
		<h1 class="ess-page-title">{title}</h1>
		{#if sub}<p class="ess-page-sub">{sub}</p>{/if}
		{#if children}{@render children()}{/if}
	</div>
	{#if actions}
		<div class="ess-page-head__actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.compact {
		margin-bottom: var(--ess-space-4);
	}
	@media (max-width: 720px) {
		.ess-page-head__text {
			flex: 0 1 auto;
		}
		.ess-page-head {
			flex-direction: column;
			align-items: stretch;
		}
		.ess-page-head__actions {
			justify-content: flex-start;
		}
	}
</style>
