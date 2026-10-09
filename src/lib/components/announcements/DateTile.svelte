<script lang="ts">
	import { daysUntil } from '$lib/announcements';

	let { date, now, holiday = false }: { date: string; now: Date; holiday?: boolean } = $props();

	const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const d = $derived(new Date(date + 'T00:00:00Z'));
	const n = $derived(daysUntil(date, now));
</script>

<span class="tile" class:holiday class:today={n === 0} class:past={n < 0} aria-hidden="true" title={WD[d.getUTCDay()]}>
	<span class="d">{d.getUTCDate()}</span>
	<span class="m">{MO[d.getUTCMonth()]}</span>
</span>

<style>
	/* The mockups' date tile: a quiet bordered box, serif day over the month. */
	.tile {
		width: 54px;
		flex-shrink: 0;
		display: grid;
		justify-items: center;
		padding: 7px 0 6px;
		border-radius: var(--ess-radius-md);
		border: 1px solid var(--ess-border);
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
		line-height: 1.1;
	}
	.d {
		font-family: var(--ess-font-display);
		font-size: 21px;
		font-weight: 600;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.m {
		font-size: 11.5px;
		font-weight: 500;
	}
	.holiday {
		border-color: transparent;
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.holiday .d {
		color: var(--ess-success);
	}
	.today {
		border-color: transparent;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.today .d {
		color: var(--ess-primary-text);
	}
	.past {
		color: var(--ess-text-muted);
	}
	.past .d {
		color: var(--ess-text-muted);
	}
</style>
