<script lang="ts">
	import type { StripItem } from '$lib/admin-issues';

	/**
	 * The three or four figures a section opens with. Generated from live data
	 * (src/lib/admin-issues.ts), so the page states its own condition instead
	 * of opening with a paragraph explaining what it is for.
	 */
	let { items }: { items: StripItem[] } = $props();
</script>

<div class="ess-figures strip" style="--n: {items.length}">
	{#each items as item (item.label)}
		<div class="ess-figure cell">
			<span class="ess-figure__dot" data-tone={item.tone ?? 'neutral'}></span>
			<div class="body">
				<span class="ess-figure__value">{item.value}</span>
				<span class="ess-figure__label">{item.label}</span>
				{#if item.detail}
					<span class="detail" data-tone={item.tone ?? 'muted'}>{item.detail}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.cell {
		align-items: flex-start;
	}
	.cell .ess-figure__dot {
		margin-top: 9px;
		background: var(--ess-border-strong);
	}
	.cell .ess-figure__dot[data-tone='ok'] {
		background: var(--ess-success);
	}
	.cell .ess-figure__dot[data-tone='warn'] {
		background: var(--ess-warning);
	}
	.cell .ess-figure__dot[data-tone='bad'] {
		background: var(--ess-danger);
	}
	.body {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.detail {
		font-size: var(--ess-fs-caption);
		font-weight: 500;
		color: var(--ess-text-muted);
	}
	.detail[data-tone='ok'] {
		color: var(--ess-success);
	}
	.detail[data-tone='warn'] {
		color: var(--ess-warning);
	}
	.detail[data-tone='bad'] {
		color: var(--ess-danger);
	}
</style>
