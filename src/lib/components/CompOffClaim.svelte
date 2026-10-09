<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import Gift from '@lucide/svelte/icons/gift';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import XCircle from '@lucide/svelte/icons/x-circle';
	import X from '@lucide/svelte/icons/x';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Info from '@lucide/svelte/icons/info';

	/**
	 * "Comp-off credits" — the balance, the claims so far, and the claim form.
	 * `open` is bindable so the Attendance page can open the form from the
	 * correction drawer's Comp-off tab.
	 */
	interface Props {
		credits?: Array<{
			id: string;
			workedDate: string;
			status: string;
			expiresOn: string;
			usedOn?: string | null;
			workedMinutes: number | null;
		}>;
		open?: boolean;
	}

	let { credits = [], open = $bindable(false) }: Props = $props();

	let workedDate = $state('');
	let note = $state('');
	let checking = $state(false);
	let submitting = $state(false);
	let errorMsg = $state('');
	let done = $state(false);
	let showAll = $state(false);
	let dateField = $state<HTMLInputElement | null>(null);
	let eligibility = $state<{
		eligible: boolean;
		workedMinutes: number | null;
		dayBasis: string | null;
		holidayName: string | null;
		reasons: string[];
	} | null>(null);

	const today = new Date().toISOString().slice(0, 10);

	$effect(() => {
		if (open) void tick().then(() => dateField?.focus());
	});

	async function check() {
		if (!workedDate) return;
		errorMsg = '';
		eligibility = null;
		checking = true;
		try {
			const res = await fetch(`/api/attendance/comp-off?check=${workedDate}`);
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.message ?? 'Could not check this date';
				return;
			}
			eligibility = body.eligibility;
		} finally {
			checking = false;
		}
	}

	async function claim() {
		errorMsg = '';
		submitting = true;
		try {
			const res = await fetch('/api/attendance/comp-off', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workedDate, note })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.message ?? 'Could not claim this comp-off';
				return;
			}
			done = true;
			await invalidateAll();
		} finally {
			submitting = false;
		}
	}

	function finish() {
		open = false;
		done = false;
		workedDate = '';
		note = '';
		eligibility = null;
		errorMsg = '';
	}

	/* Withdrawing a claim you raised. Allowed while it is still undecided; the
	   server refuses anything credited or already spent on leave. */
	let confirmingWithdraw = $state<string | null>(null);
	let withdrawingId = $state<string | null>(null);

	async function withdraw(creditId: string) {
		errorMsg = '';
		withdrawingId = creditId;
		try {
			const res = await fetch(`/api/attendance/comp-off/${creditId}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? 'Could not withdraw this claim';
				return;
			}
			confirmingWithdraw = null;
			await invalidateAll();
		} finally {
			withdrawingId = null;
		}
	}

	function hours(min: number | null) {
		return min == null ? '—' : `${(min / 60).toFixed(1)}h`;
	}

	function fmt(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const todayKey = new Date().toISOString().slice(0, 10);
	// Approved but past its expiry is not spendable, even before the lapse sweep
	// has run — counting it would offer a credit that applying would reject.
	const available = $derived(credits.filter((c) => c.status === 'approved' && c.expiresOn.slice(0, 10) >= todayKey).length);
	// 'manager_approved' is mid-chain — the manager has signed off and HR has yet
	// to credit it — so it counts as awaiting, not available.
	const pending = $derived(credits.filter((c) => c.status === 'pending' || c.status === 'manager_approved').length);
	const used = $derived(credits.filter((c) => c.status === 'used').length);

	const STATUS: Record<string, { label: string; tone: string }> = {
		approved: { label: 'Available', tone: 'present' },
		pending: { label: 'Awaiting manager', tone: 'restricted' },
		manager_approved: { label: 'Awaiting HR', tone: 'restricted' },
		used: { label: 'Used', tone: 'cancelled' },
		rejected: { label: 'Rejected', tone: 'absent' },
		lapsed: { label: 'Lapsed', tone: 'cancelled' }
	};
	const status = (s: string) => STATUS[s] ?? { label: s.replace(/_/g, ' '), tone: 'neutral' };
	const shown = $derived(showAll ? credits : credits.slice(0, 3));
</script>

<section class="ess-card comp-off" aria-labelledby="co-h">
	<div class="ess-card-head">
		<h2 id="co-h" class="ess-h2">Comp-off credits <span class="info" title="Work 7+ hours on a holiday or week off to earn one comp-off. Your reporting manager approves it; spend it within 3 months by applying for Comp-Off leave. It cannot be encashed."><Info size={15} /></span></h2>
	</div>

	<div class="balance">
		<span class="ess-tile"><CalendarCheck size={20} strokeWidth={1.75} /></span>
		<div class="balance-body">
			<strong>{available} {available === 1 ? 'day' : 'days'}</strong>
			<span>Available balance{#if pending} · {pending} awaiting approval{/if}{#if used} · {used} used{/if}</span>
		</div>
		{#if !open}
			<button type="button" class="ess-btn ess-btn--soft" onclick={() => (open = true)}>Request comp-off <ChevronRight size={15} /></button>
		{/if}
	</div>

	{#if open}
		<div class="claim-form">
			{#if done}
				<div class="ess-notice ess-notice--success">
					<span class="ess-notice__icon"><CheckCircle2 size={15} /></span>
					<div class="ess-notice__body"><strong>Claim submitted.</strong>Your reporting manager approves it, then HR verifies the hours and credits it.</div>
				</div>
				<div class="actions">
					<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={finish}>Done</button>
				</div>
			{:else}
				<p class="rule">Work 7+ hours on a holiday or your week off to earn one comp-off. Spend it within 3 months by applying for Comp-Off leave — one credit per day, oldest first. It cannot be encashed.</p>
				<label class="ess-field">
					<span class="ess-label">Date worked</span>
					<input bind:this={dateField} class="ess-input" type="date" bind:value={workedDate} max={today} onchange={check} />
				</label>

				{#if checking}
					<p class="checking">Checking your attendance for this date…</p>
				{:else if eligibility}
					<div class="verdict" class:ok={eligibility.eligible}>
						{#if eligibility.eligible}
							<CheckCircle2 size={15} />
							<span>Eligible — {hours(eligibility.workedMinutes)} worked on a {eligibility.dayBasis === 'holiday' ? (eligibility.holidayName ?? 'holiday') : 'week off'}.</span>
						{:else}
							<XCircle size={15} />
							<span>{eligibility.reasons[0] ?? 'Not eligible for a comp-off.'}</span>
						{/if}
					</div>
				{/if}

				{#if eligibility?.eligible}
					<label class="ess-field">
						<span class="ess-label">Note for HR <small>(optional)</small></span>
						<input class="ess-input" bind:value={note} placeholder="e.g. covered the Diwali release window" />
					</label>
				{/if}

				{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}

				<div class="actions">
					<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" onclick={claim} disabled={!eligibility?.eligible || submitting}>
						{submitting ? 'Submitting…' : 'Claim comp-off'}
					</button>
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={finish}>Cancel</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if errorMsg && !open}<p class="ess-error">{errorMsg}</p>{/if}

	{#if credits.length > 0}
		<div class="ess-rows credits">
			{#each shown as c (c.id)}
				{@const s = status(c.status)}
				<div class="ess-row credit">
					<div class="ess-row__body">
						<span class="ess-row__title">{fmt(c.workedDate)} <span class="hrs">· {hours(c.workedMinutes)}</span></span>
						<span class="ess-row__meta">
							{#if c.status === 'approved'}Expires {fmt(c.expiresOn)}{:else if c.status === 'used' && c.usedOn}Used {fmt(c.usedOn)}{:else if c.status === 'pending'}Waiting for your manager{:else if c.status === 'manager_approved'}Manager approved · HR credits it{:else}&nbsp;{/if}
						</span>
					</div>
					<div class="ess-row__end">
						<span class="ess-badge ess-badge--{s.tone}">{s.label}</span>
						<!-- Withdrawable until it has actually been spent on leave: a credit
						     backing a leave application cannot be removed without leaving that
						     leave unfunded. Two clicks, since a manager may already have
						     reviewed it. -->
						{#if ['pending', 'manager_approved', 'approved'].includes(c.status) && !c.usedOn}
							{#if confirmingWithdraw === c.id}
								<span class="c-withdraw">
									<button type="button" class="ess-btn ess-btn--sm ess-btn--danger" onclick={() => withdraw(c.id)} disabled={withdrawingId === c.id}>
										{withdrawingId === c.id ? 'Withdrawing…' : 'Confirm'}
									</button>
									<button type="button" class="ess-btn ess-btn--sm ess-btn--ghost" onclick={() => (confirmingWithdraw = null)} disabled={withdrawingId === c.id}>Keep</button>
								</span>
							{:else}
								<button type="button" class="ess-icon-btn c-remove" onclick={() => (confirmingWithdraw = c.id)} aria-label="Withdraw comp-off claim for {fmt(c.workedDate)}" title="Withdraw this claim">
									<X size={14} />
								</button>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>
		{#if credits.length > 3}
			<button type="button" class="ess-link more" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${credits.length}`}</button>
		{/if}
	{/if}
</section>

<style>
	.info {
		display: inline-flex;
		vertical-align: middle;
		margin-left: 6px;
		color: var(--ess-text-muted);
		cursor: help;
	}

	.balance {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.balance-body {
		flex: 1;
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.balance-body strong {
		font-family: var(--ess-font-display);
		font-size: 26px;
		font-weight: 600;
		line-height: 1.1;
	}
	.balance-body span {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}

	.claim-form {
		display: grid;
		gap: 12px;
		margin-top: 16px;
		padding: 14px 16px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
	}
	.rule {
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
		margin: 0;
	}
	.ess-label small {
		font-weight: 400;
		color: var(--ess-text-muted);
	}
	.checking {
		font-size: 13px;
		color: var(--ess-text-secondary);
		margin: 0;
	}
	.verdict {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		padding: 9px 12px;
		border-radius: var(--ess-radius-sm);
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.verdict.ok {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.credits {
		margin-top: 12px;
		border-top: 1px solid var(--ess-border);
	}
	.credit {
		padding: 11px 0;
	}
	.hrs {
		font-weight: 400;
		color: var(--ess-text-secondary);
	}
	.c-remove {
		width: 28px;
		height: 28px;
	}
	.c-remove:hover {
		color: var(--ess-danger);
		background: var(--ess-danger-bg);
	}
	.c-withdraw {
		display: inline-flex;
		gap: 6px;
		white-space: nowrap;
	}
	.more {
		background: none;
		border: none;
		padding: 6px 0 0;
		cursor: pointer;
		font: inherit;
	}
</style>
