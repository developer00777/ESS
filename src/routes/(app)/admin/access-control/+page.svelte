<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { data } = $props();

	let tab = $state<'roles' | 'teams'>('roles');

	const ROLES = ['super_admin', 'admin', 'team_lead', 'employee'] as const;
	type RoleKey = (typeof ROLES)[number];

	/*
		Transcribed from src/lib/server/rbac.ts and the route guards — this table
		is a readable mirror of the code, not a second source of truth. If a rule
		changes there it must change here by hand, which is the trade for not
		inventing a permissions engine nobody asked for.
	*/
	interface Capability {
		label: string;
		detail: string;
		allows: Record<RoleKey, boolean | 'scoped'>;
		/** Set when the rule is agreed but not yet implemented. */
		notEnforced?: string;
	}

	const capabilities: Capability[] = [
		{
			label: 'Reach Admin Controls',
			detail: 'The /admin area as a whole.',
			allows: { super_admin: true, admin: true, team_lead: false, employee: false }
		},
		{
			label: 'Publish policies, clean data, design tweaks',
			detail: 'Leave types, holiday calendars, placeholder removal.',
			allows: { super_admin: true, admin: false, team_lead: false, employee: false }
		},
		{
			label: 'Upload biometric reports and leave balances',
			detail: 'The two HR upload screens.',
			allows: { super_admin: true, admin: true, team_lead: false, employee: false }
		},
		{
			label: 'See the Team roster',
			detail: 'Super Admin sees the whole org; Admin and Team Lead see their own team.',
			allows: { super_admin: true, admin: 'scoped', team_lead: 'scoped', employee: false }
		},
		{
			label: 'Create a login',
			detail:
				'Super Admin creates anyone; Admin creates Team Leads and Employees; Team Lead creates Employees.',
			allows: { super_admin: true, admin: 'scoped', team_lead: 'scoped', employee: false }
		},
		{
			label: 'Change a privilege level',
			detail: 'Super Admin alone, and never on their own account.',
			allows: { super_admin: 'scoped', admin: false, team_lead: false, employee: false }
		},
		{
			label: 'Act on another person record',
			detail: 'Yourself always; a Team Lead only within their own team.',
			allows: { super_admin: true, admin: true, team_lead: 'scoped', employee: 'scoped' }
		},
		{
			label: 'See Aadhaar, PAN and bank details',
			detail: 'Agreed rule: the employee themselves and Super Admin only.',
			allows: { super_admin: true, admin: false, team_lead: false, employee: 'scoped' },
			notEnforced:
				'Not yet enforced in code. These fields render only on your own profile today, so nothing is over-exposed — but the gate must exist before any screen shows one person profile to another.'
		}
	];

	const flagColumns = [
		{ key: 'canApproveLeave', label: 'Approve leave' },
		{ key: 'canEditTeamShiftWindow', label: 'Edit shift window' },
		{ key: 'canViewTeamPayrollCost', label: 'View payroll cost' },
		{ key: 'canCreateEmployeeLogins', label: 'Create logins' },
		{ key: 'canResolveGrievances', label: 'Resolve grievances' }
	] as const;

	function roleLabel(r: string) {
		return r.replace('_', ' ');
	}
</script>

<svelte:head>
	<title>Access Control — Champ HR ESS Portal</title>
</svelte:head>

<!-- Title and description come from the Admin Controls layout (src/lib/admin-tabs.ts). -->

<div class="ess-tabs" role="tablist">
	<button class="ess-tab" role="tab" aria-selected={tab === 'roles'} onclick={() => (tab = 'roles')}>
		Role matrix
	</button>
	<button class="ess-tab" role="tab" aria-selected={tab === 'teams'} onclick={() => (tab = 'teams')}>
		Team privileges
	</button>
</div>

{#if tab === 'roles'}
	<div class="ess-alert ess-alert--info section-gap">
		<Info size={16} />
		<span>
			These rules live in code, not in the database — this table mirrors them so they can be read in
			one place. The headcount under each role is live.
		</span>
	</div>

	<div class="ess-table-shell section-gap">
		<table class="ess-table">
			<thead>
				<tr>
					<th>Capability</th>
					{#each ROLES as r (r)}
						<th class="role-col">
							{roleLabel(r)}
							<span class="head-count">{data.byRole[r] ?? 0}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each capabilities as cap (cap.label)}
					<tr>
						<td>
							<span class="cap-label">{cap.label}</span>
							<span class="cap-detail">{cap.detail}</span>
							{#if cap.notEnforced}
								<span class="not-enforced">
									<TriangleAlert size={13} />
									{cap.notEnforced}
								</span>
							{/if}
						</td>
						{#each ROLES as r (r)}
							<td class="role-col">
								{#if cap.allows[r] === true}
									<Check size={16} class="yes" />
								{:else if cap.allows[r] === 'scoped'}
									<span class="ess-badge ess-badge--pending">scoped</span>
								{:else}
									<Minus size={14} class="no" />
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="ess-alert ess-alert--info section-gap">
		<Info size={16} />
		<span>
			These flags are set when a team is created and have had no screen since. Read-only for now —
			editing them needs its own audited endpoint.
		</span>
	</div>

	<div class="ess-table-shell section-gap">
		<table class="ess-table">
			<thead>
				<tr>
					<th>Team</th>
					<th>Team lead</th>
					{#each flagColumns as col (col.key)}
						<th class="role-col">{col.label}</th>
					{/each}
					<th class="role-col">Auto-approve up to</th>
				</tr>
			</thead>
			<tbody>
				{#each data.teamRows as team (team.id)}
					<tr>
						<td><span class="cap-label">{team.name}</span></td>
						<td>{team.teamLeadName ?? '—'}</td>
						{#each flagColumns as col (col.key)}
							<td class="role-col">
								{#if team[col.key]}
									<Check size={16} class="yes" />
								{:else}
									<Minus size={14} class="no" />
								{/if}
							</td>
						{/each}
						<td class="role-col ess-num">{team.maxLeaveDaysAutoApprove ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if data.teamRows.length === 0}
			<div class="ess-empty"><p class="ess-empty__title">No teams yet.</p></div>
		{/if}
	</div>
{/if}

<style>
	.section-gap {
		margin-top: var(--ess-space-5);
	}

	.role-col {
		text-align: center;
		white-space: nowrap;
	}

	.head-count {
		display: block;
		font-size: var(--ess-fs-caption);
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ess-text-secondary);
	}

	.cap-label {
		display: block;
		font-weight: 600;
	}

	.cap-detail {
		display: block;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		margin-top: 2px;
		max-width: 46ch;
	}

	/* A rule that is agreed but not yet built has to look different from one
	   that is live, or the table quietly overstates what the portal enforces. */
	.not-enforced {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-top: 6px;
		padding: 6px 8px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
		font-size: var(--ess-fs-caption);
		max-width: 52ch;
	}

	.ess-table :global(.yes) {
		color: var(--ess-success);
	}
	.ess-table :global(.no) {
		color: var(--ess-text-muted);
	}
</style>
