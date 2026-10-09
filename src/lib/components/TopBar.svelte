<script lang="ts">
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import User from '@lucide/svelte/icons/user';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Avatar from './Avatar.svelte';
	import { hub } from '$lib/hub/client.svelte';

	/**
	 * The slim bar above every page: search, the notification bell and the
	 * signed-in person. The person's menu holds profile, password, theme and
	 * sign-out, which the mockups' sidebar no longer carries.
	 */
	interface Props {
		fullName: string;
		userId: string;
		hasPicture?: boolean;
		pictureVersion?: number | null;
		/** What the person is here as, under their name ("Employee", "Administrator"). */
		roleLabel: string;
		/** Unread announcements; the bell shows a dot when there are any. */
		notifications?: { count: number; urgent: boolean };
	}

	let { fullName, userId, hasPicture = false, pictureVersion, roleLabel, notifications = { count: 0, urgent: false } }: Props = $props();

	let menuOpen = $state(false);
	let theme = $state<'light' | 'dark'>('light');

	$effect(() => {
		theme = document.documentElement.getAttribute('data-ess-theme') === 'dark' ? 'dark' : 'light';
	});

	function setTheme(next: 'light' | 'dark') {
		theme = next;
		if (next === 'dark') document.documentElement.setAttribute('data-ess-theme', 'dark');
		else document.documentElement.removeAttribute('data-ess-theme');
		localStorage.setItem('essTheme', next);
	}

	async function openSearch() {
		// Search lives in Champ Hub's command palette; open it wherever we are.
		if (location.pathname.startsWith('/hub')) hub.paletteOpen = true;
		else {
			await goto('/hub');
			hub.paletteOpen = true;
		}
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && !(e.target as HTMLElement).closest('.me')) menuOpen = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="topbar">
	<button type="button" class="ess-icon-btn" onclick={openSearch} aria-label="Search or ask Champ" title="Search (Ctrl K)">
		<Search size={19} strokeWidth={1.75} />
	</button>
	<a href="/chat?c=announcements" class="ess-icon-btn bell" aria-label={notifications.count ? `${notifications.count} unread announcement${notifications.count === 1 ? '' : 's'}` : 'Announcements'} title="Announcements">
		<Bell size={19} strokeWidth={1.75} />
		{#if notifications.count > 0}<span class="dot" class:urgent={notifications.urgent}></span>{/if}
	</a>
	<span class="divider" aria-hidden="true"></span>
	<div class="me">
		<button type="button" class="me-btn" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
			<Avatar {userId} {fullName} {hasPicture} size="md" version={pictureVersion ?? undefined} />
			<span class="me-text">
				<strong>{fullName}</strong>
				<span>{roleLabel}</span>
			</span>
			<ChevronDown size={16} class="chev" />
		</button>
		{#if menuOpen}
			<div class="menu" role="menu">
				<a role="menuitem" href="/profile" onclick={() => (menuOpen = false)}><User size={15} /> My profile</a>
				<a role="menuitem" href="/change-password" onclick={() => (menuOpen = false)}><KeyRound size={15} /> Change password</a>
				<div class="menu-sep"></div>
				<div class="theme" role="group" aria-label="Appearance">
					<button type="button" aria-pressed={theme === 'light'} onclick={() => setTheme('light')}><Sun size={14} /> Light</button>
					<button type="button" aria-pressed={theme === 'dark'} onclick={() => setTheme('dark')}><Moon size={14} /> Dark</button>
				</div>
				<div class="menu-sep"></div>
				<form method="POST" action="/logout">
					<button type="submit" role="menuitem" class="logout"><LogOut size={15} /> Log out</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding: 12px var(--ess-page-pad-x) 0;
		min-height: 56px;
	}

	.bell {
		position: relative;
	}
	.dot {
		position: absolute;
		top: 7px;
		right: 8px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ess-primary);
		box-shadow: 0 0 0 2px var(--ess-canvas);
	}
	.dot.urgent {
		background: var(--ess-danger);
	}

	.divider {
		width: 1px;
		height: 24px;
		background: var(--ess-border);
		margin: 0 8px;
	}

	.me {
		position: relative;
	}

	.me-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 6px 4px 4px;
		border: 1px solid transparent;
		border-radius: var(--ess-radius-md);
		background: transparent;
		color: var(--ess-text);
		cursor: pointer;
		text-align: left;
		transition: background var(--ess-t-fast);
	}
	.me-btn:hover,
	.me-btn[aria-expanded='true'] {
		background: var(--ess-surface-hover);
	}
	.me-btn :global(.chev) {
		color: var(--ess-text-muted);
		margin-left: 6px;
	}

	.me-text {
		display: grid;
		line-height: 1.2;
		min-width: 0;
	}
	.me-text strong {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 180px;
	}
	.me-text span {
		font-size: 12px;
		color: var(--ess-text-muted);
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 80;
		min-width: 220px;
		padding: 6px;
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		box-shadow: var(--ess-elev-3);
		display: grid;
		gap: 2px;
	}
	.menu a,
	.menu .logout {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: none;
		border-radius: var(--ess-radius-sm);
		background: transparent;
		color: var(--ess-text);
		font: inherit;
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
	}
	.menu a:hover,
	.menu .logout:hover {
		background: var(--ess-surface-hover);
	}
	.menu .logout:hover {
		color: var(--ess-danger);
	}
	.menu-sep {
		height: 1px;
		background: var(--ess-border);
		margin: 4px 0;
	}
	.theme {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-sm);
	}
	.theme button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--ess-text-secondary);
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.theme button[aria-pressed='true'] {
		background: var(--ess-surface);
		color: var(--ess-primary-text);
		box-shadow: var(--ess-elev-1);
	}

	@media (max-width: 720px) {
		.topbar {
			padding: 10px 16px 0;
		}
		.me-text {
			display: none;
		}
	}
</style>
