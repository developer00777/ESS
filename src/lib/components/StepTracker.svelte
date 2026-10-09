<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	interface Step {
		label: string;
		description?: string;
	}

	interface Props {
		steps: Step[];
		currentIndex: number;
	}

	let { steps, currentIndex }: Props = $props();
</script>

<div class="ess-timeline">
	{#each steps as step, i (step.label)}
		{@const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending'}
		<div class="ess-tl-step" data-state={state}>
			<div class="ess-tl-dot">
				{#if state === 'done'}<Check size={12} strokeWidth={3} />{:else}{i + 1}{/if}
			</div>
			<div>
				<div class="ess-tl-label">{step.label}</div>
				{#if step.description}
					<div class="ess-tl-meta">{step.description}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
