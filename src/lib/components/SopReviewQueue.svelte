<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';

	/**
	 * The HR / Reporting Manager side of the SOP: pending attendance corrections
	 * and comp-off claims, decided in place.
	 *
	 * The LLM triage is shown alongside each request rather than in a separate
	 * view because its whole purpose is to shorten this decision — the reviewer
	 * should see the model's reading and the raw evidence in the same glance, and
	 * be able to disagree with it without leaving the row.
	 */

	interface DeviationRow {
		deviation: {
			id: string;
			date: string;
			reason: string;
			description: string;
			status: string;
			claimedCheckIn: string | null;
			claimedCheckOut: string | null;
			aiSummary: string | null;
			aiEvidenceNote: string | null;
			aiSuggestedReason: string | null;
			aiConfidence: string | null;
			aiFlags: unknown;
			evidenceSnapshot: unknown;
		};
		employeeName: string;
	}

	interface CompOffRow {
		credit: {
			id: string;
			workedDate: string;
			workedMinutes: number | null;
			expiresOn: string;
			note: string | null;
			evidenceSnapshot: unknown;
		};
		employeeName: string;
	}

	let { deviations = [], compOffs = [] }: { deviations?: DeviationRow[]; compOffs?: CompOffRow[] } =
		$props();

	let busy = $state<string | null>(null);
	let errorMsg = $state('');
	let expanded = $state<string | null>(null);

	const FLAG_LABELS: Record<string, string> = {
		no_prohance_activity: 'No ProHance activity found',
		prohance_supports_claim: 'ProHance supports the claim',
		outside_shift_window: 'Outside shift window',
		holiday_or_weekend: 'Holiday or weekend',
		exceeds_monthly_cap: 'Exceeds monthly cap',
		short_hours: 'Short hours',
		no_portal_record: 'No portal record',
		conflicting_records: 'Conflicting records'
	};

	const label = (v: string) => v.replace(/_/g, ' ');
	const fmtDate = (d: string) =>
		new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	const hours = (m: number | null) => (m == null ? '—' : `${(m / 60).toFixed(1)}h`);
	const flagsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

	async function decide(kind: 'deviation' | 'comp-off', id: string, decision: 'approve' | 'reject') {
		errorMsg = '';
		busy = id;
		const url =
			kind === 'deviation'
				? `/api/attendance/deviations/${id}/review`
				: `/api/attendance/comp-off/${id}/review`;
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decision })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? 'Could not record that decision';
				return;
			}
			await invalidateAll();
		} catch {
			errorMsg = 'Could not reach the server. Please try again.';
		} finally {
			busy = null;
		}
	}
</script>

{#if deviations.length > 0 || compOffs.length > 0}
	<section class="queue">
		<div class="queue-head">
			<h2><ShieldAlert size={17} /> Pending your review</h2>
			<span class="count">{deviations.length + compOffs.length}</span>
		</div>

		{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}

		{#if deviations.length > 0}
			<span class="ess-eyebrow">Attendance corrections</span>
			<ul class="rows">
				{#each deviations as row (row.deviation.id)}
					{@const d = row.deviation}
					{@const flags = flagsOf(d.aiFlags)}
					<li class="row">
						<div class="row-main">
							<div class="who">
								<strong>{row.employeeName}</strong>
								<span class="meta">{fmtDate(d.date)} · {label(d.reason)}</span>
							</div>
							{#if d.status === 'needs_manager_approval'}
								<span class="ess-badge ess-badge--restricted cap-badge">
									<AlertTriangle size={11} /> Past monthly cap — needs HR + Manager
								</span>
							{/if}
						</div>

						<p class="statement">“{d.description}”</p>

						{#if d.claimedCheckIn || d.claimedCheckOut}
							<p class="claimed">
								Claims actual times: {d.claimedCheckIn ?? '—'} → {d.claimedCheckOut ?? '—'}
								<em>Approving writes these to the attendance record.</em>
							</p>
						{/if}

						{#if d.aiSummary}
							<div class="ai">
								<span class="ai-head">
									<Sparkles size={12} /> Automated first pass
									{#if d.aiConfidence}
										<span class="conf">confidence {Math.round(Number(d.aiConfidence) * 100)}%</span>
									{/if}
								</span>
								<p class="ai-text">{d.aiSummary}</p>
								{#if d.aiEvidenceNote}<p class="ai-note">{d.aiEvidenceNote}</p>{/if}
								{#if d.aiSuggestedReason && d.aiSuggestedReason !== d.reason}
									<p class="ai-note">
										Suggests reclassifying as <strong>{label(d.aiSuggestedReason)}</strong>.
									</p>
								{/if}
								{#if flags.length > 0}
									<div class="flags">
										{#each flags as f (f)}
											<span class="flag">{FLAG_LABELS[f] ?? label(f)}</span>
										{/each}
									</div>
								{/if}
								<p class="ai-disc">Advisory only — your decision is what counts.</p>
							</div>
						{:else}
							<p class="ai-absent">
								No automated triage for this request — review it against the records directly.
							</p>
						{/if}

						{#if d.evidenceSnapshot}
							<button
								type="button"
								class="link-btn"
								onclick={() => (expanded = expanded === d.id ? null : d.id)}
							>
								{expanded === d.id ? 'Hide' : 'Show'} system record
							</button>
							{#if expanded === d.id}
								<pre class="evidence">{JSON.stringify(d.evidenceSnapshot, null, 2)}</pre>
							{/if}
						{/if}

						<div class="actions">
							<button
								class="ess-btn ess-btn--primary ess-btn--sm"
								disabled={busy === d.id}
								onclick={() => decide('deviation', d.id, 'approve')}
							>
								{busy === d.id ? 'Saving…' : 'Approve & correct'}
							</button>
							<button
								class="ess-btn ess-btn--ghost ess-btn--sm"
								disabled={busy === d.id}
								onclick={() => decide('deviation', d.id, 'reject')}
							>
								Reject
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if compOffs.length > 0}
			<span class="ess-eyebrow section-gap">Comp-off claims</span>
			<ul class="rows">
				{#each compOffs as row (row.credit.id)}
					{@const c = row.credit}
					<li class="row">
						<div class="row-main">
							<div class="who">
								<strong>{row.employeeName}</strong>
								<span class="meta">
									Worked {fmtDate(c.workedDate)} · {hours(c.workedMinutes)} · expires
									{fmtDate(c.expiresOn)}
								</span>
							</div>
						</div>
						{#if c.note}<p class="statement">“{c.note}”</p>{/if}
						<p class="ai-absent">
							Eligibility is re-verified against the attendance record when you approve.
						</p>
						<div class="actions">
							<button
								class="ess-btn ess-btn--primary ess-btn--sm"
								disabled={busy === c.id}
								onclick={() => decide('comp-off', c.id, 'approve')}
							>
								{busy === c.id ? 'Saving…' : 'Credit comp-off'}
							</button>
							<button
								class="ess-btn ess-btn--ghost ess-btn--sm"
								disabled={busy === c.id}
								onclick={() => decide('comp-off', c.id, 'reject')}
							>
								Reject
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.queue {
		margin-top: 1.5rem;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		padding: 1.1rem 1.2rem;
	}

	.queue-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}

	.queue-head h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 1rem;
		margin: 0;
		color: var(--ess-text);
	}

	.count {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	.section-gap {
		display: block;
		margin-top: 1.2rem;
	}

	.rows {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.row {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.85rem 0.95rem;
		background: var(--ess-sunken);
	}

	.row-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.who strong {
		font-size: 0.88rem;
		color: var(--ess-text);
	}

	.meta {
		font-size: 0.76rem;
		color: var(--ess-text-secondary);
		text-transform: capitalize;
	}

	.cap-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	.statement {
		font-size: 0.82rem;
		color: var(--ess-text);
		margin: 0.6rem 0 0;
		max-width: 78ch;
	}

	.claimed {
		font-size: 0.76rem;
		color: var(--ess-text-secondary);
		margin: 0.45rem 0 0;
	}

	.claimed em {
		display: block;
		color: var(--ess-text-muted);
		font-size: 0.72rem;
	}

	.ai {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 0.7rem 0.8rem;
		margin-top: 0.7rem;
	}

	.ai-head {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ess-primary-text);
	}

	.conf {
		letter-spacing: 0;
		text-transform: none;
		font-weight: 600;
		color: var(--ess-text-muted);
	}

	.ai-text {
		font-size: 0.82rem;
		color: var(--ess-text);
		margin: 0.4rem 0 0;
	}

	.ai-note {
		font-size: 0.76rem;
		color: var(--ess-text-secondary);
		margin: 0.3rem 0 0;
		max-width: 78ch;
	}

	.ai-disc {
		font-size: 0.68rem;
		color: var(--ess-text-muted);
		margin: 0.5rem 0 0;
	}

	.ai-absent {
		font-size: 0.74rem;
		color: var(--ess-text-muted);
		margin: 0.6rem 0 0;
	}

	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}

	.flag {
		font-size: 0.66rem;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	.link-btn {
		background: none;
		border: 0;
		padding: 0;
		margin-top: 0.55rem;
		font-size: 0.73rem;
		color: var(--ess-primary-text);
		cursor: pointer;
		text-decoration: underline;
	}

	.evidence {
		margin: 0.4rem 0 0;
		padding: 0.6rem 0.7rem;
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-xs);
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--ess-text-secondary);
		overflow-x: auto;
		max-height: 18rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.8rem;
		flex-wrap: wrap;
	}
</style>
