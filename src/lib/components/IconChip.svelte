<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		size?: 'sm' | 'md' | 'lg';
		shape?: 'square' | 'circle';
		iconSize?: number;
		tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'pink';
	}

	let { icon: Icon, size = 'md', shape = 'square', iconSize, tone = 'accent' }: Props = $props();

	const boxSize = $derived({ sm: 32, md: 40, lg: 48 }[size]);
</script>

<div
	class="ess-tile icon-chip"
	class:ess-tile--round={shape === 'circle'}
	class:ess-tile--ok={tone === 'ok'}
	class:ess-tile--warn={tone === 'warn'}
	class:ess-tile--bad={tone === 'bad'}
	class:ess-tile--info={tone === 'info'}
	class:ess-tile--neutral={tone === 'neutral'}
	class:ess-tile--pink={tone === 'pink'}
	style="width:{boxSize}px;height:{boxSize}px"
>
	<Icon size={iconSize ?? Math.round(boxSize * 0.46)} strokeWidth={1.75} />
</div>

<style>
	.icon-chip {
		border-radius: var(--ess-radius-sm);
	}
	.icon-chip.ess-tile--round {
		border-radius: 50%;
	}
</style>
