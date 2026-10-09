<script lang="ts">
	import type { Component } from 'svelte';

	/**
	 * A metric card: icon tile on the left, label, serif figure, caption.
	 * Matches the "Today's check-in · 09:02" cards in the Timeline mockups.
	 */
	interface Props {
		icon: Component;
		label: string;
		value: string;
		/** Caption under the value, e.g. "this month · 21 of 22 days". */
		meta?: string;
		/** Sparkline bar heights as percentages (0-100). Omit to hide the chart. */
		spark?: number[];
		/** Tints the value with the accent colour, for the headline metric. */
		accent?: boolean;
		/** Tile colour. */
		tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
	}

	let { icon: Icon, label, value, meta, spark, accent = false, tone = 'accent' }: Props = $props();
</script>

<div class="ess-metric">
	<span class="ess-tile" class:ess-tile--ok={tone === 'ok'} class:ess-tile--warn={tone === 'warn'} class:ess-tile--bad={tone === 'bad'} class:ess-tile--info={tone === 'info'} class:ess-tile--neutral={tone === 'neutral'}>
		<Icon size={20} strokeWidth={1.75} />
	</span>
	<div class="ess-metric__body">
		<span class="ess-metric__label">{label}</span>
		<span class="ess-metric__value" class:accent>{value}</span>
		{#if spark && spark.length > 0}
			<div class="spark" aria-hidden="true">
				{#each spark as h, i (i)}
					<span style="height:{Math.max(8, Math.min(100, h))}%"></span>
				{/each}
			</div>
		{/if}
		{#if meta}
			<span class="ess-metric__meta">{meta}</span>
		{/if}
	</div>
</div>

<style>
	.accent {
		color: var(--ess-primary-text);
	}

	/* Sparkline — indicative trend bars. */
	.spark {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 20px;
		width: 96px;
		margin: 4px 0 2px;
	}

	.spark span {
		flex: 1;
		border-radius: 2px;
		background: var(--ess-primary);
		opacity: 0.75;
	}
</style>
