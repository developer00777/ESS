<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { chat } from '$lib/chat/client.svelte';
	import { lockPageScroll } from '$lib/scroll-lock';

	/** Chat settings: pop-ups and push, sound, email digest, celebrations. */
	let { onclose }: { onclose: () => void } = $props();

	let prefs = $state({ emailDigest: true, sound: true, celebrations: true, push: true });
	let alerts = $state<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
	let saved = $state(false);

	$effect(() => {
		const unlock = lockPageScroll();
		void fetch('/api/chat/prefs').then(async (r) => {
			if (r.ok) prefs = { ...prefs, ...(await r.json()) };
		});
		return unlock;
	});

	async function save() {
		const r = await fetch('/api/chat/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs) });
		saved = r.ok;
		setTimeout(() => (saved = false), 2000);
	}

	async function enable() {
		alerts = await chat.enableAlerts();
		prefs.push = alerts === 'granted';
		await save();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="prefs-h">
	<header>
		<h2 id="prefs-h" class="ess-h3">Chat settings</h2>
		<button type="button" class="ess-icon-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
	</header>
	<div class="body">
		<div class="row">
			<div>
				<strong>Alerts on this device</strong>
				<p>Pop-ups for DMs and mentions, including when the portal is closed. They wait outside your shift hours.</p>
			</div>
			{#if alerts === 'granted'}
				<span class="ok">On</span>
			{:else if alerts === 'denied'}
				<span class="off">Blocked in the browser</span>
			{:else if alerts === 'unsupported'}
				<span class="off">Not supported here</span>
			{:else}
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={enable}>Turn on</button>
			{/if}
		</div>
		<label class="row">
			<span><strong>Sound</strong><p>A short chime for new DMs and mentions.</p></span>
			<input type="checkbox" bind:checked={prefs.sound} onchange={save} />
		</label>
		<label class="row">
			<span><strong>Email digest</strong><p>An email when DMs sit unread for 2 hours, or mentions for 4.</p></span>
			<input type="checkbox" bind:checked={prefs.emailDigest} onchange={save} />
		</label>
		<label class="row">
			<span><strong>Birthday and work-anniversary posts about me</strong><p>A short note in your team channel on the day.</p></span>
			<input type="checkbox" bind:checked={prefs.celebrations} onchange={save} />
		</label>
		<p class="foot">{saved ? 'Saved.' : 'Changes save as you make them.'} Messages are kept for six months, then deleted.</p>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(27, 31, 59, 0.42);
	}
	.dialog {
		position: fixed;
		z-index: 91;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(500px, calc(100vw - 24px));
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg);
		box-shadow: var(--ess-elev-4);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 12px 14px 20px;
		border-bottom: 1px solid var(--ess-border);
	}
	header h2 {
		margin: 0;
		font-family: var(--ess-font-display);
		font-size: 22px;
		font-weight: 600;
	}
	.body {
		padding: 6px 20px 16px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 14px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
		cursor: pointer;
	}
	.row strong {
		font-weight: 500;
	}
	.row p {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	.row input {
		width: 18px;
		height: 18px;
		accent-color: var(--ess-primary);
		flex-shrink: 0;
	}
	.ok {
		font-weight: 600;
		color: var(--ess-success);
		font-size: 13px;
	}
	.off {
		font-size: 13px;
		color: var(--ess-text-muted);
		text-align: right;
	}
	.foot {
		margin: 12px 0 0;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
</style>
