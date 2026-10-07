<script lang="ts">
	import type { Snippet } from 'svelte';
	import { lockPageScroll } from '$lib/scroll-lock';

	/**
	 * A right-hand sheet over the page, for chat's thread, details, search and
	 * saved panels. Champ Hub has no permanent side column; these slide in when
	 * asked for and close with Esc or a click outside.
	 */
	let { label, onclose, children }: { label: string; onclose: () => void; children: Snippet } = $props();

	$effect(() => lockPageScroll());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="ess-scrim scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
	{@render children()}
</div>

<style>
	.scrim {
		z-index: 70;
	}
	.sheet {
		position: fixed;
		z-index: 71;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(420px, 100vw);
		display: flex;
		flex-direction: column;
		background: var(--ess-modal-bg);
		box-shadow: var(--ess-elev-4);
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	.sheet > :global(*) {
		flex: 1;
		min-height: 0;
	}
</style>
