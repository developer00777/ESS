<script lang="ts">
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
			<div class="ess-tl-dot">{state === 'done' ? '✓' : i + 1}</div>
			<div>
				<div class="ess-tl-label">{step.label}</div>
				{#if step.description}
					<div class="ess-tl-meta">{step.description}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
