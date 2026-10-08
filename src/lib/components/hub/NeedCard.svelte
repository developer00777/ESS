<script lang="ts">
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import Video from '@lucide/svelte/icons/video';
	import AtSign from '@lucide/svelte/icons/at-sign';
	import Clock from '@lucide/svelte/icons/clock';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import { api, hub } from '$lib/hub/client.svelte';
	import { moveTask } from '$lib/hub/actions';
	import ApprovalButtons from './ApprovalButtons.svelte';
	import { dueLabel } from '$lib/hub/format';
	import { PRIORITY_LABEL } from '$lib/tasks/rules';
	import type { NeedItem } from '$lib/tasks/types';

	/**
	 * One thing that needs the person, with the action right on it: approve,
	 * accept, reply, review, start or finish. Handling it anywhere else in ESS
	 * removes it from here on the next refresh.
	 */
	let { item }: { item: NeedItem } = $props();

	let busy = $state(false);
	let rejecting = $state(false);
	let note = $state('');
	let reply = $state('');
	let gone = $state(false);

	const ENDPOINT: Record<'leave' | 'deviation' | 'comp_off', (id: string) => string> = {
		leave: (id) => `/api/leave/${id}/approve`,
		deviation: (id) => `/api/attendance/deviations/${id}/review`,
		comp_off: (id) => `/api/attendance/comp-off/${id}/review`
	};
	const isTaskApproval = $derived(item.approval?.type === 'task');

	async function decide(decision: 'approve' | 'reject') {
		if (!item.approval || item.approval.type === 'task') return;
		if (decision === 'reject' && !rejecting) {
			rejecting = true;
			return;
		}
		busy = true;
		const r = await api(ENDPOINT[item.approval.type](item.approval.id), 'POST', { decision, note: note.trim() || undefined, via: 'hub' });
		busy = false;
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		gone = true;
		hub.say(decision === 'approve' ? (item.approval.stage === 'manager' ? 'Approved. It goes to HR next if it needs them.' : 'Approved.') : 'Rejected. They were told.');
		hub.changed(0);
	}

	async function sendReply(e: SubmitEvent) {
		e.preventDefault();
		if (!item.mention || !reply.trim()) return;
		busy = true;
		const r = await api('/api/chat/messages', 'POST', { channelId: item.mention.channelId, body: reply.trim() });
		busy = false;
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		reply = '';
		gone = true;
		hub.say(`Replied in ${item.mention.channelName}.`);
		hub.changed(0);
	}

	async function markRead() {
		if (!item.mention) return;
		await api('/api/chat/read', 'POST', { channelId: item.mention.channelId });
		gone = true;
		hub.changed(0);
	}

	async function later() {
		await api('/api/hub/later', 'POST', { key: item.key });
		gone = true;
		hub.say('Hidden until tomorrow morning.');
		hub.changed(0);
	}

	async function move(status: 'in_progress' | 'done') {
		if (!item.task) return;
		busy = true;
		const t = await moveTask(item.task, { status });
		busy = false;
		if (t && status === 'done') gone = true;
	}
</script>

{#if !gone}
	<article class="need" data-kind={item.kind}>
		<span class="ic" aria-hidden="true">
			{#if item.kind === 'approval'}<CalendarCheck size={16} />
			{:else if item.kind === 'minutes'}<Video size={16} />
			{:else if item.kind === 'mention'}<AtSign size={16} />
			{:else if item.kind === 'due'}<Clock size={16} />
			{:else}<Ban size={16} />{/if}
		</span>
		<div class="main">
			{#if item.task}
				<button type="button" class="title link" onclick={() => hub.openTask(item.task!.id)}>{item.kind === 'blocked' ? `${item.task.assignee?.fullName ?? 'Someone'} is blocked: ${item.title}` : item.title}</button>
			{:else}
				<strong class="title">{item.title}</strong>
			{/if}
			<span class="detail">
				{#if item.task && item.kind !== 'blocked'}
					<span class="chip p-{item.task.priority}">{PRIORITY_LABEL[item.task.priority]}</span>
					{#if item.task.dueDate}<span class:over={item.kind === 'due' && item.detail === 'Overdue'}>{item.kind === 'due' ? item.detail : `Due ${dueLabel(item.task.dueDate)}`}{item.kind === 'due' && item.detail === 'Overdue' ? ` · was ${dueLabel(item.task.dueDate)}` : ''}</span>{/if}
					{#if isTaskApproval}<span>{item.detail}</span>{/if}
					{#if item.task.source?.kind === 'meeting'}<span class="src">From {item.task.source.topic}</span>{/if}
				{:else}{item.detail}{/if}
			</span>
			{#if item.quote}<blockquote>"{item.quote}"</blockquote>{/if}
			{#if item.kind === 'mention'}
				<form class="reply" onsubmit={sendReply}>
					<input class="ess-input" bind:value={reply} placeholder="Reply in {item.mention?.channelName}" aria-label="Reply in {item.mention?.channelName}" />
					<button class="ess-btn ess-btn--secondary ess-btn--sm" type="submit" disabled={busy || !reply.trim()}>Reply</button>
				</form>
			{/if}
			{#if rejecting}
				<div class="reply">
					<input class="ess-input" bind:value={note} placeholder="Reason, shown to them (optional)" aria-label="Reason for rejecting" />
					<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" disabled={busy} onclick={() => decide('reject')}>Reject</button>
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (rejecting = false)}>Cancel</button>
				</div>
			{/if}
		</div>
		<div class="acts">
			{#if isTaskApproval && item.task}
				<ApprovalButtons task={item.task} ondone={() => (gone = true)} />
			{:else if item.kind === 'approval' && !rejecting}
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy} onclick={() => decide('approve')}>Approve</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" disabled={busy} onclick={() => decide('reject')}>Reject</button>
			{:else if item.kind === 'minutes'}
				<a class="ess-btn ess-btn--primary ess-btn--sm" href="/hub/meetings/{item.meetingId}">Review</a>
			{:else if item.kind === 'mention' && item.mention}
				<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/c/{item.mention.channelId}">Open</a>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={markRead}>Mark read</button>
			{:else if item.kind === 'due' && item.task}
				{#if item.task.status === 'todo'}<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy} onclick={() => move('in_progress')}>Start</button>{/if}
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy} onclick={() => move('done')}><Check size={14} /> Done</button>
			{:else if item.kind === 'blocked' && item.task}
				<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={() => hub.openTask(item.task!.id)}>Open</button>
			{/if}
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm later" title="Hide until tomorrow morning" onclick={later}>Later</button>
		</div>
	</article>
{/if}

<style>
	.need {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) auto;
		gap: 12px;
		align-items: start;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
		box-shadow: var(--ess-glass-shadow);
	}
	.ic {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}
	[data-kind='approval'] .ic {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	[data-kind='request'] .ic,
	[data-kind='mention'] .ic {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	[data-kind='minutes'] .ic {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	[data-kind='due'] .ic {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	[data-kind='blocked'] .ic {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.main {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.title {
		font-weight: 600;
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		color: var(--ess-text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.link:hover {
		color: var(--ess-primary-text);
	}
	.detail {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: center;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.over {
		color: var(--ess-danger);
		font-weight: 600;
	}
	.src {
		color: var(--ess-info);
	}
	.chip {
		padding: 1px 8px;
		border-radius: 99px;
		font-size: 11.5px;
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
	blockquote {
		margin: 2px 0 0;
		padding-left: 10px;
		border-left: 2px solid var(--ess-border-strong);
		font-size: 13px;
		color: var(--ess-text-secondary);
		overflow-wrap: anywhere;
	}
	.reply {
		display: flex;
		gap: 6px;
		margin-top: 4px;
	}
	.reply .ess-input {
		padding: 6px 10px;
	}
	.acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.later {
		color: var(--ess-text-muted);
	}
	@media (max-width: 720px) {
		.need {
			grid-template-columns: 30px minmax(0, 1fr);
		}
		.acts {
			grid-column: 2;
			justify-content: flex-start;
		}
	}
</style>
