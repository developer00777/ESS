<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import UserCheck from '@lucide/svelte/icons/user-check';

	/**
	 * Approval cover — "approve my team's requests while I'm away"
	 * (/api/delegations). Lists live and upcoming delegations, ends one early,
	 * and sets up a new one: who covers, from and to (90 days at most).
	 *
	 * `all` is HR's view (people.edit_settings or Super Admin): everyone's
	 * delegations, and a manager to set one up for. Without it, only those the
	 * viewer is on either side of, and they delegate their own approvals.
	 *
	 * Uses no <form>, so it can sit inside a page that is one (Profile); its
	 * fields carry no name and Enter creates instead of submitting the page.
	 */
	type Person = { id: string; fullName: string };
	type Delegation = { id: string; fromId: string; fromName: string; toId: string; toName: string; startsOn: string; endsOn: string; reason: string | null };

	interface Props {
		viewerId: string;
		/** Everyone's delegations and setting one up for someone else (HR). */
		all?: boolean;
		/** People to pick from; fetched from /api/chat/people when not given. */
		people?: Person[] | null;
		/** Only the contents, for a page that supplies its own card. */
		bare?: boolean;
	}
	let { viewerId, all = false, people = null, bare = false }: Props = $props();

	const MAX_DAYS = 90;
	const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

	let rows = $state<Delegation[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	// HR's view answers 403 to anyone else; the card then stays out of the way.
	let forbidden = $state(false);

	async function load() {
		loadError = '';
		try {
			const r = await fetch(`/api/delegations${all ? '?all=1' : ''}`);
			if (r.status === 403) {
				forbidden = true;
				return;
			}
			if (!r.ok) throw new Error(String(r.status));
			rows = ((await r.json()) as { delegations: Delegation[] }).delegations.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
		} catch {
			loadError = 'Could not load delegations. Try again in a moment.';
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		void load();
	});

	let pool = $state<Person[]>([]);
	$effect(() => {
		if (people) {
			pool = people;
			return;
		}
		void fetch('/api/chat/people').then(async (r) => (pool = r.ok ? ((await r.json()) as Person[]) : []));
	});
	const sorted = $derived([...pool].sort((a, b) => a.fullName.localeCompare(b.fullName)));

	/* ---------- new delegation ---------- */
	let fromId = $state(''); // HR's view: the manager; otherwise the viewer
	let toId = $state('');
	let startsOn = $state(today);
	let endsOn = $state('');
	let reason = $state('');
	let tried = $state(false);
	let saving = $state(false);
	let formError = $state('');
	let saved = $state('');

	const manager = $derived(all ? fromId : viewerId);
	// The server's rules, so the button says what is wrong before sending.
	const problem = $derived.by(() => {
		if (all && !fromId) return 'Pick the manager whose approvals are covered.';
		if (!toId) return 'Pick who covers.';
		if (toId === manager) return 'Pick someone other than the manager.';
		if (!startsOn || !endsOn) return 'Give a start and an end date.';
		if (endsOn < startsOn) return 'End on or after the start date.';
		if (endsOn < today) return 'That window is already over.';
		if ((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000 + 1 > MAX_DAYS) return `Keep it to ${MAX_DAYS} days or fewer.`;
		return '';
	});

	async function create() {
		tried = true;
		formError = '';
		saved = '';
		if (problem || saving) return;
		saving = true;
		try {
			const r = await fetch('/api/delegations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...(all ? { fromId } : {}), toId, startsOn, endsOn, ...(reason.trim() ? { reason: reason.trim() } : {}) })
			});
			if (!r.ok) {
				const body = await r.json().catch(() => ({}));
				formError = body.message ?? `Could not set it up (${r.status}).`;
				return;
			}
			saved = `${nameOf(toId)} now covers ${all ? `${nameOf(fromId)}'s` : 'your'} approvals, ${fmtRange(startsOn, endsOn)}.`;
			toId = '';
			endsOn = '';
			reason = '';
			if (all) fromId = '';
			tried = false;
			await load();
		} catch {
			formError = 'Could not reach the server. Try again.';
		} finally {
			saving = false;
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
			e.preventDefault();
			void create();
		}
	}

	/* ---------- ending one early ---------- */
	let confirmEnd = $state<string | null>(null);
	let ending = $state<string | null>(null);
	let endError = $state('');
	async function end(id: string) {
		ending = id;
		endError = '';
		try {
			const r = await fetch(`/api/delegations/${id}`, { method: 'DELETE' });
			if (!r.ok) {
				const body = await r.json().catch(() => ({}));
				endError = body.message ?? `Could not end it (${r.status}).`;
				return;
			}
			confirmEnd = null;
			await load();
		} finally {
			ending = null;
		}
	}

	const nameOf = (id: string) => pool.find((p) => p.id === id)?.fullName ?? 'They';
	function fmtRange(a: string, b: string) {
		const s = new Date(a + 'T00:00:00');
		const e = new Date(b + 'T00:00:00');
		const sameYear = s.getFullYear() === e.getFullYear();
		if (a === b) return e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
		return `${s.toLocaleDateString('en-IN', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
	}
	function line(d: Delegation) {
		if (all) return `${d.toName} covers ${d.fromName}`;
		return d.fromId === viewerId ? `${d.toName} covers your approvals` : `You cover ${d.fromName}'s approvals`;
	}
</script>

{#if !forbidden}
	{#snippet body()}
		<div class="ess-rows list">
			{#if loading}
				<p class="ess-caption">Loading…</p>
			{:else if loadError}
				<p class="ess-error" role="alert">{loadError}</p>
			{:else}
				{#each rows as d (d.id)}
					{@const live = d.startsOn <= today}
					<div class="ess-row">
						<span class="ess-tile ess-tile--sm" aria-hidden="true"><UserCheck size={16} /></span>
						<div class="ess-row__body">
							<span class="ess-row__title">{line(d)}</span>
							<span class="ess-row__meta">{fmtRange(d.startsOn, d.endsOn)}{#if d.reason}<span class="sep"></span>{d.reason}{/if}</span>
						</div>
						<div class="ess-row__end">
							<span class="ess-badge {live ? 'ess-badge--approved' : 'ess-badge--info'}">{live ? 'Active' : 'Upcoming'}</span>
							{#if confirmEnd === d.id}
								<button type="button" class="ess-btn ess-btn--danger ess-btn--sm" disabled={ending === d.id} onclick={() => end(d.id)}><X size={14} /> {ending === d.id ? 'Ending…' : 'End now'}</button>
								<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmEnd = null)}>Keep</button>
							{:else}
								<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (confirmEnd = d.id)} aria-label="End: {line(d)}"><X size={14} /> End</button>
							{/if}
						</div>
					</div>
				{:else}
					<p class="ess-caption">{all ? 'No live or upcoming delegations.' : 'Nobody covers your approvals, and you cover nobody’s.'}</p>
				{/each}
			{/if}
			{#if endError}<p class="ess-error" role="alert">{endError}</p>{/if}
		</div>

		<!-- Enter in a field creates the delegation (and never submits a page form around it). -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="new" role="group" aria-label="Set up a delegation" onkeydown={onKey}>
			<div class="fields">
				{#if all}
					<label class="ess-field">
						<span class="ess-label">Manager</span>
						<select class="ess-select" bind:value={fromId}>
							<option value="">Whose approvals…</option>
							{#each sorted as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
						</select>
					</label>
				{/if}
				<label class="ess-field">
					<span class="ess-label">Covered by</span>
					<select class="ess-select" bind:value={toId}>
						<option value="">Choose a person</option>
						{#each sorted.filter((p) => p.id !== manager) as p (p.id)}<option value={p.id}>{p.fullName}</option>{/each}
					</select>
				</label>
				<label class="ess-field">
					<span class="ess-label">From</span>
					<input class="ess-input" type="date" min={today} bind:value={startsOn} />
				</label>
				<label class="ess-field">
					<span class="ess-label">To</span>
					<input class="ess-input" type="date" min={startsOn || today} bind:value={endsOn} />
				</label>
				<label class="ess-field wide">
					<span class="ess-label">Reason <span class="opt">(optional)</span></span>
					<input class="ess-input" maxlength="300" placeholder="On leave, travelling…" bind:value={reason} />
				</label>
			</div>
			<div class="actions">
				<button type="button" class="ess-btn ess-btn--primary ess-btn--sm" disabled={saving} onclick={create}>
					<Plus size={14} /> {saving ? 'Setting up…' : 'Set up cover'}
				</button>
				{#if tried && problem}
					<span class="ess-error" role="alert">{problem}</span>
				{:else if formError}
					<span class="ess-error" role="alert">{formError}</span>
				{:else if saved}
					<span class="ess-help ok" role="status"><ArrowRight size={13} /> {saved}</span>
				{:else}
					<span class="ess-help">The manager stage only; HR's decision never delegates. Up to {MAX_DAYS} days.</span>
				{/if}
			</div>
		</div>
	{/snippet}

	{#if bare}
		{@render body()}
	{:else}
		<section class="ess-card cover" aria-labelledby="cover-h">
			<div class="ess-card-head">
				<h2 id="cover-h" class="ess-h2"><UserCheck size={16} /> {all ? 'Approval delegations' : 'Cover my approvals'}</h2>
				<span class="ess-caption">{rows.length} live or upcoming</span>
			</div>
			<p class="ess-caption intro">
				{all
					? 'Who approves on a manager’s behalf while they are away. Set one up for a manager who is away unexpectedly, or end one early.'
					: 'While you are away, someone else can approve your team’s requests for you.'}
			</p>
			{@render body()}
		</section>
	{/if}
{/if}

<style>
	.cover {
		display: grid;
		gap: 10px;
	}
	.intro {
		margin-top: -4px;
	}
	.list .ess-row {
		padding: 10px 0;
	}
	.new {
		display: grid;
		gap: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--ess-border-subtle);
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 10px 12px;
	}
	.fields .wide {
		grid-column: 1 / -1;
	}
	.opt {
		font-weight: 400;
		color: var(--ess-text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.actions .ess-help,
	.actions .ess-error {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.ok {
		color: var(--ess-success);
	}
</style>
