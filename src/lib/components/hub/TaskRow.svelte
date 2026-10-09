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
	const selected = $derived(hub.openTaskId === task.id);
	let busy = $state(false);

	async function set(status: TaskStatus) {
		busy = true;
		await moveTask(task, { status });
		busy = false;
	}
</script>

<div class="row" class:done class:selected>
	<input type="checkbox" class="tick" checked={done} disabled={busy || !task.can.edit} aria-label="Done: {task.title}" onchange={(e) => set(e.currentTarget.checked ? 'done' : 'todo')} />
	<div class="main">
		<button type="button" class="title" onclick={() => hub.openTask(task.id)}>{task.title}</button>
		<span class="meta">
			{#if task.source?.kind === 'meeting'}<span class="src"><Video size={12} /> {task.source.topic}</span>
			{:else if task.source?.kind === 'message'}<span class="src"><Hash size={12} /> {task.source.channelName ?? 'Chat'}</span>
			{:else if showAssignee}<span>{task.assignee?.fullName ?? 'Unassigned'}</span>
			{:else}<span>{task.createdBy.fullName === task.assignee?.fullName ? 'Personal' : `From ${task.createdBy.fullName}`}</span>{/if}
			{#if task.dueDate}<span class="due {tone}">{tone === 'overdue' ? 'Overdue · ' : 'Due '}{dueLabel(task.dueDate)}</span>{/if}
			{#if task.blocked}<span class="due overdue">Blocked</span>{/if}
			{#if task.requestState === 'pending'}<span class="req">{task.can.approve ? 'Needs your approval' : `Waiting for ${task.approver?.fullName ?? 'the lead'} to approve`}</span>{/if}
			{#if showAssignee && task.source}<span>{task.assignee?.fullName ?? 'Unassigned'}</span>{/if}
		</span>
	</div>
	<span class="ess-badge p-{task.priority}">{PRIORITY_LABEL[task.priority]}</span>
	<select class="ess-select status" aria-label="Status of {task.title}" value={task.status} disabled={busy || !task.can.edit} onchange={(e) => set(e.currentTarget.value as TaskStatus)}>
		{#each TASK_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
	</select>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 10px;
		border-bottom: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-md);
		transition: background var(--ess-t-fast);
	}
	.row:last-child {
		border-bottom: none;
	}
	.row:hover {
		background: var(--ess-sunken);
	}
	.row.selected {
		background: var(--ess-primary-soft);
	}
	.tick {
		appearance: none;
		-webkit-appearance: none;
		width: 22px;
		height: 22px;
		margin: 0;
		border-radius: 50%;
		border: 1.5px solid var(--ess-border-strong);
		background: var(--ess-surface);
		flex: none;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition:
			border-color var(--ess-t-fast),
			background var(--ess-t-fast);
	}
	.tick:hover:not(:disabled) {
		border-color: var(--ess-primary);
	}
	.tick:checked {
		border-color: var(--ess-primary);
		background: var(--ess-primary);
	}
	.tick:checked::after {
		content: '';
		width: 6px;
		height: 10px;
		margin-top: -2px;
		border: solid var(--ess-text-on-primary);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}
	.tick:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.title {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: inherit;
		font-weight: 500;
		font-size: 14.5px;
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
		gap: 2px 0;
		align-items: center;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.meta > * + *::before {
		content: '·';
		margin: 0 7px;
		color: var(--ess-text-muted);
	}
	.due.overdue {
		color: var(--ess-danger);
		font-weight: 500;
	}
	.due.soon {
		color: var(--ess-warning);
		font-weight: 500;
	}
	.req {
		color: var(--ess-primary-text);
		font-weight: 500;
	}
	.src {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.p-high {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.p-medium {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.p-low {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.status {
		width: auto;
		padding: 6px 30px 6px 10px;
		font-size: 13px;
	}
	@media (max-width: 560px) {
		.status {
			display: none;
		}
	}
</style>
