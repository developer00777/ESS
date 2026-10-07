<script lang="ts">
	import { enhance } from '$app/forms';
	import { describeDmRule, type ChatPolicy } from '$lib/chat/policy';

	let { data, form } = $props();

	// A working copy, so the summary line follows the switches before saving.
	let draft = $state<ChatPolicy>(structuredClone(data.policy));
	let saving = $state(false);

	const DM_OPTIONS: { key: keyof ChatPolicy['dm']; label: string; hint: string }[] = [
		{ key: 'team', label: 'Their own team', hint: 'Everyone with the same team in People.' },
		{ key: 'managerAndReports', label: 'Their manager and direct reports', hint: 'The Reports to line, both ways.' },
		{ key: 'concernedHr', label: 'Their concerned HR', hint: 'The one HR person set on their profile.' },
		{ key: 'allHr', label: 'Any HR Admin', hint: 'Every HR Admin and Super Admin.' },
		{ key: 'everyone', label: 'Anyone in the company', hint: 'Turns every other switch on. Chat becomes fully open.' }
	];
</script>

<svelte:head>
	<title>Chat rules — Champ HR ESS Portal</title>
</svelte:head>

{#if form?.error}
	<p class="ess-alert ess-alert--danger gap" role="alert">{form.error}</p>
{:else if form?.message}
	<p class="ess-alert ess-alert--success gap" role="status">{form.message}</p>
{/if}

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<section class="ess-card block gap">
		<h2 class="ess-h3">Who employees can message directly</h2>
		<p class="ess-caption">
			Team Leads, HR, Super Admins and any named role with <strong>Message anyone</strong> can always message anyone.
			These switches set the rule for everyone else.
		</p>
		<div class="opts">
			{#each DM_OPTIONS as o (o.key)}
				{@const implied = o.key !== 'everyone' && draft.dm.everyone}
				<label class="opt" class:implied>
					{#if implied}
						<input type="checkbox" checked disabled />
						<input type="hidden" name={o.key} value="on" />
					{:else}
						<input type="checkbox" name={o.key} bind:checked={draft.dm[o.key]} />
					{/if}
					<span>
						<strong>{o.label}</strong>
						<small>{o.hint}</small>
					</span>
				</label>
			{/each}
		</div>
		<p class="summary">Employees can message <strong>{describeDmRule(draft)}</strong>.</p>
	</section>

	<section class="ess-card block gap">
		<h2 class="ess-h3">Who can start group chats</h2>
		<p class="ess-caption">Group chats are small private conversations of up to 20 people. Members still have to be people the starter may message.</p>
		<div class="opts">
			<label class="opt">
				<input type="radio" name="groups" value="everyone" bind:group={draft.groups} />
				<span>
					<strong>Everyone</strong>
					<small>Any employee can start a group with people they may message.</small>
				</span>
			</label>
			<label class="opt">
				<input type="radio" name="groups" value="privileged" bind:group={draft.groups} />
				<span>
					<strong>Only people with “Start group chats”</strong>
					<small>Team Leads, HR and Super Admins by default. Give it to a named role in Roles &amp; access.</small>
				</span>
			</label>
		</div>
	</section>

	<div class="actions gap">
		<button class="ess-btn ess-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save chat rules'}</button>
		<span class="ess-caption">Conversations that already exist stay open. Every change is recorded in the activity log.</span>
	</div>
</form>

<style>
	.gap {
		margin-top: var(--ess-space-5);
	}
	.block {
		padding: 18px 20px;
		display: grid;
		gap: 8px;
	}
	.block h2,
	.block p {
		margin: 0;
	}
	.opts {
		display: grid;
		gap: 6px;
		margin-top: 6px;
	}
	.opt {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 10px 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md, 10px);
		cursor: pointer;
	}
	.opt:has(input:checked) {
		border-color: color-mix(in oklab, var(--ess-primary) 45%, var(--ess-border));
		background: color-mix(in oklab, var(--ess-primary) 6%, transparent);
	}
	.opt.implied {
		opacity: 0.6;
		cursor: default;
	}
	.opt input {
		margin-top: 3px;
		accent-color: var(--ess-primary);
	}
	.opt span {
		display: grid;
		gap: 2px;
	}
	.opt small {
		color: var(--ess-text-muted);
	}
	.summary {
		margin-top: 6px !important;
		color: var(--ess-text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
</style>
