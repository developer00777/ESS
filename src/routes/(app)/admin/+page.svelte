<script lang="ts">
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Fingerprint from '@lucide/svelte/icons/fingerprint';
	import Scale from '@lucide/svelte/icons/scale';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	let { data } = $props();

	const isSuperAdmin = $derived(data.adminRole === 'super_admin');

	/*
	 * Hiding an item is a per-browser convenience, not a resolution. Ids carry
	 * the size of the condition (see AdminIssue.id), so a hidden "23 people
	 * have no manager" comes back by itself once it becomes 24 — or disappears
	 * for real once it is fixed.
	 */
	const HIDDEN_KEY = 'essAdminHiddenIssues';
	let hidden = $state<string[]>([]);

	$effect(() => {
		try {
			hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
		} catch {
			hidden = [];
		}
	});

	function toggleHidden(id: string) {
		hidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
		try {
			// Only ids that still exist are kept, so the list cannot grow forever.
			const live = new Set(data.adminIssues.map((i) => i.id));
			localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden.filter((h) => live.has(h))));
		} catch {
			/* storage blocked: hiding lasts for this visit only */
		}
	}

	let showHidden = $state(false);
	const open = $derived(data.adminIssues.filter((i) => !hidden.includes(i.id)));
	const hiddenCount = $derived(data.adminIssues.length - open.length);
	const listed = $derived(showHidden ? data.adminIssues : open);

	const tasks = $derived(
		[
			{ href: '/admin/people?create=1', label: 'Create a login', sub: 'One person, with a temporary password', icon: UserPlus },
			{ href: '/admin/biometric', label: 'Upload a biometric report', sub: 'For days the device feed missed', icon: Fingerprint },
			{ href: '/admin/leave-balances', label: 'Set leave balances', sub: 'HRone carry-forward or a correction', icon: Scale },
			{ href: '/leave', label: 'Approve leave requests', sub: 'Everything waiting on you', icon: CheckCheck },
			...(isSuperAdmin
				? [{ href: '/admin/policies', label: 'Publish a holiday calendar', sub: 'From a PDF or a photo', icon: BookOpen }]
				: [])
		]
	);
</script>

<svelte:head>
	<title>Admin Controls — Champ HR ESS Portal</title>
</svelte:head>

<div class="overview">
	<section class="ess-panel attention" aria-labelledby="attention-title">
		<div class="panel-head">
			<h2 class="ess-h3" id="attention-title">Needs attention</h2>
			{#if open.length > 0}
				<span class="ess-badge ess-badge--pending">{open.length} open</span>
			{/if}
			<span class="spacer"></span>
			{#if hiddenCount > 0}
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (showHidden = !showHidden)}>
					{showHidden ? 'Hide dismissed' : `Show ${hiddenCount} dismissed`}
				</button>
			{/if}
		</div>

		{#if listed.length === 0}
			<div class="all-clear">
				<CircleCheck size={20} />
				<span>Nothing needs attention. Attendance is arriving, everyone has a manager and the policies are published.</span>
			</div>
		{:else}
			<ul class="feed">
				{#each listed as issue (issue.id)}
					{@const isHidden = hidden.includes(issue.id)}
					<li class="item" class:is-hidden={isHidden}>
						<span class="sev" data-sev={issue.severity} aria-hidden="true"></span>
						<div class="item-text">
							<strong>{issue.title}</strong>
							<span class="why">{issue.detail}</span>
						</div>
						<div class="item-actions">
							<a class="ess-btn ess-btn--secondary ess-btn--sm" href={issue.href}>{issue.cta}</a>
							<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => toggleHidden(issue.id)}>
								{isHidden ? 'Restore' : 'Dismiss'}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="ess-panel tasks" aria-labelledby="tasks-title">
		<div class="panel-head">
			<h2 class="ess-h3" id="tasks-title">Start a task</h2>
		</div>
		<div class="task-list">
			{#each tasks as task (task.href)}
				{@const Icon = task.icon}
				<a class="task" href={task.href}>
					<span class="task-icon"><Icon size={16} /></span>
					<span class="task-text">
						<strong>{task.label}</strong>
						<span>{task.sub}</span>
					</span>
				</a>
			{/each}
		</div>
		<p class="ess-caption hint">Press <kbd>Ctrl K</kbd> on any admin tab to jump straight to a section.</p>
	</section>
</div>

<style>
	.overview {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: var(--ess-space-5);
		align-items: start;
	}

	.panel-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		margin-bottom: var(--ess-space-3);
	}

	.panel-head h2 {
		margin: 0;
	}

	.spacer {
		flex: 1;
	}

	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.item {
		display: grid;
		grid-template-columns: 4px minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 12px 0;
		border-top: 1px solid var(--ess-border-subtle);
	}

	.item:first-child {
		border-top: 0;
	}

	.item.is-hidden {
		opacity: 0.5;
	}

	.sev {
		align-self: stretch;
		border-radius: 4px;
	}
	.sev[data-sev='bad'] {
		background: var(--ess-danger);
	}
	.sev[data-sev='warn'] {
		background: var(--ess-warning);
	}
	.sev[data-sev='info'] {
		background: var(--ess-info);
	}

	.item-text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.item-text strong {
		font-weight: 600;
	}

	.why {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-secondary);
		line-height: 1.45;
	}

	.item-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}

	.all-clear {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-success-bg);
		color: var(--ess-success);
		font-weight: 500;
	}

	.task-list {
		display: grid;
		gap: 8px;
	}

	.task {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-surface);
		color: inherit;
		text-decoration: none;
		transition: border-color var(--ess-t-fast);
	}

	.task:hover {
		border-color: color-mix(in oklab, var(--acc) 50%, transparent);
	}

	.task:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}

	.task-icon {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	.task-text {
		display: grid;
		min-width: 0;
	}

	.task-text strong {
		font-weight: 600;
	}

	.task-text span {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}

	.hint {
		margin: var(--ess-space-3) 0 0;
	}

	kbd {
		font-family: var(--ess-font-mono);
		font-size: 10.5px;
		padding: 1px 5px;
		border: 1px solid var(--ess-border-strong);
		border-bottom-width: 2px;
		border-radius: 5px;
	}

	@media (max-width: 960px) {
		.overview {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 560px) {
		.item {
			grid-template-columns: 4px minmax(0, 1fr);
		}
		.item-actions {
			grid-column: 2;
			justify-content: flex-start;
		}
	}
</style>
