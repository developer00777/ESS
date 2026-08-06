<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';

	interface Props {
		/** Pre-fills the date when opened from a specific calendar cell. */
		initialDate?: string;
		monthlyUsed?: number;
		monthlyCap?: number;
	}

	let { initialDate = '', monthlyUsed = 0, monthlyCap = 3 }: Props = $props();

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

	let open = $state(false);
	let date = $state(initialDate);
	let reason = $state('missing_biometric_punch');
	let description = $state('');
	let claimedCheckIn = $state('');
	let claimedCheckOut = $state('');
	let submitting = $state(false);
	let errorMsg = $state('');
	let result = $state<{ status: string; aiSummary: string | null; aiEvidenceNote: string | null; aiFlags: string[]; aiConfidence: string | null; triaged: boolean } | null>(null);

	const selectedCapped = $derived(REASONS.find((r) => r.value === reason)?.capped ?? false);
	const willExceedCap = $derived(selectedCapped && monthlyUsed >= monthlyCap);
	const canSubmit = $derived(Boolean(date) && description.trim().length >= 10 && !submitting);

	function reset() {
		date = initialDate;
		reason = 'missing_biometric_punch';
		description = '';
		claimedCheckIn = '';
		claimedCheckOut = '';
		errorMsg = '';
		result = null;
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

<div class="deviation-block">
	{#if !open}
		<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (open = true)}>
			<AlertTriangle size={14} /> Raise attendance deviation
		</button>
	{:else}
		<div class="panel">
			<div class="panel-head">
				<strong><AlertTriangle size={15} /> Attendance correction request</strong>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => { open = false; reset(); }}>
					Close
				</button>
			</div>

			{#if result}
				<div class="outcome">
					<p class="outcome-head">
						<CheckCircle2 size={16} />
						{#if result.status === 'needs_manager_approval'}
							Submitted — this is past your {monthlyCap}-per-month limit, so it needs both HR and your
							Reporting Manager.
						{:else}
							Submitted for HR review.
						{/if}
					</p>

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
								This is an automated reading of your request against the attendance records. It does
								not approve or reject anything — HR reviews every request.
							</p>
						</div>
					{/if}

					<button type="button" class="ess-btn ess-btn--sm" onclick={() => { reset(); open = false; }}>
						Done
					</button>
				</div>
			{:else}
				<p class="hint">
					Raise this when your attendance wasn't captured correctly — a missed punch, a missing
					login/logout, or a day wrongly marked Half Day or Absent.
				</p>

				<div class="cap-line" class:cap-warn={willExceedCap}>
					Biometric-related requests used this month: <strong>{monthlyUsed} of {monthlyCap}</strong>
					{#if willExceedCap}
						— further requests need HR <em>and</em> your Reporting Manager.
					{/if}
				</div>

				<div class="grid">
					<label>
						<span>Date</span>
						<input class="ess-input" type="date" bind:value={date} max={new Date().toISOString().slice(0, 10)} />
					</label>
					<label>
						<span>Reason</span>
						<select class="ess-select" bind:value={reason}>
							{#each REASONS as r (r.value)}
								<option value={r.value}>{r.label}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Actual in (optional)</span>
						<input class="ess-input" type="time" bind:value={claimedCheckIn} />
					</label>
					<label>
						<span>Actual out (optional)</span>
						<input class="ess-input" type="time" bind:value={claimedCheckOut} />
					</label>
				</div>

				<label class="full">
					<span>What happened?</span>
					<textarea
						class="ess-input"
						rows="3"
						bind:value={description}
						placeholder="e.g. Biometric didn't register my punch at the gate; I was at my desk from 09:20 and my ProHance session shows the full day."
					></textarea>
				</label>

				{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}

				<div class="actions">
					<button type="button" class="ess-btn" onclick={submit} disabled={!canSubmit}>
						{submitting ? 'Submitting…' : 'Submit request'}
					</button>
					<span class="assist">
						<Sparkles size={12} /> Your description is checked against your attendance and ProHance records
						to help HR review it faster.
					</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.deviation-block {
		margin-top: 0.75rem;
	}

	.panel {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		padding: 1rem 1.1rem;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.6rem;
	}

	.panel-head strong {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.92rem;
		color: var(--ess-text);
	}

	.hint {
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
		margin: 0 0 0.7rem;
		max-width: 72ch;
	}

	.cap-line {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-xs);
		padding: 0.45rem 0.6rem;
		margin-bottom: 0.8rem;
	}

	.cap-warn {
		color: var(--ess-warning);
		background: var(--ess-warning-bg);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.6rem;
		margin-bottom: 0.6rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--ess-text-secondary);
	}

	label.full {
		margin-bottom: 0.7rem;
	}

	textarea.ess-input {
		resize: vertical;
		font-family: inherit;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.assist {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		color: var(--ess-text-muted);
		max-width: 52ch;
	}

	.outcome-head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		color: var(--ess-text);
		margin: 0 0 0.75rem;
	}

	.ai-card {
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.8rem 0.9rem;
		margin-bottom: 0.85rem;
	}

	.ai-head {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
	}

	.ai-summary {
		font-size: 0.85rem;
		color: var(--ess-text);
		margin: 0.5rem 0 0;
	}

	.ai-note {
		font-size: 0.78rem;
		color: var(--ess-text-secondary);
		margin: 0.35rem 0 0;
		max-width: 72ch;
	}

	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	.flag {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	.ai-disclaimer {
		font-size: 0.7rem;
		color: var(--ess-text-muted);
		margin: 0.6rem 0 0;
		max-width: 72ch;
	}
</style>
