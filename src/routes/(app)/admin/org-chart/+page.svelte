<script lang="ts">
	import Network from '@lucide/svelte/icons/network';
	import Search from '@lucide/svelte/icons/search';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Maximize from '@lucide/svelte/icons/maximize';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Avatar from '$lib/components/Avatar.svelte';
	import { flattenDepthFirst, reportCount, type OrgNode } from '$lib/org-chart';
	import { BASE_ROLE_LABEL } from '$lib/capabilities';

	let { data } = $props();

	const chart = $derived(data.chart);
	const stats = $derived(data.stats);
	const teamNames = $derived(data.teamNames as Record<string, string | null>);

	/** Expanded to this depth on load — the whole org at once is unreadable. */
	const OPEN_TO_DEPTH = 1;

	/** Everyone under Chief, at any depth. */
	const chiefTotal = $derived(chart.underChief.reduce((n, node) => n + 1 + reportCount(node), 0));

	const roleLabel = (role: string) => BASE_ROLE_LABEL[role as keyof typeof BASE_ROLE_LABEL] ?? role.replace('_', ' ');
	const teamOf = (id: string) => teamNames[id] ?? null;

	/* ---------- lookups for the detail panel ---------- */
	const everyone = $derived(flattenDepthFirst([...chart.underChief, ...chart.roots, ...chart.orphans]));
	const nodeById = $derived(new Map(everyone.map((n) => [n.person.id, n])));
	const parentOf = $derived.by(() => {
		const m = new Map<string, OrgNode>();
		for (const n of everyone) for (const c of n.children) m.set(c.person.id, n);
		return m;
	});

	/* ---------- search, filter, zoom ---------- */
	let q = $state('');
	let dept = $state('');
	let zoom = $state(1);
	const departments = $derived([...new Set(Object.values(teamNames).filter((t): t is string => !!t))].sort());

	const filtering = $derived(q.trim().length > 0 || dept !== '');
	const matches = $derived.by(() => {
		if (!filtering) return [];
		const needle = q.trim().toLowerCase();
		return everyone.filter((n) => {
			const p = n.person;
			const team = teamOf(p.id);
			if (dept && team !== dept) return false;
			if (!needle) return true;
			return p.fullName.toLowerCase().includes(needle) || (p.employeeCode ?? '').toLowerCase().includes(needle) || roleLabel(p.role).toLowerCase().includes(needle) || (team ?? '').toLowerCase().includes(needle);
		});
	});

	/* ---------- selection and open branches ---------- */
	let selectedId = $state<string | null>(null);
	const selected = $derived(selectedId ? (nodeById.get(selectedId) ?? null) : null);
	let open = $state<Record<string, boolean>>({});
	const isOpen = (n: OrgNode) => open[n.person.id] ?? n.depth < OPEN_TO_DEPTH;
	function toggle(n: OrgNode) {
		open = { ...open, [n.person.id]: !isOpen(n) };
	}
	function select(n: OrgNode) {
		selectedId = n.person.id;
	}
</script>

<svelte:head>
	<title>Org chart — Champ HR ESS Portal</title>
</svelte:head>

{#snippet personCard(node: OrgNode)}
	<button type="button" class="node" class:selected={selectedId === node.person.id} onclick={() => select(node)}>
		<Avatar userId={node.person.id} fullName={node.person.fullName} size="lg" />
		<span class="node-body">
			<span class="node-name">{node.person.fullName}</span>
			<span class="node-role">{roleLabel(node.person.role)}</span>
			<span class="node-meta">
				{#if teamOf(node.person.id)}<span>{teamOf(node.person.id)}</span>{/if}
				{#if node.person.employeeCode}<span><code>{node.person.employeeCode}</code></span>{/if}
				<span>{reportCount(node)} {reportCount(node) === 1 ? 'report' : 'reports'}</span>
			</span>
		</span>
	</button>
{/snippet}

{#snippet branch(node: OrgNode)}
	<li class="tree-item">
		<div class="tree-node">
			{@render personCard(node)}
			{#if node.children.length > 0}
				<button type="button" class="expander" onclick={() => toggle(node)} aria-expanded={isOpen(node)} aria-label="{isOpen(node) ? 'Collapse' : 'Expand'} {node.person.fullName}'s reports">
					{#if isOpen(node)}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
					{node.children.length}
				</button>
			{/if}
		</div>
		{#if node.children.length > 0 && isOpen(node)}
			<ul class="tree-children">
				{#each node.children as child (child.person.id)}
					{@render branch(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="ess-split">
	<div class="ess-stack">
		<section class="ess-card chart-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Organisation chart</h2>
				<span class="ess-caption">{stats.total} active {stats.total === 1 ? 'person' : 'people'}</span>
			</div>

			<div class="toolbar">
				<label class="ess-search grow">
					<Search size={16} />
					<input class="ess-input" placeholder="Search by name, role, code or department…" bind:value={q} />
				</label>
				<select class="ess-select dept" bind:value={dept} aria-label="Department">
					<option value="">All departments</option>
					{#each departments as d (d)}<option value={d}>{d}</option>{/each}
				</select>
				<div class="zoom" role="group" aria-label="Zoom">
					<button type="button" class="ess-icon-btn ess-icon-btn--bordered" onclick={() => (zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)))} aria-label="Zoom out"><Minus size={15} /></button>
					<span class="ess-num">{Math.round(zoom * 100)}%</span>
					<button type="button" class="ess-icon-btn ess-icon-btn--bordered" onclick={() => (zoom = Math.min(1.5, +(zoom + 0.1).toFixed(2)))} aria-label="Zoom in"><Plus size={15} /></button>
					<button type="button" class="ess-icon-btn ess-icon-btn--bordered" onclick={() => (zoom = 1)} aria-label="Reset zoom"><Maximize size={15} /></button>
				</div>
			</div>

			{#if chart.roots.length === 0 && chart.underChief.length === 0 && chart.orphans.length === 0}
				<div class="ess-empty">
					<span class="ess-empty__icon"><Network size={22} /></span>
					<p class="ess-empty__title">No active people to chart yet.</p>
				</div>
			{:else if filtering}
				<div class="results">
					{#each matches as n (n.person.id)}
						{@render personCard(n)}
					{:else}
						<p class="ess-help">Nobody matches{q.trim() ? ` “${q.trim()}”` : ''}{dept ? ` in ${dept}` : ''}.</p>
					{/each}
				</div>
			{:else}
				<div class="canvas">
					<div class="tree-wrap" style="transform: scale({zoom})">
						<!--
							Chief heads the chart as a position, not a person: there is no
							account behind it, so it carries no code or role, and the people
							under it have their approvals handled by their concerned HR.
						-->
						{#if chart.underChief.length > 0}
							<ul class="tree">
								<li class="tree-item">
									<div class="tree-node">
										<div class="node chief">
											<span class="ess-tile ess-tile--lg ess-tile--round"><Network size={22} strokeWidth={1.75} /></span>
											<span class="node-body">
												<span class="node-name">Chief</span>
												<span class="node-role">Head of the company</span>
												<span class="node-meta"><span>{chiefTotal} {chiefTotal === 1 ? 'report' : 'reports'}</span></span>
											</span>
										</div>
									</div>
									<ul class="tree-children">
										{#each chart.underChief as node (node.person.id)}
											{@render branch(node)}
										{/each}
									</ul>
								</li>
							</ul>
						{/if}
						{#if chart.roots.length > 0}
							{#if chart.underChief.length > 0}<p class="no-line">No reporting line on file</p>{/if}
							<ul class="tree">
								{#each chart.roots as root (root.person.id)}
									{@render branch(root)}
								{/each}
							</ul>
						{/if}
						{#if chart.orphans.length > 0}
							<p class="no-line loop">In a reporting loop</p>
							<ul class="tree">
								{#each chart.orphans as orphan (orphan.person.id)}
									{@render branch(orphan)}
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/if}
		</section>
	</div>

	<aside class="ess-stack">
		<section class="ess-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Reporting checks</h2>
			</div>
			<p class="ess-caption">From the live roster: only active people are charted.</p>
			<div class="ess-rows checks">
				<div class="ess-row">
					<span class="ess-tile ess-tile--sm ess-tile--round" class:ess-tile--bad={stats.withoutManager > 0} class:ess-tile--ok={stats.withoutManager === 0}>
						{#if stats.withoutManager > 0}<CircleAlert size={16} />{:else}<CircleCheck size={16} />{/if}
					</span>
					<span class="ess-row__body">
						<span class="ess-row__title">{stats.withoutManager === 0 ? 'Everyone has a manager' : `${stats.withoutManager} unassigned ${stats.withoutManager === 1 ? 'employee' : 'employees'}`}</span>
						<span class="ess-row__meta">{stats.withoutManager === 0 ? 'Every active person reports to someone' : 'No reporting manager on file; shown at the top level'}</span>
					</span>
				</div>
				<div class="ess-row">
					<span class="ess-tile ess-tile--sm ess-tile--round" class:ess-tile--warn={chart.cycleMemberIds.length > 0} class:ess-tile--ok={chart.cycleMemberIds.length === 0}>
						{#if chart.cycleMemberIds.length > 0}<CircleAlert size={16} />{:else}<CircleCheck size={16} />{/if}
					</span>
					<span class="ess-row__body">
						<span class="ess-row__title">{chart.cycleMemberIds.length === 0 ? 'No reporting loops' : `${chart.cycleMemberIds.length} people in a reporting loop`}</span>
						<span class="ess-row__meta">{chart.cycleMemberIds.length === 0 ? 'All reporting lines are valid' : 'Fix from their settings panel; approvals cannot resolve a loop'}</span>
					</span>
				</div>
				<div class="ess-row">
					<span class="ess-tile ess-tile--sm ess-tile--round ess-tile--ok"><CircleCheck size={16} /></span>
					<span class="ess-row__body">
						<span class="ess-row__title">{stats.chiefCount} report to Chief</span>
						<span class="ess-row__meta">{stats.withManager} of {stats.total} with a manager on file</span>
					</span>
				</div>
			</div>
		</section>

		<section class="ess-card">
			<div class="ess-card-head">
				<h2 class="ess-h2">Employee details</h2>
			</div>
			{#if selected}
				{@const p = selected.person}
				{@const parent = parentOf.get(p.id)}
				<div class="detail-head">
					<Avatar userId={p.id} fullName={p.fullName} size="lg" />
					<div>
						<span class="detail-name">{p.fullName}</span>
						<span class="ess-caption">{roleLabel(p.role)}</span>
					</div>
				</div>
				<dl class="ess-kv">
					<dt>Department</dt>
					<dd>{teamOf(p.id) ?? '—'}</dd>
					<dt>Employee code</dt>
					<dd>{p.employeeCode ?? '—'}</dd>
					<dt>Role</dt>
					<dd>{roleLabel(p.role)}</dd>
				</dl>
				<h3 class="ess-h3 sub">Reports to</h3>
				{#if parent}
					<button type="button" class="ess-row person" onclick={() => select(parent)}>
						<Avatar userId={parent.person.id} fullName={parent.person.fullName} size="sm" />
						<span class="ess-row__body">
							<span class="ess-row__title">{parent.person.fullName}</span>
							<span class="ess-row__meta">{roleLabel(parent.person.role)}</span>
						</span>
						<ChevronRight size={15} class="chev" />
					</button>
				{:else if p.reportsToChief}
					<p class="ess-caption">Chief — the head of the company</p>
				{:else}
					<p class="ess-caption">— No reporting line on file</p>
				{/if}
				<h3 class="ess-h3 sub">Direct reports ({selected.children.length})</h3>
				<div class="ess-rows">
					{#each selected.children as c (c.person.id)}
						<button type="button" class="ess-row person" onclick={() => select(c)}>
							<Avatar userId={c.person.id} fullName={c.person.fullName} size="sm" />
							<span class="ess-row__body">
								<span class="ess-row__title">{c.person.fullName}</span>
								<span class="ess-row__meta">{roleLabel(c.person.role)}</span>
							</span>
							<ChevronRight size={15} class="chev" />
						</button>
					{:else}
						<p class="ess-caption">No direct reports.</p>
					{/each}
				</div>
			{:else}
				<p class="ess-caption">Select a person in the chart to see who they report to and who reports to them.</p>
			{/if}
		</section>
	</aside>
</div>

<style>
	.chart-card {
		display: grid;
		gap: 14px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.grow {
		flex: 1;
		min-width: 220px;
	}
	.dept {
		width: auto;
		min-width: 180px;
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.zoom span {
		min-width: 44px;
		text-align: center;
	}

	.canvas {
		overflow: auto;
		padding: 12px 8px 20px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.tree-wrap {
		transform-origin: top left;
		width: max-content;
		min-width: 100%;
	}

	.no-line {
		margin: 18px 0 8px;
		font-size: var(--ess-fs-eyebrow);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		text-align: center;
	}
	.no-line.loop {
		color: var(--ess-warning);
	}

	/* ---------- the tree: vertical connectors drawn with pseudo-elements ---------- */
	.tree,
	.tree-children {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 16px;
	}
	.tree-children {
		padding-top: 28px;
		position: relative;
	}
	.tree-item {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 6px;
	}
	/* Line from a parent down to the children's rail. */
	.tree-item > .tree-children::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 1px;
		height: 28px;
		background: var(--ess-border-strong);
	}
	/* The rail above the children, and each child's stem up to it. */
	.tree-children > .tree-item::before {
		content: '';
		position: absolute;
		top: -28px;
		left: 50%;
		width: 1px;
		height: 28px;
		background: var(--ess-border-strong);
	}
	.tree-children > .tree-item::after {
		content: '';
		position: absolute;
		top: -28px;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--ess-border-strong);
	}
	.tree-children > .tree-item:first-child::after {
		left: 50%;
	}
	.tree-children > .tree-item:last-child::after {
		right: 50%;
	}
	.tree-children > .tree-item:only-child::after {
		display: none;
	}
	.tree-node {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.expander {
		position: absolute;
		bottom: -12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		height: 22px;
		padding: 0 8px;
		border-radius: 99px;
		border: 1px solid var(--ess-border-strong);
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}
	.expander:hover {
		color: var(--ess-primary-text);
		border-color: var(--ess-primary);
	}

	.node {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 240px;
		padding: 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text);
		text-align: left;
		font: inherit;
		cursor: pointer;
		transition:
			border-color var(--ess-t-fast),
			box-shadow var(--ess-t-fast);
	}
	button.node:hover {
		border-color: var(--ess-border-strong);
		box-shadow: var(--ess-elev-2);
	}
	.node.selected {
		border-color: var(--ess-primary);
		background: var(--ess-primary-softer);
		box-shadow: 0 0 0 3px var(--ring);
	}
	.node.chief {
		cursor: default;
		background: var(--ess-primary-softer);
		border-color: var(--ess-primary-soft);
	}
	.node-body {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.node-name {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.node-role {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.node-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 4px;
		font-size: 11.5px;
		color: var(--ess-text-muted);
		margin-top: 4px;
	}
	.node-meta > span + span::before {
		content: '·';
		margin-right: 4px;
	}
	.node-meta code {
		font-family: var(--ess-font-mono);
		font-size: 11px;
	}

	.results {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 10px;
		padding-top: 4px;
	}
	.results .node {
		width: auto;
	}

	.checks {
		margin-top: 8px;
	}
	.detail-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 14px;
	}
	.detail-head div {
		display: grid;
	}
	.detail-name {
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
		line-height: 1.2;
	}
	.sub {
		margin: 16px 0 6px;
		padding-top: 12px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.person {
		padding: 8px 0;
		cursor: pointer;
	}
	.person :global(.chev) {
		color: var(--ess-text-muted);
	}

	@media (max-width: 720px) {
		.zoom {
			margin-left: 0;
		}
	}
</style>
