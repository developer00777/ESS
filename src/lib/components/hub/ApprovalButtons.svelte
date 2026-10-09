<script lang="ts">
	import { approve } from '$lib/hub/actions';
	import type { TaskView } from '$lib/tasks/types';

	/**
	 * A lead's answer to a task waiting for them. Saying no asks for a reason,
	 * which goes back to the person who made the task.
	 */
	let { task, ondone }: { task: TaskView; ondone?: (decision: 'approve' | 'reject') => void } = $props();

	let rejecting = $state(false);
	let note = $state('');
	let busy = $state(false);

	async function go(decision: 'approve' | 'reject') {
		busy = true;
		const ok = await approve(task, decision, note);
		busy = false;
		if (ok) ondone?.(decision);
	}
</script>

<div class="approval" data-no-drag>
	{#if rejecting}
		<input class="ess-input" bind:value={note} placeholder="Why not? {task.createdBy.fullName.split(' ')[0]} sees this" aria-label="Reason for not approving" />
		<div class="row">
			<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" disabled={busy || !note.trim()} onclick={(e) => { e.stopPropagation(); void go('reject'); }}>Don't approve</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={(e) => { e.stopPropagation(); rejecting = false; }}>Back</button>
		</div>
	{:else}
		<div class="row">
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy} onclick={(e) => { e.stopPropagation(); void go('approve'); }}>Approve</button>
			<button type="button" class="ess-btn ess-btn--outline ess-btn--sm" disabled={busy} onclick={(e) => { e.stopPropagation(); rejecting = true; }}>Don't approve</button>
		</div>
	{/if}
</div>

<style>
	.approval {
		display: grid;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ess-input {
		padding: 7px 10px;
		font-size: 13px;
	}
</style>
