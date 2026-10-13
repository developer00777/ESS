<script lang="ts">
	import TeamPage from '../../team/+page.svelte';
	// The Team route's own types: this route runs that exact load and those
	// actions (see +page.server.ts), but SvelteKit cannot infer PageData
	// through an imported load, so it is stated here instead.
	import type { ActionData, PageData } from '../../team/$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- The Team page renders its parts (view tabs, figures, toolbar, notices, the
     directory split) as siblings; this wrapper spaces them and, on desktop,
     lets the last split fill the workspace so the page never scrolls. -->
<div class="ess-fill people-fill">
	<TeamPage {data} {form} embedded />
</div>

<style>
	.people-fill {
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.people-fill > :global(*) {
		min-width: 0;
		margin-top: 0;
		margin-bottom: 0;
	}
	/* Slimmer figures than the stand-alone Team page. */
	.people-fill > :global(.ess-figures > .ess-figure) {
		padding: 10px 16px;
	}
	.people-fill > :global(.ess-figures) :global(.ess-figure__value) {
		font-size: 20px;
	}
	/* The directory table bleeds to the card's edges; match the card padding. */
	.people-fill :global(.directory .table-wrap) {
		margin-inline: calc(-1 * var(--card-px, var(--ess-space-4)));
	}
	.people-fill :global(.directory .table-wrap .ess-table th:first-child),
	.people-fill :global(.directory .table-wrap .ess-table td:first-child) {
		padding-left: var(--card-px, var(--ess-space-4));
	}
	.people-fill :global(.directory .table-wrap .ess-table th:last-child),
	.people-fill :global(.directory .table-wrap .ess-table td:last-child) {
		padding-right: var(--card-px, var(--ess-space-4));
	}

	@media (min-width: 1101px) and (min-height: 480px) {
		.people-fill {
			display: flex;
			flex-direction: column;
			overflow: auto;
			scrollbar-width: thin;
		}
		.people-fill > :global(*) {
			flex-shrink: 0;
		}
		/* The view's main split takes the rest of the height. */
		.people-fill > :global(.ess-split) {
			flex: 1 1 0px;
			min-height: 260px;
		}
		.people-fill > :global(.ess-split > *) {
			min-height: 0;
		}
		.people-fill > :global(.ess-split .side) {
			position: static;
		}
		/* Directory: the table scrolls inside the card, header pinned. */
		.people-fill :global(.people-split > .directory) {
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}
		.people-fill :global(.people-split > .directory > .table-wrap) {
			flex: 1 1 0%;
			min-height: 0;
			overflow: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
			margin-bottom: calc(-1 * var(--card-py, var(--ess-space-4)));
		}
		.people-fill :global(.people-split > .directory thead th) {
			position: sticky;
			top: 0;
			z-index: 1;
		}
		/* A single-card column (password activity) scrolls inside itself. */
		.people-fill > :global(.ess-split > section.ess-card) {
			overflow: auto;
			scrollbar-width: thin;
		}
		/* A view without a split (Login delivery): its card meets the bottom. */
		.people-fill:not(:has(> :global(.ess-split))) > :global(.ess-card:last-child) {
			flex: 1 0 auto;
		}
		.people-fill :global(.side .placeholder) {
			padding: 24px 20px;
			align-content: center;
		}
	}

	/* Short desktop screens (a 1280x580 browser): tighter bands above the
	   split so the list keeps its room and nothing scrolls the column. */
	@media (min-width: 1101px) and (min-height: 480px) and (max-height: 800px) {
		.people-fill {
			gap: 10px;
		}
		.people-fill > :global(.ess-figures > .ess-figure) {
			padding: 6px 14px;
			gap: 10px;
		}
		.people-fill > :global(.ess-figures) :global(.ess-figure__value) {
			font-size: 18px;
		}
		.people-fill > :global(.ess-figures) :global(.ess-tile) {
			width: 32px;
			height: 32px;
		}
		.people-fill > :global(.ess-split) {
			min-height: 200px;
		}
		/* Bulk import: a slimmer stepper. */
		.people-fill > :global(.bulk-steps) {
			margin: 0 auto;
		}
		.people-fill > :global(.bulk-steps .ess-step) {
			gap: 4px;
		}
		.people-fill > :global(.bulk-steps .ess-step__meta) {
			margin-top: -3px;
			font-size: 12px;
		}
		/* Password activity: slim figures and filter bar. */
		.people-fill > :global(.pw-figures) {
			gap: 10px;
		}
		.people-fill > :global(.pw-figures .ess-metric) {
			padding: 8px 14px;
			align-items: center;
			gap: 12px;
		}
		.people-fill > :global(.pw-figures .ess-tile) {
			width: 34px;
			height: 34px;
		}
		.people-fill > :global(.pw-figures .ess-metric__value) {
			font-size: 19px;
		}
		.people-fill > :global(.toolbar-card) {
			padding: 8px 12px;
			align-items: center;
		}
		.people-fill > :global(.toolbar-card .ess-field.inline) {
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}
		.people-fill > :global(.toolbar-card .ess-field.inline .ess-label) {
			white-space: nowrap;
		}
	}
</style>
