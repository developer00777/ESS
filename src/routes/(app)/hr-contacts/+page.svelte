<script lang="ts">
	import { goto } from '$app/navigation';
	import Mail from '@lucide/svelte/icons/mail';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Clock from '@lucide/svelte/icons/clock';
	import Search from '@lucide/svelte/icons/search';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Headset from '@lucide/svelte/icons/headset';
	import Avatar from '$lib/components/Avatar.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data } = $props();

	/*
		Only the job designation is shown. This used to fall back to the account's
		privilege level when no designation was on file, which published "Super
		Admin" or "Team Lead" to every employee who opened the page — a permissions
		setting standing in for a job title. A missing designation now shows
		nothing, which says less but says nothing wrong.
	*/

	let q = $state('');
	const needle = $derived(q.trim().toLowerCase());
	const contacts = $derived(
		needle
			? data.contacts.filter((c) => [c.fullName, c.designation, c.email, c.floorDetails, c.teamAndFloor].some((v) => (v ?? '').toLowerCase().includes(needle)))
			: data.contacts
	);
	const location = (c: (typeof data.contacts)[number]) => [c.floorDetails, c.teamAndFloor].filter(Boolean).join(' · ');

	let chatting = $state<string | null>(null);
	let chatError = $state('');

	/** Opens (or creates) the direct message with this person in Champ Hub. */
	async function chat(userId: string) {
		chatError = '';
		chatting = userId;
		try {
			const res = await fetch('/api/chat/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.ok) {
				chatError = body.message ?? 'Could not open a chat with this person right now.';
				return;
			}
			await goto(`/hub/c/${body.id}`);
		} catch {
			chatError = 'You seem to be offline. Try again in a moment.';
		} finally {
			chatting = null;
		}
	}
</script>

<svelte:head>
	<title>HR contacts — Champ HR</title>
</svelte:head>

<PageHeader crumb={[{ label: 'Today', href: '/dashboard' }, 'HR contacts']} title="The right person to help." sub="Find and contact the HR team for quick support." compact />

<div class="ess-split layout">
	<div class="ess-stack">
		<div class="ess-search">
			<Search size={18} />
			<input class="ess-input big" type="search" placeholder="Search by name, role or location" bind:value={q} aria-label="Search HR contacts" />
		</div>

		<section class="ess-card">
			<div class="head">
				<h2 class="ess-h2">Your HR team</h2>
				<p>Your manager and the HR team who handle leave, attendance records, logins and policy questions.</p>
			</div>
			{#if chatError}<p class="ess-error" role="alert">{chatError}</p>{/if}
			<div class="ess-rows">
				{#each contacts as contact (contact.id)}
					<div class="ess-row person">
						<Avatar userId={contact.id} fullName={contact.fullName} hasPicture={contact.hasPicture} size="lg" />
						<div class="ess-row__body">
							<span class="name">{contact.fullName}{#if contact.isManager}<span class="ess-badge ess-badge--accent tag">Your manager</span>{/if}</span>
							{#if contact.designation}<span class="role">{contact.designation}</span>{/if}
							<span class="line"><Mail size={14} /> <a href="mailto:{contact.email}">{contact.email}</a></span>
							{#if location(contact)}<span class="line"><MapPin size={14} /> {location(contact)}</span>{/if}
							{#if contact.officeTimings}<span class="line"><Clock size={14} /> {contact.officeTimings}</span>{/if}
						</div>
						<div class="ess-row__end actions">
							<a href="mailto:{contact.email}" class="ess-btn ess-btn--secondary"><Mail size={16} /> Email</a>
							<button type="button" class="ess-btn ess-btn--primary" onclick={() => chat(contact.id)} disabled={chatting === contact.id}>
								<MessageCircle size={16} /> {chatting === contact.id ? 'Opening…' : 'Chat'}
							</button>
						</div>
					</div>
				{:else}
					<div class="ess-empty">
						<span class="ess-empty__icon"><Headset size={22} /></span>
						<span class="ess-empty__title">{data.contacts.length === 0 ? 'No HR contacts on file yet' : 'No one matches that'}</span>
						<span>{data.contacts.length === 0 ? 'Your manager and HR team appear here once HR sets them up.' : 'Try a name, a role or an office.'}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<aside class="ess-stack">
		<section class="ess-card">
			<h2 class="ess-h2 aside-h">How to get help</h2>
			<p class="aside-sub">Follow these steps to reach the right person.</p>
			<ol class="steps">
				<li>
					<span class="num">1</span>
					<div><strong>Find your contact</strong><span>Search by name or role, or pick your manager for anything about your own team.</span></div>
				</li>
				<li>
					<span class="num">2</span>
					<div><strong>Check who handles what</strong><span>Leave, attendance corrections and logins go to HR; day-to-day questions go to your manager.</span></div>
				</li>
				<li>
					<span class="num">3</span>
					<div><strong>Start a conversation</strong><span>Use Email or Chat to get in touch directly. Chat opens in Champ Hub.</span></div>
				</li>
			</ol>
		</section>
		<section class="ess-card">
			<h2 class="ess-h2 aside-h">Before you ask</h2>
			<div class="ess-rows">
				<a class="ess-row" href="/policies?tab=leave"><span class="ess-row__body"><span class="ess-row__title">Leave policy</span><span class="ess-row__meta">Entitlements, carry-forward and documentation</span></span></a>
				<a class="ess-row" href="/attendance"><span class="ess-row__body"><span class="ess-row__title">Raise an attendance correction</span><span class="ess-row__meta">For a missing or wrong punch</span></span></a>
			</div>
		</section>
	</aside>
</div>

<style>
	.layout {
		--ess-aside-width: 380px;
	}
	.big {
		height: 54px;
		font-size: 16px;
		border-radius: var(--ess-radius-md);
	}
	.head {
		padding-bottom: 14px;
		border-bottom: 1px solid var(--ess-border);
		margin-bottom: 4px;
	}
	.head p {
		margin-top: 4px;
		font-size: 14.5px;
		color: var(--ess-text-secondary);
	}
	.person {
		align-items: flex-start;
		padding: 20px 0;
		gap: 18px;
	}
	.person .ess-row__body {
		gap: 4px;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
		color: var(--ess-text);
	}
	.tag {
		font-family: var(--ess-font-sans);
	}
	.role {
		font-size: 14.5px;
		color: var(--ess-text-secondary);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13.5px;
		color: var(--ess-text-secondary);
	}
	.line :global(svg) {
		color: var(--ess-text-muted);
	}
	.actions {
		align-self: center;
	}
	.aside-h {
		font-size: 20px;
	}
	.aside-sub {
		margin-top: 4px;
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	.steps {
		list-style: none;
		margin: 18px 0 0;
		padding: 0;
		display: grid;
	}
	.steps li {
		position: relative;
		display: flex;
		gap: 16px;
		padding-bottom: 22px;
	}
	.steps li:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 21px;
		top: 44px;
		bottom: 0;
		width: 2px;
		background: var(--ess-border);
	}
	.steps li:last-child {
		padding-bottom: 0;
	}
	.num {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
	}
	.steps div {
		display: grid;
		gap: 4px;
		padding-top: 6px;
	}
	.steps strong {
		font-family: var(--ess-font-display);
		font-size: 18px;
		font-weight: 600;
	}
	.steps span:not(.num) {
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	@media (max-width: 720px) {
		.person {
			flex-wrap: wrap;
		}
		.actions {
			width: 100%;
			margin-left: 0;
		}
		.actions .ess-btn {
			flex: 1;
		}
	}
</style>
