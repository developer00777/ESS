<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import Video from '@lucide/svelte/icons/video';
	import Hash from '@lucide/svelte/icons/hash';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Ban from '@lucide/svelte/icons/ban';
	import Send from '@lucide/svelte/icons/send';
	import Avatar from '$lib/components/Avatar.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import ApprovalButtons from './ApprovalButtons.svelte';
	import { dueLabel, dueTone } from '$lib/hub/format';
	import { PRIORITY_LABEL } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	let {
		task,
		meId,
		showAssignee = false,
		onkeymove
	}: {
		task: TaskView;
		meId: string;
		showAssignee?: boolean;
		/** Alt + ← / → on a focused card. */
		onkeymove?: (task: TaskView, dir: -1 | 1) => void;
	} = $props();

	const done = $derived(task.status === 'done');
	const tone = $derived(dueTone(task.dueDate, done));

	function key(e: KeyboardEvent) {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			hub.openTask(task.id);
		} else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && onkeymove) {
			e.preventDefault();
			onkeymove(task, e.key === 'ArrowRight' ? 1 : -1);
		}
	}
</script>

<!--
	A card is focusable so Alt + arrow can move it and Enter can open it, as on
	Linear's and Trello's boards. It holds its own buttons (Approve), so it can't
	itself be a button.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<article
	class="card"
	class:done
	class:request={task.requestState === 'pending'}
	data-card={task.id}
	tabindex="0"
	aria-label="{task.title}. {PRIORITY_LABEL[task.priority]} priority{task.dueDate ? `, due ${dueLabel(task.dueDate)}` : ''}. Press Enter to open{onkeymove ? ', Alt and an arrow key to move' : ''}."
	onclick={() => hub.openTask(task.id)}
	onkeydown={key}
>
	{#if task.requestState === 'pending'}
		<span class="req"><Send size={12} /> {task.can.approve ? `${task.createdBy.fullName} needs your approval` : `Waiting for ${task.approver?.fullName ?? 'the lead'} to approve`}</span>
	{:else if task.requestState === 'declined'}
		<span class="req declined">Not approved or handed back{task.requestNote ? `: "${task.requestNote}"` : ''}</span>
	{/if}
	<strong class="title">{task.title}</strong>
	<div class="chips">
		<span class="ess-badge p-{task.priority}">{PRIORITY_LABEL[task.priority]}</span>
		{#if task.dueDate}<span class="chip due {tone}"><CalendarIcon size={12} />{tone === 'overdue' ? 'Overdue · ' : ''}{dueLabel(task.dueDate)}</span>{/if}
		{#if task.blocked}<span class="ess-badge ess-badge--bad"><Ban size={12} />Blocked</span>{/if}
		{#if task.subtasks.total}<span class="chip plain"><ListChecks size={12} />{task.subtasks.done}/{task.subtasks.total}</span>{/if}
	</div>
	{#if task.source || showAssignee}
		<div class="foot">
			{#if task.source?.kind === 'meeting'}
				<span class="src"><Video size={12} /><span>{task.source.topic}</span></span>
			{:else if task.source?.kind === 'message'}
				<span class="src"><Hash size={12} /><span>{task.source.channelName ?? 'From chat'}</span></span>
			{:else}<span></span>{/if}
			{#if showAssignee && task.assignee}<Avatar userId={task.assignee.id} fullName={task.assignee.fullName} size="sm" />{/if}
		</div>
	{/if}
	{#if task.can.approve}<ApprovalButtons {task} />{/if}
</article>

<style>
	.card {
		display: grid;
		gap: 8px;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		box-shadow: var(--ess-elev-1);
		cursor: grab;
		touch-action: pan-x pan-y;
		user-select: none;
		transition:
			border-color var(--ess-t-fast),
			box-shadow var(--ess-t-fast);
	}
	.card:hover {
		border-color: var(--ess-border-strong);
		box-shadow: var(--ess-elev-2);
	}
	.card.request {
		border-color: var(--ess-primary);
	}
	.title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}
	.done .title {
		color: var(--ess-text-muted);
		text-decoration: line-through;
	}
	.req {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		font-weight: 500;
		color: var(--ess-primary-text);
	}
	.req.declined {
		color: var(--ess-warning);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.chip.overdue {
		color: var(--ess-danger);
	}
	.chip.soon {
		color: var(--ess-warning);
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
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}
	.src {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--ess-text-secondary);
	}
	.src span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
