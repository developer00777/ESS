<script lang="ts">
	import Video from '@lucide/svelte/icons/video';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import { timeIst } from '$lib/hub/format';
	import type { MeetingRowView } from '$lib/tasks/types';

	/**
	 * Today's meetings next to today's work: each meeting with where its minutes
	 * stand, and a count of tasks due today.
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
</script>

<div class="strip" aria-label="Today">
	{#each meetings as m (m.id)}
		{@const href = m.state === 'upcoming' ? (m.canJoin ? `/hub/meetings/${m.id}/join` : '/hub/meetings') : m.isHost ? `/hub/meetings/${m.id}` : '/hub/meetings'}
		{#if href}
			<a class="chip" data-state={m.state} {href} target={m.state === 'upcoming' && m.canJoin ? '_blank' : undefined} rel={m.state === 'upcoming' && m.canJoin ? 'noopener' : undefined} data-sveltekit-reload={m.state === 'upcoming' && m.canJoin ? true : undefined}>
				<span class="t">{timeIst(m.startedAt)}</span>
				<span class="b"><strong>{m.topic}</strong><small>{m.state === 'upcoming' && m.canJoin ? (m.isHost ? 'Start meeting' : 'Join meeting') : STATE[m.state]}</small></span>
			</a>
		{:else}
			<span class="chip" data-state={m.state}>
				<span class="t">{timeIst(m.startedAt)}</span>
				<span class="b"><strong>{m.topic}</strong><small>{STATE[m.state]}</small></span>
			</span>
		{/if}
	{:else}
		<a class="chip quiet" href="/hub/meetings"><Video size={15} /><span class="b"><strong>No meetings today</strong><small>Schedule one in Meetings</small></span></a>
	{/each}
	<a class="chip" href="/hub/tasks">
		<span class="t"><SquareKanban size={15} /></span>
		<span class="b"><strong>{dueToday} due today</strong><small>Open Tasks</small></span>
	</a>
</div>

<style>
	.strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}
	.chip {
		flex: none;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
		color: var(--ess-text);
		max-width: 280px;
	}
	a.chip:hover {
		border-color: var(--ess-border-strong);
	}
	.chip[data-state='ready'] {
		border-color: color-mix(in oklab, var(--ess-info) 50%, var(--ess-border));
	}
	.chip[data-state='waiting'] {
		border-color: color-mix(in oklab, var(--ess-warning) 50%, var(--ess-border));
	}
	.chip.quiet {
		color: var(--ess-text-muted);
	}
	.t {
		font-family: var(--ess-font-mono);
		font-size: 12px;
		color: var(--ess-text-muted);
		display: inline-flex;
	}
	.b {
		display: grid;
		min-width: 0;
	}
	.b strong {
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.b small {
		font-size: 11.5px;
		color: var(--ess-text-muted);
	}
</style>
