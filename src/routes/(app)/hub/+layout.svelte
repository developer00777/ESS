<script lang="ts">
	import { page } from '$app/state';
	import { goto, replaceState } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import House from '@lucide/svelte/icons/house';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Users from '@lucide/svelte/icons/users';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { chat } from '$lib/chat/client.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import CommandPalette from '$lib/components/hub/CommandPalette.svelte';
	import TaskSheet from '$lib/components/hub/TaskSheet.svelte';
	import NewTaskDialog from '$lib/components/hub/NewTaskDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { longDay } from '$lib/hub/format';

	let { data, children } = $props();

	const me = $derived(data.hubMe);

	$effect(() => {
		hub.start();
	});

	const path = $derived(page.url.pathname);
	const tabs = $derived([
		{ href: '/hub', label: 'Today', icon: House, count: hub.counts.needs, on: path === '/hub' },
		{ href: '/hub/chats', label: 'Chats', icon: MessageCircle, count: chat.badge, on: path.startsWith('/hub/chats') || path.startsWith('/hub/c/') },
		{ href: '/hub/tasks', label: 'Tasks', icon: SquareCheck, count: 0, on: path.startsWith('/hub/tasks') },
		{ href: '/hub/meetings', label: 'Meetings', icon: Calendar, count: hub.counts.minutes, on: path.startsWith('/hub/meetings') },
		...(data.hub.isLead ? [{ href: '/hub/team', label: 'Team', icon: Users, count: 0, on: path.startsWith('/hub/team') }] : [])
	]);

	/* The serif line each tab opens with. A conversation and a meeting's
	   minutes carry their own title, so the layout draws nothing there. */
	const head = $derived.by(() => {
		if (path === '/hub') return { title: 'A little focus. A clearer day.', sub: longDay(new Date().toISOString()) };
		if (path.startsWith('/hub/chats')) return { title: 'Keep the conversation moving.', sub: 'Every conversation in one place: channels, people and HR.' };
		if (path.startsWith('/hub/tasks')) return { title: 'Move the important work forward.', sub: 'Your tasks, grouped by when they are due.' };
		if (path === '/hub/meetings') return { title: 'Meet with a clear purpose.', sub: 'Upcoming calls, minutes to review, and what came out of each one.' };
		if (path.startsWith('/hub/team')) return { title: 'See where your team needs you.', sub: 'Task counts for the people who report to you, never a productivity score.' };
		return null;
	});
	const ownHeader = $derived(path.startsWith('/hub/c/') || /^\/hub\/meetings\/[^/]+/.test(path));

	const openTask = $derived(hub.openTaskId);

	function closeTask() {
		if (page.state.task) history.back();
		else {
			const url = new URL(page.url);
			url.searchParams.delete('task');
			replaceState(url, {});
		}
	}

	// G then T / C / K / M jumps between tabs, like Linear; Ctrl K searches.
	let gPressed = 0;
	function keys(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			hub.paletteOpen = !hub.paletteOpen;
			return;
		}
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return;
		const k = e.key.toLowerCase();
		if (k === 'g') {
			gPressed = Date.now();
			return;
		}
		if (Date.now() - gPressed < 1200) {
			const to = { t: '/hub', c: '/hub/chats', k: '/hub/tasks', m: '/hub/meetings', e: data.hub.isLead ? '/hub/team' : null }[k];
			gPressed = 0;
			if (to) {
				e.preventDefault();
				void goto(to);
			}
		} else if (k === 'n' && !hub.newTaskOpen) {
			e.preventDefault();
			hub.newTaskOpen = true;
		}
	}
</script>

<svelte:window onkeydown={keys} />

<div class="hub" class:own-header={ownHeader}>
	{#if head && !ownHeader}
		<PageHeader crumb={['Champ Hub']} title={head.title} sub={head.sub} compact>
			{#snippet actions()}
				<button type="button" class="search" onclick={() => (hub.paletteOpen = true)}>
					<Search size={16} />
					<span>Search or ask Champ…</span>
					<kbd class="ess-kbd">Ctrl K</kbd>
				</button>
				<button type="button" class="ess-btn ess-btn--primary new" onclick={() => (hub.newTaskOpen = true)} title="New task (N)">
					<Plus size={17} /> <span>New task</span>
				</button>
			{/snippet}
		</PageHeader>
	{/if}

	<nav class="ess-tabs tabs" aria-label="Champ Hub">
		{#each tabs as t (t.href)}
			<a href={t.href} class="ess-tab" aria-current={t.on ? 'page' : undefined}>
				<t.icon size={17} strokeWidth={1.75} />
				{t.label}
				{#if t.count > 0}<span class="ess-count" aria-label="{t.count} waiting">{t.count > 99 ? '99+' : t.count}</span>{/if}
			</a>
		{/each}
	</nav>

	<div class="page">
		{@render children()}
	</div>
</div>

{#if hub.paletteOpen}
	<CommandPalette meId={me.id} isLead={data.hub.isLead} onclose={() => (hub.paletteOpen = false)} />
{/if}
{#if hub.newTaskOpen}
	<NewTaskDialog meId={me.id} onclose={() => (hub.newTaskOpen = false)} />
{/if}
{#if openTask}
	{#key openTask}
		<TaskSheet taskId={openTask} meId={me.id} onclose={closeTask} />
	{/key}
{/if}
{#if hub.toast}
	<div class="toast" role="status" aria-live="polite" data-tone={hub.toast.tone}>
		{#if hub.toast.tone === 'bad'}<CircleAlert size={16} />{:else}<CircleCheck size={16} />{/if}
		<span>{hub.toast.text}</span>
		{#if hub.toast.undo}
			{@const undo = hub.toast.undo}
			<button type="button" onclick={() => { hub.toast = null; void undo(); }}>Undo</button>
		{/if}
	</div>
{/if}

<style>
	.hub {
		display: flex;
		flex-direction: column;
		gap: 20px;
		min-width: 0;
	}
	.hub.own-header {
		gap: 16px;
	}
	.tabs {
		align-self: flex-start;
	}
	.tabs .ess-tab {
		min-width: 128px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 300px;
		height: 40px;
		padding: 0 12px 0 14px;
		border-radius: var(--ess-radius-md);
		border: 1px solid var(--ess-border);
		background: var(--ess-surface);
		color: var(--ess-text-muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		text-align: left;
	}
	.search span {
		flex: 1;
	}
	.search:hover {
		border-color: var(--ess-border-strong);
	}
	.page {
		min-width: 0;
	}
	.toast {
		position: fixed;
		z-index: 95;
		left: 50%;
		bottom: calc(22px + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(560px, calc(100vw - 32px));
		padding: 10px 12px 10px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-text);
		color: var(--ess-canvas);
		box-shadow: var(--ess-elev-4);
		font-size: 13px;
	}
	.toast[data-tone='bad'] {
		background: var(--ess-danger);
		color: #fff;
	}
	.toast button {
		border: 1px solid color-mix(in oklab, currentColor 40%, transparent);
		background: transparent;
		color: inherit;
		border-radius: 8px;
		padding: 3px 10px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	/* Card drag (src/lib/hub/drag.ts) */
	:global(.hub-drag-ghost) {
		transform: rotate(1.5deg);
		box-shadow: var(--ess-elev-4) !important;
		opacity: 0.95;
	}
	:global(.hub-dragging) {
		opacity: 0.35;
	}
	:global(.hub-drop-line) {
		height: 3px;
		border-radius: 3px;
		background: var(--ess-primary);
		margin: -2px 0;
	}
	@media (max-width: 900px) {
		.search {
			min-width: 0;
		}
		.search span {
			display: none;
		}
		.tabs {
			align-self: stretch;
		}
		.tabs .ess-tab {
			min-width: 0;
			flex: 1;
		}
	}
	@media (max-width: 720px) {
		.new span {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.hub-drag-ghost) {
			transform: none;
		}
	}
</style>
