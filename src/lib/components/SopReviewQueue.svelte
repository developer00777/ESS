<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import FileText from '@lucide/svelte/icons/file-text';
	import Gift from '@lucide/svelte/icons/gift';

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
			/** 'pending' at the manager stage, 'manager_approved' at HR's. */
			status: string;
		};
		employeeName: string;
	}

	let { deviations = [], compOffs = [] }: { deviations?: DeviationRow[]; compOffs?: CompOffRow[] } = $props();

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
	const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	const hours = (m: number | null) => (m == null ? '—' : `${(m / 60).toFixed(1)}h`);
	const flagsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
	const initials = (name: string) =>
		name
			.split(' ')
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();

	async function decide(kind: 'deviation' | 'comp-off', id: string, decision: 'approve' | 'reject') {
		errorMsg = '';
		busy = id;
		const url = kind === 'deviation' ? `/api/attendance/deviations/${id}/review` : `/api/attendance/comp-off/${id}/review`;
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
	<section class="ess-card queue" aria-labelledby="queue-h">
		<div class="ess-card-head">
			<h2 id="queue-h" class="ess-h2">Pending your review <span class="count">{deviations.length + compOffs.length}</span></h2>
			<span class="ess-caption">Corrections and comp-off claims from people who report to you</span>
		</div>

		{#if errorMsg}<p class="ess-error">{errorMsg}</p>{/if}

		{#if deviations.length > 0}
			<h3 class="group"><FileText size={15} /> Attendance corrections</h3>
			<ul class="rows">
				{#each deviations as row (row.deviation.id)}
					{@const d = row.deviation}
					{@const flags = flagsOf(d.aiFlags)}
					<li class="row">
						<div class="row-main">
							<span class="ess-avatar">{initials(row.employeeName)}</span>
							<div class="who">
								<strong>{row.employeeName}</strong>
								<span class="meta">{fmtDate(d.date)} · {label(d.reason)}</span>
							</div>
							{#if d.status === 'needs_manager_approval'}
								<span class="ess-badge ess-badge--restricted"><AlertTriangle size={11} /> Past monthly cap — needs HR + manager</span>
							{:else if d.status === 'manager_approved'}
								<!-- Second stage of manager → HR → approved: the badge says
								     whose turn it is, so HR knows this is theirs to finish. -->
								<span class="ess-badge ess-badge--pending">Manager approved — awaiting HR</span>
							{:else}
								<span class="ess-badge ess-badge--pending">Awaiting review</span>
							{/if}
						</div>

						<p class="statement">“{d.description}”</p>

						{#if d.claimedCheckIn || d.claimedCheckOut}
							<p class="claimed">
								Claims actual times: <strong>{d.claimedCheckIn ?? '—'} → {d.claimedCheckOut ?? '—'}</strong>
								<em>Approving writes these to the attendance record.</em>
							</p>
						{/if}

						{#if d.aiSummary}
							<div class="ai">
								<span class="ai-head">
									<Sparkles size={12} /> Automated first pass
									{#if d.aiConfidence}<span class="conf">confidence {Math.round(Number(d.aiConfidence) * 100)}%</span>{/if}
								</span>
								<p class="ai-text">{d.aiSummary}</p>
								{#if d.aiEvidenceNote}<p class="ai-note">{d.aiEvidenceNote}</p>{/if}
								{#if d.aiSuggestedReason && d.aiSuggestedReason !== d.reason}
									<p class="ai-note">Suggests reclassifying as <strong>{label(d.aiSuggestedReason)}</strong>.</p>
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
							<p class="ai-absent">No automated triage for this request — review it against the records directly.</p>
						{/if}

						{#if d.evidenceSnapshot}
							<button type="button" class="link-btn" onclick={() => (expanded = expanded === d.id ? null : d.id)}>
								{expanded === d.id ? 'Hide' : 'Show'} system record
							</button>
							{#if expanded === d.id}
								<pre class="evidence">{JSON.stringify(d.evidenceSnapshot, null, 2)}</pre>
							{/if}
						{/if}

						<div class="actions">
							<button class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy === d.id} onclick={() => decide('deviation', d.id, 'approve')}>
								{busy === d.id ? 'Saving…' : 'Approve & correct'}
							</button>
							<button class="ess-btn ess-btn--outline ess-btn--sm" disabled={busy === d.id} onclick={() => decide('deviation', d.id, 'reject')}>Reject</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if compOffs.length > 0}
			<h3 class="group"><Gift size={15} /> Comp-off claims</h3>
			<ul class="rows">
				{#each compOffs as row (row.credit.id)}
					{@const c = row.credit}
					<li class="row">
						<div class="row-main">
							<span class="ess-avatar">{initials(row.employeeName)}</span>
							<div class="who">
								<strong>{row.employeeName}</strong>
								<span class="meta">Worked {fmtDate(c.workedDate)} · {hours(c.workedMinutes)} · expires {fmtDate(c.expiresOn)}</span>
							</div>
							{#if c.status === 'manager_approved'}
								<!-- Second stage: the manager has confirmed the day was worked
								     and this is HR's to credit. -->
								<span class="ess-badge ess-badge--pending">Manager approved — awaiting HR</span>
							{:else}
								<span class="ess-badge ess-badge--pending">Awaiting your approval</span>
							{/if}
						</div>
						{#if c.note}<p class="statement">“{c.note}”</p>{/if}
						<p class="ai-absent">
							{c.status === 'manager_approved' ? 'Eligibility is re-verified against the attendance record when you credit this.' : 'Approving passes this to the concerned HR, who credits it.'}
						</p>
						<div class="actions">
							<button class="ess-btn ess-btn--primary ess-btn--sm" disabled={busy === c.id} onclick={() => decide('comp-off', c.id, 'approve')}>
								{busy === c.id ? 'Saving…' : c.status === 'manager_approved' ? 'Credit comp-off' : 'Approve — send to HR'}
							</button>
							<button class="ess-btn ess-btn--outline ess-btn--sm" disabled={busy === c.id} onclick={() => decide('comp-off', c.id, 'reject')}>Reject</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 7px;
		margin-left: 8px;
		border-radius: 99px;
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
		font-family: var(--ess-font-sans);
		font-size: 12px;
		font-weight: 600;
		vertical-align: middle;
	}

	.group {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ess-text-secondary);
		margin: 6px 0 8px;
	}
	.rows + .group {
		margin-top: 18px;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}

	.row {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		padding: 14px 16px;
		background: var(--ess-surface);
	}

	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.row-main .ess-badge {
		margin-left: auto;
		gap: 5px;
	}

	.who {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.who strong {
		font-size: 14.5px;
		font-weight: 500;
		color: var(--ess-text);
	}
	.meta {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.meta::first-letter {
		text-transform: uppercase;
	}

	.statement {
		font-size: 14px;
		color: var(--ess-text);
		margin: 12px 0 0;
		padding-left: 12px;
		border-left: 2px solid var(--ess-border-strong);
		max-width: 78ch;
	}

	.claimed {
		font-size: 13px;
		color: var(--ess-text-secondary);
		margin: 10px 0 0;
	}
	.claimed strong {
		color: var(--ess-text);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.claimed em {
		display: block;
		font-style: normal;
		color: var(--ess-text-muted);
		font-size: 12px;
	}

	.ai {
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-md);
		padding: 12px 14px;
		margin-top: 12px;
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
	.conf {
		letter-spacing: 0;
		text-transform: none;
		font-weight: 500;
		color: var(--ess-text-muted);
	}
	.ai-text {
		font-size: 13.5px;
		color: var(--ess-text);
		margin: 6px 0 0;
	}
	.ai-note {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		margin: 6px 0 0;
		max-width: 78ch;
	}
	.ai-disc {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		margin: 8px 0 0;
	}
	.ai-absent {
		font-size: 12.5px;
		color: var(--ess-text-muted);
		margin: 10px 0 0;
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

	.link-btn {
		background: none;
		border: 0;
		padding: 0;
		margin-top: 10px;
		font: inherit;
		font-size: 12.5px;
		color: var(--ess-primary-text);
		cursor: pointer;
	}
	.link-btn:hover {
		text-decoration: underline;
	}

	.evidence {
		margin: 8px 0 0;
		padding: 10px 12px;
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-sm);
		font-family: var(--ess-font-mono);
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
		overflow-x: auto;
		overscroll-behavior-x: contain;
		max-height: 18rem;
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 14px;
		flex-wrap: wrap;
	}
</style>
