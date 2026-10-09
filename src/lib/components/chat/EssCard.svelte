<script lang="ts">
	import type { ChatMessageView } from '$lib/server/chat/messages';

	/**
	 * A card inside a message: an ESS request with Approve / Reject, a notice
	 * with a link, a reminder, a celebration, or a reported message for HR.
	 * The request's state is read fresh from ESS; the buttons call the same
	 * endpoints as the Leave and Attendance pages.
	 */
	let { message, onchanged }: { message: ChatMessageView; onchanged: () => void } = $props();

	const card = $derived(message.card!);
	let busy = $state(false);
	let rejecting = $state(false);
	let note = $state('');
	let error = $state('');
	let report = $state<{ status: string; reason: string; body: string; author: string; hidden: boolean } | null>(null);

	const ENDPOINT: Record<string, (id: string) => string> = {
		leave: (id) => `/api/leave/${id}/approve`,
		deviation: (id) => `/api/attendance/deviations/${id}/review`,
		comp_off: (id) => `/api/attendance/comp-off/${id}/review`
	};

	async function decide(decision: 'approve' | 'reject') {
		if (card.type !== 'leave' && card.type !== 'deviation' && card.type !== 'comp_off') return;
		if (decision === 'reject' && !rejecting) {
			rejecting = true;
			return;
		}
		busy = true;
		error = '';
		try {
			const res = await fetch(ENDPOINT[card.type](card.id), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decision, note: note.trim() || undefined, via: 'chat' })
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				error = b.message ?? 'That did not go through';
			} else {
				rejecting = false;
				onchanged();
			}
		} finally {
			busy = false;
		}
	}

	async function loadReport() {
		if (card.type !== 'report') return;
		const res = await fetch(`/api/chat/reports/${card.reportId}`);
		if (res.ok) report = await res.json();
	}

	async function moderate(decision: 'hide' | 'dismiss') {
		if (card.type !== 'report') return;
		busy = true;
		const res = await fetch(`/api/chat/reports/${card.reportId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
		busy = false;
		if (res.ok) await loadReport();
	}

	$effect(() => {
		if (card.type === 'report') void loadReport();
	});
</script>

{#if card.type === 'leave' || card.type === 'deviation' || card.type === 'comp_off'}
	{@const r = card.resolved}
	{#if r}
		<div class="card" data-tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' || r.status === 'cancelled' ? 'muted' : 'warn'}>
			<span class="k">{r.statusLabel}</span>
			<strong>{r.title}</strong>
			<span class="line">{r.detail}</span>
			{#if r.reason}<span class="line">"{r.reason}"</span>{/if}
			{#if error}<span class="err">{error}</span>{/if}
			{#if r.canAct}
				{#if rejecting}
					<input class="ess-input" bind:value={note} placeholder="Reason, which they will see" aria-label="Reason for rejecting" />
				{/if}
				<div class="btns">
					{#if !rejecting}
						<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy} onclick={() => decide('approve')}>
							{r.canAct === 'hr' ? 'Approve' : 'Approve'}
						</button>
					{/if}
					<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy || (rejecting && !note.trim())} onclick={() => decide('reject')}>
						{rejecting ? 'Send rejection' : 'Reject'}
					</button>
					{#if rejecting}<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (rejecting = false)}>Cancel</button>{/if}
					<a class="ess-btn ess-btn--ghost ess-btn--sm" href={r.href}>Open in {card.type === 'leave' ? 'Leave' : 'Attendance'}</a>
				</div>
			{/if}
		</div>
	{:else}
		<div class="card" data-tone="muted"><span class="line">This request no longer exists.</span></div>
	{/if}
{:else if card.type === 'notice'}
	<div class="card" data-tone={card.tone}>
		<strong>{card.title}</strong>
		{#if card.text}<span class="line">{card.text}</span>{/if}
		{#if card.href}<div class="btns"><a class="ess-btn ess-btn--secondary ess-btn--sm" href={card.href}>Open</a></div>{/if}
	</div>
{:else if card.type === 'reminder'}
	<div class="card" data-tone="info">
		<span class="k">Reminder</span>
		<strong>{card.text || 'You asked me to remind you'}</strong>
		{#if card.channelId}<div class="btns"><a class="ess-btn ess-btn--ghost ess-btn--sm" href="/chat?c={card.channelId}">Go to the conversation</a></div>{/if}
	</div>
{:else if card.type === 'celebration'}
	<div class="card celebrate" data-tone="ok">
		<span class="emoji" aria-hidden="true">{card.kind === 'birthday' ? '🎂' : '🎉'}</span>
		<strong>{card.kind === 'birthday' ? `Happy birthday, ${card.name}!` : `${card.name}: ${card.years} ${card.years === 1 ? 'year' : 'years'} with us`}</strong>
	</div>
{:else if card.type === 'report'}
	<div class="card" data-tone="warn">
		<span class="k">Reported message{report ? ` · ${report.status}` : ''}</span>
		{#if report}
			<span class="line"><b>{report.author}:</b> "{report.body}"</span>
			<span class="line">Reason given: "{report.reason}"</span>
			{#if report.status === 'open'}
				<div class="btns">
					<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy} onclick={() => moderate('hide')}>Hide for everyone</button>
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" disabled={busy} onclick={() => moderate('dismiss')}>Keep it</button>
				</div>
			{/if}
		{:else}
			<span class="line">"{card.reason}"</span>
		{/if}
	</div>
{/if}

<style>
	.card {
		margin-top: 8px;
		max-width: 480px;
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		box-shadow: var(--ess-elev-1);
	}
	.card strong {
		font-size: 14.5px;
		font-weight: 600;
	}
	.k {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
	}
	.k::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.card[data-tone='warn'] .k {
		color: var(--ess-warning);
	}
	.card[data-tone='ok'] .k {
		color: var(--ess-success);
	}
	.card[data-tone='bad'] .k {
		color: var(--ess-danger);
	}
	.card[data-tone='muted'] .k {
		color: var(--ess-text-muted);
	}
	.card[data-tone='info'] .k {
		color: var(--ess-info);
	}
	.line {
		font-size: 13px;
		color: var(--ess-text-secondary);
		overflow-wrap: anywhere;
	}
	.err {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ess-danger);
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}
	.celebrate {
		grid-template-columns: auto 1fr;
		align-items: center;
		background: var(--ess-primary-softer);
		border-color: var(--ess-primary-soft);
	}
	.emoji {
		font-size: 22px;
	}
</style>
