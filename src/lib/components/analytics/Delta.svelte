<script lang="ts">
	/**
	 * Change against the previous period: an arrow, the signed amount and
	 * what it's compared with. Green or red says whether the move is good,
	 * which depends on the measure (more engagement is good, more absence
	 * isn't) — always with the arrow and words, never colour alone.
	 */
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Minus from '@lucide/svelte/icons/minus';

	interface Props {
		value: number | null;
		unit?: string;
		/** "pts" for a score, "%" reads as percentage points. */
		vs: string;
		upIsGood?: boolean;
	}

	let { value, unit = '', vs, upIsGood = true }: Props = $props();
	const flat = $derived(value === null || Math.abs(value) < 0.05);
	const good = $derived(!flat && (value! > 0) === upIsGood);
	const text = $derived(value === null ? '' : `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`);
</script>

{#if value !== null}
	<span class="delta" class:good class:bad={!flat && !good} class:flat>
		{#if flat}<Minus size={12} />{:else if value > 0}<ArrowUp size={12} />{:else}<ArrowDown size={12} />{/if}
		<b>{flat ? 'No change' : text}</b>
		<span>vs {vs}</span>
	</span>
{/if}

<style>
	.delta {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	b {
		font-weight: 650;
	}
	.good b,
	.good :global(svg) {
		color: var(--ess-success);
	}
	.bad b,
	.bad :global(svg) {
		color: var(--ess-danger);
	}
</style>
