<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import Send from '@lucide/svelte/icons/send-horizontal';
	import Download from '@lucide/svelte/icons/download';
	import { chat } from '$lib/chat/client.svelte';
	import type { ChampCard, ChampMessage, ChampReport, ChampResult } from '$lib/champ';
	import { CHAMP_LIMITS } from '$lib/champ';

	/**
	 * Champ, inside Champ Chat: a Chat tab (questions, drafted cards, report
	 * tables) and a Requests tab (tasks and approvals waiting on you). It fills
	 * the conversation area when "Champ" is picked in the chat sidebar.
	 * Nothing changes until a card's button is pressed, and the button runs the
	 * portal's own endpoint.
	 */

	let { firstName, onwaiting, initialQuestion = '' }: { firstName: string; onwaiting?: (n: number) => void; /** Asked once on open (Champ Hub's "Ask Champ"). */ initialQuestion?: string } = $props();

	let asked = '';
	$effect(() => {
		const q = initialQuestion.trim();
		if (!q || q === asked) return;
		asked = q;
		tab = 'chat';
		void ask(q);
	});

	type Turn =
		| { role: 'user'; text: string }
		| { role: 'assistant'; text: string; cards: ChampCard[]; report?: ChampReport };

	const KEY = 'essChamp';
	let tab = $state<'chat' | 'requests'>('chat');
	let turns = $state<Turn[]>([]);
	let input = $state('');
	let asking = $state(false);
	let bodyEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);
	let cardState = $state<Record<string, { status: 'done' | 'failed' | 'busy'; text: string }>>({});
	let rejectFor = $state<string | null>(null);
	let rejectNote = $state('');

	// Requests tab
	type Task = { id: string; title: string; status: string; note: string | null; dueAt: string | null; mine: boolean; fromName: string; toName: string; decidedAt: string | null };
	let tasks = $state<Task[]>([]);
	let approvals = $state<ChampCard[]>([]);
	let declineFor = $state<string | null>(null);
	let declineNote = $state('');
	const waiting = $derived(tasks.filter((t) => t.mine && t.status === 'open').length + approvals.length);
	$effect(() => onwaiting?.(waiting));

	$effect(() => {
		try {
			const saved = sessionStorage.getItem(KEY);
			if (saved) turns = JSON.parse(saved);
		} catch {
			/* storage blocked: start fresh */
		}
		void loadRequests();
		const off = chat.on((e) => {
			if (e.type === 'tasks.changed' || e.type === 'card.updated' || e.type === 'reconnected') void loadRequests();
		});
		const t = setInterval(loadRequests, 60_000);
		return () => {
			off();
			clearInterval(t);
		};
	});

	// ?tab=requests (from an ESS notice about a task) opens the Requests tab.
	$effect(() => {
		const want = page.url.searchParams.get('tab');
		if (want === 'requests' || want === 'chat') tab = want;
	});

	function persist() {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-30)));
		} catch {
			/* fine */
		}
	}

	async function loadRequests() {
		try {
			const [t, a] = await Promise.all([fetch('/api/champ/tasks'), fetch('/api/champ/approvals')]);
			if (t.ok) tasks = await t.json();
			if (a.ok) approvals = await a.json();
		} catch {
			/* offline */
		}
	}

	async function scrollDown() {
		await tick();
		bodyEl?.scrollTo({ top: bodyEl.scrollHeight, behavior: 'smooth' });
	}

	async function ask(q = input) {
		const question = q.trim();
		if (!question || asking) return;
		input = '';
		turns = [...turns, { role: 'user', text: question }];
		asking = true;
		void scrollDown();
		const history: ChampMessage[] = turns
			.slice(0, -1)
			.slice(-CHAMP_LIMITS.history)
			.map((t) => ({ role: t.role, content: t.text }));
		try {
			const res = await fetch('/api/champ/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question, history })
			});
			const r: ChampResult = res.ok ? await res.json() : { reply: 'That did not go through. Try again.', cards: [], usedTools: [] };
			turns = [...turns, { role: 'assistant', text: r.reply, cards: r.cards ?? [], report: r.report }];
		} catch {
			turns = [...turns, { role: 'assistant', text: 'I could not reach the portal. Check your connection.', cards: [] }];
		} finally {
			asking = false;
			persist();
			void scrollDown();
		}
	}

	function clear() {
		turns = [];
		cardState = {};
		persist();
		inputEl?.focus();
	}

	async function press(card: ChampCard, action: string, note?: string) {
		if (card.kind === 'announcement_draft') {
			await goto(`/hub/c/announcements?compose=1&draft=${encodeURIComponent(JSON.stringify(card.payload))}`);
			return;
		}
		if (action === 'reject' && note === undefined) {
			rejectFor = card.id;
			rejectNote = '';
			return;
		}
		cardState[card.id] = { status: 'busy', text: '' };
		try {
			const res = await fetch('/api/champ/apply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind: card.kind, action, payload: card.payload, note })
			});
			const r = await res.json().catch(() => ({ message: 'That did not work' }));
			cardState[card.id] = res.ok
				? { status: 'done', text: card.kind === 'approve' ? (action === 'approve' ? 'Approved' : 'Rejected') : r.message && r.message !== 'Done' ? r.message : card.doneText }
				: { status: 'failed', text: r.message ?? 'That did not work' };
			rejectFor = null;
			if (res.ok) void loadRequests();
		} catch {
			cardState[card.id] = { status: 'failed', text: 'Could not reach the portal' };
		}
	}

	async function decide(t: Task, action: 'done' | 'decline' | 'withdraw') {
		if (action === 'decline' && declineFor !== t.id) {
			declineFor = t.id;
			declineNote = '';
			return;
		}
		const res = await fetch(`/api/champ/tasks/${t.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, note: action === 'decline' ? declineNote : '' })
		});
		if (res.ok) {
			declineFor = null;
			await loadRequests();
		}
	}

	function csv(report: ChampReport) {
		const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
		const text = [report.columns.map((c) => cell(c.label)).join(','), ...report.rows.map((r) => r.map(cell).join(','))].join('\r\n');
		const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${report.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'report'}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void ask();
		}
	}

	const due = (d: string | null) =>
		d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null;

	const suggestions = [
		'How much leave do I have?',
		'What is the next holiday?',
		'Who do I report to?',
		'Anything waiting on me?'
	];
</script>

	<section class="panel" aria-label="Champ">
		<header class="head">
			<span class="mark"><Sparkles size={15} /></span>
			<div class="title">
				<strong>Champ</strong>
				<span>Answers from ESS records only</span>
			</div>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={clear}>Clear</button>
		</header>
		<div class="tabs" role="tablist">
			<button type="button" role="tab" aria-selected={tab === 'chat'} onclick={() => (tab = 'chat')}>Chat</button>
			<button type="button" role="tab" aria-selected={tab === 'requests'} onclick={() => (tab = 'requests')}>
				Requests {#if waiting}<span class="count">{waiting}</span>{/if}
			</button>
		</div>

		{#if tab === 'chat'}
			<div class="body" bind:this={bodyEl}>
				{#if turns.length === 0}
					<div class="bub a">Hi {firstName}! Ask me about your leave, attendance, holidays, policies or your team. I never change anything without a button you press.</div>
					<div class="sugs">
						{#each suggestions as s (s)}
							<button type="button" class="sug" onclick={() => ask(s)}>{s}</button>
						{/each}
					</div>
				{/if}
				{#each turns as t, i (i)}
					{#if t.role === 'user'}
						<div class="bub u">{t.text}</div>
					{:else}
						<div class="bub a">{t.text}</div>
						{#if t.report}
							<div class="report">
								<div class="report-head">
									<strong>{t.report.title}</strong>
									<span>{t.report.rows.length} rows{t.report.truncated ? ' (first 200)' : ''}</span>
									<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => csv(t.report!)}>
										<Download size={13} /> CSV
									</button>
								</div>
								<div class="table-wrap">
									<table>
										<thead><tr>{#each t.report.columns as c (c.key)}<th>{c.label}</th>{/each}</tr></thead>
										<tbody>
											{#each t.report.rows.slice(0, 25) as row, ri (ri)}
												<tr>{#each row as cell, ci (ci)}<td>{cell}</td>{/each}</tr>
											{/each}
										</tbody>
									</table>
								</div>
								{#if t.report.rows.length > 25}<p class="more">…{t.report.rows.length - 25} more rows in the CSV</p>{/if}
							</div>
						{/if}
						{#each t.cards as card (card.id)}
							{@render cardView(card)}
						{/each}
					{/if}
				{/each}
				{#if asking}<div class="bub a"><span class="dots"><i></i><i></i><i></i></span></div>{/if}
			</div>
			<form class="foot" onsubmit={(e) => { e.preventDefault(); void ask(); }}>
				<textarea
					bind:this={inputEl}
					bind:value={input}
					onkeydown={onKey}
					rows="1"
					maxlength={CHAMP_LIMITS.question}
					placeholder="Ask Champ…"
					aria-label="Ask Champ"
				></textarea>
				<button class="ess-btn ess-btn--primary ess-btn--sm" type="submit" disabled={asking || !input.trim()} aria-label="Send">
					<Send size={15} />
				</button>
			</form>
		{:else}
			<div class="body">
				<span class="section">Waiting on you</span>
				{#each approvals as card (card.id)}
					{@render cardView(card)}
				{/each}
				{#each tasks.filter((t) => t.mine && t.status === 'open') as t (t.id)}
					<div class="card">
						<span class="k">Task from {t.fromName}</span>
						<strong>{t.title}</strong>
						{#if t.dueAt}<span class="line">Due {due(t.dueAt)}</span>{/if}
						{#if declineFor === t.id}
							<input class="ess-input" bind:value={declineNote} placeholder="What's stopping it?" aria-label="Reason" />
						{/if}
						<div class="btns">
							<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={() => decide(t, 'done')}>Mark done</button>
							<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={declineFor === t.id && !declineNote.trim()} onclick={() => decide(t, 'decline')}>
								{declineFor === t.id ? 'Send' : "Can't do this"}
							</button>
						</div>
					</div>
				{/each}
				{#if approvals.length === 0 && !tasks.some((t) => t.mine && t.status === 'open')}
					<p class="empty">Nothing is waiting on you.</p>
				{/if}

				{#if tasks.some((t) => !t.mine)}
					<span class="section">Raised by you</span>
					{#each tasks.filter((t) => !t.mine) as t (t.id)}
						<div class="card" class:settled={t.status !== 'open'}>
							<span class="k">Task for {t.toName} · {t.status === 'open' ? 'open' : t.status}</span>
							<strong>{t.title}</strong>
							{#if t.note}<span class="line">"{t.note}"</span>{/if}
							{#if t.status === 'open'}
								<div class="btns"><button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => decide(t, 'withdraw')}>Withdraw</button></div>
							{/if}
						</div>
					{/each}
				{/if}
				{#if tasks.some((t) => t.mine && t.status !== 'open')}
					<span class="section">Settled recently</span>
					{#each tasks.filter((t) => t.mine && t.status !== 'open') as t (t.id)}
						<div class="card settled"><span class="k">From {t.fromName} · {t.status}</span><strong>{t.title}</strong></div>
					{/each}
				{/if}
			</div>
		{/if}
	</section>

{#snippet cardView(card: ChampCard)}
	{@const st = cardState[card.id]}
	<div class="card" class:done={st?.status === 'done'} class:failed={st?.status === 'failed'}>
		<span class="k">{st?.status === 'done' ? st.text : card.label}</span>
		<strong>{card.title}</strong>
		{#each card.lines as line (line)}<span class="line">{line}</span>{/each}
		{#if st?.status === 'failed'}<span class="err">{st.text}</span>{/if}
		{#if rejectFor === card.id}
			<input class="ess-input" bind:value={rejectNote} placeholder="Reason for rejecting (they will see it)" aria-label="Reason" />
		{/if}
		{#if st?.status !== 'done'}
			<div class="btns">
				{#each card.buttons as b (b.action)}
					<button
						type="button"
						class="ess-btn ess-btn--sm {b.primary ? 'ess-btn--primary' : 'ess-btn--secondary'}"
						disabled={st?.status === 'busy' || (rejectFor === card.id && b.action === 'reject' && !rejectNote.trim())}
						onclick={() => press(card, b.action, rejectFor === card.id && b.action === 'reject' ? rejectNote : undefined)}
					>
						{rejectFor === card.id && b.action === 'reject' ? 'Send rejection' : b.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--ess-border);
	}
	.mark {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #fff;
		background: linear-gradient(150deg, #f0b35a, #e879a6);
	}
	.title {
		flex: 1;
		display: grid;
		line-height: 1.2;
	}
	.title span {
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 0 10px;
		border-bottom: 1px solid var(--ess-border);
	}
	.tabs button {
		position: relative;
		border: 0;
		background: none;
		padding: 10px;
		font: inherit;
		font-weight: 600;
		font-size: 13px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		color: var(--ess-text);
	}
	.tabs button[aria-selected='true']::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px;
		background: linear-gradient(90deg, var(--acc), var(--acc2));
	}
	.count {
		margin-left: 4px;
		font-size: 11px;
		font-weight: 700;
		padding: 0 6px;
		border-radius: 99px;
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 14px;
		display: grid;
		gap: 10px;
		align-content: start;
	}
	.bub {
		max-width: 88%;
		padding: 9px 12px;
		border-radius: 14px;
		white-space: pre-wrap;
		font-size: 13.5px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.bub.u {
		justify-self: end;
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		border-bottom-right-radius: 4px;
	}
	.bub.a {
		justify-self: start;
		background: var(--ess-sunken);
		border-bottom-left-radius: 4px;
	}
	.sugs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.sug {
		border: 1px solid var(--ess-border-strong);
		background: transparent;
		border-radius: 99px;
		padding: 5px 11px;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.sug:hover {
		background: var(--ess-surface-hover);
	}
	.card {
		justify-self: start;
		width: 100%;
		display: grid;
		gap: 5px;
		padding: 11px 13px;
		border: 1px solid var(--ess-border);
		border-left: 4px solid var(--ess-warning);
		border-radius: 12px;
		background: var(--ess-surface);
	}
	.card.done {
		border-left-color: var(--ess-success);
	}
	.card.failed {
		border-left-color: var(--ess-danger);
	}
	.card.settled {
		opacity: 0.75;
		border-left-color: var(--ess-border-strong);
	}
	.k {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-warning);
	}
	.card.done .k {
		color: var(--ess-success);
	}
	.line {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.err {
		font-size: 12.5px;
		color: var(--ess-danger);
		font-weight: 600;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 2px;
	}
	.report {
		border: 1px solid var(--ess-border);
		border-radius: 10px;
		overflow: hidden;
		background: var(--ess-surface);
	}
	.report-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--ess-border);
		font-size: 13px;
	}
	.report-head span {
		flex: 1;
		color: var(--ess-text-muted);
		font-size: 12px;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 12px;
		min-width: 100%;
	}
	th,
	td {
		padding: 6px 9px;
		border-bottom: 1px solid var(--ess-border-subtle);
		text-align: left;
		white-space: nowrap;
	}
	th {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ess-text-muted);
		background: var(--ess-sunken);
	}
	.more,
	.empty {
		margin: 0;
		padding: 6px 10px;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.section {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
		margin-top: 4px;
	}
	.foot {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		padding: 10px;
		border-top: 1px solid var(--ess-border);
	}
	.foot textarea:focus,
	.foot textarea:focus-visible {
		outline: none;
		box-shadow: none;
		border-color: color-mix(in oklab, var(--ess-primary) 70%, var(--ess-border-strong));
	}
	.foot textarea {
		flex: 1;
		resize: none;
		max-height: 120px;
		min-height: 36px;
		border: 1px solid var(--ess-border-strong);
		border-radius: 10px;
		background: var(--ess-field-bg);
		padding: 8px 10px;
		font: inherit;
		color: var(--ess-text);
	}
	.dots {
		display: inline-flex;
		gap: 3px;
	}
	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ess-text-muted);
		animation: blink 1s infinite;
	}
	.dots i:nth-child(2) {
		animation-delay: 0.15s;
	}
	.dots i:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes blink {
		0%,
		80%,
		100% {
			opacity: 0.3;
		}
		40% {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dots i {
			animation: none;
		}
	}
</style>
