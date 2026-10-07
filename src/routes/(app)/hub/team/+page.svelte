<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Avatar from '$lib/components/Avatar.svelte';
	import TaskBoard, { type BoardColumn } from '$lib/components/hub/TaskBoard.svelte';
	import { moveTask, short } from '$lib/hub/actions';
	import { dueLabel, todayKey } from '$lib/hub/format';
	import type { DropTarget } from '$lib/hub/drag';
	import { PRIORITY_WEIGHT, TASK_STATUSES, TEAM_CAPACITY } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	let { data } = $props();
	const meId = $derived(data.hubMe.id);

	type Lane = { id: string | null; fullName: string; title: string | null; tasks: TaskView[] };
	let lanes = $state<Lane[]>([]);
	$effect(() => {
		lanes = [{ id: null, fullName: 'Unassigned', title: 'Drag to a person to give it to them', tasks: data.unassigned }, ...data.lanes.map((l) => ({ id: l.person.id, fullName: l.person.fullName, title: l.person.title, tasks: l.tasks }))];
	});

	let showDone = $state(false);
	const order = (a: TaskView, b: TaskView) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.rank.localeCompare(b.rank);
	const today = todayKey();
	const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

	const open = (l: Lane) => l.tasks.filter((t) => t.status !== 'done');
	const columns = $derived<BoardColumn[]>(
		lanes.map((l) => ({
			zone: `person:${l.id ?? 'none'}`,
			label: l.fullName,
			tasks: l.tasks.filter((t) => showDone || t.status !== 'done').sort(order),
			empty: l.id ? 'No open tasks' : 'Nothing unassigned'
		}))
	);
	const laneOf = (zone: string) => lanes.find((l) => `person:${l.id ?? 'none'}` === zone)!;

	/** One suggestion: the busiest person's least urgent unstarted task, to the least busy. */
	let dismissed = $state(false);
	const suggestion = $derived.by(() => {
		const people = lanes.filter((l) => l.id);
		if (people.length < 2 || dismissed) return null;
		const sorted = [...people].sort((a, b) => open(b).length - open(a).length);
		const hi = sorted[0];
		const lo = sorted[sorted.length - 1];
		if (open(hi).length - open(lo).length < 2) return null;
		const task = open(hi)
			.filter((t) => t.status === 'todo' && !t.requestState)
			.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || (b.dueDate ?? '9').localeCompare(a.dueDate ?? '9'))[0];
		return task ? { hi, lo, task } : null;
	});

	async function drop(task: TaskView, target: DropTarget) {
		const to = laneOf(target.zone);
		if (!to || (task.assignee?.id ?? null) === to.id) return;
		const before = lanes;
		lanes = lanes.map((l) => ({ ...l, tasks: l.id === to.id ? [{ ...task, assignee: to.id ? { id: to.id, fullName: to.fullName } : null }, ...l.tasks] : l.tasks.filter((t) => t.id !== task.id) }));
		const saved = await moveTask(task, { assigneeId: to.id });
		if (!saved) lanes = before;
	}

	function keymove(task: TaskView, dir: -1 | 1) {
		const i = lanes.findIndex((l) => l.id === (task.assignee?.id ?? null)) + dir;
		if (i < 0 || i >= lanes.length) return;
		void drop(task, { zone: `person:${lanes[i].id ?? 'none'}`, beforeId: null, afterId: null }).then(() => {
			queueMicrotask(() => document.querySelector<HTMLElement>(`[data-card="${task.id}"]`)?.focus());
		});
	}
</script>

<svelte:head><title>Team · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<header class="ess-page-head head">
		<div>
			<h1 class="ess-page-title">{data.leadId === meId ? 'Your team' : `${data.leadName}'s team`}</h1>
			<p class="ess-page-sub">Drag a card to another person to give it to them. They hear about it in Champ Hub; Undo is there for a few seconds.</p>
		</div>
		<div class="tools">
			{#if data.leads.length}
				<label class="sr" for="lead-pick">Team</label>
				<select id="lead-pick" class="ess-select" value={data.leadId} onchange={(e) => goto(`/hub/team?lead=${e.currentTarget.value}`)}>
					{#each data.leads as l (l.id)}<option value={l.id}>{l.id === meId ? 'Your team' : `${l.fullName}'s team`}</option>{/each}
				</select>
			{/if}
			<label class="check"><input type="checkbox" bind:checked={showDone} /> Show done</label>
		</div>
	</header>

	{#if suggestion}
		<div class="ess-alert ess-alert--info hint">
			<ArrowRightLeft size={16} />
			<p>
				<strong>{suggestion.hi.fullName.split(' ')[0]}</strong> has {open(suggestion.hi).length} open tasks and <strong>{suggestion.lo.fullName.split(' ')[0]}</strong> has {open(suggestion.lo).length}.
				Move "{short(suggestion.task.title)}" ({suggestion.task.priority}{suggestion.task.dueDate ? `, due ${dueLabel(suggestion.task.dueDate)}` : ''}) to {suggestion.lo.fullName.split(' ')[0]}?
			</p>
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => suggestion && drop(suggestion.task, { zone: `person:${suggestion.lo.id}`, beforeId: null, afterId: null })}>Move it</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (dismissed = true)}>Dismiss</button>
		</div>
	{/if}

	{#if data.lanes.length === 0}
		<p class="empty">Nobody reports to {data.leadId === meId ? 'you' : data.leadName} in ESS yet. Reporting lines come from Admin Controls › People.</p>
	{:else}
		<TaskBoard {columns} {meId} ondrop={drop} onkeymove={keymove}>
			{#snippet head(col)}
				{@const l = laneOf(col.zone)}
				{@const n = open(l).length}
				<div class="lane">
					<div class="who">
						{#if l.id}<Avatar userId={l.id} fullName={l.fullName} size="sm" />{:else}<span class="none">?</span>{/if}
						<div><strong>{l.fullName}</strong>{#if l.title}<small>{l.title}</small>{/if}</div>
					</div>
					{#if l.id}
						<div class="meter" data-load={n >= 5 ? 'high' : n >= 3 ? 'mid' : 'ok'} role="img" aria-label="{n} of {TEAM_CAPACITY} open tasks">
							<i style="width:{Math.min(100, Math.round((n / TEAM_CAPACITY) * 100))}%"></i>
						</div>
						<div class="nums">
							<span>{n} open of {TEAM_CAPACITY}</span>
							<span>{open(l).filter((t) => t.dueDate && t.dueDate < today).length} overdue · {open(l).filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= soon).length} due soon</span>
						</div>
					{/if}
				</div>
			{/snippet}
		</TaskBoard>
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
	.tools {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}
	.tools .ess-select {
		width: auto;
	}
	.check {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 13px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.hint {
		align-items: center;
		flex-wrap: wrap;
	}
	.hint p {
		margin: 0;
		flex: 1;
		min-width: 220px;
		color: var(--ess-text);
	}
	.lane {
		display: grid;
		gap: 7px;
		width: 100%;
		min-width: 0;
	}
	.who {
		display: flex;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}
	.who div {
		display: grid;
		min-width: 0;
	}
	.who strong {
		font-size: 13px;
	}
	.who small {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.none {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px dashed var(--ess-border-strong);
		color: var(--ess-text-muted);
		font-weight: 700;
		flex: none;
	}
	.meter {
		height: 6px;
		border-radius: 99px;
		background: var(--ess-border-subtle);
		overflow: hidden;
	}
	.meter i {
		display: block;
		height: 100%;
		border-radius: 99px;
		background: var(--ess-success);
	}
	.meter[data-load='mid'] i {
		background: var(--ess-warning);
	}
	.meter[data-load='high'] i {
		background: var(--ess-danger);
	}
	.nums {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11.5px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.empty {
		padding: 22px;
		text-align: center;
		color: var(--ess-text-muted);
		border: 1.5px dashed var(--ess-border);
		border-radius: var(--ess-radius-md);
	}
</style>
