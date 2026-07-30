<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		label: string;
		value: string;
	}

	let { icon: Icon, label, value }: Props = $props();
</script>

<div class="stat-card">
	<div class="stat-icon">
		<Icon size={18} />
	</div>
	<div class="stat-label">{label}</div>
	<div class="stat-value">{value}</div>
</div>

<style>
	.stat-card {
		background: var(--color-panel);
		border-radius: var(--radius-md);
		padding: 1.1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stat-icon {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		background: var(--color-accent);
		color: var(--color-ink);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stat-label {
		font-size: 0.8rem;
		color: rgba(242, 248, 247, 0.7);
		font-weight: 500;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-text-inverse);
	}
</style>
