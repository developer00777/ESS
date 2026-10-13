<script lang="ts">
	/**
	 * Champ, the portal's assistant, on the dashboard. Asking here opens the
	 * Champ conversation in Champ Hub with the question already sent — the
	 * same hand-off the command palette's "Ask Champ" uses — so the answer,
	 * any drafted actions and the history all live in one place.
	 */
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import { goto } from '$app/navigation';

	let {
		firstName,
		champ
	}: {
		firstName: string;
		champ: { configured: boolean; team: boolean };
	} = $props();

	// The same suggestions Champ's own panel offers, trimmed to fit.
	const suggestions = $derived.by(() => {
		const s = ['How much leave do I have?', 'When is the next holiday?'];
		if (champ.team) s.push('Who in my team is out today?');
		else s.push('Show my attendance this month');
		return s;
	});

	let question = $state('');

	function ask(q: string) {
		const text = q.trim();
		if (!text || !champ.configured) return;
		void goto(`/hub/c/champ?ask=${encodeURIComponent(text)}`);
	}
</script>

<section class="ess-card panel" aria-labelledby="champ-card-h">
	<div class="orb" aria-hidden="true"></div>
	<div class="intro">
		<h2 id="champ-card-h">Hi {firstName}, I'm Champ</h2>
		<p>Ask about leave, attendance, holidays or policy. Answers come from ESS records only.</p>
	</div>

	{#if champ.configured}
		<div class="chips">
			{#each suggestions as s (s)}
				<button type="button" class="chip" onclick={() => ask(s)}>{s}</button>
			{/each}
		</div>
		<form
			class="ask"
			onsubmit={(e) => {
				e.preventDefault();
				ask(question);
			}}
		>
			<label class="ess-sr-only" for="champ-q">Ask Champ</label>
			<input id="champ-q" type="text" placeholder="Ask Champ anything…" bind:value={question} maxlength="500" autocomplete="off" />
			<button type="submit" class="send" disabled={!question.trim()} aria-label="Send to Champ"><ArrowUp size={16} strokeWidth={2.4} /></button>
		</form>
	{:else}
		<p class="off">Champ isn't switched on for this portal yet. An administrator can enable it.</p>
	{/if}
</section>

<style>
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		overflow: hidden;
		padding: 16px 18px;
		background:
			radial-gradient(120% 70% at 50% -10%, var(--ess-primary-soft), transparent 60%),
			var(--ess-surface);
	}

	.orb {
		width: 52px;
		height: 52px;
		flex-shrink: 0;
		border-radius: 50%;
		background:
			radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0) 32%),
			radial-gradient(circle at 70% 75%, var(--acc-soft), transparent 55%),
			radial-gradient(circle at 50% 50%, var(--ess-primary), #1b2490);
		box-shadow:
			0 10px 24px -8px rgba(47, 67, 230, 0.55),
			inset 0 -4px 10px rgba(10, 14, 60, 0.35);
		animation: breathe 6s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			transform: scale(1.05);
		}
	}

	.intro h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.intro p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--ess-text-muted);
		line-height: 1.4;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		height: 28px;
		padding: 0 11px;
		border: 1px solid var(--ess-border);
		border-radius: 999px;
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip:hover {
		color: var(--ess-primary-text);
		border-color: var(--ess-primary-ring);
	}

	.ask {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: auto;
		height: 42px;
		padding: 0 5px 0 14px;
		border-radius: 999px;
		background: var(--ess-sunken);
		border: 1px solid transparent;
		transition: border-color var(--ess-t-fast);
	}
	.ask:focus-within {
		border-color: var(--ess-primary-ring);
		background: var(--ess-surface);
	}
	.ask input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: 13px;
		color: var(--ess-text);
		outline: none;
	}
	.send {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 50%;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		cursor: pointer;
		box-shadow: var(--ess-primary-shadow);
	}
	.send:disabled {
		background: var(--ess-border-strong);
		box-shadow: none;
		cursor: default;
	}
	.off {
		margin: auto 0 0;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}

	@media (min-width: 721px) and (max-height: 820px) {
		.orb {
			width: 38px;
			height: 38px;
		}
	}

	/* Short laptop screens (about 1280×580): tighter so the dashboard fits. */
	@media (min-width: 721px) and (max-height: 760px) {
		.panel {
			padding: 10px 14px;
			gap: 8px;
		}
		.orb {
			display: none;
		}
		.chip {
			height: 24px;
			padding: 0 9px;
		}
		.ask {
			height: 34px;
		}
		.send {
			width: 26px;
			height: 26px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.orb {
			animation: none;
		}
	}
</style>
