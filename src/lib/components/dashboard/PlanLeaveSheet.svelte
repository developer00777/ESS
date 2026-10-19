<script lang="ts">
	/**
	 * "What if I took these days?" — opened from the planner by dragging across
	 * your own row, from a long-weekend idea or the Plan button. Counts the
	 * range the way POST /api/leave will (week offs free, holidays charged),
	 * shows the whole break it makes, what it does to the chosen balance and
	 * who else is away, then hands over to the Leave form pre-filled. Nothing
	 * is booked from here.
	 */
	import X from '@lucide/svelte/icons/x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Users from '@lucide/svelte/icons/users';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import SideSheet from '$lib/components/hub/SideSheet.svelte';
	import { makeWeekOffResolver, workingDaysInRange } from '$lib/week-off';
	import { addDays, daysBetween, type MyLeave } from '$lib/leave-planning';

	interface Props {
		me: MyLeave;
		start: string;
		end: string;
		typeId?: string;
		/** Other people's leave the viewer can already see on the planner. */
		others: { name: string; start: string; end: string; status: 'approved' | 'pending' }[];
		onclose: () => void;
	}

	let { me, start: initialStart, end: initialEnd, typeId: initialType, others, onclose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let start = $state(initialStart);
	// svelte-ignore state_referenced_locally
	let end = $state(initialEnd);
	// svelte-ignore state_referenced_locally
	let typeId = $state(
		initialType ?? me.balances.find((b) => b.free > 0)?.typeId ?? me.monthly[0]?.typeId ?? me.types[0]?.id ?? ''
	);

	const isWeekOff = $derived(makeWeekOffResolver(me.weekOff.rosters, me.weekOff.assignments));
	const holidayOn = $derived(new Map(me.calendar.map((h) => [h.date, h.name])));
	const isKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
	const valid = $derived(isKey(start) && isKey(end) && end >= start);

	const counts = $derived.by(() => {
		if (!valid) return null;
		let offs = 0;
		const hols: { date: string; name: string }[] = [];
		for (let d = start; d <= end; d = addDays(d, 1)) {
			if (isWeekOff(d)) offs++;
			else if (holidayOn.has(d)) hols.push({ date: d, name: holidayOn.get(d)! });
		}
		return { charged: workingDaysInRange(start, end, isWeekOff), offs, hols, span: daysBetween(start, end) + 1 };
	});

	/** The whole time away: the range plus the week offs and holidays either side. */
	const away = $derived.by(() => {
		if (!valid) return null;
		const free = (k: string) => isWeekOff(k) || holidayOn.has(k);
		let s = start;
		let e = end;
		while (free(addDays(s, -1))) s = addDays(s, -1);
		while (free(addDays(e, 1))) e = addDays(e, 1);
		return { s, e, days: daysBetween(s, e) + 1 };
	});

	const balance = $derived(me.balances.find((b) => b.typeId === typeId) ?? null);
	const monthly = $derived(me.monthly.find((m) => m.typeId === typeId) ?? null);
	const isCompOff = $derived(me.types.find((t) => t.id === typeId)?.compOff ?? false);
	const after = $derived(balance && counts ? Math.round((balance.free - counts.charged) * 100) / 100 : null);

	const clashes = $derived(valid ? me.booked.filter((b) => b.start <= end && b.end >= start) : []);
	const alsoAway = $derived(valid ? others.filter((o) => o.start <= end && o.end >= start) : []);

	const parse = (k: string) => new Date(k + 'T00:00:00');
	const fmtDay = (k: string) => parse(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
	const fmtRange = (s: string, e: string) => (s === e ? fmtDay(s) : `${fmtDay(s)} – ${fmtDay(e)}`);
	const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
	const plural = (n: number, one: string) => `${fmtNum(n)} ${n === 1 ? one : one + 's'}`;

	const applyHref = $derived(
		`/leave/apply?${new URLSearchParams({ start, end, ...(typeId ? { type: typeId } : {}) }).toString()}`
	);
</script>

<SideSheet label="Plan time off" {onclose}>
	<div class="sheet">
		<header class="sheet-head">
			<div>
				<h2>Plan time off</h2>
				<p>See what these dates cost before you apply.</p>
			</div>
			<button type="button" class="ess-icon-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
		</header>

		<div class="fields">
			<label class="ess-field">
				<span class="ess-label">From</span>
				<input class="ess-input" type="date" bind:value={start} />
			</label>
			<label class="ess-field">
				<span class="ess-label">To</span>
				<input class="ess-input" type="date" bind:value={end} min={start} />
			</label>
			<label class="ess-field wide">
				<span class="ess-label">Leave type</span>
				<select class="ess-select" bind:value={typeId}>
					{#each me.types as t (t.id)}
						{@const b = me.balances.find((x) => x.typeId === t.id)}
						{@const m = me.monthly.find((x) => x.typeId === t.id)}
						<option value={t.id}>{t.name}{b ? ` — ${fmtNum(b.free)} free` : m ? ` — ${fmtNum(m.remaining)} this month` : ''}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if !valid}
			<p class="err">Pick an end date on or after the start date.</p>
		{:else if counts && away}
			<section class="sum" aria-label="Summary">
				<p class="sum-big"><b>{plural(counts.charged, 'leave day')}</b> for {plural(away.days, 'day')} away</p>
				<p class="sum-range">{fmtRange(away.s, away.e)}</p>
				<div class="chips">
					<span class="chip">{plural(counts.span, 'day')} selected</span>
					{#if counts.offs}<span class="chip">{plural(counts.offs, 'week off')} free</span>{/if}
					{#if away.days > counts.span}<span class="chip good">+{plural(away.days - counts.span, 'day')} from weekends &amp; holidays</span>{/if}
				</div>
			</section>

			{#if counts.hols.length}
				<p class="note warn">
					<TriangleAlert size={14} />
					<span>
						{counts.hols.map((h) => `${h.name} (${fmtDay(h.date)})`).join(', ')}
						{counts.hols.length === 1 ? 'falls' : 'fall'} inside these dates and would be charged as leave. Apply for the days either side instead.
					</span>
				</p>
			{/if}

			<section class="impact" aria-label="Balance">
				{#if balance && after !== null}
					<div class="impact-row">
						<span>{balance.name}</span>
						<span class="flow"><b>{fmtNum(balance.free)}</b> <ArrowRight size={13} /> <b class:neg={after < 0}>{fmtNum(after)}</b> free</span>
					</div>
					{#if after < 0}
						<p class="note bad"><TriangleAlert size={14} /> You'd be {plural(-after, 'day')} short. Shorten the dates or pick another type.</p>
					{:else if balance.lapsing > 0}
						<p class="note good">Uses {plural(Math.min(counts.charged, balance.lapsing), 'day')} that would otherwise not carry into next year.</p>
					{/if}
				{:else if monthly}
					<div class="impact-row">
						<span>{monthly.name}</span>
						<span class="flow"><b>{fmtNum(monthly.remaining)}</b> of {fmtNum(monthly.quota)} left this month</span>
					</div>
					{#if counts.charged > monthly.remaining || start.slice(0, 7) !== end.slice(0, 7)}
						<p class="note bad"><TriangleAlert size={14} /> {monthly.name} must sit within one month and fit its quota.</p>
					{/if}
				{:else if isCompOff}
					<div class="impact-row">
						<span>Comp-off credits</span>
						<span class="flow"><b>{me.compOff.available}</b> <ArrowRight size={13} /> <b class:neg={me.compOff.available - counts.charged < 0}>{me.compOff.available - counts.charged}</b></span>
					</div>
				{:else}
					<p class="muted">This type isn't drawn from a balance — HR checks eligibility when you apply.</p>
				{/if}
			</section>

			{#if clashes.length}
				<p class="note warn">
					<TriangleAlert size={14} />
					<span>Overlaps leave you've already booked: {clashes.map((c) => `${c.typeName} ${fmtRange(c.start, c.end)}`).join('; ')}.</span>
				</p>
			{/if}

			{#if others.length}
				<section class="team" aria-label="Also away">
					<h3><Users size={13} /> Also away then</h3>
					{#if alsoAway.length}
						<ul>
							{#each alsoAway as o, i (i)}
								<li><span>{o.name}</span><span class="muted">{fmtRange(o.start, o.end)}{o.status === 'pending' ? ' · pending' : ''}</span></li>
							{/each}
						</ul>
					{:else}
						<p class="muted">No one else on the planner is away on these dates.</p>
					{/if}
				</section>
			{/if}
		{/if}

		<div class="actions">
			<button type="button" class="ess-btn ess-btn--secondary" onclick={onclose}>Close</button>
			<a class="ess-btn ess-btn--primary" class:disabled={!valid} aria-disabled={!valid} href={valid ? applyHref : undefined}>
				Continue to apply
			</a>
		</div>
	</div>
</SideSheet>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px 22px;
		overflow-y: auto;
	}
	.sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.sheet-head h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 650;
	}
	.sheet-head p {
		margin: 2px 0 0;
		color: var(--ess-text-muted);
		font-size: 13px;
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.fields .wide {
		grid-column: 1 / -1;
	}

	.sum {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
		border-radius: 14px;
		background: linear-gradient(160deg, var(--ess-primary-softer), var(--ess-sunken) 75%);
	}
	.sum-big {
		margin: 0;
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	.sum-big b {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--ess-text);
	}
	.sum-range {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--ess-surface);
		font-size: 11.5px;
		color: var(--ess-text-secondary);
	}
	.chip.good {
		background: var(--ess-success-bg);
		color: var(--ess-success);
		font-weight: 600;
	}

	.impact {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.impact-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--ess-sunken);
		font-size: 13px;
		font-weight: 600;
	}
	.flow {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 500;
		color: var(--ess-text-muted);
	}
	.flow b {
		font-size: 15px;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.flow b.neg {
		color: var(--ess-danger);
	}

	.note {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin: 0;
		padding: 9px 11px;
		border-radius: 10px;
		font-size: 12.5px;
		line-height: 1.45;
	}
	.note :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.note.warn {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.note.bad {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.note.good {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}

	.team h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--ess-text-muted);
	}
	.team ul {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.team li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
	}
	.muted {
		margin: 0;
		color: var(--ess-text-muted);
		font-size: 12.5px;
	}
	.err {
		margin: 0;
		color: var(--ess-danger);
		font-size: 13px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: auto;
	}
	.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
