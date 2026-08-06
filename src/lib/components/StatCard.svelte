<script lang="ts">
	import type { Component } from 'svelte';
	import IconChip from './IconChip.svelte';

	interface Props {
		icon: Component;
		label: string;
		value: string;
		/** Caption under the value, e.g. "this month · 21 of 22 days". */
		meta?: string;
		/**
		 * Sparkline bar heights as percentages (0-100). Omit to hide the chart.
		 * Purely indicative trend, per the Cosmic KPI card spec.
		 */
		spark?: number[];
		/** Tints the value with the accent colour, for the headline metric. */
		accent?: boolean;
	}

	let { icon, label, value, meta, spark, accent = false }: Props = $props();
</script>

<div class="stat-card">
	<IconChip {icon} size="sm" />
	<div class="stat-label">{label}</div>
	<div class="stat-value" class:accent>{value}</div>
	{#if spark && spark.length > 0}
		<div class="spark" aria-hidden="true">
			{#each spark as h, i (i)}
				<span style="height:{Math.max(0, Math.min(100, h))}%"></span>
			{/each}
		</div>
	{/if}
	{#if meta}
		<div class="stat-meta">{meta}</div>
	{/if}
</div>

<style>
	.stat-card {
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
		border-radius: var(--ess-radius-md);
		box-shadow: var(--ess-glass-shadow);
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition:
			transform var(--ess-t),
			box-shadow var(--ess-t),
			border-color var(--ess-t);
	}

	.stat-card:hover {
		transform: translate3d(0, -4px, 0);
		border-color: rgba(255, 255, 255, 0.22);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.26),
			0 34px 64px -30px #000,
			0 0 0 1px var(--ring),
			0 0 40px -14px var(--glow);
	}

	.stat-label {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.82);
		margin-top: 4px;
	}

	/* Light (Opal): white label/shadow → ink; keep dark (Onyx) as above. */
	:global(:root:not([data-ess-theme='dark'])) .stat-label {
		color: rgba(20, 18, 35, 0.62);
	}
	:global(:root:not([data-ess-theme='dark'])) .stat-value {
		text-shadow: 0 2px 18px rgba(30, 24, 55, 0.12);
	}
	:global(:root:not([data-ess-theme='dark'])) .stat-card:hover {
		border-color: rgba(20, 18, 35, 0.16);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 34px 64px -34px rgba(30, 24, 55, 0.28),
			0 0 0 1px var(--ring),
			0 0 40px -18px var(--glow);
	}

	.stat-value {
		font-family: var(--ess-font-display);
		font-size: var(--ess-fs-stat);
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.05;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
		text-shadow: 0 2px 24px rgba(0, 0, 0, 0.55);
	}

	.stat-value.accent {
		color: color-mix(in oklab, var(--acc) 72%, #fff);
	}

	/* Sparkline — indicative trend bars, per the Cosmic KPI spec. */
	.spark {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 22px;
	}

	.spark span {
		flex: 1;
		border-radius: 2px;
		background: linear-gradient(
			180deg,
			var(--acc),
			color-mix(in oklab, var(--acc) 20%, transparent)
		);
	}

	.stat-meta {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		margin-top: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.stat-card:hover {
			transform: none;
		}
	}
</style>
