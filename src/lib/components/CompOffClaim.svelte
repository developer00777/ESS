<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Gift from '@lucide/svelte/icons/gift';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import XCircle from '@lucide/svelte/icons/x-circle';

	interface Props {
		credits?: Array<{
			id: string;
			workedDate: string;
			status: string;
			expiresOn: string;
			usedOn?: string | null;
			workedMinutes: number | null;
		}>;
	}

	let { credits = [] }: Props = $props();

	let open = $state(false);
	let workedDate = $state('');
	let note = $state('');
	let checking = $state(false);
	let submitting = $state(false);
	let errorMsg = $state('');
	let done = $state(false);
	let eligibility = $state<{
		eligible: boolean;
		workedMinutes: number | null;
		dayBasis: string | null;
		holidayName: string | null;
		reasons: string[];
	} | null>(null);

	const today = new Date().toISOString().slice(0, 10);

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

	function hours(min: number | null) {
		return min == null ? '—' : `${(min / 60).toFixed(1)}h`;
	}

	function fmt(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	const todayKey = new Date().toISOString().slice(0, 10);
	// Approved but past its expiry is not spendable, even before the lapse sweep
	// has run — counting it would offer a credit that applying would reject.
	const available = $derived(
		credits.filter((c) => c.status === 'approved' && c.expiresOn.slice(0, 10) >= todayKey).length
	);
	const pending = $derived(credits.filter((c) => c.status === 'pending').length);
	const used = $derived(credits.filter((c) => c.status === 'used').length);
</script>

<div class="comp-off">
	<div class="head">
		<strong><Gift size={15} /> Comp-off</strong>
		<span class="tally">
			{available} available{#if pending}, {pending} awaiting manager{/if}{#if used}, {used} used{/if}
		</span>
	</div>

	<p class="rule">
		Work 7+ hours on a holiday or week off to earn one comp-off. Your reporting manager approves it.
		Spend it by applying for Comp-Off leave — one credit per day, oldest first — within 3 months.
		It cannot be encashed.
	</p>

	{#if credits.length > 0}
		<ul class="credit-list">
			{#each credits.slice(0, 5) as c (c.id)}
				<li>
					<span class="c-date">{fmt(c.workedDate)}</span>
					<span class="c-hours">{hours(c.workedMinutes)}</span>
					<span class="ess-badge ess-badge--{c.status === 'approved' ? 'present' : c.status === 'pending' ? 'restricted' : 'absent'}">
						{c.status}
					</span>
					<span class="c-exp">
						{#if c.status === 'approved'}
							expires {fmt(c.expiresOn)}
						{:else if c.status === 'used' && c.usedOn}
							used {fmt(c.usedOn)}
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if !open}
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (open = true)}>
			Claim a comp-off
		</button>
	{:else if done}
		<div class="claimed">
			<CheckCircle2 size={16} />
			<span>Claim submitted — HR will verify your hours and credit it.</span>
			<button type="button" class="ess-btn ess-btn--sm" onclick={() => { open = false; done = false; workedDate = ''; note = ''; eligibility = null; }}>
				Done
			</button>
		</div>
	{:else}
		<div class="claim-form">
			<label>
				<span>Date worked</span>
				<input class="ess-input" type="date" bind:value={workedDate} max={today} onchange={check} />
			</label>

			{#if checking}
				<p class="checking">Checking your attendance for this date…</p>
			{:else if eligibility}
				<div class="verdict" class:ok={eligibility.eligible}>
					{#if eligibility.eligible}
						<CheckCircle2 size={15} />
						<span>
							Eligible — {hours(eligibility.workedMinutes)} worked on a
							{eligibility.dayBasis === 'holiday' ? eligibility.holidayName ?? 'holiday' : 'weekend'}.
						</span>
					{:else}
						<XCircle size={15} />
						<span>{eligibility.reasons[0] ?? 'Not eligible for a comp-off.'}</span>
					{/if}
				</div>
			{/if}

			{#if eligibility?.eligible}
				<label>
					<span>Note for HR (optional)</span>
					<input class="ess-input" bind:value={note} placeholder="e.g. covered the Diwali release window" />
				</label>
			{/if}

			{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}

			<div class="actions">
				<button
					type="button"
					class="ess-btn"
					onclick={claim}
					disabled={!eligibility?.eligible || submitting}
				>
					{submitting ? 'Submitting…' : 'Claim comp-off'}
				</button>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => { open = false; eligibility = null; }}>
					Cancel
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.comp-off {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 1rem 1.1rem;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}

	.head strong {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.92rem;
		color: var(--ess-text);
	}

	.tally {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--ess-primary-text);
	}

	.rule {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		margin: 0 0 0.8rem;
		max-width: 72ch;
	}

	.credit-list {
		list-style: none;
		margin: 0 0 0.8rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.credit-list li {
		display: grid;
		grid-template-columns: 7.5rem 3.5rem auto 1fr;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.credit-list li:last-child {
		border-bottom: 0;
	}

	.c-date {
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	.c-hours,
	.c-exp {
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.c-exp {
		text-align: right;
	}

	.claim-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
		max-width: 22rem;
	}

	.checking {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		margin: 0;
	}

	.verdict {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.8rem;
		padding: 0.5rem 0.7rem;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}

	.verdict.ok {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}

	.claimed {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--ess-text);
		flex-wrap: wrap;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
</style>
