<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		size?: 'sm' | 'md' | 'lg';
		shape?: 'square' | 'circle';
		iconSize?: number;
	}

	let { icon: Icon, size = 'md', shape = 'square', iconSize }: Props = $props();

	const boxSize = $derived({ sm: 30, md: 36, lg: 40 }[size]);
</script>

<div
	class="icon-chip"
	class:circle={shape === 'circle'}
	style="width:{boxSize}px;height:{boxSize}px"
>
	<Icon size={iconSize ?? Math.round(boxSize * 0.5)} />
</div>

<style>
	.icon-chip {
		flex-shrink: 0;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-chip.circle {
		border-radius: 50%;
	}
</style>
