<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	/**
	 * The same three steps on every admin upload — choose a file, review what
	 * will change, apply. Biometric, Leave Balances and Policies each had their
	 * own wording and layout for one flow; this is the shared signpost.
	 *
	 * `current` is the step in progress (0-based). Setting it past the last
	 * step marks them all done. `hints` adds a quiet line under each label.
	 */
	let { steps, current, hints }: { steps: [string, string, string]; current: number; hints?: [string, string, string] } = $props();
</script>

<ol class="ess-stepper ess-stepper--center steps" aria-label="Progress">
	{#each steps as label, i (label)}
		<li class="ess-step" data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
			<span class="ess-step__dot">
				{#if i < current}<Check size={12} strokeWidth={3} />{:else if i !== current}{i + 1}{/if}
			</span>
			<span class="ess-step__label">{label}</span>
			{#if hints}<span class="ess-step__meta">{hints[i]}</span>{/if}
		</li>
	{/each}
</ol>

<style>
	/* A slim signpost: it sits above the upload form, not in place of it.
	   Each step is one row — dot, label over hint, then the connector line
	   running to the next step. */
	.steps {
		margin: 0 0 12px;
	}
	.steps :global(.ess-step) {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr);
		align-items: center;
		justify-items: start;
		column-gap: 10px;
		row-gap: 0;
		padding: 0;
		text-align: left;
	}
	.steps :global(.ess-step__dot) {
		grid-column: 1;
		grid-row: 1 / span 2;
	}
	.steps :global(.ess-step__label) {
		grid-column: 2;
		font-size: 13px;
		line-height: 1.25;
	}
	.steps :global(.ess-step__meta) {
		grid-column: 2;
		font-size: 12px;
		margin-top: 0;
	}
	.steps :global(.ess-step:not(:last-child)::before) {
		position: static;
		grid-column: 3;
		grid-row: 1 / span 2;
		justify-self: stretch;
		margin-right: 10px;
	}
</style>
