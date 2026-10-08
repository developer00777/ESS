<script lang="ts">
	import type { AssignableGroups } from '$lib/tasks/types';

	/**
	 * Who a task can go to: anyone. People whose task goes straight onto their
	 * board come first; for the rest, their lead approves it first, and the
	 * option says who that lead is.
	 */
	let {
		id,
		groups,
		value,
		meId,
		noneLabel = 'Unassigned',
		disabled = false,
		onchange
	}: {
		id: string;
		groups: AssignableGroups;
		value: string | null;
		meId: string;
		noneLabel?: string;
		disabled?: boolean;
		onchange: (value: string | null) => void;
	} = $props();

	// Someone no longer listed (they left) still shows as chosen.
	const known = $derived(!value || groups.direct.some((p) => p.id === value) || groups.approval.some((p) => p.id === value));
</script>

<select {id} class="ess-select" {disabled} value={value ?? ''} onchange={(e) => onchange(e.currentTarget.value || null)}>
	<option value="">{noneLabel}</option>
	{#if !known}<option value={value}>Someone who has left</option>{/if}
	{#if groups.direct.length}
		<optgroup label="Goes straight on">
			{#each groups.direct as p (p.id)}<option value={p.id}>{p.fullName}{p.id === meId ? ' (you)' : ''}</option>{/each}
		</optgroup>
	{/if}
	{#if groups.approval.length}
		<optgroup label="Their lead approves first">
			{#each groups.approval as p (p.id)}<option value={p.id}>{p.fullName}{p.id === meId ? ' (you)' : ''} · {p.approverName}</option>{/each}
		</optgroup>
	{/if}
</select>
