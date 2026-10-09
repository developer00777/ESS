<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import Info from '@lucide/svelte/icons/info';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Gift from '@lucide/svelte/icons/gift';

	/**
	 * "Raise attendance correction" — a right-hand drawer over the Attendance
	 * page. A correction asks HR to review the record; it never rewrites the
	 * biometric punch itself.
	 *
	 * Controlled by the page: `open` is bindable, `initialDate` pre-fills the
	 * date when opened from a calendar day, and `recordFor` lets the drawer
	 * show the current biometric record beside the request.
	 */
	interface Props {
		open?: boolean;
		/** Pre-fills the date when opened from a specific calendar cell. */
		initialDate?: string;
		monthlyUsed?: number;
		monthlyCap?: number;
		/** The current record for a date, shown beside the form. */
		recordFor?: (date: string) => { checkIn: string | null; checkOut: string | null } | null;
		/** The person chose the Comp-off tab: the page opens the comp-off claim instead. */
		oncompoff?: () => void;
	}

	let { open = $bindable(false), initialDate = '', monthlyUsed = 0, monthlyCap = 3, recordFor, oncompoff }: Props = $props();

	const REASONS = [
		{ value: 'login_not_captured', label: 'Login not captured', capped: true },
		{ value: 'logout_not_captured', label: 'Logout not captured', capped: true },
		{ value: 'missing_biometric_punch', label: 'Missing biometric punch', capped: true },
		{ value: 'biometric_system_mismatch', label: 'Biometric and system login mismatch', capped: true },
		{ value: 'prohance_mismatch', label: 'ProHance activity mismatch', capped: false },
		{ value: 'system_server_issue', label: 'System / server issue', capped: false },
		{ value: 'machine_malfunction', label: 'Machine malfunction', capped: false },
		{ value: 'technical_error', label: 'Technical error affecting attendance', capped: false },
		{ value: 'wrong_half_day', label: 'Incorrectly marked Half Day', capped: false },
		{ value: 'wrong_absent', label: 'Incorrectly marked Absent', capped: false },
		{ value: 'incorrect_working_hours', label: 'Incorrect working hours', capped: false }
	];

	let date = $state(initialDate);
	let reason = $state('missing_biometric_punch');
	let description = $state('');
	let claimedCheckIn = $state('');
	let claimedCheckOut = $state('');
	let submitting = $state(false);
	let errorMsg = $state('');
	let tab = $state<'correction' | 'compoff'>('correction');
	let result = $state<{ status: string; aiSummary: string | null; aiEvidenceNote: string | null; aiFlags: string[]; aiConfidence: string | null; triaged: boolean } | null>(null);
	let firstField = $state<HTMLInputElement | null>(null);

	const today = new Date().toISOString().slice(0, 10);
	const MAX_DESCRIPTION = 500;

	// Opening from a calendar day pre-fills that day; a sensible reason follows
	// from what the record is missing.
	$effect(() => {
		if (!open) return;
		date = initialDate || date;
		const rec = initialDate && recordFor ? recordFor(initialDate) : null;
		if (rec && rec.checkIn && !rec.checkOut) reason = 'logout_not_captured';
		else if (rec && !rec.checkIn && rec.checkOut) reason = 'login_not_captured';
		tab = 'correction';
		void tick().then(() => firstField?.focus());
	});

	const current = $derived(date && recordFor ? recordFor(date) : null);

	const selectedCapped = $derived(REASONS.find((r) => r.value === reason)?.capped ?? false);
	const willExceedCap = $derived(selectedCapped && monthlyUsed >= monthlyCap);

	/** Mirrors the server's rule in deviations/+server.ts. */
	const MIN_DESCRIPTION = 10;
	const described = $derived(description.trim().length);
	const canSubmit = $derived(Boolean(date) && described >= MIN_DESCRIPTION && !submitting);

	/**
	 * Why the button is disabled, said out loud: a greyed-out Submit with
	 * nothing next to it is indistinguishable from a broken form.
	 */
	const blockedBecause = $derived.by(() => {
		if (!date) return 'Pick the date this applies to.';
		if (described === 0) return 'Describe what happened before submitting.';
		if (described < MIN_DESCRIPTION) {
			const short = MIN_DESCRIPTION - described;
			return `Please add a little more detail — ${short} more character${short === 1 ? '' : 's'}. HR reads this to decide the request.`;
		}
		return null;
	});

	const fmtDate = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' }) : '');

	function reset() {
		date = initialDate;
		reason = 'missing_biometric_punch';
		description = '';
		claimedCheckIn = '';
		claimedCheckOut = '';
		errorMsg = '';
		result = null;
	}

	function close() {
		open = false;
		reset();
	}

	async function submit() {
		errorMsg = '';
		submitting = true;
		try {
			const res = await fetch('/api/attendance/deviations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, reason, description, claimedCheckIn, claimedCheckOut })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.message ?? 'Could not submit this request';
				return;
			}
			result = {
				status: body.deviation.status,
				aiSummary: body.deviation.aiSummary,
				aiEvidenceNote: body.deviation.aiEvidenceNote,
				aiFlags: body.deviation.aiFlags ?? [],
				aiConfidence: body.deviation.aiConfidence,
				triaged: body.triaged
			};
			await invalidateAll();
		} catch {
			errorMsg = 'Could not reach the server. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	const FLAG_LABELS: Record<string, string> = {
		no_prohance_activity: 'No ProHance activity found',
		prohance_supports_claim: 'ProHance activity supports the claim',
		outside_shift_window: 'Outside your shift window',
		holiday_or_weekend: 'Holiday or weekend',
		exceeds_monthly_cap: 'Exceeds the monthly cap',
		short_hours: 'Short hours',
		no_portal_record: 'No portal record',
		conflicting_records: 'Conflicting records'
	};
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="ess-scrim scrim" role="presentation" onclick={close}></div>
	<div class="ess-drawer drawer" role="dialog" aria-modal="true" aria-labelledby="dev-title">
		<header class="head">
			<div>
				<h2 id="dev-title" class="ess-h2">Raise attendance correction</h2>
				<p class="sub">Request a correction for a missing or incorrect check-in / check-out. Your request is reviewed by HR and, past the monthly limit, your manager.</p>
			</div>
			<button type="button" class="ess-icon-btn" onclick={close} aria-label="Close"><X size={18} /></button>
		</header>

		{#if !result}
			<div class="tabs" role="tablist">
				<button type="button" role="tab" aria-selected={tab === 'correction'} onclick={() => (tab = 'correction')}>Correction</button>
				<button type="button" role="tab" aria-selected={tab === 'compoff'} onclick={() => (tab = 'compoff')}>Comp-off</button>
			</div>
		{/if}

		<div class="body">
			{#if result}
				<div class="outcome">
					<div class="ess-notice ess-notice--success">
						<span class="ess-notice__icon"><CheckCircle2 size={15} /></span>
						<div class="ess-notice__body">
							<strong>Submitted for review.</strong>
							{#if result.status === 'needs_manager_approval'}
								This is past your {monthlyCap}-per-month limit, so it needs both HR and your reporting manager.
							{:else}
								HR will review it against the records and let you know.
							{/if}
						</div>
					</div>

					{#if result.triaged && result.aiSummary}
						<div class="ai-card">
							<span class="ai-head"><Sparkles size={13} /> Automated first pass</span>
							<p class="ai-summary">{result.aiSummary}</p>
							{#if result.aiEvidenceNote}
								<p class="ai-note">{result.aiEvidenceNote}</p>
							{/if}
							{#if result.aiFlags.length > 0}
								<div class="flags">
									{#each result.aiFlags as flag (flag)}
										<span class="flag">{FLAG_LABELS[flag] ?? flag.replace(/_/g, ' ')}</span>
									{/each}
								</div>
							{/if}
							<p class="ai-disclaimer">
								This is an automated reading of your request against the attendance records. It does not approve or reject anything — HR reviews every request.
							</p>
						</div>
					{/if}

					<div class="progress">
						<span class="progress-title">Request progress</span>
						<ol class="ess-stepper ess-stepper--center">
							<li class="ess-step" data-state="done"><span class="ess-step__dot"><Check size={12} strokeWidth={3} /></span><span class="ess-step__label">Submitted</span><span class="ess-step__meta">Just now</span></li>
							<li class="ess-step" data-state="current"><span class="ess-step__dot"></span><span class="ess-step__label">HR review</span><span class="ess-step__meta">In progress</span></li>
							<li class="ess-step" data-state="todo"><span class="ess-step__dot"></span><span class="ess-step__label">Resolved</span><span class="ess-step__meta">You’ll be notified</span></li>
						</ol>
					</div>
				</div>
			{:else if tab === 'compoff'}
				<div class="compoff-tab">
					<span class="ess-tile"><Gift size={20} strokeWidth={1.75} /></span>
					<h3 class="ess-h3">Worked on a holiday or week off?</h3>
					<p>That is not a correction — it earns a comp-off. Work 7+ hours on a holiday or your week off, claim it, and your reporting manager approves it. Spend it within 3 months by applying for Comp-Off leave.</p>
					<button type="button" class="ess-btn ess-btn--primary" onclick={() => { close(); oncompoff?.(); }}>Request comp-off</button>
				</div>
			{:else}
				<div class="ess-notice ess-notice--info">
					<span class="ess-notice__icon"><Info size={15} /></span>
					<div class="ess-notice__body">You are requesting an attendance correction, not a change to the biometric record. HR reviews it against your attendance and ProHance records.</div>
				</div>

				<div class="cap-line" class:cap-warn={willExceedCap}>
					<span>Monthly allowance</span>
					<strong>{Math.min(monthlyUsed, monthlyCap)} of {monthlyCap} used</strong>
					<span class="ess-meter ess-meter--thin" class:ess-meter--warn={willExceedCap}><span style="width:{Math.min(100, (monthlyUsed / monthlyCap) * 100)}%"></span></span>
					<small>
						{#if willExceedCap}
							Biometric-related requests past the limit need HR <em>and</em> your reporting manager.
						{:else}
							{monthlyCap - monthlyUsed} remaining this month for biometric-related requests.
						{/if}
					</small>
				</div>

				<label class="ess-field">
					<span class="ess-label">Date</span>
					<input bind:this={firstField} class="ess-input" type="date" bind:value={date} max={today} />
					{#if date}<span class="ess-help">{fmtDate(date)}</span>{/if}
				</label>

				<label class="ess-field">
					<span class="ess-label">Reason</span>
					<select class="ess-select" bind:value={reason}>
						{#each REASONS as r (r.value)}
							<option value={r.value}>{r.label}</option>
						{/each}
					</select>
				</label>

				<div class="times">
					<label class="ess-field">
						<span class="ess-label">Reported check-in time <small>(optional)</small></span>
						<input class="ess-input" type="time" bind:value={claimedCheckIn} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Reported check-out time <small>(optional)</small></span>
						<input class="ess-input" type="time" bind:value={claimedCheckOut} />
					</label>
				</div>
				<span class="ess-help">Enter the times you actually started and finished. Approving writes these to your record.</span>

				<label class="ess-field">
					<span class="ess-label">Explanation</span>
					<textarea
						class="ess-textarea"
						rows="4"
						bind:value={description}
						maxlength={MAX_DESCRIPTION}
						aria-describedby="dev-desc-help"
						placeholder="e.g. Biometric didn't register my punch at the gate; I was at my desk from 09:20 and my ProHance session shows the full day."
					></textarea>
					<span class="help-row">
						<span class="ess-help" id="dev-desc-help">A sentence or two is enough — at least {MIN_DESCRIPTION} characters.</span>
						<span class="ess-help count">{described}/{MAX_DESCRIPTION}</span>
					</span>
				</label>

				{#if date}
					<div class="record">
						<span class="record-title">Current biometric record <small>({fmtDate(date)})</small></span>
						<div class="record-grid">
							<div><span>Check-in</span><strong>{current?.checkIn ?? 'Missing'}</strong></div>
							<div><span>Check-out</span><strong>{current?.checkOut ?? 'Missing'}</strong></div>
						</div>
					</div>
				{/if}

				<div class="progress">
					<span class="progress-title">Request progress</span>
					<ol class="ess-stepper ess-stepper--center">
						<li class="ess-step" data-state="current"><span class="ess-step__dot"></span><span class="ess-step__label">Submitted</span><span class="ess-step__meta">Your request</span></li>
						<li class="ess-step" data-state="todo"><span class="ess-step__dot"></span><span class="ess-step__label">HR review</span><span class="ess-step__meta">Checked against records</span></li>
						<li class="ess-step" data-state="todo"><span class="ess-step__dot"></span><span class="ess-step__label">Resolved</span><span class="ess-step__meta">You’ll be notified</span></li>
					</ol>
				</div>

				{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}
				{#if blockedBecause}
					<p class="blocked" role="status"><AlertTriangle size={13} /> {blockedBecause}</p>
				{/if}
				<p class="assist"><Sparkles size={12} /> Your description is checked against your attendance and ProHance records to help HR review it faster.</p>
			{/if}
		</div>

		<footer class="foot">
			{#if result}
				<button type="button" class="ess-btn ess-btn--primary" onclick={close}>Done</button>
			{:else if tab === 'correction'}
				<button type="button" class="ess-btn ess-btn--secondary" onclick={close}>Cancel</button>
				<button type="button" class="ess-btn ess-btn--primary" onclick={submit} disabled={!canSubmit}>
					{submitting ? 'Submitting…' : 'Submit for review'}
				</button>
			{:else}
				<button type="button" class="ess-btn ess-btn--secondary" onclick={close}>Cancel</button>
			{/if}
		</footer>
	</div>
{/if}

<style>
	.scrim {
		z-index: 80;
	}
	.drawer {
		z-index: 81;
		width: min(520px, 100vw);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 24px 24px 12px;
	}
	.head .ess-h2 {
		font-size: 26px;
	}
	.sub {
		margin-top: 6px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
	}

	.tabs {
		display: flex;
		gap: 4px;
		padding: 0 24px;
		border-bottom: 1px solid var(--ess-border);
	}
	.tabs button {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		padding: 10px 14px;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		color: var(--ess-text-secondary);
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		color: var(--ess-primary-text);
		border-bottom-color: var(--ess-primary);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 18px 24px;
		display: grid;
		gap: 14px;
		align-content: start;
	}

	.cap-line {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 12px;
		align-items: center;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.cap-line strong {
		color: var(--ess-text);
		font-weight: 500;
	}
	.cap-line .ess-meter {
		grid-column: 1 / -1;
	}
	.cap-line small {
		grid-column: 1 / -1;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.cap-warn {
		background: var(--ess-warning-bg);
	}
	.cap-warn small {
		color: var(--ess-warning);
	}

	.times {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.times + .ess-help {
		margin-top: -8px;
	}
	.ess-label small {
		font-weight: 400;
		color: var(--ess-text-muted);
	}
	.help-row {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.count {
		font-variant-numeric: tabular-nums;
	}

	.record {
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
	}
	.record-title {
		display: block;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 8px;
	}
	.record-title small {
		font-weight: 400;
		color: var(--ess-text-muted);
	}
	.record-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.record-grid div {
		display: grid;
		gap: 2px;
	}
	.record-grid div + div {
		border-left: 1px solid var(--ess-border);
		padding-left: 14px;
	}
	.record-grid span {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.record-grid strong {
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
	}

	.progress {
		padding: 14px 16px 10px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-primary-softer);
	}
	.progress-title {
		display: block;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
	}
	.progress .ess-step__meta {
		font-size: 11.5px;
	}

	.blocked {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		color: var(--ess-warning);
		margin: 0;
	}
	.assist {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--ess-text-muted);
		margin: 0;
	}

	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 14px 24px;
		border-top: 1px solid var(--ess-border);
		background: var(--ess-surface);
	}

	.compoff-tab {
		display: grid;
		justify-items: start;
		gap: 10px;
		padding: 8px 0;
	}
	.compoff-tab p {
		font-size: 14px;
		line-height: 1.55;
		color: var(--ess-text-secondary);
		margin: 0;
	}

	.outcome {
		display: grid;
		gap: 14px;
	}
	.ai-card {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-md);
		padding: 12px 14px;
	}
	.ai-head {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
	}
	.ai-summary {
		font-size: 13.5px;
		color: var(--ess-text);
		margin: 8px 0 0;
	}
	.ai-note {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		margin: 6px 0 0;
	}
	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.flag {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.ai-disclaimer {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		margin: 8px 0 0;
	}

	@media (max-width: 480px) {
		.times {
			grid-template-columns: 1fr;
		}
	}
</style>
