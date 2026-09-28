<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	/**
	 * The same three steps on every admin upload — choose a file, review what
	 * will change, apply. Biometric, Leave Balances and Policies each had their
	 * own wording and layout for one flow; this is the shared signpost.
	 *
	 * `current` is the step in progress (0-based). Setting it past the last
	 * step marks them all done.
	 */
	let { steps, current }: { steps: [string, string, string]; current: number } = $props();
</script>

<ol class="steps" aria-label="Progress">
	{#each steps as label, i (label)}
		<li
			class="step"
			data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
			aria-current={i === current ? 'step' : undefined}
		>
			<span class="dot">
				{#if i < current}<Check size={12} strokeWidth={3} />{:else}{i + 1}{/if}
			</span>
			{label}
		</li>
	{/each}
</ol>

<style>
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0 0 var(--ess-space-4);
		padding: 0;
	}

	.step {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px 5px 5px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		color: var(--ess-text-muted);
	}

	.dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		border: 1px solid var(--ess-border-strong);
		background: var(--ess-surface);
	}

	.step[data-state='current'] {
		color: var(--ess-text);
		background: var(--ess-primary-soft);
	}
	.step[data-state='current'] .dot {
		background: var(--ess-primary);
		border-color: transparent;
		color: var(--ess-text-on-primary);
	}

	.step[data-state='done'] {
		color: var(--ess-success);
	}
	.step[data-state='done'] .dot {
		background: var(--ess-success);
		border-color: transparent;
		color: #fff;
	}
</style>
