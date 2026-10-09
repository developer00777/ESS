<script lang="ts">
	import List from '@lucide/svelte/icons/list';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Plus from '@lucide/svelte/icons/plus';
	import TaskBoard, { type BoardColumn } from '$lib/components/hub/TaskBoard.svelte';
	import TaskRow from '$lib/components/hub/TaskRow.svelte';
	import { createTask, moveTask } from '$lib/hub/actions';
	import { todayKey } from '$lib/hub/format';
	import type { DropTarget } from '$lib/hub/drag';
	import { dueBucket, rankBetween, STATUS_LABEL, TASK_STATUSES, type TaskStatus } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	let { data } = $props();
	const meId = $derived(data.hubMe.id);

	// The server's list, with local moves applied on top until it answers.
	let local = $state<TaskView[]>([]);
	$effect(() => {
		local = data.tasks;
	});

	const VIEW_KEY = 'essHubTaskView';
	let view = $state<'board' | 'list'>('list');
	$effect(() => {
		try {
			const v = localStorage.getItem(VIEW_KEY);
			if (v === 'list' || v === 'board') view = v;
		} catch {
			/* storage blocked */
		}
	});
	function setView(v: 'board' | 'list') {
		view = v;
		try {
			localStorage.setItem(VIEW_KEY, v);
		} catch {
			/* fine */
		}
	}

	/* Three filters, as the mockup's toolbar: what to show, status, due date. */
	let filter = $state<'all' | 'meetings' | 'high' | 'approval'>('all');
	let status = $state<'all' | TaskStatus>('all');
	let due = $state<'all' | 'overdue' | 'today' | 'week' | 'later' | 'none'>('all');

	const today = todayKey();
	const shown = $derived(
		local
			.filter((t) => (filter === 'meetings' ? t.source?.kind === 'meeting' : filter === 'high' ? t.priority === 'high' : filter === 'approval' ? t.requestState === 'pending' : true))
			.filter((t) => (status === 'all' ? true : t.status === status))
			.filter((t) => (due === 'all' ? true : dueBucket(t.dueDate, today) === due))
	);

	const stats = $derived({
		overdue: local.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
		today: local.filter((t) => t.status !== 'done' && t.dueDate === today).length,
		progress: local.filter((t) => t.status === 'in_progress').length,
		done: local.filter((t) => t.status === 'done').length
	});

	const TONE: Record<TaskStatus, string> = { todo: '', in_progress: 'info', in_review: 'warning', done: 'success' };
	const byRank = (a: TaskView, b: TaskView) => a.rank.localeCompare(b.rank) || b.updatedAt.localeCompare(a.updatedAt);
	const columns = $derived<BoardColumn[]>(
		TASK_STATUSES.map((s) => ({
			zone: `status:${s}`,
			label: STATUS_LABEL[s],
			tone: TONE[s],
			tasks: shown.filter((t) => t.status === s).sort(byRank),
			empty: s === 'done' ? 'Finished work stays here for two weeks.' : s === 'todo' ? 'Nothing to start. Tasks from meetings and chats land here.' : 'Drop a card here'
		}))
	);

	async function drop(task: TaskView, target: DropTarget) {
		const status = target.zone.replace('status:', '') as TaskStatus;
		const col = local.filter((t) => t.status === status && t.id !== task.id).sort(byRank);
		const above = col.find((t) => t.id === target.beforeId)?.rank ?? null;
		const below = col.find((t) => t.id === target.afterId)?.rank ?? null;
		if (status === task.status && target.beforeId === null && target.afterId === null && col.length) return;
		let rank = task.rank;
		try {
			rank = rankBetween(above, below);
		} catch {
			/* the server picks */
		}
		const before = local;
		local = local.map((t) => (t.id === task.id ? { ...t, status, rank } : t));
		const saved = await moveTask(task, { status, beforeId: target.beforeId, afterId: target.afterId }, { quiet: status === task.status });
		if (!saved) local = before;
		else local = local.map((t) => (t.id === saved.id ? saved : t));
	}

	function keymove(task: TaskView, dir: -1 | 1) {
		const i = TASK_STATUSES.indexOf(task.status) + dir;
		if (i < 0 || i >= TASK_STATUSES.length) return;
		void drop(task, { zone: `status:${TASK_STATUSES[i]}`, beforeId: null, afterId: null }).then(() => {
			queueMicrotask(() => document.querySelector<HTMLElement>(`[data-card="${task.id}"]`)?.focus());
		});
	}

	let quick = $state('');
	async function add(e: SubmitEvent) {
		e.preventDefault();
		const title = quick.trim();
		if (!title) return;
		quick = '';
		const t = await createTask({ title, assigneeId: meId });
		if (t) local = [t, ...local];
	}

	const GROUPS = [
		['overdue', 'Overdue'],
		['today', 'Today'],
		['week', 'This week'],
		['later', 'Later'],
		['none', 'No date']
	] as const;
	const groups = $derived(
		GROUPS.map(([k, label]) => ({ k, label, tasks: shown.filter((t) => t.status !== 'done' && dueBucket(t.dueDate, today) === k).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || byRank(a, b)) })).filter((g) => g.tasks.length)
	);
	const doneList = $derived(shown.filter((t) => t.status === 'done'));
</script>

<svelte:head><title>Tasks · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<div class="ess-figures">
		<div class="ess-figure">
			<span class="ess-figure__dot" class:ess-figure__dot--bad={stats.overdue > 0} class:ess-figure__dot--neutral={stats.overdue === 0}></span>
			<div><div class="ess-figure__value">{stats.overdue}</div><div class="ess-figure__label">Overdue</div></div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--warn"></span>
			<div><div class="ess-figure__value">{stats.today}</div><div class="ess-figure__label">Due today</div></div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot"></span>
			<div><div class="ess-figure__value">{stats.progress}</div><div class="ess-figure__label">In progress</div></div>
		</div>
		<div class="ess-figure">
			<span class="ess-figure__dot ess-figure__dot--ok"></span>
			<div><div class="ess-figure__value">{stats.done}</div><div class="ess-figure__label">Done, last 2 weeks</div></div>
		</div>
	</div>

	<section class="ess-card board-card" aria-labelledby="tasks-h">
		<header class="toolbar">
			<h2 id="tasks-h" class="ess-h2">My tasks</h2>
			<div class="ess-segmented" role="group" aria-label="View">
				<button type="button" aria-pressed={view === 'list'} onclick={() => setView('list')}><List size={15} /> List</button>
				<button type="button" aria-pressed={view === 'board'} onclick={() => setView('board')}><SquareKanban size={15} /> Board</button>
			</div>
			<div class="filters">
				<label class="ess-sr-only" for="tf-show">Show</label>
				<select id="tf-show" class="ess-select" bind:value={filter}>
					<option value="all">Assigned to me</option>
					<option value="approval">Waiting for approval</option>
					<option value="meetings">From meetings</option>
					<option value="high">High priority</option>
				</select>
				<label class="ess-sr-only" for="tf-status">Status</label>
				<select id="tf-status" class="ess-select" bind:value={status}>
					<option value="all">Status</option>
					{#each TASK_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
				</select>
				<label class="ess-sr-only" for="tf-due">Due date</label>
				<select id="tf-due" class="ess-select" bind:value={due}>
					<option value="all">Due date</option>
					<option value="overdue">Overdue</option>
					<option value="today">Today</option>
					<option value="week">This week</option>
					<option value="later">Later</option>
					<option value="none">No date</option>
				</select>
			</div>
		</header>

		<p class="hint ess-help">
			{view === 'board' ? 'Drag cards between columns, or focus one and press Alt + ← / →.' : 'Tick a task off, change its status on the right, or open it to see everything.'} Press N for a new task.
		</p>

		{#if view === 'board'}
			<TaskBoard {columns} {meId} ondrop={drop} onkeymove={keymove}>
				{#snippet top(col)}
					{#if col.zone === 'status:todo'}
						<form class="quick" onsubmit={add} data-no-drag>
							<Plus size={15} />
							<input class="quick-input" bind:value={quick} placeholder="Add a task for yourself" aria-label="New task title" />
						</form>
					{/if}
				{/snippet}
			</TaskBoard>
		{:else}
			<div class="list">
				<form class="quick" onsubmit={add}>
					<Plus size={15} />
					<input class="quick-input" bind:value={quick} placeholder="Add a task for yourself" aria-label="New task title" />
				</form>
				{#each groups as g (g.k)}
					<section class="grp" aria-label={g.label}>
						<h3 class="grp-h">{g.label} <span class="n" class:bad={g.k === 'overdue'}>{g.tasks.length}</span></h3>
						<div class="rows">
							{#each g.tasks as task (task.id)}<TaskRow {task} />{/each}
						</div>
					</section>
				{/each}
				{#if doneList.length}
					<section class="grp" aria-label="Done">
						<h3 class="grp-h">Done <span class="n ok">{doneList.length}</span></h3>
						<div class="rows">
							{#each doneList as task (task.id)}<TaskRow {task} />{/each}
						</div>
					</section>
				{/if}
				{#if !groups.length && !doneList.length}
					<p class="empty">Nothing here. Add a task above, or they'll arrive from meetings and chats.</p>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: 20px;
		min-width: 0;
	}
	.board-card {
		display: grid;
		gap: 14px;
		min-width: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.toolbar .ess-h2 {
		margin-right: 6px;
	}
	.filters {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-left: auto;
	}
	.filters .ess-select {
		width: auto;
		padding-top: 7px;
		padding-bottom: 7px;
		font-size: 13px;
	}
	.hint {
		margin: -6px 0 0;
	}
	.quick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		height: 40px;
		border: 1px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		color: var(--ess-text-muted);
		background: var(--ess-surface);
	}
	.quick:focus-within {
		border-style: solid;
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	.quick-input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 13.5px;
		color: var(--ess-text);
		outline: none;
	}
	.quick-input::placeholder {
		color: var(--ess-text-muted);
	}
	.list {
		display: grid;
		gap: 22px;
	}
	.grp {
		display: grid;
		gap: 4px;
	}
	.grp-h {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--ess-border);
		font-family: var(--ess-font-display);
		font-size: 19px;
		font-weight: 600;
		color: var(--ess-text);
	}
	.n {
		min-width: 22px;
		height: 22px;
		padding: 0 7px;
		border-radius: var(--ess-radius-xs);
		display: inline-grid;
		place-items: center;
		font-family: var(--ess-font-sans);
		font-size: 12.5px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.n.bad {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.n.ok {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.rows {
		display: grid;
	}
	.empty {
		margin: 0;
		padding: 22px;
		text-align: center;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
	@media (max-width: 720px) {
		.filters {
			margin-left: 0;
			width: 100%;
		}
		.filters .ess-select {
			flex: 1;
		}
	}
</style>
