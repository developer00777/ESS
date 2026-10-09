<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import Users from '@lucide/svelte/icons/users';
	import FileText from '@lucide/svelte/icons/file-text';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Info from '@lucide/svelte/icons/info';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Avatar from '$lib/components/Avatar.svelte';
	import AssigneeSelect from '$lib/components/hub/AssigneeSelect.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { dueLabel, longDay, timeIst } from '$lib/hub/format';
	import { PRIORITY_LABEL, TASK_PRIORITIES } from '$lib/tasks/rules';
	import type { MeetingItemView } from '$lib/tasks/types';

	/**
	 * Minutes review: the summary, the action items it found, and what the
	 * host has to do before anything reaches anyone. The host fixes owners and
	 * dates, drops noise, adds anything missed, and publishes.
	 */
	let { data } = $props();
	const m = $derived(data.meeting);
	const meId = $derived(data.hubMe.id);

	let items = $state<MeetingItemView[]>([]);
	$effect(() => {
		items = data.meeting.items;
	});

	let lit = $state<number | null>(null);
	let busy = $state(false);
	let newTitle = $state('');
	let tab = $state<'summary' | 'items'>('summary');

	const editable = (i: MeetingItemView) => m.isHost && !i.taskId;
	const kept = $derived(items.filter((i) => i.included));
	const pending = $derived(items.filter((i) => i.included && !i.taskId));
	const missing = $derived(pending.filter((i) => !i.ownerId).length);
	const approvals = $derived(pending.filter((i) => i.ownerId && m.assignable.approval.some((p) => p.id === i.ownerId)).length);
	const mine = $derived(items.filter((i) => i.ownerId === meId && i.included));

	async function update(i: MeetingItemView, patch: Partial<Pick<MeetingItemView, 'title' | 'ownerId' | 'dueDate' | 'priority' | 'included'>>) {
		const before = items;
		items = items.map((x) => (x.id === i.id ? { ...x, ...patch } : x));
		const r = await api(`/api/meetings/items/${i.id}`, 'PATCH', patch);
		if (!r.ok) {
			items = before;
			hub.say(r.message, { tone: 'bad' });
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const r = await api<{ id: string }>(`/api/meetings/${m.id}/items`, 'POST', { title: newTitle.trim() || 'New action item' });
		busy = false;
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		newTitle = '';
		hub.changed(0);
	}

	async function publish() {
		busy = true;
		const r = await api<{ published: number; message?: string }>(`/api/meetings/${m.id}/publish`, 'POST', {});
		busy = false;
		if (!r.ok) return hub.say(r.message, { tone: 'bad' });
		hub.say(r.message ?? `Published ${r.published} ${r.published === 1 ? 'task' : 'tasks'}. Owners have them in To do.`);
		hub.changed(0);
	}

	const conf = (c: number | null) => (c === null ? '' : `${Math.round(c * 100)}%`);
	const attendeeCount = $derived(m.attendees.length + m.guestCount);
</script>

<svelte:head><title>{m.topic} · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<a class="back" href="/hub/meetings"><ArrowLeft size={15} /> Back to Meetings</a>
	<header class="head">
		<h1 class="ess-page-title">{m.topic}</h1>
		<div class="facts">
			<span><Calendar size={16} strokeWidth={1.75} /> {longDay(m.startedAt)}, {timeIst(m.startedAt)} IST</span>
			{#if m.durationMin}<span><Clock size={16} strokeWidth={1.75} /> {m.durationMin} minutes</span>{/if}
			<span><Users size={16} strokeWidth={1.75} /> {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}{m.host ? ` · hosted by ${m.host.fullName}` : ''}</span>
			{#if m.attendees.length}
				<span class="stack">{#each m.attendees.slice(0, 8) as p (p.id)}<Avatar userId={p.id} fullName={p.fullName} size="sm" />{/each}{#if m.attendees.length > 8}<span class="more">+{m.attendees.length - 8}</span>{/if}</span>
			{/if}
		</div>
	</header>

	{#if !m.isHost}
		<div class="ess-split">
			<section class="ess-card" aria-labelledby="mine-h">
				<div class="ess-card-head">
					<h2 id="mine-h" class="ess-h2">Your tasks from this meeting</h2>
				</div>
				<div class="ess-rows">
					{#each items as i (i.id)}
						<div class="ess-row">
							<span class="ess-tile ess-tile--sm"><ListChecks size={16} /></span>
							<span class="ess-row__body">
								<span class="ess-row__title">{i.title}</span>
								{#if i.dueDate}<span class="ess-row__meta">Due {dueLabel(i.dueDate)}</span>{/if}
							</span>
							<span class="ess-row__end">{#if i.taskId}<a class="ess-btn ess-btn--secondary ess-btn--sm" href="/hub/tasks?task={i.taskId}">Open task</a>{/if}</span>
						</div>
					{:else}
						<p class="empty">{m.state === 'published' ? 'Nothing from this meeting was given to you.' : `${m.host?.fullName ?? 'The host'} is still reviewing the minutes.`}</p>
					{/each}
				</div>
			</section>
			<aside class="ess-notice ess-notice--info">
				<span class="ess-notice__icon"><Info size={15} /></span>
				<div class="ess-notice__body"><strong>Minutes stay with the host</strong>The full summary is visible to the person who hosted the meeting. You see the tasks they publish to you.</div>
			</aside>
		</div>
	{:else}
		<div class="ess-tabs tabs" role="tablist" aria-label="Minutes">
			<button type="button" role="tab" class="ess-tab" aria-selected={tab === 'summary'} onclick={() => (tab = 'summary')}>{m.source === 'pasted' ? 'Your notes' : 'Summary'}</button>
			<button type="button" role="tab" class="ess-tab" aria-selected={tab === 'items'} onclick={() => (tab = 'items')}>Action items{#if kept.length}<span class="ess-count">{kept.length}</span>{/if}</button>
		</div>

		<div class="ess-split review">
			<div class="ess-stack">
				{#if tab === 'summary'}
					<section class="ess-card" aria-labelledby="sum-h">
						<div class="ess-card-head">
							<h2 id="sum-h" class="ess-h2">{m.source === 'pasted' ? 'Your notes' : 'Meeting summary'}</h2>
							<span class="ess-badge ess-badge--accent">{m.source === 'pasted' ? 'Pasted' : 'Written automatically'}</span>
						</div>
						{#if m.summary}
							<div class="sum-rows">
								{#if m.summary.overview}
									<div class="sum">
										<span class="ess-tile"><FileText size={18} strokeWidth={1.75} /></span>
										<h3>Overview</h3>
										<p>{m.summary.overview}</p>
									</div>
								{/if}
								{#each m.summary.details as d, i (i)}
									<div class="sum">
										<span class="ess-tile"><CircleCheck size={18} strokeWidth={1.75} /></span>
										<h3>{d.label}</h3>
										<p>{d.text}</p>
									</div>
								{/each}
								{#if m.summary.nextSteps.length}
									<div class="sum">
										<span class="ess-tile"><ListChecks size={18} strokeWidth={1.75} /></span>
										<h3>Next steps</h3>
										<ol class="steps">
											{#each m.summary.nextSteps as s, i (i)}
												<li class:lit={lit === i}>{s}</li>
											{/each}
										</ol>
									</div>
								{/if}
							</div>
						{:else}
							<p class="empty">No summary yet.</p>
						{/if}
					</section>
				{/if}

				<section class="ess-card" aria-labelledby="items-h">
					<div class="ess-card-head">
						<h2 id="items-h" class="ess-h2">Action items{#if kept.length} ({kept.length}){/if}</h2>
						{#if pending.length}
							<button type="button" class="ess-btn ess-btn--primary" disabled={busy || missing > 0} title={missing ? 'Give every kept item an owner, or drop it' : undefined} onclick={publish}>
								<Send size={15} /> Publish {pending.length} {pending.length === 1 ? 'task' : 'tasks'}
							</button>
						{:else if m.state === 'published'}
							<span class="ess-badge ess-badge--ok"><CircleCheck size={12} /> Published{m.publishedAt ? ` ${longDay(m.publishedAt)}` : ''}</span>
						{/if}
					</div>
					{#if m.state !== 'published' || pending.length}
						<p class="ess-help hint">Hover or focus an item to see the line it came from. Nothing is sent until you publish.</p>
					{/if}
					<div class="items">
						{#each items as i (i.id)}
							<div
								class="item"
								class:dropped={!i.included}
								class:warn={i.included && !i.ownerId && !i.taskId}
								role="group"
								aria-label={i.title}
								onmouseenter={() => (lit = i.stepIndex)}
								onfocusin={() => (lit = i.stepIndex)}
							>
								{#if i.taskId}
									<div class="top">
										<span class="ess-tile ess-tile--sm ess-tile--ok"><CircleCheck size={15} /></span>
										<strong class="grow">{i.title}</strong>
										<a class="ess-btn ess-btn--secondary ess-btn--sm" href="/hub/tasks?task={i.taskId}">Open task</a>
									</div>
									<span class="done-line">Published to {i.ownerName}{i.dueDate ? ` · due ${dueLabel(i.dueDate)}` : ''}</span>
								{:else}
									<div class="top">
										<input class="title" aria-label="Action item" value={i.title} disabled={!editable(i)} onblur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== i.title && update(i, { title: e.currentTarget.value })} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
										{#if i.confidence !== null && i.confidence < 1}<span class="conf" title="How sure the extraction was">{i.confidence < 0.6 ? 'low ' : ''}{conf(i.confidence)}</span>{/if}
										{#if i.included}
											<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm drop" onclick={() => update(i, { included: false })}>Drop</button>
										{:else}
											<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={() => update(i, { included: true })}>Keep</button>
										{/if}
									</div>
									{#if i.included}
										<div class="grid">
											<div class="ess-field">
												<label class="ess-label" for="own-{i.id}">Owner</label>
												<AssigneeSelect id="own-{i.id}" groups={m.assignable} value={i.ownerId} {meId} noneLabel="Needs owner" onchange={(v) => update(i, { ownerId: v })} />
											</div>
											<div class="ess-field">
												<label class="ess-label" for="due-{i.id}">Due date</label>
												<input id="due-{i.id}" type="date" class="ess-input" value={i.dueDate ?? ''} onchange={(e) => update(i, { dueDate: e.currentTarget.value || null })} />
											</div>
											<div class="ess-field">
												<label class="ess-label" for="pri-{i.id}">Priority</label>
												<select id="pri-{i.id}" class="ess-select pri-{i.priority}" value={i.priority} onchange={(e) => update(i, { priority: e.currentTarget.value as MeetingItemView['priority'] })}>
													{#each TASK_PRIORITIES as p (p)}<option value={p}>{PRIORITY_LABEL[p]}</option>{/each}
												</select>
											</div>
										</div>
										{#if i.stepIndex !== null && m.summary?.nextSteps[i.stepIndex]}
											<blockquote>"{m.summary.nextSteps[i.stepIndex]}"</blockquote>
										{:else}
											<blockquote>Added by the host</blockquote>
										{/if}
										{#if !i.ownerId}
											<p class="note warn"><CircleAlert size={13} /> {i.ownerHeard ? `Couldn't match "${i.ownerHeard}" to a login. Pick an owner or drop it.` : 'The minutes name nobody. Pick an owner or drop it.'}</p>
										{:else if m.assignable.approval.some((p) => p.id === i.ownerId)}
											<p class="note info"><Send size={13} /> {m.assignable.approval.find((p) => p.id === i.ownerId)?.approverName ?? 'Their lead'} approves this before {i.ownerName?.split(' ')[0]} can start it.</p>
										{/if}
									{/if}
								{/if}
							</div>
						{:else}
							<p class="empty">No action items were found. Add any that were agreed.</p>
						{/each}
					</div>

					<form class="add" onsubmit={add}>
						<input class="ess-input" bind:value={newTitle} placeholder="Add an action item the summary missed" aria-label="New action item" />
						<button type="submit" class="ess-btn ess-btn--secondary" disabled={busy}><Plus size={14} /> Add</button>
					</form>

					{#if pending.length}
						<div class="publish">
							<p>
								<strong>{pending.length - missing} of {pending.length}</strong> ready{#if missing}<span class="miss"> · {missing} {missing === 1 ? 'needs' : 'need'} an owner</span>{/if}{#if approvals} · {approvals} {approvals === 1 ? 'needs' : 'need'} a lead's approval{/if}
							</p>
							<button type="button" class="ess-btn ess-btn--primary" disabled={busy || missing > 0} title={missing ? 'Give every kept item an owner, or drop it' : undefined} onclick={publish}>
								<Send size={15} /> Publish {pending.length} {pending.length === 1 ? 'task' : 'tasks'}
							</button>
						</div>
					{:else if m.state === 'published'}
						<p class="ess-alert ess-alert--success"><CircleCheck size={16} /> Published{m.publishedAt ? ` on ${longDay(m.publishedAt)}` : ''}. Owners were told, and your team channel got one line listing them.</p>
					{/if}
				</section>
			</div>

			<aside class="ess-stack">
				<section class="ess-card" aria-labelledby="yours-h">
					<div class="ess-card-head">
						<h2 id="yours-h" class="ess-h2">Your tasks from this meeting</h2>
						<a class="ess-link" href="/hub/tasks" aria-label="All tasks"><ChevronRight size={16} /></a>
					</div>
					<div class="ess-rows">
						{#each mine as i (i.id)}
							<div class="ess-row">
								<span class="ess-tile" class:ess-tile--ok={!!i.taskId}><ListChecks size={18} strokeWidth={1.75} /></span>
								<span class="ess-row__body">
									<span class="ess-row__title">{i.title}</span>
									<span class="ess-row__meta">{i.taskId ? 'Published to your To do' : 'Publishes with the rest'}</span>
								</span>
								<span class="ess-row__end side-end">
									<span class="ess-badge" class:ess-badge--ok={!!i.taskId} class:ess-badge--warn={!i.taskId}>{i.taskId ? 'To do' : 'Pending'}</span>
									{#if i.dueDate}<small>{dueLabel(i.dueDate)}</small>{/if}
								</span>
							</div>
						{:else}
							<p class="empty">None of the action items are yours.</p>
						{/each}
					</div>
				</section>

				<section class="ess-card" aria-labelledby="rev-h">
					<div class="ess-card-head">
						<h2 id="rev-h" class="ess-h2">Minutes review</h2>
						{#if m.state === 'published'}
							<span class="ess-badge ess-badge--ok">Published</span>
						{:else if pending.length}
							<span class="ess-badge ess-badge--warn">Pending</span>
						{:else}
							<span class="ess-badge">Nothing to publish</span>
						{/if}
					</div>
					<dl class="ess-kv">
						<dt>Kept</dt>
						<dd>{kept.length} {kept.length === 1 ? 'item' : 'items'}</dd>
						<dt>Need an owner</dt>
						<dd class:bad={missing > 0}>{missing}</dd>
						{#if approvals}
							<dt>Need approval</dt>
							<dd>{approvals}</dd>
						{/if}
						<dt>Dropped</dt>
						<dd>{items.length - kept.length}</dd>
					</dl>
					{#if pending.length}
						<button type="button" class="ess-btn ess-btn--primary wide" disabled={busy || missing > 0} onclick={publish}><Send size={15} /> Approve and publish</button>
					{/if}
				</section>

				{#if m.state !== 'published'}
					<div class="ess-notice ess-notice--info">
						<span class="ess-notice__icon"><Info size={15} /></span>
						<div class="ess-notice__body"><strong>Review before publishing</strong>Check the owners, dates and wording. Once published, each item becomes a task in its owner's To do and your team channel gets one line listing them.</div>
					</div>
				{/if}
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
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
		font-size: 14px;
		width: max-content;
	}
	.head {
		display: grid;
		gap: 12px;
	}
	.facts {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 22px;
		font-size: 15px;
		color: var(--ess-text-secondary);
	}
	.facts > span {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.stack {
		display: inline-flex;
	}
	.stack :global(> *:not(:first-child)) {
		margin-left: -6px;
	}
	.stack :global(.avatar) {
		box-shadow: 0 0 0 2px var(--ess-canvas);
	}
	.more {
		font-size: 13px;
		margin-left: 6px;
	}
	.tabs {
		align-self: flex-start;
	}
	.review {
		--ess-aside-width: 400px;
	}
	.sum-rows {
		display: grid;
	}
	.sum {
		display: grid;
		grid-template-columns: 44px 120px minmax(0, 1fr);
		gap: 20px;
		align-items: start;
		padding: 18px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.sum:last-child {
		border-bottom: none;
	}
	.sum h3 {
		margin: 8px 0 0;
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.sum p {
		margin: 8px 0 0;
		font-size: 14.5px;
		line-height: 1.6;
		color: var(--ess-text-secondary);
	}
	.steps {
		margin: 8px 0 0;
		padding-left: 20px;
		display: grid;
		gap: 6px;
		font-size: 14.5px;
		color: var(--ess-text-secondary);
	}
	.steps li {
		padding: 2px 6px;
		margin-left: -6px;
		border-radius: 6px;
		transition: background var(--ess-t-fast);
	}
	.steps li.lit {
		background: var(--ess-primary-soft);
		color: var(--ess-text);
	}
	.hint {
		margin: -6px 0 12px;
	}
	.items {
		display: grid;
		gap: 10px;
	}
	.item {
		display: grid;
		gap: 10px;
		padding: 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
	}
	.item.warn {
		border-color: var(--ess-warning);
	}
	.item.dropped {
		opacity: 0.55;
		background: var(--ess-sunken);
	}
	.top {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.grow {
		flex: 1;
		font-weight: 500;
	}
	.title {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-weight: 500;
		font-size: 14.5px;
		color: var(--ess-text);
		border: 1px solid transparent;
		background: transparent;
		border-radius: var(--ess-radius-sm);
		padding: 5px 8px;
		margin-left: -8px;
	}
	.title:hover:not(:disabled),
	.title:focus {
		border-color: var(--ess-border);
		background: var(--ess-field-bg);
		outline: none;
	}
	.conf {
		font-family: var(--ess-font-mono);
		font-size: 11px;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}
	.drop {
		color: var(--ess-danger);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
	}
	.pri-high {
		color: var(--ess-danger);
	}
	.pri-medium {
		color: var(--ess-warning);
	}
	.pri-low {
		color: var(--ess-success);
	}
	blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--ess-border-strong);
		font-style: italic;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.note {
		margin: 0;
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12.5px;
	}
	.note.warn {
		color: var(--ess-warning);
	}
	.note.info {
		color: var(--ess-primary-text);
	}
	.done-line {
		font-size: 13px;
		color: var(--ess-success);
	}
	.add {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
	.publish {
		position: sticky;
		bottom: 12px;
		margin-top: 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		box-shadow: var(--ess-elev-3);
	}
	.publish p {
		margin: 0;
		font-size: 13.5px;
	}
	.miss {
		color: var(--ess-warning);
	}
	.side-end {
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.side-end small {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.ess-kv dd.bad {
		color: var(--ess-danger);
	}
	.wide {
		width: 100%;
		margin-top: 16px;
	}
	.empty {
		margin: 0;
		padding: 18px 0;
		text-align: center;
		color: var(--ess-text-muted);
		font-size: 13.5px;
	}
	@media (max-width: 720px) {
		.sum {
			grid-template-columns: 44px minmax(0, 1fr);
		}
		.sum p,
		.sum .steps {
			grid-column: 2;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
