<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Video from '@lucide/svelte/icons/video';
	import Hash from '@lucide/svelte/icons/hash';
	import Send from '@lucide/svelte/icons/send';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Avatar from '$lib/components/Avatar.svelte';
	import AssigneeSelect from './AssigneeSelect.svelte';
	import { chat } from '$lib/chat/client.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { moveTask, respond } from '$lib/hub/actions';
	import ApprovalButtons from './ApprovalButtons.svelte';
	import { ago, longDay } from '$lib/hub/format';
	import { lockPageScroll } from '$lib/scroll-lock';
	import { PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from '$lib/tasks/rules';
	import type { TaskDetail } from '$lib/tasks/types';

	/**
	 * Everything about one task, in a sheet over whatever Hub page is open.
	 * Opened by hub.openTask (shallow routing) or a ?task= link, so Back closes
	 * it and a link from a notification lands straight on it.
	 */
	let { taskId, meId, onclose }: { taskId: string; meId: string; onclose: () => void } = $props();

	let task = $state<TaskDetail | null>(null);
	let error = $state('');
	let title = $state('');
	let description = $state('');
	let newSub = $state('');
	let comment = $state('');
	let declining = $state(false);
	let declineNote = $state('');
	let confirmDelete = $state(false);
	let busy = $state(false);
	let closeBtn = $state<HTMLButtonElement | null>(null);

	async function load() {
		const r = await fetch(`/api/tasks/${taskId}`);
		const data = await r.json().catch(() => ({}));
		if (!r.ok) {
			error = data.message ?? 'That task is not available to you';
			task = null;
			return;
		}
		error = '';
		task = data.task;
		title = data.task.title;
		description = data.task.description;
	}

	$effect(() => {
		void taskId;
		void load();
	});

	$effect(() => {
		const unlock = lockPageScroll();
		const returnTo = document.activeElement as HTMLElement | null;
		queueMicrotask(() => closeBtn?.focus());
		const off = chat.on((e) => {
			if (e.type === 'tasks.changed' && e.taskId === taskId) void load();
		});
		return () => {
			unlock();
			off();
			returnTo?.focus?.();
		};
	});

	const can = $derived(task?.can.edit ?? false);

	async function patch(body: Record<string, unknown>) {
		if (!task) return;
		const r = await api<{ task: TaskDetail }>(`/api/tasks/${task.id}`, 'PATCH', { ...body, version: task.version });
		if (!r.ok) hub.say(r.message, { tone: 'bad' });
		await load();
		hub.changed();
	}

	async function move(to: { status?: TaskStatus; assigneeId?: string | null }) {
		if (!task) return;
		busy = true;
		await moveTask(task, to);
		busy = false;
		await load();
	}

	async function addSub() {
		const t = newSub.trim();
		if (!t || !task) return;
		newSub = '';
		const r = await api(`/api/tasks/${task.id}/subtasks`, 'POST', { title: t });
		if (!r.ok) hub.say(r.message, { tone: 'bad' });
		await load();
		hub.changed();
	}

	async function toggleSub(id: string) {
		if (!task) return;
		const r = await api(`/api/tasks/${task.id}/subtasks/${id}/toggle`, 'POST', {});
		if (!r.ok) hub.say(r.message, { tone: 'bad' });
		await load();
		hub.changed();
	}

	async function removeSub(id: string) {
		if (!task) return;
		await api(`/api/tasks/${task.id}/subtasks/${id}`, 'DELETE');
		await load();
	}

	async function postComment() {
		const b = comment.trim();
		if (!b || !task) return;
		comment = '';
		const r = await api(`/api/tasks/${task.id}/comments`, 'POST', { body: b });
		if (!r.ok) hub.say(r.message, { tone: 'bad' });
		await load();
	}

	async function decline() {
		if (!task || !declineNote.trim()) return;
		if (await respond(task, 'decline', declineNote)) onclose();
	}

	async function remove() {
		if (!task) return;
		const r = await api(`/api/tasks/${task.id}`, 'DELETE');
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		hub.say('Task deleted.');
		hub.changed(0);
		onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ess-scrim scrim" role="presentation" onclick={onclose}></div>
<div class="ess-drawer sheet" role="dialog" aria-modal="true" aria-labelledby="task-sheet-title">
	<header class="head">
		{#if task}
			<label class="sr" for="ts-status">Status</label>
			<select id="ts-status" class="ess-select status" disabled={!can || busy} value={task.status} onchange={(e) => move({ status: e.currentTarget.value as TaskStatus })}>
				{#each TASK_STATUSES as s (s)}<option value={s}>{STATUS_LABEL[s]}</option>{/each}
			</select>
		{/if}
		<span id="task-sheet-title" class="head-title">Task</span>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" bind:this={closeBtn} onclick={onclose} aria-label="Close task"><X size={16} /></button>
	</header>

	<div class="body">
		{#if error}
			<p class="ess-alert ess-alert--warning">{error}</p>
		{:else if !task}
			<div class="ess-skeleton" style="height:22px;width:70%"></div>
			<div class="ess-skeleton" style="width:40%"></div>
		{:else}
			<input
				class="title"
				aria-label="Task title"
				bind:value={title}
				disabled={!can}
				onblur={() => title.trim() && title !== task!.title && patch({ title })}
				onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			/>

			{#if task.can.approve}
				<div class="ess-alert ess-alert--info banner">
					<Send size={15} />
					<div class="grow">
						<p>
							{task.assignee?.id === task.createdBy.id ? `${task.createdBy.fullName} made this task for themselves.` : `${task.createdBy.fullName} made this task for ${task.assignee?.fullName ?? 'nobody yet'}.`}
							It starts once you approve.
						</p>
						<ApprovalButtons {task} ondone={() => void load()} />
					</div>
				</div>
			{:else if task.requestState === 'pending'}
				<p class="ess-alert ess-alert--info">Waiting for {task.approver?.fullName ?? 'the lead'} to approve. It can be started once they do.</p>
			{:else if task.requestState === 'declined'}
				<p class="ess-alert ess-alert--warning">Not approved or handed back{task.requestNote ? `: "${task.requestNote}"` : ''}. Change it and give it to someone, or delete it.</p>
			{/if}
			{#if task.assignee?.id === meId && task.createdBy.id !== meId && !task.requestState}
				{#if declining}
					<div class="ess-field">
						<label class="ess-label" for="ts-decline">Why can't you take it?</label>
						<input id="ts-decline" class="ess-input" bind:value={declineNote} placeholder="For example: on leave until the 14th" />
						<div class="row">
							<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={!declineNote.trim()} onclick={decline}>Hand it back</button>
							<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (declining = false)}>Cancel</button>
						</div>
					</div>
				{:else}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm handback" onclick={() => (declining = true)}>Can't take this? Hand it back</button>
				{/if}
			{/if}
			{#if !can}<p class="ess-help">You can see this because it is on your team. Only its owner, the person who made it and their leads can change it.</p>{/if}

			<div class="grid">
				<div class="ess-field">
					<label class="ess-label" for="ts-assignee">Assignee</label>
					<AssigneeSelect id="ts-assignee" groups={task.assignable} value={task.assignee?.id ?? null} {meId} disabled={!can || busy} onchange={(v) => move({ assigneeId: v })} />
				</div>
				<div class="ess-field">
					<label class="ess-label" for="ts-due">Due</label>
					<input id="ts-due" type="date" class="ess-input" disabled={!can} value={task.dueDate ?? ''} onchange={(e) => patch({ dueDate: e.currentTarget.value || null })} />
				</div>
				<div class="ess-field">
					<label class="ess-label" for="ts-priority">Priority</label>
					<select id="ts-priority" class="ess-select" disabled={!can} value={task.priority} onchange={(e) => patch({ priority: e.currentTarget.value })}>
						{#each TASK_PRIORITIES as p (p)}<option value={p}>{PRIORITY_LABEL[p]}</option>{/each}
					</select>
				</div>
				<div class="ess-field">
					<span class="ess-label">Blocked</span>
					<label class="check"><input type="checkbox" disabled={!can} checked={task.blocked} onchange={(e) => patch({ blocked: e.currentTarget.checked })} /> Waiting on something</label>
				</div>
			</div>

			<div class="ess-field">
				<label class="ess-label" for="ts-desc">Description</label>
				<textarea id="ts-desc" class="ess-textarea" rows="3" disabled={!can} bind:value={description} placeholder="Context, links, what done looks like" onblur={() => description !== task!.description && patch({ description })}></textarea>
			</div>

			{#if task.source?.kind === 'meeting'}
				<div class="src">
					<div class="src-top">
						<span class="src-name"><Video size={14} /> From {task.source.topic} · {longDay(task.source.date + 'T06:30:00Z')}</span>
						{#if task.source.canOpen}<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/meetings/{task.source.meetingId}">Open minutes</a>{/if}
					</div>
					{#if task.source.quote}<blockquote>"{task.source.quote}"</blockquote>{/if}
					{#if !task.source.canOpen}<p class="ess-help">Only the host sees the full minutes.</p>{/if}
				</div>
			{:else if task.source?.kind === 'message'}
				<div class="src">
					<div class="src-top">
						<span class="src-name"><Hash size={14} /> From {task.source.channelName ?? 'a conversation'}</span>
						{#if task.source.channelId}<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/c/{task.source.channelId}">Open chat</a>{/if}
					</div>
					{#if task.source.quote}<blockquote>"{task.source.quote}"</blockquote>{/if}
				</div>
			{/if}

			<section>
				<h3 class="sec">Subtasks <span>{task.subtaskList.filter((s) => s.done).length}/{task.subtaskList.length}</span></h3>
				<ul class="subs">
					{#each task.subtaskList as s (s.id)}
						<li class:done={s.done}>
							<label><input type="checkbox" checked={s.done} disabled={!can} onchange={() => toggleSub(s.id)} /> <span>{s.title}</span></label>
							{#if can}<button type="button" class="icon" aria-label="Remove subtask {s.title}" onclick={() => removeSub(s.id)}><X size={13} /></button>{/if}
						</li>
					{/each}
				</ul>
				{#if can}
					<form class="inline" onsubmit={(e) => { e.preventDefault(); void addSub(); }}>
						<input class="ess-input" aria-label="New subtask" bind:value={newSub} placeholder="Add a subtask" />
						<button class="ess-btn ess-btn--secondary ess-btn--sm" type="submit" disabled={!newSub.trim()}>Add</button>
					</form>
				{/if}
			</section>

			<section>
				<h3 class="sec">Activity</h3>
				<form class="inline" onsubmit={(e) => { e.preventDefault(); void postComment(); }}>
					<input class="ess-input" aria-label="Comment" bind:value={comment} placeholder="Write a comment" />
					<button class="ess-btn ess-btn--secondary ess-btn--sm" type="submit" disabled={!comment.trim()}>Comment</button>
				</form>
				<ul class="events">
					{#each task.events as ev (ev.id)}
						<li class:comment={ev.kind === 'comment'}>
							{#if ev.actor}<Avatar userId={ev.actor.id} fullName={ev.actor.fullName} size="sm" />{:else}<span class="sys">ESS</span>{/if}
							<div>
								<strong>{ev.actor?.fullName ?? 'ESS'}</strong>
								{#if ev.kind === 'comment'}<span class="when">{ago(ev.createdAt)}</span><p>{ev.body}</p>
								{:else}<span>{ev.body}</span> <span class="when">· {ago(ev.createdAt)}</span>{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<footer class="foot">
				<span class="ess-help">Made by {task.createdBy.fullName}</span>
				{#if confirmDelete}
					<span class="warn">Delete for everyone?</span>
					<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" onclick={remove}>Delete</button>
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmDelete = false)}>Keep</button>
				{:else if task.createdBy.id === meId || can}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmDelete = true)}><Trash2 size={14} /> Delete</button>
				{/if}
			</footer>
		{/if}
	</div>
</div>

<style>
	.scrim {
		z-index: 70;
	}
	.sheet {
		z-index: 71;
		width: min(480px, 100vw);
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--ess-border);
	}
	.head-title {
		flex: 1;
		font-size: 12px;
		color: var(--ess-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
	}
	.status {
		width: auto;
		padding: 6px 10px;
		font-weight: 600;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: grid;
		gap: 16px;
		align-content: start;
	}
	.title {
		width: 100%;
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ess-text);
		border-radius: 8px;
		padding: 4px 6px;
		margin-left: -6px;
	}
	.title:hover:not(:disabled),
	.title:focus {
		border-color: var(--ess-border);
		outline: none;
	}
	.banner {
		align-items: flex-start;
	}
	.banner p {
		margin: 0 0 6px;
	}
	.grow {
		flex: 1;
		display: grid;
		gap: 6px;
	}
	.row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.handback {
		justify-self: start;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		padding-top: 8px;
	}
	.src {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: 12px;
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-subtle);
	}
	.src-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.src-name {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ess-info);
	}
	blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--ess-border-strong);
		font-style: italic;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.sec {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		display: flex;
		justify-content: space-between;
	}
	.subs {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.subs li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-radius: 8px;
		padding: 3px 6px;
	}
	.subs li:hover {
		background: var(--ess-surface-hover);
	}
	.subs label {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 13px;
		cursor: pointer;
	}
	.subs li.done span {
		text-decoration: line-through;
		color: var(--ess-text-muted);
	}
	.icon {
		border: 0;
		background: none;
		color: var(--ess-text-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
	}
	.icon:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.inline {
		display: flex;
		gap: 6px;
	}
	.events {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.events li {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: 8px;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.events strong {
		color: var(--ess-text);
		margin-right: 4px;
	}
	.events p {
		margin: 4px 0 0;
		padding: 7px 10px;
		border-radius: 10px;
		background: var(--ess-sunken);
		color: var(--ess-text);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.when {
		color: var(--ess-text-muted);
		font-size: 11.5px;
	}
	.sys {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 8.5px;
		font-weight: 800;
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding-top: 8px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.foot .ess-help {
		flex: 1;
	}
	.warn {
		font-size: 12.5px;
		color: var(--ess-danger);
	}
	@media (max-width: 520px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
