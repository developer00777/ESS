<script lang="ts">
	import type { Component } from 'svelte';
	import IconChip from './IconChip.svelte';

	interface Props {
		icon: Component;
		label: string;
		value: string;
	}

	let { icon, label, value }: Props = $props();
</script>

<div class="stat-card">
	<IconChip {icon} size="sm" />
	<div class="stat-label">{label}</div>
	<div class="stat-value">{value}</div>
</div>

<style>
	.stat-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.stat-label {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-text-secondary);
		margin-top: 4px;
	}

	.stat-value {
		font-family: var(--ess-font-display);
		font-size: var(--ess-fs-stat);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
</style>
