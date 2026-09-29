<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Avatar from '$lib/components/Avatar.svelte';
	import { lockPageScroll } from '$lib/scroll-lock';

	/**
	 * Start a DM or group, create a channel, or browse and join public ones.
	 * The people list is already filtered to who you may message (your team,
	 * manager and HR for employees; everyone for those who may message anyone).
	 */
	let {
		scope,
		onopen,
		onclose
	}: {
		scope: 'anywhere' | 'team' | 'none';
		onopen: (channelId: string) => void;
		onclose: () => void;
	} = $props();

	type Person = { id: string; fullName: string; role: string };
	let tab = $state<'message' | 'channel' | 'browse'>('message');
	let people = $state<Person[]>([]);
	let q = $state('');
	let picked = $state<string[]>([]);
	let name = $state('');
	let topic = $state('');
	let isPrivate = $state(false);
	let browse = $state<{ id: string; name: string; topic: string; members: number }[]>([]);
	let err = $state('');
	let busy = $state(false);

	$effect(() => {
		const unlock = lockPageScroll();
		void fetch('/api/chat/people').then(async (r) => (people = r.ok ? await r.json() : []));
		void fetch('/api/chat/browse').then(async (r) => (browse = r.ok ? await r.json() : []));
		return unlock;
	});

	const shown = $derived(people.filter((p) => p.fullName.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60));

	async function post(path: string, body: unknown) {
		busy = true;
		err = '';
		try {
			const r = await fetch(`/api/chat/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			const data = await r.json().catch(() => ({}));
			if (!r.ok) {
				err = data.message ?? 'That did not work';
				return null;
			}
			return data;
		} finally {
			busy = false;
		}
	}

	async function start() {
		const r = picked.length === 1 ? await post('dm', { userId: picked[0] }) : await post('groups', { memberIds: picked });
		if (r?.id) onopen(r.id);
	}

	async function create() {
		const r = await post('channels', { name, topic, isPrivate, memberIds: picked });
		if (r?.id) onopen(r.id);
	}

	function toggle(id: string) {
		picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="New conversation">
	<header>
		<div class="tabs" role="tablist">
			<button type="button" role="tab" aria-selected={tab === 'message'} onclick={() => (tab = 'message')}>Message people</button>
			{#if scope !== 'none'}<button type="button" role="tab" aria-selected={tab === 'channel'} onclick={() => (tab = 'channel')}>New channel</button>{/if}
			<button type="button" role="tab" aria-selected={tab === 'browse'} onclick={() => (tab = 'browse')}>Browse channels</button>
		</div>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={onclose} aria-label="Close"><X size={16} /></button>
	</header>
	<div class="body">
		{#if err}<p class="err" role="alert">{err}</p>{/if}
		{#if tab === 'browse'}
			{#each browse as c (c.id)}
				<div class="chan">
					<span><strong>#{c.name}</strong><small>{c.topic || 'No topic'} · {c.members} members</small></span>
					<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy} onclick={async () => { if (await post(`channels/${c.id}/join`, {})) onopen(c.id); }}>Join</button>
				</div>
			{:else}
				<p class="note">No public channels to join right now. Team and shift channels you belong to are already in your sidebar.</p>
			{/each}
		{:else}
			{#if tab === 'channel'}
				<div class="fields">
					<label class="ess-field">
						<span class="ess-label">Channel name</span>
						<input class="ess-input" bind:value={name} maxlength="40" placeholder="q3-healthcare-refresh" />
					</label>
					<label class="ess-field">
						<span class="ess-label">What it is for (optional)</span>
						<input class="ess-input" bind:value={topic} maxlength="200" />
					</label>
					<label class="check"><input type="checkbox" bind:checked={isPrivate} /> Private: only people added can see it</label>
					{#if scope === 'team'}<p class="note">As a Team Lead you create channels for your own team.</p>{/if}
				</div>
				<span class="ess-label">Add people (optional)</span>
			{/if}
			<input class="ess-input" bind:value={q} placeholder="Search people" aria-label="Search people" />
			<ul class="people">
				{#each shown as p (p.id)}
					<li>
						<label class:on={picked.includes(p.id)}>
							<input type="checkbox" checked={picked.includes(p.id)} onchange={() => toggle(p.id)} />
							<Avatar userId={p.id} fullName={p.fullName} size="sm" />
							<span>{p.fullName}</span>
						</label>
					</li>
				{:else}
					<p class="note">Nobody matches. Employees can message their team, their manager and HR.</p>
				{/each}
			</ul>
		{/if}
	</div>
	{#if tab !== 'browse'}
		<footer>
			<span class="note">{picked.length} selected</span>
			{#if tab === 'message'}
				<button type="button" class="ess-btn ess-btn--primary" disabled={busy || picked.length === 0} onclick={start}>
					{picked.length > 1 ? 'Start group' : 'Start chat'}
				</button>
			{:else}
				<button type="button" class="ess-btn ess-btn--primary" disabled={busy || !name.trim()} onclick={create}>Create channel</button>
			{/if}
		</footer>
	{/if}
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(4, 2, 12, 0.5);
	}
	.dialog {
		position: fixed;
		z-index: 91;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(520px, calc(100vw - 24px));
		max-height: min(640px, calc(100vh - 40px));
		display: flex;
		flex-direction: column;
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-lg);
		box-shadow: var(--ess-elev-4);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 10px 0;
		border-bottom: 1px solid var(--ess-border);
	}
	.tabs {
		display: flex;
		gap: 2px;
		overflow-x: auto;
	}
	.tabs button {
		border: 0;
		background: none;
		padding: 10px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--ess-text-secondary);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}
	.tabs button[aria-selected='true'] {
		color: var(--ess-text);
		border-bottom-color: var(--ess-primary);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 14px;
		display: grid;
		gap: 10px;
		align-content: start;
	}
	.fields {
		display: grid;
		gap: 10px;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 13px;
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.people label {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 13.5px;
	}
	.people label:hover,
	.people label.on {
		background: var(--ess-primary-soft);
	}
	.people input {
		accent-color: var(--ess-primary);
	}
	.chan {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--ess-border);
		border-radius: 10px;
	}
	.chan span {
		display: grid;
	}
	.chan small {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		border-top: 1px solid var(--ess-border);
	}
	.note {
		margin: 0;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.err {
		margin: 0;
		font-size: 13px;
		color: var(--ess-danger);
	}
</style>
