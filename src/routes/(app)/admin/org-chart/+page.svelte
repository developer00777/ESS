<script lang="ts">
	import Network from '@lucide/svelte/icons/network';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import UserX from '@lucide/svelte/icons/user-x';
	import { reportCount, type OrgNode } from '$lib/org-chart';

	let { data } = $props();

	const chart = $derived(data.chart);
	const stats = $derived(data.stats);

	/** Expanded to this depth on load — the whole org at once is unreadable. */
	const OPEN_TO_DEPTH = 1;

	/** Everyone under Chief, at any depth. */
	const chiefTotal = $derived(chart.underChief.reduce((n, node) => n + 1 + reportCount(node), 0));

	function roleLabel(role: string) {
		return role.replace('_', ' ');
	}
</script>

<svelte:head>
	<title>Org Chart — Champ HR ESS Portal</title>
</svelte:head>

<!-- Title and description come from the Admin Controls layout (src/lib/admin-tabs.ts). -->

<div class="ess-kpis" data-lay="grid" data-n="3">
	<div class="ess-stat">
		<span class="ess-stat__label">Active people</span>
		<span class="ess-stat__value ess-num">{stats.total}</span>
	</div>
	<div class="ess-stat">
		<span class="ess-stat__label">With a manager on file</span>
		<span class="ess-stat__value ess-num">{stats.withManager}</span>
		<span class="ess-stat__meta">{stats.withoutManager} without</span>
	</div>
	<div class="ess-stat">
		<span class="ess-stat__label">Report to Chief</span>
		<span class="ess-stat__value ess-num">{stats.chiefCount}</span>
		<span class="ess-stat__meta">{stats.rootCount} others with nobody above them</span>
	</div>
</div>

<!--
	The chart is only as good as reports_to, which is NULL for most accounts
	today. Saying so on the page is better than letting a flat chart read as
	"this company has no hierarchy".
-->
{#if stats.withoutManager > 0}
	<div class="ess-alert ess-alert--info section-gap">
		<UserX size={16} />
		<span>
			{stats.withoutManager} of {stats.total} people have no reporting manager recorded, so they
			appear at the top level. Manager names captured during import are still held as text — the
			backfill links them to real accounts.
		</span>
	</div>
{/if}

{#if chart.cycleMemberIds.length > 0}
	<div class="ess-alert ess-alert--warning section-gap">
		<TriangleAlert size={16} />
		<span>
			{chart.cycleMemberIds.length} people form a reporting loop and are shown separately below.
			Fix this from their settings panel — approval routing cannot resolve a loop.
		</span>
	</div>
{/if}

{#snippet personCard(node: OrgNode)}
	<div class="node-card">
		<div class="node-main">
			<span class="node-name">{node.person.fullName}</span>
			{#if node.person.employeeCode}
				<code class="node-code">{node.person.employeeCode}</code>
			{/if}
		</div>
		<div class="node-meta">
			<span class="ess-badge">{roleLabel(node.person.role)}</span>
			{#if node.children.length > 0}
				<span class="node-reports">
					{reportCount(node)}
					{reportCount(node) === 1 ? 'report' : 'reports'}
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet branch(node: OrgNode)}
	{#if node.children.length > 0}
		<details class="branch" open={node.depth < OPEN_TO_DEPTH}>
			<summary>
				{@render personCard(node)}
			</summary>
			<div class="children">
				{#each node.children as child (child.person.id)}
					{@render branch(child)}
				{/each}
			</div>
		</details>
	{:else}
		<div class="leaf">
			{@render personCard(node)}
		</div>
	{/if}
{/snippet}

<section class="ess-panel tree-panel section-gap">
	{#if chart.roots.length === 0 && chart.underChief.length === 0 && chart.orphans.length === 0}
		<div class="ess-empty">
			<Network class="ess-empty__icon" size={28} />
			<p class="ess-empty__title">No active people to chart yet.</p>
		</div>
	{:else}
		<!--
			Chief heads the chart as a position, not a person: there is no account
			behind it, so it carries no code or role, and the people under it have
			their approvals handled by their concerned HR.
		-->
		{#if chart.underChief.length > 0}
			<details class="branch" open>
				<summary>
					<div class="node-card chief-card">
						<div class="node-main">
							<span class="node-name">Chief</span>
						</div>
						<div class="node-meta">
							<span class="node-reports">{chiefTotal} {chiefTotal === 1 ? 'report' : 'reports'}</span>
						</div>
					</div>
				</summary>
				<div class="children">
					{#each chart.underChief as node (node.person.id)}
						{@render branch(node)}
					{/each}
				</div>
			</details>
		{/if}
		{#if chart.underChief.length > 0 && chart.roots.length > 0}
			<p class="no-line">No reporting line on file</p>
		{/if}
		{#each chart.roots as root (root.person.id)}
			{@render branch(root)}
		{/each}
	{/if}
</section>

{#if chart.orphans.length > 0}
	<h2 class="ess-h2 section-gap">In a reporting loop</h2>
	<section class="ess-panel tree-panel">
		{#each chart.orphans as orphan (orphan.person.id)}
			{@render branch(orphan)}
		{/each}
	</section>
{/if}

<style>
	.section-gap {
		margin-top: var(--ess-space-6);
	}

	.chief-card {
		border: 1px solid color-mix(in oklab, var(--acc) 45%, var(--ess-border));
		background: linear-gradient(100deg, var(--ess-primary-soft), transparent);
	}

	.no-line {
		margin: 16px 0 6px;
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}

	.tree-panel {
		padding: 12px;
	}

	/* Each level steps in by one gutter. A connector line runs down the inside
	   so a long list of siblings still reads as belonging to one manager. */
	.children {
		margin-left: 14px;
		padding-left: 14px;
		border-left: 1px solid var(--ess-border);
	}

	.branch > summary {
		list-style: none;
		cursor: pointer;
	}
	.branch > summary::-webkit-details-marker {
		display: none;
	}

	/* The disclosure triangle is drawn here rather than left to the browser so
	   it picks up the theme and rotates with the open state. */
	.branch > summary .node-card::before {
		content: '';
		width: 0;
		height: 0;
		flex-shrink: 0;
		border-left: 5px solid var(--ess-text-muted);
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		transition: transform var(--ess-t-fast);
	}
	.branch[open] > summary .node-card::before {
		transform: rotate(90deg);
	}

	/* Leaves have no triangle, so they get the same indent from a spacer. */
	.leaf .node-card {
		padding-left: 25px;
	}

	.node-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--ess-radius-sm);
		transition: background var(--ess-t-fast);
	}

	.branch > summary:hover .node-card,
	.leaf:hover .node-card {
		background: var(--ess-sunken);
	}

	.node-main {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		flex: 1;
	}

	.node-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.node-code {
		font-family: var(--ess-font-mono, Consolas, Menlo, monospace);
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
	}

	.node-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.node-reports {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		white-space: nowrap;
	}

	/* On a phone the roster is deep rather than wide: drop the role badge and
	   tighten the indent so names keep their width instead of the tree eating
	   it one level at a time. */
	@media (max-width: 720px) {
		.children {
			margin-left: 6px;
			padding-left: 8px;
		}
		.node-meta :global(.ess-badge) {
			display: none;
		}
	}
</style>
