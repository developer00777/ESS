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
<div class="ess-drawer sheet" role="dialog" aria-modal="true" aria-label={label}>
	{@render children()}
</div>

<style>
	.scrim {
		z-index: 70;
	}
	.sheet {
		z-index: 71;
		width: min(500px, 100vw);
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		animation: slide var(--ess-t) both;
	}
	.sheet > :global(*) {
		flex: 1;
		min-height: 0;
	}
	@keyframes slide {
		from {
			transform: translateX(16px);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet {
			animation: none;
		}
	}
</style>
