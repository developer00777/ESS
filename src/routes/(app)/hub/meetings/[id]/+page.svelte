<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import Video from '@lucide/svelte/icons/video';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import AssigneeSelect from '$lib/components/hub/AssigneeSelect.svelte';
	import { api, hub } from '$lib/hub/client.svelte';
	import { dueLabel, longDay, timeIst } from '$lib/hub/format';
	import { PRIORITY_LABEL, TASK_PRIORITIES } from '$lib/tasks/rules';
	import type { MeetingItemView } from '$lib/tasks/types';

	/**
	 * Minutes review: Zoom's summary on the left, the action items it found on
	 * the right. The host fixes owners and dates, drops noise, adds anything
	 * missed, and publishes. Nothing reaches anyone before that.
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

	const editable = (i: MeetingItemView) => m.isHost && !i.taskId;
	const pending = $derived(items.filter((i) => i.included && !i.taskId));
	const missing = $derived(pending.filter((i) => !i.ownerId).length);
	const approvals = $derived(pending.filter((i) => i.ownerId && m.assignable.approval.some((p) => p.id === i.ownerId)).length);

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
</script>

<svelte:head><title>{m.topic} · Champ Hub — Champ HR ESS Portal</title></svelte:head>

<div class="page">
	<a class="back" href="/hub/meetings"><ArrowLeft size={15} /> Meetings</a>
	<header class="ess-page-head head">
		<div>
			<h1 class="ess-page-title">{m.topic}</h1>
			<p class="ess-page-sub">
				{longDay(m.startedAt)}, {timeIst(m.startedAt)} IST{m.durationMin ? ` · ${m.durationMin} min` : ''} · {m.attendees.length + m.guestCount} attendees{m.host ? ` · hosted by ${m.host.fullName}` : ''}
			</p>
		</div>
	</header>

	{#if !m.isHost}
		<section class="pane narrow">
			<h2>Your tasks from this meeting</h2>
			{#each items as i (i.id)}
				<div class="mine"><strong>{i.title}</strong>{#if i.taskId}<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/tasks?task={i.taskId}">Open task</a>{/if}</div>
			{:else}
				<p class="ess-help">{m.state === 'published' ? 'Nothing from this meeting was given to you.' : `${m.host?.fullName ?? 'The host'} is still reviewing the minutes.`}</p>
			{/each}
			<p class="ess-help">The full minutes are visible to the meeting host.</p>
		</section>
	{:else}
		<div class="review">
			<section class="pane summary" aria-labelledby="sum-h">
				<div class="pane-head">
					<h2 id="sum-h">{m.source === 'pasted' ? 'Your notes' : 'Meeting summary'}</h2>
					<span class="chip info"><Video size={12} /> {m.source === 'pasted' ? 'Pasted' : 'Written automatically'}</span>
				</div>
				{#if m.summary}
					{#if m.summary.overview}<div class="sum"><h3>Overview</h3><p>{m.summary.overview}</p></div>{/if}
					{#each m.summary.details as d, i (i)}
						<div class="sum"><h3>{d.label}</h3><p>{d.text}</p></div>
					{/each}
					{#if m.summary.nextSteps.length}
						<div class="sum">
							<h3>Next steps</h3>
							<ol class="steps">
								{#each m.summary.nextSteps as s, i (i)}
									<li class:lit={lit === i}><span class="n">{String(i + 1).padStart(2, '0')}</span><span>{s}</span></li>
								{/each}
							</ol>
						</div>
					{/if}
				{:else}
					<p class="ess-help">No summary yet.</p>
				{/if}
			</section>

			<section class="pane" aria-labelledby="items-h">
				<div class="pane-head">
					<h2 id="items-h">Action items</h2>
				</div>
				{#if m.state !== 'published' || pending.length}
					<p class="ess-help">Hover or focus an item to see the line it came from. Nothing is sent until you publish.</p>
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
									<strong class="grow">{i.title}</strong>
									<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/hub/tasks?task={i.taskId}">Open task</a>
								</div>
								<span class="done-line"><CircleCheck size={13} /> Published to {i.ownerName}{i.dueDate ? ` · due ${dueLabel(i.dueDate)}` : ''}</span>
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
											<label class="ess-label" for="due-{i.id}">Due</label>
											<input id="due-{i.id}" type="date" class="ess-input" value={i.dueDate ?? ''} onchange={(e) => update(i, { dueDate: e.currentTarget.value || null })} />
										</div>
										<div class="ess-field">
											<label class="ess-label" for="pri-{i.id}">Priority</label>
											<select id="pri-{i.id}" class="ess-select" value={i.priority} onchange={(e) => update(i, { priority: e.currentTarget.value as MeetingItemView['priority'] })}>
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
						<p class="ess-help">No action items were found. Add any that were agreed.</p>
					{/each}
				</div>

				<form class="add" onsubmit={add}>
					<input class="ess-input" bind:value={newTitle} placeholder="Add an action item the summary missed" aria-label="New action item" />
					<button type="submit" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy}><Plus size={14} /> Add</button>
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
	{/if}
</div>

<style>
	.page {
		display: grid;
		gap: 14px;
		min-width: 0;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		font-size: 13px;
		width: max-content;
	}
	.head {
		margin-bottom: 0;
	}
	.review {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 16px;
		align-items: start;
	}
	.pane {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-bg);
		border: 1px solid var(--ess-glass-border);
		min-width: 0;
	}
	.pane.narrow {
		max-width: 720px;
	}
	.summary {
		position: sticky;
		top: 76px;
		max-height: calc(100dvh - 100px);
		overflow-y: auto;
	}
	.pane-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		font-family: var(--ess-font-display);
		font-size: 16px;
	}
	.sum h3 {
		margin: 0 0 3px;
		font-size: 12.5px;
	}
	.sum p {
		margin: 0;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 5px;
	}
	.steps li {
		display: flex;
		gap: 8px;
		padding: 6px 9px;
		border-radius: 9px;
		border: 1px solid transparent;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.steps li.lit {
		border-color: color-mix(in oklab, var(--ess-primary) 45%, transparent);
		background: var(--ess-primary-soft);
		color: var(--ess-text);
	}
	.n {
		font-family: var(--ess-font-mono);
		font-size: 11px;
		color: var(--ess-text-muted);
		padding-top: 2px;
	}
	.chip {
		display: inline-flex;
		gap: 5px;
		align-items: center;
		padding: 2px 9px;
		border-radius: 99px;
		font-size: 11.5px;
		font-weight: 600;
	}
	.chip.info {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.items {
		display: grid;
		gap: 10px;
	}
	.item {
		display: grid;
		gap: 9px;
		padding: 12px;
		border-radius: 12px;
		background: var(--ess-pane-raised-bg);
		border: 1px solid var(--ess-border);
	}
	.item.warn {
		border-color: color-mix(in oklab, var(--ess-warning) 55%, var(--ess-border));
	}
	.item.dropped {
		opacity: 0.55;
	}
	.top {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.grow {
		flex: 1;
	}
	.title {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-weight: 600;
		font-size: 13.5px;
		color: var(--ess-text);
		border: 1px solid transparent;
		background: transparent;
		border-radius: 8px;
		padding: 4px 6px;
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
		gap: 8px;
	}
	blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--ess-border-strong);
		font-style: italic;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.note {
		margin: 0;
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
	}
	.note.warn {
		color: var(--ess-warning);
	}
	.note.info {
		color: var(--ess-info);
	}
	.done-line {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: 12.5px;
		color: var(--ess-success);
	}
	.add {
		display: flex;
		gap: 6px;
	}
	.publish {
		position: sticky;
		bottom: 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		box-shadow: var(--ess-elev-3);
	}
	.publish p {
		margin: 0;
		font-size: 13px;
	}
	.miss {
		color: var(--ess-warning);
	}
	.mine {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	@media (max-width: 960px) {
		.review {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary {
			position: static;
			max-height: none;
		}
	}
	@media (max-width: 560px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
