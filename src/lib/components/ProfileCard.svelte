<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import IconChip from './IconChip.svelte';

	interface Props {
		icon: Component;
		title: string;
		children: Snippet;
	}

	let { icon, title, children }: Props = $props();
</script>

<div class="profile-card">
	<IconChip {icon} size="sm" />
	<h3>{title}</h3>
	<div class="card-body">
		{@render children()}
	</div>
</div>

<style>
	.profile-card {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 100%;
	}

	h3 {
		font-size: var(--ess-fs-h3);
		font-weight: 700;
		color: var(--ess-text);
	}

	.card-body {
		font-size: var(--ess-fs-body);
		color: var(--ess-text-secondary);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
