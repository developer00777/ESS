<script lang="ts">
	import { goto } from '$app/navigation';
	import X from '@lucide/svelte/icons/x';
	import { api, hub } from '$lib/hub/client.svelte';
	import { todayKey } from '$lib/hub/format';
	import { lockPageScroll } from '$lib/scroll-lock';

	/**
	 * Minutes from notes, for a meeting Zoom wrote no summary for, or one that
	 * wasn't on Zoom at all. Lines like "Karan will…" become action items to
	 * review, the same as Zoom's next steps.
	 */
	let { meetingId = null, topic: knownTopic = '', onclose }: { meetingId?: string | null; topic?: string; onclose: () => void } = $props();

	let topic = $state('');
	let date = $state(todayKey());
	let notes = $state('');
	let busy = $state(false);
	let err = $state('');

	$effect(() => lockPageScroll());

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		err = '';
		const r = await api<{ id: string; items: number }>('/api/meetings/notes', 'POST', { meetingId, topic, date, notes });
		busy = false;
		if (!r.ok) {
			err = r.message;
			return;
		}
		hub.say(r.items ? `Found ${r.items} action ${r.items === 1 ? 'item' : 'items'}. Check them, then publish.` : 'No action lines found. Add items by hand.');
		hub.changed(0);
		onclose();
		await goto(`/hub/meetings/${r.id}`);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ess-scrim scrim" role="presentation" onclick={onclose}></div>
<div class="ess-modal modal" role="dialog" aria-modal="true" aria-labelledby="paste-title">
	<div class="ess-modal__head">
		<h2 id="paste-title" class="ess-h2">{meetingId ? `Notes for ${knownTopic}` : 'Minutes from notes'}</h2>
		<button type="button" class="ess-icon-btn" onclick={onclose} aria-label="Close"><X size={16} /></button>
	</div>
	<form class="ess-modal__body body" onsubmit={save}>
		{#if !meetingId}
			<div class="grid">
				<div class="ess-field">
					<label class="ess-label" for="pn-topic">Meeting</label>
					<input id="pn-topic" class="ess-input" bind:value={topic} placeholder="Weekly ops sync" required />
				</div>
				<div class="ess-field">
					<label class="ess-label" for="pn-date">Date</label>
					<input id="pn-date" type="date" class="ess-input" bind:value={date} required />
				</div>
			</div>
		{/if}
		<div class="ess-field">
			<label class="ess-label" for="pn-notes">Notes</label>
			<textarea id="pn-notes" class="ess-textarea" rows="8" bind:value={notes} placeholder={'Karan will build the bounce-rate dashboard by Friday.\nPriya to review the Q4 learning plan.\nSomeone needs to update the tracker.'} required></textarea>
			<p class="ess-help">One action per line. "Name will …" or "Name to …" picks the owner; you can change everything before publishing.</p>
		</div>
		{#if err}<p class="ess-error">{err}</p>{/if}
		<div class="actions">
			<button type="button" class="ess-btn ess-btn--secondary" onclick={onclose}>Cancel</button>
			<button type="submit" class="ess-btn ess-btn--primary" disabled={busy || !notes.trim()}>Find action items</button>
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
		top: 10vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(600px, calc(100vw - 32px));
	}
	.body {
		display: grid;
		gap: 14px;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 10px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
