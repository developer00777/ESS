<script lang="ts">
	import Video from '@lucide/svelte/icons/video';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Calendar from '@lucide/svelte/icons/calendar';
	import { timeIst } from '$lib/hub/format';
	import type { MeetingRowView } from '$lib/tasks/types';

	/**
	 * Today's meetings next to today's work: the next call as a block with
	 * its Join button, the rest as rows with where their minutes stand, and
	 * a count of tasks due today.
	 */
	let { meetings, dueToday }: { meetings: MeetingRowView[]; dueToday: number } = $props();

	const STATE: Record<MeetingRowView['state'], string> = {
		upcoming: 'Coming up',
		waiting: 'Waiting for the summary',
		ready: 'Minutes ready',
		published: 'Tasks published',
		no_summary: 'No summary',
		cancelled: 'Cancelled'
	};

	const next = $derived(meetings.find((m) => m.state === 'upcoming') ?? null);
	const rest = $derived(meetings.filter((m) => m !== next));

	const hrefFor = (m: MeetingRowView) => (m.state === 'upcoming' ? (m.canJoin ? `/hub/meetings/${m.id}/join` : '/hub/meetings') : m.isHost ? `/hub/meetings/${m.id}` : '/hub/meetings');
	const joins = (m: MeetingRowView) => m.state === 'upcoming' && m.canJoin;

	function endOf(m: MeetingRowView) {
		const mins = m.durationMin ?? 30;
		return timeIst(new Date(Date.parse(m.startedAt) + mins * 60_000).toISOString());
	}
	function inWords(m: MeetingRowView) {
		const diff = Math.round((Date.parse(m.startedAt) - Date.now()) / 60_000);
		if (diff <= 0) return 'Now';
		if (diff < 60) return `In ${diff} min`;
		const h = Math.floor(diff / 60);
		return `In ${h} h${diff % 60 ? ` ${diff % 60} min` : ''}`;
	}
</script>

<div class="strip" aria-label="Today">
	{#if next}
		<div class="next">
			<span class="ess-tile"><Calendar size={20} strokeWidth={1.75} /></span>
			<div class="b">
				<small class="time">{timeIst(next.startedAt)} – {endOf(next)}</small>
				<strong>{next.topic}</strong>
				<small class="meta"><Video size={13} /> {next.durationMin ?? 30} min <span class="ess-dot-sep"></span> {inWords(next)}</small>
			</div>
			<a class="ess-btn ess-btn--primary ess-btn--sm" href={hrefFor(next)} target={joins(next) ? '_blank' : undefined} rel={joins(next) ? 'noopener' : undefined} data-sveltekit-reload={joins(next) ? true : undefined}>
				<Video size={15} /> {joins(next) ? (next.isHost ? 'Start' : 'Join') : 'Open'}
			</a>
		</div>
	{:else if meetings.length === 0}
		<a class="row quiet" href="/hub/meetings">
			<span class="ess-tile ess-tile--sm ess-tile--neutral"><Video size={16} /></span>
			<span class="b"><strong>No meetings today</strong><small>Schedule one in Meetings</small></span>
		</a>
	{/if}
	{#each rest as m (m.id)}
		<a class="row" data-state={m.state} href={hrefFor(m)}>
			<span class="t">{timeIst(m.startedAt)}</span>
			<span class="b"><strong>{m.topic}</strong><small>{STATE[m.state]}</small></span>
		</a>
	{/each}
	<a class="row" href="/hub/tasks">
		<span class="ess-tile ess-tile--sm ess-tile--neutral"><SquareKanban size={16} /></span>
		<span class="b"><strong>{dueToday} due today</strong><small>Open Tasks</small></span>
	</a>
</div>

<style>
	.strip {
		display: grid;
		gap: 4px;
	}
	.next {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		margin-bottom: 8px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
	}
	.next .b {
		flex: 1;
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.next strong {
		font-family: var(--ess-font-display);
		font-size: 19px;
		font-weight: 600;
		line-height: 1.2;
	}
	.time {
		font-size: 13px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 4px;
		border-bottom: 1px solid var(--ess-border-subtle);
		color: var(--ess-text);
	}
	.row:last-child {
		border-bottom: none;
	}
	.row:hover strong {
		color: var(--ess-primary-text);
	}
	.row[data-state='ready'] small {
		color: var(--ess-info);
	}
	.row[data-state='waiting'] small {
		color: var(--ess-warning);
	}
	.row.quiet {
		color: var(--ess-text-muted);
	}
	.t {
		font-family: var(--ess-font-mono);
		font-size: 12px;
		color: var(--ess-text-muted);
		min-width: 44px;
	}
	.row .b {
		display: grid;
		min-width: 0;
	}
	.row strong {
		font-size: 13.5px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row small {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
</style>
