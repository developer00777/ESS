<script lang="ts">
	import Video from '@lucide/svelte/icons/video';
	import Hash from '@lucide/svelte/icons/hash';
	import { hub } from '$lib/hub/client.svelte';
	import { moveTask } from '$lib/hub/actions';
	import { dueLabel, dueTone } from '$lib/hub/format';
	import { PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES, type TaskStatus } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	/** A task as one line: tick it off, change its status, or open it. */
	let { task, showAssignee = false }: { task: TaskView; showAssignee?: boolean } = $props();

	const done = $derived(task.status === 'done');
	const tone = $derived(dueTone(task.dueDate, done));
	let busy = $state(false);

	async function set(status: TaskStatus) {
		busy = true;
		await moveTask(task, { status });
		busy = false;
	}
</script>

<div class="row" class:done>
	<input type="checkbox" checked={done} disabled={busy || !task.can.edit} aria-label="Done: {task.title}" onchange={(e) => set(e.currentTarget.checked ? 'done' : 'todo')} />
	<div class="main">
		<button type="button" class="title" onclick={() => hub.openTask(task.id)}>{task.title}</button>
		<span class="meta">
			<span class="chip p-{task.priority}">{PRIORITY_LABEL[task.priority]}</span>
			{#if task.dueDate}<span class="due {tone}">{tone === 'overdue' ? 'Overdue · ' : ''}{dueLabel(task.dueDate)}</span>{/if}
			{#if task.blocked}<span class="due overdue">Blocked</span>{/if}
			{#if task.requestState === 'pending'}<span class="req">{task.can.approve ? 'Needs your approval' : `Waiting for ${task.approver?.fullName ?? 'the lead'} to approve`}</span>{/if}
			{#if showAssignee}<span>{task.assignee?.fullName ?? 'Unassigned'}</span>{/if}
			{#if task.source?.kind === 'meeting'}<span class="src"><Video size={12} /> {task.source.topic}</span>
			{:else if task.source?.kind === 'message'}<span class="src"><Hash size={12} /> {task.source.channelName ?? 'Chat'}</span>{/if}
		</span>
	</div>
	<select class="ess-select status" aria-label="Status of {task.title}" value={task.status} disabled={busy || !task.can.edit} onchange={(e) => set(e.currentTarget.value as TaskStatus)}>
		{#each TASK_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
	</select>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 12px;
		border-radius: 12px;
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-border-subtle);
	}
	.row input[type='checkbox'] {
		width: 17px;
		height: 17px;
		accent-color: var(--ess-primary);
		flex: none;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.title {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: inherit;
		font-weight: 600;
		font-size: 13.5px;
		color: var(--ess-text);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.title:hover {
		color: var(--ess-primary-text);
	}
	.done .title {
		text-decoration: line-through;
		color: var(--ess-text-muted);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: center;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.chip {
		padding: 0 7px;
		border-radius: 99px;
		font-size: 11px;
		font-weight: 600;
		background: var(--ess-neutral-bg);
		color: var(--ess-neutral);
	}
	.chip.p-high {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.chip.p-medium {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.due.overdue {
		color: var(--ess-danger);
		font-weight: 600;
	}
	.due.soon {
		color: var(--ess-warning);
		font-weight: 600;
	}
	.req {
		color: var(--ess-primary-text);
		font-weight: 600;
	}
	.src {
		display: inline-flex;
		gap: 4px;
		align-items: center;
		color: var(--ess-info);
	}
	.status {
		width: auto;
		padding: 5px 8px;
		font-size: 12.5px;
	}
	@media (max-width: 560px) {
		.status {
			display: none;
		}
	}
</style>
