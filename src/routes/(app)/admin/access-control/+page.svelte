<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Info from '@lucide/svelte/icons/info';
	import {
		BASE_ROLE_LABEL,
		CAPABILITIES,
		ROLE_PRESETS,
		defaultCapabilities,
		effectiveCapabilities,
		type CapabilityGroup
	} from '$lib/capabilities';

	let { data, form } = $props();

	type Tab = 'roles' | 'matrix' | 'teams';
	let tab = $state<Tab>('roles');

	const BUILT_IN = ['employee', 'team_lead', 'admin', 'super_admin'] as const;
	const BUILT_IN_BLURB: Record<(typeof BUILT_IN)[number], string> = {
		employee: 'Their own leave, attendance, profile and chat.',
		team_lead: 'Approves their team and keeps its shifts and reporting lines right.',
		admin: 'HR: people, balances, uploads, announcements and the HR desk.',
		super_admin: 'Everything, including roles, policies and data cleanup.'
	};

	const GROUPS = [...new Set(CAPABILITIES.map((c) => c.group))] as CapabilityGroup[];
	const grantable = CAPABILITIES.filter((c) => c.grantable);

	/* ---------- editor ---------- */
	type Draft = { id: string; name: string; description: string; baseRole: 'employee' | 'team_lead' | 'admin'; capabilities: string[] };
	const blank = (): Draft => ({ id: '', name: '', description: '', baseRole: 'employee', capabilities: [] });
	let editing = $state<Draft | null>(page.url.searchParams.has('new') && data.canManage ? blank() : null);

	function edit(r: (typeof data.namedRoles)[number]) {
		editing = { id: r.id, name: r.name, description: r.description, baseRole: r.baseRole as Draft['baseRole'], capabilities: [...r.capabilities] };
		tab = 'roles';
	}
	function fromPreset(p: (typeof ROLE_PRESETS)[number]) {
		editing = { id: '', name: p.name, description: p.description, baseRole: p.baseRole as Draft['baseRole'], capabilities: [...p.capabilities] };
	}
	/** Privileges the base role already gives, shown ticked and locked. */
	const inherited = $derived(editing ? defaultCapabilities(editing.baseRole) : []);

	let confirmDelete = $state<string | null>(null);
	const pick = $state<Record<string, string>>({});
	const nameById = $derived(new Map(data.people.map((p) => [p.id, p.fullName])));
</script>

<svelte:head>
	<title>Roles & access — Champ HR ESS Portal</title>
</svelte:head>

<div class="ess-tabs" role="tablist">
	<button class="ess-tab" role="tab" aria-selected={tab === 'roles'} onclick={() => (tab = 'roles')}>Roles</button>
	<button class="ess-tab" role="tab" aria-selected={tab === 'matrix'} onclick={() => (tab = 'matrix')}>Who can do what</button>
	<button class="ess-tab" role="tab" aria-selected={tab === 'teams'} onclick={() => (tab = 'teams')}>Team privileges</button>
</div>

{#if form?.error}
	<p class="ess-alert ess-alert--danger section-gap" role="alert">{form.error}</p>
{:else if form?.message}
	<p class="ess-alert ess-alert--success section-gap" role="status">{form.message}</p>
{/if}

{#if tab === 'roles'}
	<section class="section-gap">
		<h2 class="ess-h3">Built-in roles</h2>
		<p class="ess-caption">Every login has one of these. It decides approvals: who a person's leave goes to, and who counts as HR.</p>
		<div class="builtins">
			{#each BUILT_IN as r (r)}
				<div class="ess-card role-card">
					<div class="role-head">
						<strong>{BASE_ROLE_LABEL[r]}</strong>
						<span class="ess-badge ess-num">{data.byRole[r] ?? 0}</span>
					</div>
					<p class="ess-caption">{BUILT_IN_BLURB[r]}</p>
					<span class="ess-caption">{defaultCapabilities(r).length} {defaultCapabilities(r).length === 1 ? 'privilege' : 'privileges'}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="section-gap">
		<div class="row-head">
			<div>
				<h2 class="ess-h3">Named roles</h2>
				<p class="ess-caption">
					A name and a set of privileges on top of a built-in role, such as IT Support. Give one to anyone
					from here, from their settings, or when you create their login.
				</p>
			</div>
			{#if data.canManage && !editing}
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => (editing = blank())}>
					<Plus size={14} /> New role
				</button>
			{/if}
		</div>

		{#if editing}
			<form
				class="ess-panel editor"
				method="POST"
				action="?/saveRole"
				use:enhance={() => async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = null;
				}}
			>
				<div class="editor-head">
					<h3 class="ess-h3">{editing.id ? `Edit ${editing.name}` : 'New named role'}</h3>
					{#if !editing.id}
						<span class="ess-caption">Start from:</span>
						{#each ROLE_PRESETS as p (p.name)}
							<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => fromPreset(p)}>{p.name}</button>
						{/each}
					{/if}
				</div>
				<input type="hidden" name="id" value={editing.id} />
				<div class="fields">
					<label class="ess-field">
						<span class="ess-label">Name</span>
						<input class="ess-input" name="name" maxlength="60" bind:value={editing.name} required placeholder="IT Support" />
					</label>
					<label class="ess-field">
						<span class="ess-label">Starts from</span>
						<select class="ess-select" name="baseRole" bind:value={editing.baseRole}>
							<option value="employee">Employee</option>
							<option value="team_lead">Team Lead</option>
							<option value="admin">HR Admin</option>
						</select>
					</label>
					<label class="ess-field wide">
						<span class="ess-label">What it is for</span>
						<input class="ess-input" name="description" maxlength="160" bind:value={editing.description} placeholder="Looks after logins, passwords and the biometric devices." />
					</label>
				</div>

				<div class="cap-groups">
					{#each GROUPS as g (g)}
						{@const items = grantable.filter((c) => c.group === g)}
						{#if items.length}
							<fieldset class="cap-group">
								<legend>{g}</legend>
								{#each items as c (c.key)}
									{@const locked = inherited.includes(c.key)}
									<label class="cap" class:locked>
										<input
											type="checkbox"
											name="capabilities"
											value={c.key}
											checked={locked || editing.capabilities.includes(c.key)}
											disabled={locked}
											onchange={(e) => {
												const on = (e.currentTarget as HTMLInputElement).checked;
												editing!.capabilities = on
													? [...editing!.capabilities, c.key]
													: editing!.capabilities.filter((k) => k !== c.key);
											}}
										/>
										<span>
											<strong>{c.label}</strong>
											<small>{locked ? `Already part of ${BASE_ROLE_LABEL[editing.baseRole]}` : c.description}</small>
										</span>
									</label>
								{/each}
							</fieldset>
						{/if}
					{/each}
				</div>
				<p class="ess-caption">
					Deleting data, managing roles and exporting conversations stay with Super Admins and cannot be given.
				</p>
				<div class="actions">
					<button class="ess-btn ess-btn--primary" type="submit">Save role</button>
					<button class="ess-btn ess-btn--ghost" type="button" onclick={() => (editing = null)}>Cancel</button>
				</div>
			</form>
		{/if}

		{#if data.namedRoles.length === 0}
			<p class="ess-empty">No named roles yet.</p>
		{:else}
			<div class="named">
				{#each data.namedRoles as r (r.id)}
					<article class="ess-card named-card">
						<div class="role-head">
							<strong>{r.name}</strong>
							<span class="ess-badge">starts as {BASE_ROLE_LABEL[r.baseRole]}</span>
							<span class="spacer"></span>
							{#if data.canManage}
								<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => edit(r)}>Edit</button>
								{#if confirmDelete === r.id}
									<form method="POST" action="?/deleteRole" use:enhance={() => async ({ update }) => { await update(); confirmDelete = null; }}>
										<input type="hidden" name="id" value={r.id} />
										<button class="ess-btn ess-btn--danger ess-btn--sm" type="submit">Delete {r.name}</button>
									</form>
									<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmDelete = null)}>Keep</button>
								{:else}
									<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmDelete = r.id)}>Delete</button>
								{/if}
							{/if}
						</div>
						{#if r.description}<p class="ess-caption">{r.description}</p>{/if}
						<div class="chips">
							{#each CAPABILITIES.filter((c) => r.capabilities.includes(c.key)) as c (c.key)}
								<span class="chip">{c.label}</span>
							{:else}
								<span class="ess-caption">No extra privileges</span>
							{/each}
						</div>
						<div class="members">
							<span class="ess-label">{r.members.length} {r.members.length === 1 ? 'person' : 'people'}</span>
							<div class="chips">
								{#each r.members as m (m.id)}
									<span class="member">
										{m.fullName}
										{#if data.canManage && m.id !== data.viewerId}
											<form method="POST" action="?/assign" use:enhance>
												<input type="hidden" name="userId" value={m.id} />
												<input type="hidden" name="roleId" value="" />
												<button type="submit" class="x" aria-label="Take {r.name} from {m.fullName}"><X size={12} /></button>
											</form>
										{/if}
									</span>
								{/each}
							</div>
							{#if data.canManage}
								<form class="assign" method="POST" action="?/assign" use:enhance={() => async ({ update }) => { await update(); pick[r.id] = ''; }}>
									<input type="hidden" name="roleId" value={r.id} />
									<select class="ess-select" name="userId" bind:value={pick[r.id]} aria-label="Give {r.name} to">
										<option value="">Give this role to…</option>
										{#each data.people.filter((p) => p.customRoleId !== r.id && p.id !== data.viewerId) as p (p.id)}
											<option value={p.id}>{p.fullName}{p.customRoleId ? ` (now ${data.namedRoles.find((n) => n.id === p.customRoleId)?.name})` : ` (${BASE_ROLE_LABEL[p.role]})`}</option>
										{/each}
									</select>
									<button class="ess-btn ess-btn--secondary ess-btn--sm" type="submit" disabled={!pick[r.id]}>Give role</button>
								</form>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
		<p class="ess-caption section-gap">
			Giving someone a named role moves their built-in role to the one it starts from. Changes reach them within 30
			seconds. {#if !data.canManage}Only a Super Admin can change roles.{/if}
		</p>
	</section>
{:else if tab === 'matrix'}
	<div class="ess-alert ess-alert--info section-gap">
		<Info size={16} />
		<span>Worked out from the same privilege list the portal checks, so this table cannot drift from what people can actually do.</span>
	</div>
	<div class="ess-table-shell section-gap">
		<table class="ess-table">
			<thead>
				<tr>
					<th>Privilege</th>
					{#each BUILT_IN as r (r)}<th class="role-col">{BASE_ROLE_LABEL[r]}</th>{/each}
					{#each data.namedRoles as n (n.id)}<th class="role-col named-col">{n.name}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each GROUPS as g (g)}
					<tr class="group-row"><td colspan={5 + data.namedRoles.length}>{g}</td></tr>
					{#each CAPABILITIES.filter((c) => c.group === g) as c (c.key)}
						<tr>
							<td><span class="cap-label">{c.label}</span><span class="cap-detail">{c.description}</span></td>
							{#each BUILT_IN as r (r)}
								<td class="role-col">
									{#if effectiveCapabilities(r).includes(c.key)}<Check size={16} class="yes" />{:else}<Minus size={14} class="no" />{/if}
								</td>
							{/each}
							{#each data.namedRoles as n (n.id)}
								<td class="role-col">
									{#if effectiveCapabilities(n.baseRole, n.capabilities).includes(c.key)}<Check size={16} class="yes" />{:else}<Minus size={14} class="no" />{/if}
								</td>
							{/each}
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="ess-alert ess-alert--info section-gap">
		<Info size={16} />
		<span>These flags are set when a team is created. Read-only here.</span>
	</div>
	<div class="ess-table-shell section-gap">
		<table class="ess-table">
			<thead>
				<tr>
					<th>Team</th><th>Team lead</th>
					<th class="role-col">Approve leave</th><th class="role-col">Edit shift window</th><th class="role-col">View payroll cost</th>
					<th class="role-col">Create logins</th><th class="role-col">Resolve grievances</th><th class="role-col">Auto-approve up to</th>
				</tr>
			</thead>
			<tbody>
				{#each data.teamRows as team (team.id)}
					<tr>
						<td><span class="cap-label">{team.name}</span></td>
						<td>{team.teamLeadName ?? '—'}</td>
						{#each [team.canApproveLeave, team.canEditTeamShiftWindow, team.canViewTeamPayrollCost, team.canCreateEmployeeLogins, team.canResolveGrievances] as on, i (i)}
							<td class="role-col">{#if on}<Check size={16} class="yes" />{:else}<Minus size={14} class="no" />{/if}</td>
						{/each}
						<td class="role-col ess-num">{team.maxLeaveDaysAutoApprove ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if data.teamRows.length === 0}<div class="ess-empty"><p class="ess-empty__title">No teams yet.</p></div>{/if}
	</div>
{/if}

<style>
	.section-gap {
		margin-top: var(--ess-space-5);
	}
	.builtins {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 10px;
		margin-top: 10px;
	}
	.role-card,
	.named-card {
		padding: 14px 16px;
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.role-card p,
	.named-card p {
		margin: 0;
	}
	.role-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.role-head form {
		display: inline;
	}
	.spacer {
		flex: 1;
	}
	.row-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 10px;
	}
	.row-head h2,
	.row-head p {
		margin: 0;
	}
	.editor {
		display: grid;
		gap: 14px;
		margin-bottom: 14px;
	}
	.editor-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.editor-head h3 {
		margin: 0 8px 0 0;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}
	.fields .wide {
		grid-column: 1 / -1;
	}
	.cap-groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
	}
	.cap-group {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		padding: 10px 12px;
		margin: 0;
		display: grid;
		gap: 8px;
		align-content: start;
	}
	.cap-group legend {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		padding: 0 4px;
	}
	.cap {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		cursor: pointer;
	}
	.cap input {
		margin-top: 3px;
		accent-color: var(--ess-primary);
	}
	.cap span {
		display: grid;
	}
	.cap strong {
		font-size: 13px;
		font-weight: 600;
	}
	.cap small {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.cap.locked {
		opacity: 0.7;
		cursor: default;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.named {
		display: grid;
		gap: 10px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip,
	.member {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 600;
		padding: 2px 9px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}
	.member {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.member form {
		display: inline-flex;
	}
	.x {
		border: 0;
		background: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
	}
	.members {
		display: grid;
		gap: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.assign {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.assign select {
		max-width: 320px;
	}
	.role-col {
		text-align: center;
		white-space: nowrap;
	}
	.named-col {
		color: var(--ess-primary-text);
	}
	.group-row td {
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		background: var(--ess-sunken);
	}
	.cap-label {
		font-weight: 600;
		display: block;
	}
	.cap-detail {
		display: block;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}
	.ess-table :global(.yes) {
		color: var(--ess-success);
	}
	.ess-table :global(.no) {
		color: var(--ess-text-muted);
	}
</style>
