<script lang="ts">
	import { untrack } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import AssigneeSelect from './AssigneeSelect.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { lockPageScroll } from '$lib/scroll-lock';
	import { PRIORITY_LABEL, TASK_PRIORITIES } from '$lib/tasks/rules';
	import type { AssignableGroups, TaskView } from '$lib/tasks/types';

	/**
	 * A new task: from the top bar's New task button, or from "Make task" on a
	 * chat message, in which case the message travels with it as its source and
	 * the owner starts as the first person the message mentions.
	 */
	let {
		meId,
		from = null,
		onclose
	}: {
		meId: string;
		from?: { messageId: string; text: string; mentionIds: string[] } | null;
		onclose: () => void;
	} = $props();

	let groups = $state<AssignableGroups>({ direct: [], request: [] });
	// Seeded once from the message; after that the fields are the person's.
	let title = $state(untrack(() => (from ? from.text.replace(/^(@\S+\s*)+/, '').replace(/[?.!]+$/, '').slice(0, 120) : '')));
	let assigneeId = $state<string | null>(untrack(() => meId));
	let dueDate = $state('');
	let priority = $state('medium');
	let busy = $state(false);
	let err = $state('');
	let titleEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const unlock = lockPageScroll();
		void fetch('/api/tasks/assignable').then(async (r) => {
			if (!r.ok) return;
			groups = await r.json();
			// Make task on "@Sneha can you…": Sneha first, if she can be given one.
			const mentioned = from?.mentionIds.find((id) => id !== meId && [...groups.direct, ...groups.request].some((p) => p.id === id));
			if (mentioned) assigneeId = mentioned;
		});
		queueMicrotask(() => titleEl?.focus());
		return unlock;
	});

	const isRequest = $derived(!!assigneeId && groups.request.some((p) => p.id === assigneeId));

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		busy = true;
		err = '';
		const body = { title, assigneeId, dueDate: dueDate || null, priority };
		const r = from ? await api<{ task: TaskView }>('/api/tasks/from-message', 'POST', { ...body, messageId: from.messageId }) : await api<{ task: TaskView }>('/api/tasks', 'POST', body);
		busy = false;
		if (!r.ok) {
			err = r.message;
			return;
		}
		const t = r.task;
		hub.say(t.requestState === 'pending' ? `Sent to ${t.assignee?.fullName} as a request.` : t.assignee?.id === meId ? 'Added to your To do.' : `Given to ${t.assignee?.fullName ?? 'nobody yet'}.`);
		hub.changed(0);
		onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ess-scrim scrim" role="presentation" onclick={onclose}></div>
<div class="ess-modal modal" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
	<div class="ess-modal__head">
		<strong id="new-task-title">{from ? 'Make a task from this message' : 'New task'}</strong>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={onclose} aria-label="Close"><X size={16} /></button>
	</div>
	<form class="ess-modal__body body" onsubmit={save}>
		{#if from}<blockquote>"{from.text.slice(0, 280)}"</blockquote>{/if}
		<div class="ess-field">
			<label class="ess-label" for="nt-title">Task</label>
			<input id="nt-title" class="ess-input" bind:this={titleEl} bind:value={title} maxlength="300" placeholder="What needs doing" required />
		</div>
		<div class="grid">
			<div class="ess-field">
				<label class="ess-label" for="nt-owner">Owner</label>
				<AssigneeSelect id="nt-owner" {groups} value={assigneeId} {meId} onchange={(v) => (assigneeId = v)} />
			</div>
			<div class="ess-field">
				<label class="ess-label" for="nt-due">Due</label>
				<input id="nt-due" type="date" class="ess-input" bind:value={dueDate} />
			</div>
			<div class="ess-field">
				<label class="ess-label" for="nt-prio">Priority</label>
				<select id="nt-prio" class="ess-select" bind:value={priority}>
					{#each TASK_PRIORITIES as p (p)}<option value={p}>{PRIORITY_LABEL[p]}</option>{/each}
				</select>
			</div>
		</div>
		{#if isRequest}<p class="ess-help">They're outside your reporting line, so they'll get this as a request to accept.</p>{/if}
		{#if err}<p class="ess-error">{err}</p>{/if}
		<div class="actions">
			<button type="button" class="ess-btn ess-btn--ghost" onclick={onclose}>Cancel</button>
			<button type="submit" class="ess-btn ess-btn--primary" disabled={busy || !title.trim()}>{from ? 'Create task' : 'Add task'}</button>
		</div>
	</form>
</div>

<style>
	.scrim {
		z-index: 80;
	}
	.modal {
		position: fixed;
		z-index: 81;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(560px, calc(100vw - 32px));
	}
	.body {
		display: grid;
		gap: 14px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr;
		gap: 10px;
	}
	blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--ess-border-strong);
		font-style: italic;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
