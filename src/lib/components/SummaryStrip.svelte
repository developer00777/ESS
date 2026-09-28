<script lang="ts">
	import type { StripItem } from '$lib/admin-issues';

	/**
	 * The three or four figures a section opens with. Generated from live data
	 * (src/lib/admin-issues.ts), so the page states its own condition instead
	 * of opening with a paragraph explaining what it is for.
	 */
	let { items }: { items: StripItem[] } = $props();
</script>

<div class="strip" style="--n: {items.length}">
	{#each items as item (item.label)}
		<div class="cell">
			<span class="value">{item.value}</span>
			<span class="label">{item.label}</span>
			{#if item.detail}
				<span class="detail" data-tone={item.tone ?? 'muted'}>{item.detail}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.strip {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 1px;
		background: var(--ess-border);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		overflow: hidden;
	}

	.cell {
		display: grid;
		align-content: start;
		gap: 2px;
		padding: 14px 18px;
		background: var(--ess-glass-raised-bg);
	}

	.value {
		font-family: var(--ess-font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1.15;
		font-variant-numeric: tabular-nums;
		color: var(--ess-text);
	}

	.label {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	.detail {
		font-size: var(--ess-fs-caption);
		font-weight: 600;
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

	@media (max-width: 720px) {
		.strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
