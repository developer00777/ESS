<script lang="ts">
	import { enhance } from '$app/forms';
	import Save from '@lucide/svelte/icons/save';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Info from '@lucide/svelte/icons/info';
	import User from '@lucide/svelte/icons/user';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import { describeDmRule, DEFAULT_CHAT_POLICY, type ChatPolicy } from '$lib/chat/policy';

	let { data, form } = $props();

	// A working copy, so the preview follows the switches before saving.
	let draft = $state<ChatPolicy>(structuredClone(data.policy));
	let saving = $state(false);

	const DM_OPTIONS: { key: keyof ChatPolicy['dm']; label: string; hint: string }[] = [
		{ key: 'team', label: 'Same team', hint: 'Everyone with the same team in People.' },
		{ key: 'managerAndReports', label: 'Their manager and direct reports', hint: 'The Reports to line, both ways.' },
		{ key: 'concernedHr', label: 'Their concerned HR', hint: 'The one HR person set on their profile.' },
		{ key: 'allHr', label: 'HR team', hint: 'Every HR Admin and Super Admin.' },
		{ key: 'everyone', label: 'Everyone', hint: 'Allow employees to message anyone in the company. Turns every other switch on.' }
	];

	const effective = (k: keyof ChatPolicy['dm']) => draft.dm.everyone || draft.dm[k];

	/** Back to the rules Champ Chat launched with, in the form only; Save commits it. */
	function reset() {
		draft = structuredClone(DEFAULT_CHAT_POLICY);
	}
</script>

<svelte:head>
	<title>Chat rules — Champ HR ESS Portal</title>
</svelte:head>

{#if form?.error}
	<p class="ess-alert ess-alert--danger" role="alert">{form.error}</p>
{:else if form?.message}
	<p class="ess-alert ess-alert--success" role="status">{form.message}</p>
{/if}

<form
	method="POST"
	action="?/save"
	class="ess-stack"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<div class="ess-split">
		<div class="ess-stack">
			<section class="ess-card">
				<div class="ess-card-head">
					<h2 class="ess-h2">Who employees can message directly</h2>
				</div>
				<p class="ess-caption">
					Select who employees are allowed to start one-to-one conversations with. Team Leads, HR, Super Admins and any named role with <strong>Message anyone</strong> can always message anyone.
				</p>
				<div class="opts">
					{#each DM_OPTIONS as o (o.key)}
						{@const implied = o.key !== 'everyone' && draft.dm.everyone}
						<label class="opt" class:implied>
							{#if implied}
								<input type="checkbox" class="box" checked disabled />
								<input type="hidden" name={o.key} value="on" />
							{:else}
								<input type="checkbox" class="box" name={o.key} bind:checked={draft.dm[o.key]} />
							{/if}
							<span class="opt-body">
								<strong>{o.label}</strong>
								<small>{o.hint}</small>
							</span>
						</label>
					{/each}
				</div>
			</section>

			<section class="ess-card">
				<div class="ess-card-head">
					<h2 class="ess-h2">Who can start group chats</h2>
				</div>
				<p class="ess-caption">Group chats are small private conversations of up to 20 people. Members still have to be people the starter may message.</p>
				<div class="opts">
					<label class="opt toggle-row">
						<span class="opt-body">
							<strong>Employees</strong>
							<small>Allow all employees to start group chats with people they may message.</small>
						</span>
						<span class="switch" aria-hidden="true" class:on={draft.groups === 'everyone'}></span>
						<input type="radio" class="ess-sr-only" name="groups" value="everyone" bind:group={draft.groups} aria-label="Everyone can start group chats" />
					</label>
					<label class="opt toggle-row">
						<span class="opt-body">
							<strong>Only people with “Start group chats”</strong>
							<small>Team Leads, HR and Super Admins by default. Give it to a named role in Roles &amp; access.</small>
						</span>
						<span class="switch" aria-hidden="true" class:on={draft.groups === 'privileged'}></span>
						<input type="radio" class="ess-sr-only" name="groups" value="privileged" bind:group={draft.groups} aria-label="Only people holding Start group chats" />
					</label>
				</div>
			</section>
		</div>

		<aside class="ess-stack">
			<section class="ess-card preview">
				<div class="ess-card-head">
					<h2 class="ess-h2">Effective access preview</h2>
				</div>
				<p class="ess-caption">Based on the current settings, before you save.</p>
				<div class="viewer">
					<span class="ess-tile"><User size={20} strokeWidth={1.75} /></span>
					<span>
						<strong>Employee view</strong>
						<small>What a typical employee can do</small>
					</span>
				</div>
				<div class="panel ok">
					<h3>Can message directly with</h3>
					<ul>
						{#each DM_OPTIONS.filter((o) => o.key !== 'everyone') as o (o.key)}
							<li>
								{#if effective(o.key)}<CircleCheck size={16} class="yes" />{:else}<CircleX size={16} class="no" />{/if}
								<span><strong>{o.label}</strong><small>{effective(o.key) ? `Can message ${o.label.toLowerCase()}` : `Cannot message ${o.label.toLowerCase()}`}</small></span>
							</li>
						{/each}
						<li>
							{#if draft.dm.everyone}<CircleCheck size={16} class="yes" />{:else}<CircleX size={16} class="no" />{/if}
							<span><strong>Everyone</strong><small>{draft.dm.everyone ? 'Can message anyone in the company' : 'Cannot message other employees outside these groups'}</small></span>
						</li>
					</ul>
					<p class="sum">Employees can message <strong>{describeDmRule(draft)}</strong>.</p>
				</div>
				<div class="panel ok">
					<h3>Can start group chats</h3>
					<ul>
						<li>
							{#if draft.groups === 'everyone'}<CircleCheck size={16} class="yes" />{:else}<CircleX size={16} class="no" />{/if}
							<span><strong>Employees</strong><small>{draft.groups === 'everyone' ? 'Can start group chats' : 'Cannot start group chats'}</small></span>
						</li>
						<li>
							<CircleCheck size={16} class="yes" />
							<span><strong>Team leads</strong><small>Can start group chats</small></span>
						</li>
						<li>
							<CircleCheck size={16} class="yes" />
							<span><strong>HR and admins</strong><small>Can start group chats</small></span>
						</li>
					</ul>
				</div>
			</section>
		</aside>
	</div>

	<div class="ess-card bar">
		<div class="bar-actions">
			<button class="ess-btn ess-btn--primary" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save changes'}</button>
			<button type="button" class="ess-btn ess-btn--secondary" onclick={reset} disabled={saving}><RotateCcw size={16} /> Reset to default</button>
		</div>
		<div class="bar-note">
			<span class="ess-tile ess-tile--sm ess-tile--round"><Info size={15} /></span>
			<span>
				<strong>Role permissions are always respected.</strong>
				<small>Conversations that already exist stay open. Every change is recorded in the activity log.</small>
			</span>
		</div>
	</div>
</form>

<style>
	.opts {
		display: grid;
		gap: 0;
		margin-top: 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		overflow: hidden;
	}
	.opt {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 14px 16px;
		border-bottom: 1px solid var(--ess-border-subtle);
		background: var(--ess-surface);
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}
	.opt:last-child {
		border-bottom: none;
	}
	.opt:hover {
		background: var(--ess-sunken);
	}
	.opt.implied {
		opacity: 0.6;
		cursor: default;
	}
	.box {
		margin-top: 3px;
		width: 18px;
		height: 18px;
		accent-color: var(--ess-primary);
		flex: none;
	}
	.opt-body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.opt-body strong {
		font-size: 14.5px;
		font-weight: 500;
	}
	.opt-body small {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.toggle-row {
		align-items: center;
	}
	.switch {
		flex: none;
		position: relative;
		width: 46px;
		height: 26px;
		border-radius: 99px;
		background: var(--ess-border-strong);
		transition: background var(--ess-t-fast);
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--ess-surface);
		box-shadow: var(--ess-elev-1);
		transition: transform var(--ess-t-fast);
	}
	.switch.on {
		background: var(--ess-primary);
	}
	.switch.on::after {
		transform: translateX(20px);
	}
	.opt:has(input:focus-visible) .switch {
		box-shadow: var(--ess-focus-ring);
	}

	/* ---------- preview ---------- */
	.preview {
		display: grid;
		gap: 12px;
	}
	.viewer {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-primary-softer);
	}
	.viewer span:last-child {
		display: grid;
	}
	.viewer strong {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.viewer small {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.panel {
		padding: 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-success-bg);
	}
	.panel h3 {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 10px;
	}
	.panel ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.panel li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.panel li > span {
		display: grid;
	}
	.panel li strong {
		font-size: 13.5px;
		font-weight: 500;
	}
	.panel li small {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.panel :global(.yes) {
		flex: none;
		margin-top: 2px;
		color: var(--ess-success);
	}
	.panel :global(.no) {
		flex: none;
		margin-top: 2px;
		color: var(--ess-text-muted);
	}
	.sum {
		margin-top: 12px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}

	/* ---------- bar ---------- */
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 16px 20px;
	}
	.bar-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.bar-note {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.bar-note span:last-child {
		display: grid;
	}
	.bar-note strong {
		color: var(--ess-text);
		font-weight: 500;
	}
</style>
