<script lang="ts" module>
	import type { TaskView } from '$lib/tasks/types';

	export type BoardColumn = {
		/** "status:todo", "person:<id>", "person:none" */
		zone: string;
		label: string;
		tasks: TaskView[];
		/** Empty-column text. */
		empty?: string;
		tone?: string;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import TaskCard from './TaskCard.svelte';
	import { dragBoard, type DropTarget } from '$lib/hub/drag';

	/**
	 * Columns of cards that can be dragged between and within columns. What a
	 * drop means (a new status, a new owner) is the page's business: it gets
	 * the card, the column and the cards it landed between.
	 */
	let {
		columns,
		meId,
		showAssignee = false,
		head,
		top,
		ondrop,
		onkeymove
	}: {
		columns: BoardColumn[];
		meId: string;
		showAssignee?: boolean;
		/** Custom column header (team lanes show a person and a load meter). */
		head?: Snippet<[BoardColumn]>;
		/** Something above the cards in a column, such as quick add. */
		top?: Snippet<[BoardColumn]>;
		ondrop: (task: TaskView, target: DropTarget) => void;
		onkeymove?: (task: TaskView, dir: -1 | 1) => void;
	} = $props();

	const byId = $derived(new Map(columns.flatMap((c) => c.tasks).map((t) => [t.id, t])));
</script>

<div class="board-wrap" use:dragBoard={{ ondrop: (id, t) => { const task = byId.get(id); if (task) ondrop(task, t); } }}>
	<div class="board" data-scroll style="--cols: {columns.length}">
		{#each columns as col (col.zone)}
			<section class="col" data-zone={col.zone} data-tone={col.tone ?? ''} aria-label={col.label}>
				<header>
					{#if head}{@render head(col)}{:else}
						<span class="dot" data-tone={col.tone ?? ''}></span>
						<strong>{col.label}</strong>
						<span class="n">{col.tasks.length}</span>
					{/if}
				</header>
				{#if top}{@render top(col)}{/if}
				<div class="list" data-zone-list>
					{#each col.tasks as t (t.id)}
						<TaskCard task={t} {meId} {showAssignee} {onkeymove} />
					{:else}
						<p class="empty">{col.empty ?? 'Drop a card here'}</p>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>

<style>
	.board-wrap {
		min-width: 0;
	}
	.board {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(250px, 1fr);
		gap: 12px;
		align-items: start;
		overflow-x: auto;
		padding: 2px 2px 10px;
		scroll-snap-type: x proximity;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 220px;
		padding: 12px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border);
		scroll-snap-align: start;
		transition:
			border-color var(--ess-t-fast),
			background var(--ess-t-fast);
	}
	.col:global(.hub-zone-over) {
		border-color: var(--ess-primary);
		background: var(--ess-primary-soft);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 4px;
		font-size: 13.5px;
		min-width: 0;
	}
	header strong {
		font-weight: 500;
	}
	.n {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--ess-radius-xs);
		display: inline-grid;
		place-items: center;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		color: var(--ess-text-secondary);
		font-size: 12px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ess-border-strong);
		flex: none;
	}
	.dot[data-tone='info'] {
		background: var(--ess-primary);
	}
	.dot[data-tone='warning'] {
		background: var(--ess-warning);
	}
	.dot[data-tone='success'] {
		background: var(--ess-success);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 40px;
	}
	.empty {
		margin: 0;
		padding: 14px;
		text-align: center;
		font-size: 12.5px;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
	}
	@media (max-width: 720px) {
		.board {
			grid-auto-columns: minmax(82vw, 1fr);
		}
	}
</style>
