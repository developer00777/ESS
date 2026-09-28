<script lang="ts">
	import { daysUntil } from '$lib/announcements';

	let { date, now, holiday = false }: { date: string; now: Date; holiday?: boolean } = $props();

	const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const d = $derived(new Date(date + 'T00:00:00Z'));
	const n = $derived(daysUntil(date, now));
</script>

<span class="tile" class:holiday class:today={n === 0} class:past={n < 0} aria-hidden="true">
	<span class="wd">{WD[d.getUTCDay()]}</span>
	<span class="d">{d.getUTCDate()}</span>
	<span class="m">{MO[d.getUTCMonth()]}</span>
</span>

<style>
	.tile {
		width: 52px;
		flex-shrink: 0;
		display: grid;
		justify-items: center;
		padding: 6px 0;
		border-radius: 12px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		line-height: 1.1;
	}
	.wd {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.d {
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.m {
		font-size: 10.5px;
		font-weight: 600;
	}
	.holiday {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.today {
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
	}
	.today .d {
		color: var(--ess-text-on-primary);
	}
	.past {
		background: var(--ess-sunken);
		color: var(--ess-text-muted);
	}
	.past .d {
		color: var(--ess-text-muted);
	}
</style>
