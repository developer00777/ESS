<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Users from '@lucide/svelte/icons/users';
	import List from '@lucide/svelte/icons/list';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Avatar from '$lib/components/Avatar.svelte';
	import TaskBoard, { type BoardColumn } from '$lib/components/hub/TaskBoard.svelte';
	import TaskRow from '$lib/components/hub/TaskRow.svelte';
	import { hub } from '$lib/hub/client.svelte';
	import { moveTask, short } from '$lib/hub/actions';
	import { dueLabel, todayKey } from '$lib/hub/format';
	import type { DropTarget } from '$lib/hub/drag';
	import { PRIORITY_WEIGHT, TASK_STATUSES, TEAM_CAPACITY } from '$lib/tasks/rules';
	import type { TaskView } from '$lib/tasks/types';

	let { data } = $props();
	const meId = $derived(data.hubMe.id);

	type Lane = { id: string | null; fullName: string; title: string | null; tasks: TaskView[] };
	let lanes = $state<Lane[]>([]);
	$effect(() => {
		lanes = [{ id: null, fullName: 'Unassigned', title: 'Drag to a person to give it to them', tasks: data.unassigned }, ...data.lanes.map((l) => ({ id: l.person.id, fullName: l.person.fullName, title: l.person.title, tasks: l.tasks }))];
	});

	let showDone = $state(false);
	let view = $state<'list' | 'board'>('list');
	let openLane = $state<string | null>(null);

	const order = (a: TaskView, b: TaskView) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.rank.localeCompare(b.rank);
	const today = todayKey();
	const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

	const open = (l: Lane) => l.tasks.filter((t) => t.status !== 'done');
	const all = $derived(lanes.flatMap((l) => l.tasks));
	const figures = $derived({
		active: all.filter((t) => t.status !== 'done').length,
		overdue: all.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
		week: all.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate >= today && t.dueDate <= soon).length
	});
	const people = $derived(lanes.filter((l) => l.id));
	const unassigned = $derived(lanes.find((l) => !l.id)?.tasks ?? []);

	/** Finished or in-review work waiting on the lead: approvals first, then anything in review. */
	const review = $derived(
		all
			.filter((t) => t.can.approve || t.status === 'in_review')
			.sort((a, b) => Number(b.can.approve) - Number(a.can.approve) || b.updatedAt.localeCompare(a.updatedAt))
	);
	const deadlines = $derived(
		all
			.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate >= today)
			.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
			.slice(0, 8)
	);
	const daysLeft = (due: string) => Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
	const dateCol = (due: string) => ({
		d: new Date(due + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
		wd: new Date(due + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
	});

	const columns = $derived<BoardColumn[]>(
		lanes.map((l) => ({
			zone: `person:${l.id ?? 'none'}`,
			label: l.fullName,
			tasks: l.tasks.filter((t) => showDone || t.status !== 'done').sort(order),
			empty: l.id ? 'No open tasks' : 'Nothing unassigned'
		}))
	);
	const laneOf = (zone: string) => lanes.find((l) => `person:${l.id ?? 'none'}` === zone)!;

	/** One suggestion: the busiest person's least urgent unstarted task, to the least busy. */
	let dismissed = $state(false);
	const suggestion = $derived.by(() => {
		if (people.length < 2 || dismissed) return null;
		const sorted = [...people].sort((a, b) => open(b).length - open(a).length);
		const hi = sorted[0];
		const lo = sorted[sorted.length - 1];
		if (open(hi).length - open(lo).length < 2) return null;
		const task = open(hi)
			.filter((t) => t.status === 'todo' && !t.requestState)
			.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || (b.dueDate ?? '9').localeCompare(a.dueDate ?? '9'))[0];
		return task ? { hi, lo, task } : null;
	});

	async function drop(task: TaskView, target: DropTarget) {
		const to = laneOf(target.zone);
		if (!to || (task.assignee?.id ?? null) === to.id) return;
		const before = lanes;
		lanes = lanes.map((l) => ({ ...l, tasks: l.id === to.id ? [{ ...task, assignee: to.id ? { id: to.id, fullName: to.fullName } : null }, ...l.tasks] : l.tasks.filter((t) => t.id !== task.id) }));
		const saved = await moveTask(task, { assigneeId: to.id });
		if (!saved) lanes = before;
	}

	function keymove(task: TaskView, dir: -1 | 1) {
		const i = lanes.findIndex((l) => l.id === (task.assignee?.id ?? null)) + dir;
		if (i < 0 || i >= lanes.length) return;
		void drop(task, { zone: `person:${lanes[i].id ?? 'none'}`, beforeId: null, afterId: null }).then(() => {
			queueMicrotask(() => document.querySelector<HTMLElement>(`[data-card="${task.id}"]`)?.focus());
		});
	}

	const counts = (l: Lane) => ({
		todo: l.tasks.filter((t) => t.status === 'todo').length,
		progress: l.tasks.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length,
		done: l.tasks.filter((t) => t.status === 'done').length
	});
</script>

<svelte:head><title>Team · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<div class="toolbar">
		<label class="team-pick">
			<span class="lbl">Team</span>
			{#if data.leads.length}
				<span class="pick">
					<Users size={17} strokeWidth={1.75} />
					<select class="ess-select" value={data.leadId} onchange={(e) => goto(`/hub/team?lead=${e.currentTarget.value}`)} aria-label="Team">
						{#each data.leads as l (l.id)}<option value={l.id}>{l.id === meId ? 'Your team' : `${l.fullName}'s team`}</option>{/each}
					</select>
				</span>
			{:else}
				<span class="pick static"><Users size={17} strokeWidth={1.75} /> {data.leadId === meId ? 'Your team' : `${data.leadName}'s team`}</span>
			{/if}
		</label>
		<div class="right">
			<label class="switch">
				<span>Show completed tasks</span>
				<input type="checkbox" bind:checked={showDone} />
				<i aria-hidden="true"></i>
			</label>
			<div class="ess-segmented" role="group" aria-label="View">
				<button type="button" aria-pressed={view === 'list'} onclick={() => (view = 'list')}><List size={15} /> Workload</button>
				<button type="button" aria-pressed={view === 'board'} onclick={() => (view = 'board')}><SquareKanban size={15} /> Board</button>
			</div>
		</div>
	</div>

	{#if suggestion}
		<div class="ess-notice ess-notice--info hint">
			<span class="ess-notice__icon"><ArrowRightLeft size={15} /></span>
			<p class="ess-notice__body">
				<strong>{suggestion.hi.fullName.split(' ')[0]}</strong> has {open(suggestion.hi).length} open tasks and <strong>{suggestion.lo.fullName.split(' ')[0]}</strong> has {open(suggestion.lo).length}.
				Move "{short(suggestion.task.title)}" ({suggestion.task.priority}{suggestion.task.dueDate ? `, due ${dueLabel(suggestion.task.dueDate)}` : ''}) to {suggestion.lo.fullName.split(' ')[0]}?
			</p>
			<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => suggestion && drop(suggestion.task, { zone: `person:${suggestion.lo.id}`, beforeId: null, afterId: null })}>Move it</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (dismissed = true)}>Dismiss</button>
		</div>
	{/if}

	{#if data.lanes.length === 0}
		<p class="empty">Nobody reports to {data.leadId === meId ? 'you' : data.leadName} in ESS yet. Reporting lines come from Admin Controls › People.</p>
	{:else if view === 'board'}
		<p class="ess-help">Drag a card to another person to give it to them, or focus one and press Alt + ← / →. They hear about it in Champ Hub; Undo is there for a few seconds.</p>
		<TaskBoard {columns} {meId} ondrop={drop} onkeymove={keymove}>
			{#snippet head(col)}
				{@const l = laneOf(col.zone)}
				{@const n = open(l).length}
				<div class="lane">
					<div class="who">
						{#if l.id}<Avatar userId={l.id} fullName={l.fullName} size="sm" />{:else}<span class="none">?</span>{/if}
						<div><strong>{l.fullName}</strong>{#if l.title}<small>{l.title}</small>{/if}</div>
					</div>
					{#if l.id}
						<div class="ess-meter ess-meter--thin" class:ess-meter--warn={n >= 3 && n < 5} class:ess-meter--bad={n >= 5} role="img" aria-label="{n} of {TEAM_CAPACITY} open tasks">
							<span style="width:{Math.min(100, Math.round((n / TEAM_CAPACITY) * 100))}%"></span>
						</div>
						<div class="nums">
							<span>{n} open of {TEAM_CAPACITY}</span>
							<span>{open(l).filter((t) => t.dueDate && t.dueDate < today).length} overdue · {open(l).filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= soon).length} due soon</span>
						</div>
					{/if}
				</div>
			{/snippet}
		</TaskBoard>
	{:else}
		<div class="ess-split">
			<div class="ess-stack">
				<div class="ess-figures">
					<div class="ess-figure">
						<span class="ess-tile"><ListChecks size={20} strokeWidth={1.75} /></span>
						<div><div class="ess-figure__value">{figures.active}</div><div class="ess-figure__label">active tasks</div></div>
					</div>
					<div class="ess-figure">
						<span class="ess-tile" class:ess-tile--bad={figures.overdue > 0} class:ess-tile--neutral={figures.overdue === 0}><CircleAlert size={20} strokeWidth={1.75} /></span>
						<div><div class="ess-figure__value">{figures.overdue}</div><div class="ess-figure__label">overdue</div></div>
					</div>
					<div class="ess-figure">
						<span class="ess-tile"><CalendarCheck size={20} strokeWidth={1.75} /></span>
						<div><div class="ess-figure__value">{figures.week}</div><div class="ess-figure__label">due this week</div></div>
					</div>
				</div>

				<section class="ess-card" aria-labelledby="work-h">
					<div class="ess-card-head">
						<h2 id="work-h" class="ess-h2">Team workload</h2>
						<button type="button" class="ess-link" onclick={() => (view = 'board')}>Open the board <ChevronRight size={14} /></button>
					</div>
					<p class="ess-help counts-note">Task counts for each person, not a measure of how well they work. Open a row to see their tasks; the Board view moves work between people.</p>
					<div class="wl-head" aria-hidden="true">
						<span>Team member</span><span>Progress</span><span class="c">Assigned</span><span class="c">In progress</span><span class="c">Done</span><span></span>
					</div>
					<div class="wl">
						{#each people as l (l.id)}
							{@const n = open(l).length}
							{@const c = counts(l)}
							{@const isOpen = openLane === l.id}
							<div class="person" class:open={isOpen}>
								<button type="button" class="wl-row" aria-expanded={isOpen} onclick={() => (openLane = isOpen ? null : l.id)}>
									<span class="who">
										<Avatar userId={l.id!} fullName={l.fullName} size="md" />
										<span class="who-t"><strong>{l.fullName}</strong>{#if l.title}<small>{l.title}</small>{/if}</span>
									</span>
									<span class="prog">
										<span class="ess-meter ess-meter--thin" class:ess-meter--warn={n >= 3 && n < 5} class:ess-meter--bad={n >= 5} role="img" aria-label="{n} of {TEAM_CAPACITY} open tasks">
											<span style="width:{Math.min(100, Math.round((n / TEAM_CAPACITY) * 100))}%"></span>
										</span>
										<small>{n} / {TEAM_CAPACITY} open</small>
									</span>
									<span class="cnt todo">{c.todo}</span>
									<span class="cnt prog-n">{c.progress}</span>
									<span class="cnt done">{c.done}</span>
									<span class="chev"><ChevronDown size={16} /></span>
								</button>
								{#if isOpen}
									<div class="person-tasks">
										{#each l.tasks.filter((t) => showDone || t.status !== 'done').sort(order) as t (t.id)}
											<TaskRow task={t} />
										{:else}
											<p class="empty small">No open tasks.</p>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
						{#if unassigned.length}
							{@const isOpen = openLane === 'none'}
							<div class="person" class:open={isOpen}>
								<button type="button" class="wl-row" aria-expanded={isOpen} onclick={() => (openLane = isOpen ? null : 'none')}>
									<span class="who">
										<span class="none">?</span>
										<span class="who-t"><strong>Unassigned</strong><small>Give these to someone from the Board view</small></span>
									</span>
									<span class="prog"></span>
									<span class="cnt todo">{unassigned.filter((t) => t.status === 'todo').length}</span>
									<span class="cnt prog-n">{unassigned.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length}</span>
									<span class="cnt done">{unassigned.filter((t) => t.status === 'done').length}</span>
									<span class="chev"><ChevronDown size={16} /></span>
								</button>
								{#if isOpen}
									<div class="person-tasks">
										{#each unassigned.filter((t) => showDone || t.status !== 'done').sort(order) as t (t.id)}
											<TaskRow task={t} />
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</section>

				<section class="ess-card" aria-labelledby="dl-h">
					<div class="ess-card-head">
						<h2 id="dl-h" class="ess-h2">Upcoming deadlines</h2>
						<a class="ess-link" href="/hub/tasks">All tasks <ChevronRight size={14} /></a>
					</div>
					<ol class="tl">
						{#each deadlines as t (t.id)}
							{@const col = dateCol(t.dueDate!)}
							{@const left = daysLeft(t.dueDate!)}
							<li class="tl-i" class:soon={left <= 1}>
								<span class="tl-d"><strong>{col.d}</strong><small>{col.wd}</small></span>
								<span class="tl-dot" aria-hidden="true"></span>
								<button type="button" class="tl-b" onclick={() => hub.openTask(t.id)}>
									<strong>{t.title}</strong>
									<small>{t.assignee?.fullName ?? 'Unassigned'}<span class="ess-dot-sep"></span>{t.priority} priority</small>
								</button>
								{#if t.assignee}<Avatar userId={t.assignee.id} fullName={t.assignee.fullName} size="sm" />{/if}
								<span class="ess-badge" class:ess-badge--warn={left <= 1} class:ess-badge--accent={left > 1}>{left === 0 ? 'Due today' : left === 1 ? '1 day left' : `${left} days left`}</span>
							</li>
						{:else}
							<li class="empty">Nothing is due in the coming days.</li>
						{/each}
					</ol>
				</section>
			</div>

			<aside class="ess-card" aria-labelledby="rev-h">
				<div class="ess-card-head">
					<h2 id="rev-h" class="ess-h2">Needs review{#if review.length}<span class="n">{review.length}</span>{/if}</h2>
				</div>
				<div class="ess-rows">
					{#each review as t (t.id)}
						<button type="button" class="ess-row rev" onclick={() => hub.openTask(t.id)}>
							<span class="ess-tile ess-tile--sm" class:ess-tile--warn={t.can.approve}><ListChecks size={16} /></span>
							<span class="ess-row__body">
								<span class="ess-row__title">{t.title}</span>
								<span class="ess-row__meta">{t.can.approve ? `${t.createdBy.fullName} needs your approval` : `In review${t.assignee ? ` · ${t.assignee.fullName}` : ''}`}</span>
							</span>
							<span class="ess-row__end">
								{#if t.assignee}<Avatar userId={t.assignee.id} fullName={t.assignee.fullName} size="sm" />{/if}
								<small class="when">{dueLabel(t.updatedAt.slice(0, 10))}</small>
							</span>
						</button>
					{:else}
						<p class="empty">Nothing is waiting on you. Work in review and tasks needing your approval show up here.</p>
					{/each}
				</div>
			</aside>
		</div>
	{/if}
</div>

<style>
	.page {
		display: grid;
		gap: 18px;
		min-width: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.team-pick {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 14px;
	}
	.lbl {
		color: var(--ess-text-secondary);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-left: 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
	}
	.pick .ess-select {
		width: auto;
		border: 0;
		background-color: transparent;
		font-weight: 500;
		min-width: 180px;
	}
	.pick .ess-select:focus {
		box-shadow: none;
	}
	.pick.static {
		padding: 9px 14px 9px 12px;
		font-weight: 500;
		color: var(--ess-text);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-left: auto;
		flex-wrap: wrap;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		cursor: pointer;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.switch i {
		position: relative;
		width: 40px;
		height: 22px;
		border-radius: 99px;
		background: var(--ess-border-strong);
		transition: background var(--ess-t-fast);
	}
	.switch i::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--ess-surface);
		transition: transform var(--ess-t-fast);
	}
	.switch input:checked + i {
		background: var(--ess-primary);
	}
	.switch input:checked + i::after {
		transform: translateX(18px);
	}
	.switch input:focus-visible + i {
		box-shadow: var(--ess-focus-ring);
	}
	.hint {
		flex-wrap: wrap;
	}
	.hint p {
		margin: 0;
		min-width: 220px;
	}
	.hint strong {
		display: inline;
	}
	.lane {
		display: grid;
		gap: 7px;
		width: 100%;
		min-width: 0;
	}
	.who {
		display: flex;
		gap: 10px;
		align-items: center;
		min-width: 0;
	}
	.who-t,
	.who div {
		display: grid;
		min-width: 0;
		text-align: left;
	}
	.who strong {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who small {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.none {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px dashed var(--ess-border-strong);
		color: var(--ess-text-muted);
		font-weight: 600;
		flex: none;
	}
	.lane .none {
		width: 28px;
		height: 28px;
	}
	.nums {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11.5px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.counts-note {
		margin: -6px 0 12px;
	}
	.wl-head,
	.wl-row {
		display: grid;
		grid-template-columns: minmax(180px, 1.3fr) minmax(140px, 1fr) 80px 90px 70px 28px;
		align-items: center;
		gap: 14px;
	}
	.wl-head {
		padding: 8px 0;
		border-bottom: 1px solid var(--ess-border);
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	.wl-head .c {
		text-align: center;
	}
	.wl {
		display: grid;
	}
	.person {
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.person:last-child {
		border-bottom: none;
	}
	.wl-row {
		width: 100%;
		padding: 12px 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--ess-text);
		cursor: pointer;
		text-align: left;
		border-radius: var(--ess-radius-md);
	}
	.wl-row:hover {
		background: var(--ess-sunken);
	}
	.prog {
		display: grid;
		gap: 6px;
	}
	.prog small {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.cnt {
		justify-self: center;
		min-width: 44px;
		padding: 5px 0;
		border-radius: var(--ess-radius-sm);
		text-align: center;
		font-size: 14px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.cnt.todo {
		background: var(--ess-sunken);
		color: var(--ess-text);
	}
	.cnt.prog-n {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.cnt.done {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.chev {
		color: var(--ess-text-muted);
		display: grid;
		place-items: center;
		transition: transform var(--ess-t-fast);
	}
	.person.open .chev {
		transform: rotate(180deg);
	}
	.person-tasks {
		padding: 0 0 10px 12px;
		margin-left: 18px;
		border-left: 2px solid var(--ess-border);
	}
	.n {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 7px;
		margin-left: 10px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		font-family: var(--ess-font-sans);
		font-size: 12.5px;
		font-weight: 600;
		vertical-align: middle;
	}
	.rev {
		padding-left: 0;
		padding-right: 0;
	}
	.when {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.tl-i {
		position: relative;
		display: grid;
		grid-template-columns: 64px 20px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0 12px;
		padding: 10px 0;
	}
	.tl-i::before {
		content: '';
		position: absolute;
		left: 85px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--ess-border-subtle);
	}
	.tl-i:first-child::before {
		top: 50%;
	}
	.tl-i:last-child::before {
		bottom: 50%;
	}
	.tl-d {
		display: grid;
		line-height: 1.2;
	}
	.tl-d strong {
		font-size: 15px;
		font-weight: 500;
	}
	.tl-d small {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.tl-dot {
		position: relative;
		z-index: 1;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ess-border-strong);
		justify-self: center;
		box-shadow: 0 0 0 3px var(--ess-surface);
	}
	.tl-i:first-child .tl-dot,
	.tl-i.soon .tl-dot {
		background: var(--ess-primary);
	}
	.tl-b {
		display: grid;
		gap: 2px;
		min-width: 0;
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--ess-text);
		text-align: left;
		cursor: pointer;
	}
	.tl-b:hover strong {
		color: var(--ess-primary-text);
	}
	.tl-b strong {
		font-size: 14.5px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tl-b small {
		font-size: 13px;
		color: var(--ess-text-secondary);
		text-transform: capitalize;
	}
	.empty {
		margin: 0;
		padding: 22px 0;
		text-align: center;
		color: var(--ess-text-muted);
		font-size: 13.5px;
		list-style: none;
	}
	.empty.small {
		padding: 10px 0;
	}
	@media (max-width: 900px) {
		.wl-head {
			display: none;
		}
		.wl-row {
			grid-template-columns: minmax(0, 1fr) 44px 44px 44px 24px;
		}
		.prog {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.tl-i {
			grid-template-columns: 64px 20px minmax(0, 1fr);
		}
		.tl-i > :global(.avatar),
		.tl-i > .ess-badge {
			grid-column: 3;
			justify-self: start;
		}
	}
	@media (max-width: 720px) {
		.right {
			margin-left: 0;
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
