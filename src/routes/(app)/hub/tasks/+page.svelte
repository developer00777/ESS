<script lang="ts">
	import TaskBoard, { type BoardColumn } from '$lib/components/hub/TaskBoard.svelte';
	import TaskRow from '$lib/components/hub/TaskRow.svelte';
	import { hub } from '$lib/hub/client.svelte';
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
	let view = $state<'board' | 'list'>('board');
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

	let filter = $state<'all' | 'meetings' | 'high' | 'approval'>('all');
	const shown = $derived(
		local.filter((t) => (filter === 'meetings' ? t.source?.kind === 'meeting' : filter === 'high' ? t.priority === 'high' : filter === 'approval' ? t.requestState === 'pending' : true))
	);

	const today = todayKey();
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
	<header class="ess-page-head head">
		<div>
			<h1 class="ess-page-title">My tasks</h1>
			<p class="ess-page-sub">Drag cards between columns, or focus one and press Alt + ← / →. Press N for a new task.</p>
		</div>
		<div class="tools">
			<div class="ess-segmented" role="group" aria-label="View">
				<button type="button" aria-pressed={view === 'board'} onclick={() => setView('board')}>Board</button>
				<button type="button" aria-pressed={view === 'list'} onclick={() => setView('list')}>List</button>
			</div>
		</div>
	</header>

	<div class="stats">
		<div class="stat" class:alert={stats.overdue > 0}><b>{stats.overdue}</b><span>Overdue</span></div>
		<div class="stat"><b>{stats.today}</b><span>Due today</span></div>
		<div class="stat"><b>{stats.progress}</b><span>In progress</span></div>
		<div class="stat"><b>{stats.done}</b><span>Done, last 2 weeks</span></div>
	</div>

	<div class="filters" role="group" aria-label="Show">
		{#each [['all', 'All'], ['approval', 'Waiting for approval'], ['meetings', 'From meetings'], ['high', 'High priority']] as [k, label] (k)}
			<button type="button" class="f" aria-pressed={filter === k} onclick={() => (filter = k as typeof filter)}>{label}</button>
		{/each}
	</div>

	{#if view === 'board'}
		<TaskBoard {columns} {meId} ondrop={drop} onkeymove={keymove}>
			{#snippet top(col)}
				{#if col.zone === 'status:todo'}
					<form class="quick" onsubmit={add} data-no-drag>
						<input class="ess-input" bind:value={quick} placeholder="Add a task for yourself" aria-label="New task title" />
					</form>
				{/if}
			{/snippet}
		</TaskBoard>
	{:else}
		<div class="list">
			<form class="quick" onsubmit={add}>
				<input class="ess-input" bind:value={quick} placeholder="Add a task for yourself" aria-label="New task title" />
			</form>
			{#each groups as g (g.k)}
				<section class="grp">
					<h2 class="label">{g.label} <span>{g.tasks.length}</span></h2>
					{#each g.tasks as task (task.id)}<TaskRow {task} />{/each}
				</section>
			{/each}
			{#if doneList.length}
				<section class="grp">
					<h2 class="label">Done <span>{doneList.length}</span></h2>
					{#each doneList as task (task.id)}<TaskRow {task} />{/each}
				</section>
			{/if}
			{#if !groups.length && !doneList.length}<p class="empty">Nothing here. Add a task above, or they'll arrive from meetings and chats.</p>{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		display: grid;
		gap: 16px;
		min-width: 0;
	}
	.head {
		margin-bottom: 0;
		flex-wrap: wrap;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}
	.stat {
		padding: 10px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-subtle);
	}
	.stat b {
		display: block;
		font-family: var(--ess-font-display);
		font-size: 24px;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.stat span {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.stat.alert b {
		color: var(--ess-danger);
	}
	.filters {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.f {
		border: 1px solid var(--ess-border);
		background: transparent;
		border-radius: 99px;
		padding: 4px 12px;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.f[aria-pressed='true'] {
		background: var(--ess-text);
		color: var(--ess-canvas);
		border-color: var(--ess-text);
	}
	.quick .ess-input {
		padding: 7px 10px;
		border-style: dashed;
		font-size: 13px;
	}
	.list {
		max-width: 900px;
		display: grid;
		gap: 16px;
	}
	.grp {
		display: grid;
		gap: 6px;
	}
	.label {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		display: flex;
		justify-content: space-between;
	}
	.empty {
		padding: 18px;
		text-align: center;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
	@media (max-width: 720px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
