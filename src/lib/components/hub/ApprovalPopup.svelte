<script lang="ts">
	import { goto } from '$app/navigation';
	import X from '@lucide/svelte/icons/x';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import Video from '@lucide/svelte/icons/video';
	import Hash from '@lucide/svelte/icons/hash';
	import ApprovalButtons from './ApprovalButtons.svelte';
	import { chat } from '$lib/chat/client.svelte';
	import { dueLabel } from '$lib/hub/format';
	import { PRIORITY_LABEL } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	/**
	 * The approval pop-up for leads, on every ESS page. When someone makes a
	 * task for one of their people, it appears here at once (the server sends
	 * 'tasks.approval'); anything still waiting when they open ESS shows too.
	 * "Later" hides a task for the rest of this browser session; it stays on
	 * Today and in the ESS feed.
	 */

	const LATER_KEY = 'essApprovalLater';
	let queue = $state<TaskView[]>([]);
	let later = $state<string[]>([]);

	function loadLater() {
		try {
			later = JSON.parse(sessionStorage.getItem(LATER_KEY) ?? '[]');
		} catch {
			later = [];
		}
	}
	function saveLater() {
		try {
			sessionStorage.setItem(LATER_KEY, JSON.stringify(later.slice(-100)));
		} catch {
			/* storage blocked: it just comes back on reload */
		}
	}

	async function refresh() {
		try {
			const r = await fetch('/api/tasks/approvals');
			if (r.ok) queue = await r.json();
		} catch {
			/* offline */
		}
	}

	$effect(() => {
		loadLater();
		void refresh();
		const off = chat.on((e) => {
			if (e.type === 'tasks.approval') {
				// A new one: show it even if an older one was put off.
				later = later.filter((id) => id !== e.taskId);
				saveLater();
				void refresh();
			} else if ((e.type === 'tasks.changed' && queue.some((t) => t.id === e.taskId)) || e.type === 'reconnected') {
				void refresh();
			}
		});
		return off;
	});

	const shown = $derived(queue.filter((t) => !later.includes(t.id)));
	const task = $derived(shown[0] ?? null);

	function putOff() {
		if (!task) return;
		later = [...later, task.id];
		saveLater();
	}

	function done(id: string) {
		queue = queue.filter((t) => t.id !== id);
	}
</script>

{#if task}
	{#key task.id}
		<aside class="pop" aria-label="Task waiting for your approval" aria-live="polite">
			<header>
				<span class="k">Needs your approval{shown.length > 1 ? ` · 1 of ${shown.length}` : ''}</span>
				<button type="button" class="x" onclick={putOff} aria-label="Remind me later"><X size={15} /></button>
			</header>
			<button type="button" class="title" onclick={() => goto(`/hub/tasks?task=${task.id}`)}>{task.title}</button>
			<p class="who">
				{task.assignee?.id === task.createdBy.id ? `${task.createdBy.fullName} made this for themselves` : `${task.createdBy.fullName} made this for ${task.assignee?.fullName ?? 'nobody yet'}`}
			</p>
			<div class="chips">
				<span class="chip p-{task.priority}">{PRIORITY_LABEL[task.priority]}</span>
				{#if task.dueDate}<span class="chip plain"><CalendarIcon size={12} /> Due {dueLabel(task.dueDate)}</span>{/if}
				{#if task.source?.kind === 'meeting'}<span class="chip plain"><Video size={12} /> {task.source.topic}</span>
				{:else if task.source?.kind === 'message'}<span class="chip plain"><Hash size={12} /> {task.source.channelName ?? 'From chat'}</span>{/if}
			</div>
			{#if task.description}<p class="desc">{task.description}</p>{/if}
			<ApprovalButtons {task} ondone={() => done(task.id)} />
			<button type="button" class="later" onclick={putOff}>Later</button>
		</aside>
	{/key}
{/if}

<style>
	.pop {
		position: fixed;
		z-index: 65;
		right: 20px;
		bottom: calc(20px + env(safe-area-inset-bottom, 0px));
		width: min(360px, calc(100vw - 32px));
		display: grid;
		gap: 8px;
		padding: 14px 16px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-modal-bg);
		border: 1px solid color-mix(in oklab, var(--ess-primary) 45%, var(--ess-border));
		box-shadow: var(--ess-elev-4);
		animation: rise var(--ess-t-slow) both;
	}
	@keyframes rise {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.k {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
	}
	.x {
		border: 0;
		background: none;
		color: var(--ess-text-muted);
		cursor: pointer;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		display: grid;
		place-items: center;
	}
	.x:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.title {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: inherit;
		font-family: var(--ess-font-display);
		font-size: 16px;
		font-weight: 600;
		color: var(--ess-text);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.title:hover {
		color: var(--ess-primary-text);
	}
	.who,
	.desc {
		margin: 0;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.desc {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px 10px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
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
	.chip.plain {
		background: transparent;
		color: var(--ess-text-muted);
		padding-inline: 0;
		font-weight: 500;
	}
	.later {
		justify-self: start;
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-text-muted);
		cursor: pointer;
	}
	.later:hover {
		color: var(--ess-text);
	}
	@media (prefers-reduced-motion: reduce) {
		.pop {
			animation: none;
		}
	}
</style>
