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

<div class="tracker">
	{#each steps as step, i (step.label)}
		<div class="step" class:done={i <= currentIndex}>
			<div class="step-row">
				<div class="step-num">{i + 1}</div>
				<div class="step-text">
					<strong>{step.label}</strong>
					{#if step.description}
						<span>{step.description}</span>
					{/if}
				</div>
			</div>
			{#if i < steps.length - 1}
				<div class="connector"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.tracker {
		display: flex;
		flex-direction: column;
	}

	.step-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: var(--color-mint);
		border-radius: var(--radius-md);
		padding: 0.9rem 1.1rem;
	}

	.step.done .step-row {
		background: var(--color-primary);
	}

	.step.done .step-text strong,
	.step.done .step-text span {
		color: var(--color-white);
	}

	.step-num {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--color-white);
		color: var(--color-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.85rem;
	}

	.step-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.step-text strong {
		font-size: 0.92rem;
		color: var(--color-ink);
	}

	.step-text span {
		font-size: 0.78rem;
		color: var(--color-text-soft);
	}

	.connector {
		width: 3px;
		height: 1rem;
		background: var(--color-muted);
		margin-left: 1.6rem;
		border-radius: 2px;
	}
</style>
