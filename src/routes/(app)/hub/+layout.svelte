<script lang="ts">
	import { page } from '$app/state';
	import { goto, replaceState } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { chat } from '$lib/chat/client.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import CommandPalette from '$lib/components/hub/CommandPalette.svelte';
	import TaskSheet from '$lib/components/hub/TaskSheet.svelte';
	import NewTaskDialog from '$lib/components/hub/NewTaskDialog.svelte';

	let { data, children } = $props();

	const me = $derived(data.hubMe);

	$effect(() => {
		hub.start();
	});

	const path = $derived(page.url.pathname);
	const tabs = $derived([
		{ href: '/hub', label: 'Today', count: hub.counts.needs, on: path === '/hub' },
		{ href: '/hub/chats', label: 'Chats', count: chat.badge, on: path.startsWith('/hub/chats') || path.startsWith('/hub/c/') },
		{ href: '/hub/tasks', label: 'Tasks', count: 0, on: path.startsWith('/hub/tasks') },
		{ href: '/hub/meetings', label: 'Meetings', count: hub.counts.minutes, on: path.startsWith('/hub/meetings') },
		...(data.hub.isLead ? [{ href: '/hub/team', label: 'Team', count: 0, on: path.startsWith('/hub/team') }] : [])
	]);

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

<div class="hub">
	<header class="bar">
		<a class="brand" href="/hub"><span class="mark">CH</span><span class="name">Champ Hub</span></a>
		<nav class="tabs" aria-label="Champ Hub">
			{#each tabs as t (t.href)}
				<a href={t.href} class="tab" aria-current={t.on ? 'page' : undefined}>
					{t.label}
					{#if t.count > 0}<span class="count" aria-label="{t.count} waiting">{t.count > 99 ? '99+' : t.count}</span>{/if}
				</a>
			{/each}
		</nav>
		<button type="button" class="search" onclick={() => (hub.paletteOpen = true)}>
			<Search size={15} />
			<span>Search or ask Champ</span>
			<kbd>Ctrl K</kbd>
		</button>
		<button type="button" class="ess-btn ess-btn--primary ess-btn--sm new" onclick={() => (hub.newTaskOpen = true)} title="New task (N)">
			<Plus size={15} /> <span>New task</span>
		</button>
	</header>

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
		gap: 16px;
		min-width: 0;
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		margin: calc(-1 * var(--ess-page-pad-y)) calc(-1 * var(--ess-page-pad-x)) 0;
		padding: 10px var(--ess-page-pad-x);
		background: color-mix(in oklab, var(--ess-canvas) 82%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--ess-border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--ess-text);
		font-family: var(--ess-font-display);
		font-weight: 700;
		font-size: 16px;
	}
	.mark {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		background: linear-gradient(150deg, var(--acc2), var(--acc));
		color: var(--ess-text-on-primary);
		font-size: 11px;
		font-weight: 800;
	}
	.tabs {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		min-width: 0;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 12px;
		border-radius: 9px;
		color: var(--ess-text-secondary);
		font-weight: 600;
		font-size: 13.5px;
		white-space: nowrap;
	}
	.tab:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-text);
	}
	.tab[aria-current='page'] {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.count {
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 99px;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font-size: 10.5px;
		font-weight: 700;
		display: grid;
		place-items: center;
		font-variant-numeric: tabular-nums;
	}
	.search {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 230px;
		padding: 7px 10px;
		border-radius: 10px;
		border: 1px solid var(--ess-border);
		background: var(--ess-field-bg);
		color: var(--ess-text-muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.search:hover {
		border-color: var(--ess-border-strong);
	}
	.search kbd {
		margin-left: auto;
		font-family: var(--ess-font-mono);
		font-size: 11px;
		border: 1px solid var(--ess-border);
		border-radius: 5px;
		padding: 0 5px;
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
		border-radius: 12px;
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
		font-weight: 700;
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
	@media (max-width: 860px) {
		.search {
			min-width: 0;
			flex: 1;
			order: 3;
			margin-left: 0;
		}
		.search span {
			display: none;
		}
		.tabs {
			order: 4;
			width: 100%;
		}
	}
	@media (max-width: 720px) {
		.bar {
			margin: -20px -16px 0;
			padding: 10px 16px;
		}
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
