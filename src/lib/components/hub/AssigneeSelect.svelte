<script lang="ts">
	import type { AssignableGroups } from '$lib/tasks/types';

	/**
	 * Who a task can go to, grouped the way the rules treat them: people it
	 * goes to directly, and people who will get it as a request to accept.
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

	// Someone no longer in either list (left the team) still shows as chosen.
	const known = $derived(!value || groups.direct.some((p) => p.id === value) || groups.request.some((p) => p.id === value));
</script>

<select {id} class="ess-select" {disabled} value={value ?? ''} onchange={(e) => onchange(e.currentTarget.value || null)}>
	<option value="">{noneLabel}</option>
	{#if !known}<option value={value}>Someone outside your reach</option>{/if}
	{#if groups.direct.length}
		<optgroup label="Directly">
			{#each groups.direct as p (p.id)}<option value={p.id}>{p.fullName}{p.id === meId ? ' (you)' : ''}</option>{/each}
		</optgroup>
	{/if}
	{#if groups.request.length}
		<optgroup label="As a request they accept">
			{#each groups.request as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
		</optgroup>
	{/if}
</select>
