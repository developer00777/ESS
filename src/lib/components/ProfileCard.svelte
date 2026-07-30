<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		icon: Component;
		title: string;
		children: Snippet;
	}

	let { icon: Icon, title, children }: Props = $props();
</script>

<div class="profile-card">
	<div class="card-icon">
		<Icon size={18} />
	</div>
	<h3>{title}</h3>
	<div class="card-body">
		{@render children()}
	</div>
</div>

<style>
	.profile-card {
		background: var(--color-mint);
		border-radius: var(--radius-md);
		padding: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 100%;
	}

	.card-icon {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		background: var(--color-white);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	h3 {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.card-body {
		font-size: 0.85rem;
		color: var(--color-text-soft);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
</style>
