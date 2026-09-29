<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import X from '@lucide/svelte/icons/x';
	import NeedsYouCard from '$lib/components/announcements/NeedsYouCard.svelte';
	import PostRow from '$lib/components/announcements/PostRow.svelte';
	import PostDetail from '$lib/components/announcements/PostDetail.svelte';
	import { daysUntil, weekGroup, type AnnouncementKind, type FeedPost } from '$lib/announcements';
	import { lockPageScroll } from '$lib/scroll-lock';

	/**
	 * Posting and managing announcements, inside Champ Chat's #announcements
	 * channel, for anyone holding "Post announcements". `draft` pre-fills the
	 * form from a Champ card.
	 */
	let {
		data,
		form,
		draft = null
	}: {
		data: {
			now: string;
			mailerConfigured: boolean;
			teams: { id: string; name: string }[];
			shiftGroups: { id: string; name: string }[];
			membership: { t: string | null; s: string | null }[];
			posts: {
				id: string;
				kind: AnnouncementKind;
				title: string;
				summary: string | null;
				body: string;
				eventDate: string | null;
				eventTime: string | null;
				audienceAll: boolean;
				audienceTeamIds: string[];
				audienceShiftGroupIds: string[];
				requiresAck: boolean;
				urgentDays: number;
				emailCopy: boolean;
				emailSentAt: string | null;
				attachmentName: string | null;
				status: string;
				publishAt: string | null;
				editedAt: string | null;
				audienceSize: number;
				reads: number;
				acks: number;
			}[];
		};
		form: { saveError?: string; savedMessage?: string } | null | undefined;
		draft?: { kind?: string; title?: string; summary?: string; body?: string; eventDate?: string; eventTime?: string } | null;
	} = $props();

	const now = $derived(new Date(data.now));
	type Post = (typeof data.posts)[number];

	/* ---------- composer state ---------- */

	const KINDS: { id: AnnouncementKind; label: string; hint: string }[] = [
		{ id: 'urgent', label: 'Urgent', hint: 'First under "Needs you" with a red badge, until each person taps "Got it"' },
		{ id: 'event', label: 'Event or date', hint: 'Listed under "Coming up" by its date. Drops off after the day' },
		{ id: 'update', label: 'Update', hint: 'A quiet line under "Updates"' }
	];

	function tomorrowNineIst(): string {
		const ist = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000);
		return ist.toISOString().slice(0, 10) + 'T09:00';
	}

	function blank() {
		return {
			id: '',
			kind: 'update' as AnnouncementKind,
			title: '',
			summary: '',
			body: '',
			eventDate: '',
			eventTime: '',
			audienceAll: true,
			teamIds: [] as string[],
			shiftGroupIds: [] as string[],
			when: 'now' as 'now' | 'later',
			publishAt: tomorrowNineIst(),
			urgentDays: 3,
			requiresAck: false,
			emailCopy: false,
			attachmentName: null as string | null,
			removeAttachment: false,
			isLive: false
		};
	}

	// svelte-ignore state_referenced_locally
	let f = $state({
		...blank(),
		...(draft
			? {
					kind: (['urgent', 'event', 'update'].includes(draft.kind ?? '') ? draft.kind : 'update') as AnnouncementKind,
					title: draft.title ?? '',
					summary: draft.summary ?? '',
					body: draft.body ?? '',
					eventDate: draft.eventDate ?? '',
					eventTime: draft.eventTime ?? ''
				}
			: {})
	});
	let fileName = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	let saving = $state(false);

	function reset() {
		f = blank();
		fileName = null;
		if (fileInput) fileInput.value = '';
	}

	async function edit(p: Post) {
		f = {
			id: p.id,
			kind: p.kind,
			title: p.title,
			summary: p.summary ?? '',
			body: p.body,
			eventDate: p.eventDate ?? '',
			eventTime: p.eventTime ?? '',
			audienceAll: p.audienceAll,
			teamIds: [...p.audienceTeamIds],
			shiftGroupIds: [...p.audienceShiftGroupIds],
			when: p.publishAt && new Date(p.publishAt) > now ? 'later' : 'now',
			publishAt: p.publishAt
				? new Date(new Date(p.publishAt).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16)
				: tomorrowNineIst(),
			urgentDays: p.urgentDays,
			requiresAck: p.requiresAck,
			emailCopy: p.emailCopy,
			attachmentName: p.attachmentName,
			removeAttachment: false,
			isLive: status(p).key === 'live' || status(p).key === 'ended'
		};
		fileName = null;
		await tick();
		formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/* ---------- reach ---------- */

	const reach = $derived(
		f.audienceAll
			? data.membership.length
			: data.membership.filter(
					(m) => (m.t && f.teamIds.includes(m.t)) || (m.s && f.shiftGroupIds.includes(m.s))
				).length
	);

	/* ---------- preview ---------- */

	const previewPost = $derived<FeedPost>({
		id: f.id || 'preview',
		kind: f.kind,
		title: f.title || 'Headline',
		summary: f.summary || (f.body ? null : 'The one line employees see'),
		body: f.body,
		eventDate: f.kind === 'event' && f.eventDate ? f.eventDate : null,
		eventTime: f.kind === 'event' && f.eventTime ? f.eventTime : null,
		requiresAck: f.requiresAck,
		urgentDays: f.urgentDays,
		attachmentName: fileName ?? (f.removeAttachment ? null : f.attachmentName),
		publishAt: data.now,
		editedAt: null,
		authorName: null,
		read: false,
		acknowledged: false,
		dismissed: false
	});

	const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MO[Number(d.slice(5, 7)) - 1]}`;

	/* ---------- list ---------- */

	function status(p: Post): { key: string; label: string; tone: string } {
		if (p.status === 'draft') return { key: 'draft', label: 'Draft', tone: 'cancelled' };
		if (p.status === 'taken_down') return { key: 'down', label: 'Taken down', tone: 'cancelled' };
		if (p.publishAt && new Date(p.publishAt) > now) return { key: 'sched', label: 'Scheduled', tone: 'info' };
		if (p.kind === 'event' && p.eventDate && daysUntil(p.eventDate, now) < 0)
			return { key: 'ended', label: 'Ended by itself', tone: 'cancelled' };
		return { key: 'live', label: 'Live', tone: 'approved' };
	}

	const teamName = $derived(new Map(data.teams.map((t) => [t.id, t.name])));
	const shiftName = $derived(new Map(data.shiftGroups.map((s) => [s.id, s.name])));

	function audienceLabel(p: Post): string {
		if (p.audienceAll) return 'Everyone';
		return [
			...p.audienceTeamIds.map((id) => teamName.get(id) ?? 'Removed team'),
			...p.audienceShiftGroupIds.map((id) => shiftName.get(id) ?? 'Removed shift')
		].join(', ');
	}

	function whenLabel(p: Post): string {
		const s = status(p);
		if (p.kind === 'event' && p.eventDate) return `On ${dayMonth(p.eventDate)}${p.eventTime ? ', ' + p.eventTime : ''}`;
		if (!p.publishAt) return 'Not published';
		const d = new Date(p.publishAt);
		const at = d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
		return s.key === 'sched' ? `Goes out ${at}` : `Posted ${at}`;
	}

	const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

	/* ---------- who hasn't confirmed ---------- */

	let pendingFor = $state<Post | null>(null);
	let pending = $state<{ audience: number; pending: { id: string; fullName: string; opened: boolean }[] } | null>(null);
	let pendingError = $state('');
	let unlock: (() => void) | null = null;

	async function openPending(p: Post) {
		pendingFor = p;
		pending = null;
		pendingError = '';
		unlock = lockPageScroll();
		try {
			const res = await fetch(`/api/admin/announcements/${p.id}/pending`);
			if (!res.ok) throw new Error();
			pending = await res.json();
		} catch {
			pendingError = 'The list did not load. Close this and try again.';
		}
	}

	function closePending() {
		pendingFor = null;
		unlock?.();
		unlock = null;
	}

	$effect(() => () => unlock?.());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && pendingFor && closePending()} />

{#if form?.saveError}
	<p class="ess-alert ess-alert--danger" role="alert">{form.saveError}</p>
{:else if form?.savedMessage}
	<p class="ess-alert ess-alert--success" role="status">{form.savedMessage}</p>
{/if}

<div class="compose">
	<form
		class="ess-panel form"
		method="POST"
		action="?/saveAnnouncement"
		enctype="multipart/form-data"
		bind:this={formEl}
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				saving = false;
				if (result.type === 'success') reset();
			};
		}}
	>
		<div class="form-head">
			<h2 class="ess-h3">{f.id ? 'Edit announcement' : 'New announcement'}</h2>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={reset}>{f.id ? 'Cancel edit' : 'Clear'}</button>
		</div>
		<input type="hidden" name="id" value={f.id} />
		<input type="hidden" name="kind" value={f.kind} />

		<fieldset class="field">
			<legend class="ess-label">What kind of post is it?</legend>
			<div class="kinds">
				{#each KINDS as k (k.id)}
					<button type="button" class="kind" data-kind={k.id} aria-pressed={f.kind === k.id} onclick={() => (f.kind = k.id)}>
						<strong><span class="kdot" aria-hidden="true"></span>{k.label}</strong>
						<small>{k.hint}</small>
					</button>
				{/each}
			</div>
		</fieldset>

		<label class="ess-field">
			<span class="ess-label">Headline</span>
			<input class="ess-input" name="title" maxlength="120" bind:value={f.title} required />
		</label>

		{#if f.kind === 'event'}
			<div class="two">
				<label class="ess-field">
					<span class="ess-label">Date</span>
					<input class="ess-input" type="date" name="eventDate" bind:value={f.eventDate} required />
				</label>
				<label class="ess-field">
					<span class="ess-label">Time (optional)</span>
					<input class="ess-input" type="time" name="eventTime" bind:value={f.eventTime} />
				</label>
			</div>
		{/if}

		<label class="ess-field">
			<span class="ess-label">One line employees see</span>
			<input class="ess-input" name="summary" maxlength="160" bind:value={f.summary} />
			<span class="ess-help">Leave blank to use the first sentence of the details.</span>
		</label>

		<label class="ess-field">
			<span class="ess-label">Details</span>
			<textarea class="ess-textarea" name="body" rows="5" bind:value={f.body}></textarea>
			<span class="ess-help">Shown only when someone taps the post.</span>
		</label>

		<fieldset class="field">
			<legend class="ess-label">Who sees it</legend>
			<div class="aud">
				<label class="chip-check">
					<input type="checkbox" name="audienceAll" bind:checked={f.audienceAll} />
					Everyone <span class="n">{data.membership.length}</span>
				</label>
				{#if !f.audienceAll}
					{#each data.teams as t (t.id)}
						<label class="chip-check">
							<input type="checkbox" name="teamIds" value={t.id} bind:group={f.teamIds} />
							{t.name} <span class="n">{data.membership.filter((m) => m.t === t.id).length}</span>
						</label>
					{/each}
					{#each data.shiftGroups as s (s.id)}
						<label class="chip-check">
							<input type="checkbox" name="shiftGroupIds" value={s.id} bind:group={f.shiftGroupIds} />
							{s.name} <span class="n">{data.membership.filter((m) => m.s === s.id).length}</span>
						</label>
					{/each}
				{/if}
			</div>
			<span class="reach">
				{reach === 0 ? 'Nobody yet. Pick at least one group.' : `Reaches ${reach} ${reach === 1 ? 'person' : 'people'}`}
			</span>
		</fieldset>

		<div class="two">
			{#if !f.isLive}
				<label class="ess-field">
					<span class="ess-label">Publish</span>
					<select class="ess-select" name="when" bind:value={f.when}>
						<option value="now">Now</option>
						<option value="later">At a set time</option>
					</select>
				</label>
				{#if f.when === 'later'}
					<label class="ess-field">
						<span class="ess-label">Date and time (IST)</span>
						<input class="ess-input" type="datetime-local" name="publishAt" bind:value={f.publishAt} />
					</label>
				{/if}
			{:else}
				<input type="hidden" name="when" value="now" />
			{/if}
			{#if f.kind === 'urgent'}
				<label class="ess-field">
					<span class="ess-label">Stays urgent for</span>
					<select class="ess-select" name="urgentDays" bind:value={f.urgentDays}>
						<option value={1}>1 day</option>
						<option value={3}>3 days</option>
						<option value={7}>1 week</option>
					</select>
				</label>
			{:else}
				<input type="hidden" name="urgentDays" value={f.urgentDays} />
			{/if}
		</div>

		<label class="toggle">
			<input type="checkbox" name="requiresAck" bind:checked={f.requiresAck} />
			<span><strong>Ask people to confirm they've read it</strong><small>It stays under "Needs you" for each person until they confirm</small></span>
		</label>
		<label class="toggle">
			<input type="checkbox" name="emailCopy" bind:checked={f.emailCopy} disabled={!data.mailerConfigured} />
			<span>
				<strong>Also send by email</strong>
				<small>
					{data.mailerConfigured
						? "To each person's official address, once, when it goes live"
						: 'Email is not set up on this server (RESEND_API_KEY), so this is off'}
				</small>
			</span>
		</label>

		<div class="attach-row">
			<label class="ess-btn ess-btn--secondary ess-btn--sm file-btn">
				<Paperclip size={14} />
				{fileName || (f.attachmentName && !f.removeAttachment) ? 'Replace file' : 'Attach a file'}
				<input
					bind:this={fileInput}
					type="file"
					name="attachment"
					accept="application/pdf,image/jpeg,image/png,image/webp"
					onchange={(e) => (fileName = (e.currentTarget as HTMLInputElement).files?.[0]?.name ?? null)}
				/>
			</label>
			{#if fileName}
				<span class="file-name">{fileName}</span>
			{:else if f.attachmentName && !f.removeAttachment}
				<span class="file-name">{f.attachmentName}</span>
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => (f.removeAttachment = true)}>
					<X size={14} /> Remove
				</button>
			{:else}
				<span class="ess-help">PDF or image, up to 5 MB</span>
			{/if}
			{#if f.removeAttachment}<input type="hidden" name="removeAttachment" value="on" />{/if}
		</div>

		<div class="actions">
			<button class="ess-btn ess-btn--primary" type="submit" name="intent" value="publish" disabled={saving}>
				{saving ? 'Saving…' : f.id && f.isLive ? 'Save changes' : f.when === 'later' ? 'Schedule' : 'Publish now'}
			</button>
			{#if !f.isLive}
				<button class="ess-btn ess-btn--secondary" type="submit" name="intent" value="draft" disabled={saving}>Save draft</button>
			{/if}
			{#if f.isLive}
				<span class="ess-help">Changing the wording shows it as unread again, marked "Edited".</span>
			{/if}
		</div>
	</form>

	<aside class="preview" aria-label="Preview">
		<span class="ess-eyebrow">Preview · where employees see it</span>
		<div class="pv-box">
			{#if f.kind === 'urgent'}
				<NeedsYouCard post={previewPost} {now} preview />
				<span class="ess-caption">First under "Needs you" for {f.urgentDays === 7 ? '1 week' : `${f.urgentDays} day${f.urgentDays === 1 ? '' : 's'}`}, and the Announcements badge turns red.</span>
			{:else if f.requiresAck}
				<NeedsYouCard post={previewPost} {now} preview />
				<span class="ess-caption">Under "Needs you" until each person confirms.</span>
			{:else if f.kind === 'event'}
				{#if previewPost.eventDate}
					<div class="pv-rows"><PostRow item={previewPost} {now} variant="event" /></div>
					<span class="ess-caption">
						Under "Coming up · {weekGroup(previewPost.eventDate, now)}". Disappears after {dayMonth(previewPost.eventDate)}.
					</span>
				{:else}
					<span class="ess-caption">Pick a date to see where it lands.</span>
				{/if}
			{:else}
				<div class="pv-rows"><PostRow item={previewPost} {now} variant="update" /></div>
				<span class="ess-caption">Under "Updates". Moves to "Earlier" after a week.</span>
			{/if}
			<span class="ess-eyebrow pv-sub">When someone taps it</span>
			<div class="pv-rows pv-detail"><PostDetail post={previewPost} {now} preview /></div>
		</div>
	</aside>
</div>

<section class="ess-panel" aria-labelledby="posted-h">
	<div class="list-head">
		<h2 class="ess-h3" id="posted-h">Posted</h2>
		<span class="ess-caption">Holidays from the published calendars appear for employees by themselves and are not listed here.</span>
	</div>
	{#if data.posts.length === 0}
		<p class="ess-empty">Nothing posted yet. Your first announcement will appear here with how many people have read it.</p>
	{:else}
		<div class="ess-table-shell">
			<table class="ess-table">
				<thead>
					<tr><th>Announcement</th><th>Status</th><th>Audience</th><th>Read</th><th>Confirmed</th><th><span class="sr-only">Actions</span></th></tr>
				</thead>
				<tbody>
					{#each data.posts as p (p.id)}
						{@const st = status(p)}
						{@const live = st.key === 'live' || st.key === 'ended'}
						<tr>
							<td>
								<div class="t-title"><span class="kind-chip" data-kind={p.kind}>{KINDS.find((k) => k.id === p.kind)?.label.split(' ')[0]}</span><strong>{p.title}</strong></div>
								<div class="ess-caption">{whenLabel(p)}{p.emailSentAt ? ' · emailed' : p.emailCopy ? ' · email pending' : ''}{p.editedAt ? ' · edited' : ''}</div>
							</td>
							<td><span class="ess-badge ess-badge--{st.tone}">{st.label}</span></td>
							<td>{audienceLabel(p)}<div class="ess-caption ess-num">{p.audienceSize} people</div></td>
							<td>
								{#if live}
									<div class="bar"><i style="width:{pct(p.reads, p.audienceSize)}%"></i></div>
									<span class="ess-caption ess-num">{p.reads} of {p.audienceSize}</span>
								{:else}<span class="ess-caption">—</span>{/if}
							</td>
							<td>
								{#if p.requiresAck && live}
									<div class="bar ack"><i style="width:{pct(p.acks, p.audienceSize)}%"></i></div>
									<button type="button" class="linkish" onclick={() => openPending(p)}>
										{Math.max(0, p.audienceSize - p.acks)} still to confirm
									</button>
								{:else}<span class="ess-caption">{p.requiresAck ? 'Asked' : 'Not asked'}</span>{/if}
							</td>
							<td class="row-actions">
								<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => edit(p)}>Edit</button>
								<form method="POST" action={p.status === 'taken_down' ? '?/restore' : '?/takeDown'} use:enhance>
									<input type="hidden" name="id" value={p.id} />
									<button class="ess-btn ess-btn--ghost ess-btn--sm" type="submit">{p.status === 'taken_down' ? 'Restore' : 'Take down'}</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

{#if pendingFor}
	<div class="ess-scrim modal-scrim" role="presentation" onclick={closePending}></div>
	<div class="ess-modal pending" role="dialog" aria-modal="true" aria-labelledby="pending-h">
		<div class="ess-modal__head">
			<div>
				<h2 class="ess-h3" id="pending-h">
					{pending ? `${pending.pending.length} ${pending.pending.length === 1 ? 'person hasn’t' : 'people haven’t'} confirmed yet` : 'Loading…'}
				</h2>
				<p class="ess-caption">“{pendingFor.title}”{pending ? ` · ${pending.audience - pending.pending.length} of ${pending.audience} confirmed` : ''}</p>
			</div>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={closePending} aria-label="Close"><X size={16} /></button>
		</div>
		<div class="ess-modal__body">
			{#if pendingError}
				<p class="ess-error">{pendingError}</p>
			{:else if pending}
				<ul class="plist">
					{#each pending.pending as person (person.id)}
						<li>{person.fullName}<span class="ess-caption">{person.opened ? 'Opened, not confirmed' : 'Not opened'}</span></li>
					{:else}
						<li>Everyone has confirmed.</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if pending && pending.pending.length > 0}
			<div class="ess-modal__foot">
				<form method="POST" action="?/remind" use:enhance={() => async ({ update }) => { await update(); closePending(); }}>
					<input type="hidden" name="id" value={pendingFor.id} />
					<button class="ess-btn ess-btn--primary ess-btn--sm" type="submit" disabled={!data.mailerConfigured}>
						Email a reminder to {pending.pending.length}
					</button>
				</form>
				{#if !data.mailerConfigured}<span class="ess-caption">Email is not set up on this server.</span>{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.compose {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
		gap: var(--ess-space-5);
		align-items: start;
	}
	.form {
		display: grid;
		gap: 16px;
	}
	.form-head,
	.list-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}
	.list-head {
		margin-bottom: var(--ess-space-3);
	}
	.form-head h2,
	.list-head h2 {
		margin: 0;
	}
	fieldset.field {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.kinds {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.kind {
		display: grid;
		gap: 3px;
		align-content: start;
		text-align: left;
		padding: 11px 12px;
		border: 1.5px solid var(--ess-border);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-surface);
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.kind strong {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13.5px;
	}
	.kind small {
		color: var(--ess-text-muted);
		font-size: 11.5px;
		line-height: 1.35;
	}
	.kind[aria-pressed='true'] {
		border-color: var(--ess-primary);
		background: var(--ess-primary-soft);
	}
	.kind:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}
	.kdot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--ess-text-muted);
	}
	[data-kind='urgent'] .kdot {
		background: var(--ess-danger);
	}
	[data-kind='event'] .kdot {
		background: var(--ess-primary);
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 12px;
	}
	.aud {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip-check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-pill);
		background: var(--ess-surface);
		font-size: 12.5px;
		cursor: pointer;
	}
	.chip-check input {
		accent-color: var(--ess-primary);
	}
	.n {
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.reach {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ess-primary-text);
	}
	.toggle {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 13px;
		cursor: pointer;
	}
	.toggle input {
		margin-top: 3px;
		width: 16px;
		height: 16px;
		accent-color: var(--ess-primary);
	}
	.toggle small {
		display: block;
		color: var(--ess-text-muted);
		font-size: 12px;
	}
	.attach-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
	}
	.file-btn {
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}
	.file-btn input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.file-btn:focus-within {
		box-shadow: var(--ess-focus-ring);
	}
	.file-name {
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.preview {
		position: sticky;
		top: 64px;
		display: grid;
		gap: 8px;
	}
	.pv-box {
		display: grid;
		gap: 10px;
		padding: 14px;
		border: 1px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
	}
	.pv-rows {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-raised-bg);
		overflow: hidden;
	}
	.pv-detail {
		padding: 14px;
	}
	.pv-sub {
		margin-top: 4px;
	}
	.t-title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.kind-chip {
		font-size: 11px;
		font-weight: 700;
		padding: 1px 8px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}
	.kind-chip[data-kind='urgent'] {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.kind-chip[data-kind='event'] {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.bar {
		width: 110px;
		height: 6px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		overflow: hidden;
		margin-bottom: 3px;
	}
	.bar i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--acc), var(--acc2));
	}
	.bar.ack i {
		background: var(--ess-success);
	}
	.linkish {
		border: 0;
		padding: 0;
		background: none;
		font: inherit;
		font-size: var(--ess-fs-caption);
		font-weight: 600;
		color: var(--ess-primary-text);
		cursor: pointer;
	}
	.row-actions {
		white-space: nowrap;
	}
	.row-actions form {
		display: inline;
	}
	.modal-scrim {
		z-index: 90;
	}
	.pending {
		position: fixed;
		z-index: 91;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}
	.pending .ess-modal__body {
		overflow-y: auto;
	}
	.plist {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.plist li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 0;
		border-top: 1px solid var(--ess-border-subtle);
		font-size: 13px;
	}
	.plist li:first-child {
		border-top: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 960px) {
		.compose {
			grid-template-columns: minmax(0, 1fr);
		}
		.preview {
			position: static;
		}
	}
	@media (max-width: 560px) {
		.kinds {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
