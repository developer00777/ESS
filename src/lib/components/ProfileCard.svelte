<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	/**
	 * One section of the profile: a serif heading with an optional one-line
	 * note and an optional control on the right, then the fields.
	 */
	interface Props {
		icon?: Component;
		title: string;
		note?: string;
		actions?: Snippet;
		children: Snippet;
	}

	let { icon: Icon, title, note, actions, children }: Props = $props();
</script>

<section class="ess-card profile-card">
	<header class="head">
		<div class="head-text">
			<h3 class="ess-h2">
				{#if Icon}<span class="ess-tile ess-tile--sm" aria-hidden="true"><Icon size={16} strokeWidth={1.75} /></span>{/if}
				{title}
			</h3>
			{#if note}<p class="note">{note}</p>{/if}
		</div>
		{#if actions}<div class="head-actions">{@render actions()}</div>{/if}
	</header>
	<div class="card-body">
		{@render children()}
	</div>
</section>

<style>
	.profile-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.head-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
	}

	h3 .ess-tile {
		width: 28px;
		height: 28px;
	}

	.note {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}

	.head-actions {
		flex: none;
	}

	.card-body {
		font-size: var(--ess-fs-body);
		color: var(--ess-text);
		display: grid;
		gap: 10px;
	}

	/* Short laptop screens: the note sits beside the title, not under it. */
	@media (min-width: 1101px) and (max-height: 760px) {
		.profile-card {
			gap: 8px;
			padding: 10px 14px;
		}
		.head-text {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			column-gap: 10px;
			row-gap: 0;
		}
		h3 {
			font-size: 15px;
			align-self: center;
		}
		h3 .ess-tile {
			width: 24px;
			height: 24px;
		}
		.note {
			font-size: 12px;
		}
		.card-body {
			gap: 8px;
		}
	}
</style>
