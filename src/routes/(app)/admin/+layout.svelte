<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Users from '@lucide/svelte/icons/users';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import Scale from '@lucide/svelte/icons/scale';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Network from '@lucide/svelte/icons/network';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import DatabaseZap from '@lucide/svelte/icons/database-zap';
	import Palette from '@lucide/svelte/icons/palette';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Video from '@lucide/svelte/icons/video';
	import Search from '@lucide/svelte/icons/search';
	import { adminTabForPath, visibleAdminTabs, type AdminTabId } from '$lib/admin-tabs';
	import { tabSeverities } from '$lib/admin-issues';
	import { lockPageScroll } from '$lib/scroll-lock';
	import SummaryStrip from '$lib/components/SummaryStrip.svelte';

	let { data, children } = $props();

	const ICONS: Record<AdminTabId, typeof Users> = {
		overview: LayoutGrid,
		people: Users,
		biometric: Fingerprint,
		balances: Scale,
		policies: BookOpen,
		org: Network,
		access: ShieldCheck,
		chat: MessagesSquare,
		zoom: Video,
		cleanup: DatabaseZap,
		tweaks: Palette
	};

	const can = (key: string) => (data.adminCaps as string[]).includes(key);
	const tabs = $derived(visibleAdminTabs(data.adminCaps));
	const current = $derived(adminTabForPath(page.url.pathname));
	const severities = $derived(tabSeverities(data.adminIssues));
	const strip = $derived(current ? data.adminStrips[current.id] : undefined);

	/** Why a tab has a dot, for its tooltip. */
	function tabHint(id: AdminTabId): string | undefined {
		const top = data.adminIssues.find((i) => i.tab === id);
		return top?.title;
	}

	/* ---------- Ctrl+K jump box ---------- */

	type Jump = { label: string; kind: 'Section' | 'Action'; href: string };

	const jumps = $derived.by((): Jump[] => [
		...tabs.map((t) => ({ label: t.label, kind: 'Section' as const, href: t.href })),
		...(can('people.create_login')
			? [{ label: 'Create a login', kind: 'Action' as const, href: '/admin/people?create=1' }]
			: []),
		...(can('announcements.post')
			? [{ label: 'Post an announcement', kind: 'Action' as const, href: '/chat?c=announcements&compose=1' }]
			: []),
		...(can('people.directory')
			? [{ label: 'Week-off rosters', kind: 'Action' as const, href: '/admin/people?view=weekoff' }]
			: []),
		...(can('people.bulk_import')
			? [{ label: 'Bulk import logins', kind: 'Action' as const, href: '/admin/people?view=bulk' }]
			: []),
		...(can('people.password_activity')
			? [{ label: 'Password activity', kind: 'Action' as const, href: '/admin/people?view=passwords' }]
			: []),
		...(can('policies.publish')
			? [{ label: 'Publish a holiday calendar', kind: 'Action' as const, href: '/admin/policies' }]
			: []),
		...(can('system.roles')
			? [{ label: 'Create a named role', kind: 'Action' as const, href: '/admin/access-control?new=1' }]
			: []),
		...(can('attendance.biometric_upload')
			? [{ label: 'Upload a biometric report', kind: 'Action' as const, href: '/admin/biometric' }]
			: []),
		...(can('leave.set_balances')
			? [{ label: 'Set leave balances', kind: 'Action' as const, href: '/admin/leave-balances' }]
			: []),
		{ label: 'Approve leave requests', kind: 'Action', href: '/leave' }
	]);

	let jumpOpen = $state(false);
	let jumpQuery = $state('');
	let jumpIndex = $state(0);
	let jumpInput = $state<HTMLInputElement | null>(null);
	let unlockScroll: (() => void) | null = null;

	const jumpMatches = $derived(
		jumps.filter((j) => j.label.toLowerCase().includes(jumpQuery.trim().toLowerCase()))
	);

	async function openJump() {
		jumpQuery = '';
		jumpIndex = 0;
		jumpOpen = true;
		unlockScroll = lockPageScroll();
		await tick();
		jumpInput?.focus();
	}

	function closeJump() {
		jumpOpen = false;
		unlockScroll?.();
		unlockScroll = null;
	}

	function pick(j: Jump) {
		closeJump();
		goto(j.href);
	}

	function onJumpKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			jumpIndex = Math.min(jumpIndex + 1, jumpMatches.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			jumpIndex = Math.max(jumpIndex - 1, 0);
		} else if (e.key === 'Enter' && jumpMatches[jumpIndex]) {
			e.preventDefault();
			pick(jumpMatches[jumpIndex]);
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			if (jumpOpen) closeJump();
			else openJump();
		} else if (e.key === 'Escape' && jumpOpen) {
			closeJump();
		}
	}

	$effect(() => () => unlockScroll?.());

	/* Keep the active tab in view when the bar scrolls sideways on a phone. */
	let tabBar = $state<HTMLElement | null>(null);
	$effect(() => {
		void current?.id;
		tabBar?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<svelte:window onkeydown={onWindowKey} />

<header class="admin-head">
	<div class="head-text">
		<span class="ess-eyebrow">Admin Controls</span>
		<h1 class="ess-page-title">{current?.label ?? 'Admin Controls'}</h1>
		{#if current}<p class="ess-page-sub">{current.blurb}</p>{/if}
	</div>
	<button type="button" class="ess-btn ess-btn--secondary jump-btn" onclick={openJump}>
		<Search size={15} />
		Jump to…
		<kbd>Ctrl K</kbd>
	</button>
</header>

<nav class="admin-tabs" aria-label="Admin sections">
	<div class="tab-row" bind:this={tabBar}>
		{#each tabs as tab, i (tab.id)}
			{@const Icon = ICONS[tab.id]}
			{@const sev = severities[tab.id]}
			{#if i > 0 && tabs[i - 1].group !== tab.group}
				<span class="group-sep" aria-hidden="true"></span>
			{/if}
			<a
				href={tab.href}
				class="tab"
				aria-current={current?.id === tab.id ? 'page' : undefined}
				title={sev ? tabHint(tab.id) : undefined}
			>
				<Icon size={16} />
				{tab.label}
				{#if sev && sev !== 'info'}
					<span class="dot" data-sev={sev}>
						<span class="sr-only">— needs attention</span>
					</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>

<div class="admin-body">
	{#if strip && strip.length > 0}
		<SummaryStrip items={strip} />
	{/if}
	{@render children()}
</div>

{#if jumpOpen}
	<div class="jump-scrim" role="presentation" onclick={closeJump}></div>
	<div class="jump" role="dialog" aria-modal="true" aria-label="Jump to a section or action">
		<input
			bind:this={jumpInput}
			bind:value={jumpQuery}
			oninput={() => (jumpIndex = 0)}
			onkeydown={onJumpKey}
			class="jump-input"
			placeholder="Jump to a section or action…"
			autocomplete="off"
			role="combobox"
			aria-expanded="true"
			aria-controls="jump-list"
		/>
		<ul class="jump-list" id="jump-list" role="listbox">
			{#each jumpMatches as j, i (j.href + j.label)}
				<li role="option" aria-selected={i === jumpIndex}>
					<button type="button" onclick={() => pick(j)} onmouseenter={() => (jumpIndex = i)}>
						{j.label}
						<span class="jump-kind">{j.kind}</span>
					</button>
				</li>
			{:else}
				<li class="jump-empty">Nothing matches “{jumpQuery}”.</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.admin-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 20px;
		margin-bottom: var(--ess-space-4);
	}

	.head-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.head-text .ess-page-title {
		margin: 0;
		text-wrap: balance;
	}

	.head-text .ess-page-sub {
		margin: 2px 0 0;
		max-width: 64ch;
	}

	.jump-btn {
		gap: 8px;
	}

	kbd {
		font-family: var(--ess-font-mono);
		font-size: 10.5px;
		padding: 1px 6px;
		border: 1px solid var(--ess-border-strong);
		border-bottom-width: 2px;
		border-radius: 5px;
		color: var(--ess-text-secondary);
	}

	/* Sticky under the page top, full bleed across .ess-main's gutter so the
	   frosted band reads as the page's own toolbar. */
	.admin-tabs {
		--gutter: var(--ess-page-pad-x);
		position: sticky;
		top: 0;
		z-index: 30;
		margin: 0 calc(-1 * var(--gutter));
		padding: 0 var(--gutter);
		background: color-mix(in oklab, var(--ess-canvas) 84%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--ess-border);
	}

	.tab-row {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab-row::-webkit-scrollbar {
		display: none;
	}

	.group-sep {
		flex-shrink: 0;
		width: 1px;
		margin: 12px 6px;
		background: var(--ess-border);
	}

	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 13px 12px;
		white-space: nowrap;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ess-text-secondary);
		text-decoration: none;
		transition: color var(--ess-t-fast);
	}

	.tab :global(svg) {
		opacity: 0.8;
		flex-shrink: 0;
	}

	.tab:hover {
		color: var(--ess-text);
	}

	.tab[aria-current='page'] {
		color: var(--ess-text);
	}

	.tab[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px;
		background: linear-gradient(90deg, var(--acc), var(--acc2));
	}

	.tab:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
		border-radius: var(--ess-radius-xs);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot[data-sev='bad'] {
		background: var(--ess-danger);
	}
	.dot[data-sev='warn'] {
		background: var(--ess-warning);
	}


	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.admin-body {
		display: grid;
		gap: var(--ess-space-5);
		padding-top: var(--ess-space-5);
		min-width: 0;
	}

	/* The pages were written as standalone screens and each sets its own top
	   spacing; inside the grid, gap does that job. */
	.admin-body > :global(*) {
		min-width: 0;
		margin-top: 0;
	}

	/* ---------- jump box ---------- */

	.jump-scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(4, 2, 12, 0.45);
	}

	.jump {
		position: fixed;
		z-index: 91;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(560px, calc(100vw - 32px));
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		box-shadow: var(--ess-elev-4);
		overflow: hidden;
	}

	.jump-input {
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--ess-border);
		background: transparent;
		padding: 16px 18px;
		font: inherit;
		font-size: 15px;
		color: var(--ess-text);
		outline: none;
	}

	.jump-list {
		list-style: none;
		margin: 0;
		padding: 6px;
		max-height: 340px;
		overflow-y: auto;
	}

	.jump-list button {
		display: flex;
		align-items: center;
		width: 100%;
		gap: 12px;
		padding: 9px 12px;
		border: 0;
		border-radius: var(--ess-radius-xs);
		background: transparent;
		font: inherit;
		color: var(--ess-text);
		text-align: left;
		cursor: pointer;
	}

	.jump-list li[aria-selected='true'] button {
		background: var(--ess-primary-soft);
	}

	.jump-kind {
		margin-left: auto;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}

	.jump-empty {
		padding: 10px 12px;
		color: var(--ess-text-muted);
		font-size: var(--ess-fs-caption);
	}

	@media (max-width: 720px) {
		.admin-tabs {
			--gutter: 16px;
		}
		.jump-btn kbd {
			display: none;
		}
	}
</style>
