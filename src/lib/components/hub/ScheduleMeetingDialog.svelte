<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Avatar from '$lib/components/Avatar.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { todayKey } from '$lib/hub/format';
	import { lockPageScroll } from '$lib/scroll-lock';
	import type { AssignableGroups, PersonRef } from '$lib/tasks/types';

	/**
	 * Schedule a meeting. Anyone can. The people invited get a card in their
	 * ESS feed and join from Champ Hub; when it ends, its summary comes back to
	 * the person who scheduled it, to turn into tasks.
	 */
	let { meId, onclose }: { meId: string; onclose: () => void } = $props();

	let people = $state<PersonRef[]>([]);
	let topic = $state('');
	let date = $state(todayKey());
	let time = $state(nextSlot());
	let duration = $state(30);
	let agenda = $state('');
	let picked = $state<string[]>([]);
	type HostOption = { value: string; label: string; detail: string };
	let hosts = $state<HostOption[]>([]);
	let host = $state('self');
	let q = $state('');
	let busy = $state(false);
	let err = $state('');
	let topicEl = $state<HTMLInputElement | null>(null);

	/** The next half hour, in IST. */
	function nextSlot() {
		const ist = new Date(Date.now() + 330 * 60_000);
		let m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
		m = Math.min(Math.ceil((m + 5) / 30) * 30, 23 * 60 + 30);
		return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	}

	$effect(() => {
		const unlock = lockPageScroll();
		void fetch('/api/meetings/hosts').then(async (r) => {
			if (!r.ok) return;
			hosts = await r.json();
			if (hosts.length && !hosts.some((h) => h.value === host)) host = hosts[0].value;
		});
		void fetch('/api/tasks/assignable').then(async (r) => {
			if (!r.ok) return;
			const g: AssignableGroups = await r.json();
			people = [...g.direct, ...g.approval].filter((p) => p.id !== meId).sort((a, b) => a.fullName.localeCompare(b.fullName));
		});
		queueMicrotask(() => topicEl?.focus());
		return unlock;
	});

	const matches = $derived(q.trim() ? people.filter((p) => !picked.includes(p.id) && p.fullName.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []);
	const chosen = $derived(picked.map((id) => people.find((p) => p.id === id)).filter((p): p is PersonRef => !!p));

	function add(id: string) {
		if (!picked.includes(id)) picked = [...picked, id];
		q = '';
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		err = '';
		const r = await api<{ id: string }>('/api/meetings/schedule', 'POST', { topic, date, time, durationMin: duration, attendeeIds: picked, agenda, host });
		busy = false;
		if (!r.ok) {
			err = r.message;
			return;
		}
		hub.say(picked.length ? `Scheduled. ${picked.length} ${picked.length === 1 ? 'person was' : 'people were'} invited.` : 'Scheduled.');
		hub.changed(0);
		onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ess-scrim scrim" role="presentation" onclick={onclose}></div>
<div class="ess-modal modal" role="dialog" aria-modal="true" aria-labelledby="sched-title">
	<div class="ess-modal__head">
		<strong id="sched-title">Schedule a meeting</strong>
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={onclose} aria-label="Close"><X size={16} /></button>
	</div>
	<form class="ess-modal__body body" onsubmit={save}>
		<div class="ess-field">
			<label class="ess-label" for="sm-topic">Meeting</label>
			<input id="sm-topic" class="ess-input" bind:this={topicEl} bind:value={topic} maxlength="200" placeholder="Weekly ops sync" required />
		</div>
		<div class="grid">
			<div class="ess-field">
				<label class="ess-label" for="sm-date">Date</label>
				<input id="sm-date" type="date" class="ess-input" min={todayKey()} bind:value={date} required />
			</div>
			<div class="ess-field">
				<label class="ess-label" for="sm-time">Starts (IST)</label>
				<input id="sm-time" type="time" class="ess-input" step="300" bind:value={time} required />
			</div>
			<div class="ess-field">
				<label class="ess-label" for="sm-dur">Length</label>
				<select id="sm-dur" class="ess-select" bind:value={duration}>
					{#each [15, 30, 45, 60, 90, 120] as d (d)}<option value={d}>{d < 60 ? `${d} min` : `${d / 60} h${d % 60 ? ' 30' : ''}`}</option>{/each}
				</select>
			</div>
		</div>
		{#if hosts.length}
			<div class="ess-field">
				<label class="ess-label" for="sm-host">Host account</label>
				<select id="sm-host" class="ess-select" bind:value={host}>
					{#each hosts as h (h.value)}<option value={h.value}>{h.label} · {h.detail}</option>{/each}
				</select>
				<p class="ess-help">The call runs under this account. You start it as host either way.</p>
			</div>
		{/if}
		<div class="ess-field">
			<label class="ess-label" for="sm-people">Invite</label>
			{#if chosen.length}
				<div class="chosen">
					{#each chosen as p (p.id)}
						<span class="pill"><Avatar userId={p.id} fullName={p.fullName} size="sm" /> {p.fullName}<button type="button" aria-label="Remove {p.fullName}" onclick={() => (picked = picked.filter((x) => x !== p.id))}><X size={12} /></button></span>
					{/each}
				</div>
			{/if}
			<input
				id="sm-people"
				class="ess-input"
				bind:value={q}
				placeholder="Type a name"
				autocomplete="off"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (matches[0]) add(matches[0].id);
					}
				}}
			/>
			{#if matches.length}
				<ul class="matches" role="listbox" aria-label="People">
					{#each matches as p (p.id)}
						<li><button type="button" onclick={() => add(p.id)}><Avatar userId={p.id} fullName={p.fullName} size="sm" /> {p.fullName}</button></li>
					{/each}
				</ul>
			{/if}
		</div>
		<div class="ess-field">
			<label class="ess-label" for="sm-agenda">Agenda (optional)</label>
			<textarea id="sm-agenda" class="ess-textarea" rows="3" bind:value={agenda} placeholder="What you want to cover"></textarea>
		</div>
		<p class="ess-help">Everyone invited gets it in their ESS feed and joins from Champ Hub. After the meeting, its summary comes back to you to turn into tasks.</p>
		{#if err}<p class="ess-error">{err}</p>{/if}
		<div class="actions">
			<button type="button" class="ess-btn ess-btn--ghost" onclick={onclose}>Cancel</button>
			<button type="submit" class="ess-btn ess-btn--primary" disabled={busy || !topic.trim()}>{busy ? 'Scheduling…' : 'Schedule'}</button>
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
		top: 8vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(600px, calc(100vw - 32px));
		max-height: 86vh;
		overflow-y: auto;
	}
	.body {
		display: grid;
		gap: 14px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		gap: 10px;
	}
	.chosen {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 6px 3px 4px;
		border-radius: 99px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-size: 12.5px;
		font-weight: 600;
	}
	.pill button {
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		display: grid;
		place-items: center;
		padding: 2px;
		border-radius: 50%;
	}
	.matches {
		list-style: none;
		margin: 0;
		padding: 4px;
		border: 1px solid var(--ess-border);
		border-radius: 10px;
		background: var(--ess-modal-bg);
		display: grid;
		gap: 2px;
	}
	.matches button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: 0;
		background: transparent;
		padding: 6px 8px;
		border-radius: 8px;
		font: inherit;
		font-size: 13px;
		color: var(--ess-text);
		cursor: pointer;
		text-align: left;
	}
	.matches button:hover {
		background: var(--ess-primary-soft);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
