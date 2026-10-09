<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import NeedsYouCard from '$lib/components/announcements/NeedsYouCard.svelte';
	import PostRow from '$lib/components/announcements/PostRow.svelte';
	import PostDetail from '$lib/components/announcements/PostDetail.svelte';
	import DateTile from '$lib/components/announcements/DateTile.svelte';
	import { isUrgentNow, weekGroup, type ComingUpItem, type Feed, type FeedPost } from '$lib/announcements';

	/**
	 * The #announcements channel in Champ Chat: what needs you, what is coming
	 * up by date, and updates, as a list on the left with the open post read
	 * in full on the right. `onchanged` re-reads the feed after an action.
	 */
	let { feed, now: nowIso, onchanged }: { feed: Feed; now: string; onchanged: () => Promise<void> | void } = $props();

	const now = $derived(new Date(nowIso));

	let openId = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let showEarlier = $state(false);
	let errorMsg = $state('');
	/* Marked read here straight away, so the dot clears on tap rather than
	   after the round trip. */
	let readLocally = $state<Set<string>>(new Set());

	const withLocalRead = <T extends ComingUpItem>(item: T): T =>
		item.kind !== 'holiday' && readLocally.has(item.id) ? { ...item, read: true } : item;

	const updates = $derived(feed.updates.map(withLocalRead));
	const unreadUpdates = $derived(updates.filter((p) => !p.read));

	const groups = $derived.by(() => {
		const out: { label: string; items: ComingUpItem[] }[] = [];
		for (const item of feed.comingUp.map(withLocalRead)) {
			const label = weekGroup(item.eventDate!, now);
			if (out.at(-1)?.label !== label) out.push({ label, items: [] });
			out.at(-1)!.items.push(item);
		}
		return out;
	});

	/** The post read on the right, wherever it sits in the lists. */
	const openPost = $derived.by((): FeedPost | null => {
		if (!openId) return null;
		const all: ComingUpItem[] = [...feed.needsYou, ...feed.comingUp, ...feed.updates, ...feed.earlier];
		const found = all.find((p) => p.kind !== 'holiday' && p.id === openId);
		return found && found.kind !== 'holiday' ? withLocalRead(found) : null;
	});
	const openNeeds = $derived(!!openPost && feed.needsYou.some((p) => p.id === openPost!.id));
	const openUrgent = $derived(!!openPost && isUrgentNow(openPost, now) && !openPost.dismissed);
	const openAsk = $derived(!!openPost && openNeeds && !openUrgent);

	async function post(url: string, body: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Something went wrong');
	}

	function toggle(item: ComingUpItem) {
		if (item.kind === 'holiday') return;
		openId = openId === item.id ? null : item.id;
		if (openId && !item.read && !readLocally.has(item.id)) {
			readLocally = new Set(readLocally).add(item.id);
			// Only the badge depends on this, so a failure is not worth an error.
			post(`/api/announcements/${item.id}`, { action: 'read' })
				.then(() => onchanged())
				.catch(() => {});
		}
	}

	async function act(id: string, action: 'ack' | 'dismiss') {
		busyId = id;
		errorMsg = '';
		try {
			await post(`/api/announcements/${id}`, { action });
			openId = null;
			await onchanged();
		} catch (e) {
			errorMsg =
				action === 'ack'
					? 'Your confirmation was not saved. Check your connection and press "Acknowledge" again.'
					: 'That did not save. Check your connection and try again.';
		} finally {
			busyId = null;
		}
	}

	async function markAllRead() {
		const ids = unreadUpdates.map((p) => p.id);
		readLocally = new Set([...readLocally, ...ids]);
		await post('/api/announcements/read-all', { ids }).catch(() => {});
		await onchanged();
	}

	const longDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
</script>

{#if errorMsg}
	<p class="ess-error" role="alert">{errorMsg}</p>
{/if}

<div class="feed" class:reading={!!openPost}>
	<div class="list">
		<section class="ess-card sec" aria-labelledby="needs-h">
			<div class="ess-card-head">
				<h2 id="needs-h" class="ess-h2">Needs you</h2>
				{#if feed.needsYou.length}<span class="cnt">{feed.needsYou.length}</span>{/if}
			</div>
			{#if feed.needsYou.length === 0}
				<div class="all-clear"><CircleCheck size={16} /> Nothing needs you right now.</div>
			{:else}
				<div class="needs">
					{#each feed.needsYou as p (p.id)}
						<NeedsYouCard
							post={p}
							{now}
							selected={openId === p.id}
							busy={busyId === p.id}
							ontoggle={() => toggle(p)}
							ondismiss={() => act(p.id, 'dismiss')}
							onconfirm={() => act(p.id, 'ack')}
						/>
					{/each}
				</div>
			{/if}
		</section>

		<section class="ess-card sec" aria-labelledby="coming-h">
			<div class="ess-card-head"><h2 id="coming-h" class="ess-h2">Coming up</h2></div>
			{#if groups.length === 0}
				<p class="empty">Nothing planned in the next two months.</p>
			{:else}
				{#each groups as g (g.label)}
					<h3 class="group-label">{g.label}</h3>
					<div class="rows">
						{#each g.items as item (item.id)}
							<PostRow {item} {now} variant="event" selected={openId === item.id} ontoggle={() => toggle(item)} />
						{/each}
					</div>
				{/each}
			{/if}
		</section>

		<section class="ess-card sec" aria-labelledby="updates-h">
			<div class="ess-card-head">
				<h2 id="updates-h" class="ess-h2">Updates {#if unreadUpdates.length}<span class="cnt">{unreadUpdates.length} new</span>{/if}</h2>
				{#if unreadUpdates.length}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={markAllRead}>Mark all read</button>
				{/if}
			</div>
			{#if updates.length === 0}
				<p class="empty">No updates this week.</p>
			{:else}
				<div class="rows">
					{#each updates as item (item.id)}
						<PostRow {item} {now} variant="update" selected={openId === item.id} ontoggle={() => toggle(item)} />
					{/each}
				</div>
			{/if}

			{#if feed.earlier.length}
				{#if showEarlier}
					<h3 class="group-label">Earlier</h3>
					<div class="rows">
						{#each feed.earlier as item (item.id)}
							<PostRow {item} {now} variant="update" muted selected={openId === item.id} ontoggle={() => toggle(item)} />
						{/each}
					</div>
				{:else}
					<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm earlier" onclick={() => (showEarlier = true)}>
						Show {feed.earlier.length} earlier
					</button>
				{/if}
			{/if}
		</section>
	</div>

	<aside class="reader ess-card" aria-live="polite" aria-label="Announcement">
		{#if openPost}
			<header class="r-head">
				{#if openPost.kind === 'event' && openPost.eventDate}
					<DateTile date={openPost.eventDate} {now} />
				{:else}
					<span class="ess-tile" class:ess-tile--bad={openUrgent} class:ess-tile--warn={openAsk}>
						{#if openUrgent}<TriangleAlert size={20} />{:else if openPost.kind === 'event'}<CalendarDays size={20} />{:else}<Megaphone size={20} />{/if}
					</span>
				{/if}
				<div class="r-title">
					<h2 class="ess-h2">
						{openPost.title}
						{#if openUrgent}<span class="ess-badge ess-badge--bad">Urgent</span>
						{:else if openAsk}<span class="ess-badge ess-badge--warn">Action required</span>
						{:else if openPost.acknowledged}<span class="ess-badge ess-badge--ok">Acknowledged</span>{/if}
					</h2>
					<span class="r-meta">
						By {openPost.authorName ? `${openPost.authorName}, HR` : 'HR'}
						<span class="ess-dot-sep"></span>{longDate(openPost.publishAt)}
						{#if openPost.kind === 'event' && openPost.eventDate}<span class="ess-dot-sep"></span>On {longDate(openPost.eventDate + 'T00:00:00+05:30')}{openPost.eventTime ? `, ${openPost.eventTime}` : ''}{/if}
					</span>
				</div>
				<button type="button" class="ess-icon-btn" onclick={() => (openId = null)} aria-label="Close">✕</button>
			</header>
			<div class="r-body">
				<PostDetail post={openPost} {now} />
			</div>
			{#if openUrgent}
				<div class="ess-notice ess-notice--danger">
					<span class="ess-notice__icon"><TriangleAlert size={15} /></span>
					<div class="ess-notice__body"><strong>Urgent notice</strong>Tap "Got it" once you have read it.</div>
					<button type="button" class="ess-btn ess-btn--primary" disabled={busyId === openPost.id} onclick={() => act(openPost!.id, 'dismiss')}>Got it</button>
				</div>
			{:else if openAsk}
				<div class="ess-notice">
					<span class="ess-notice__icon"><span class="bang">!</span></span>
					<div class="ess-notice__body"><strong>Acknowledgement required</strong>Please confirm that you have read and understood this announcement.</div>
					<button type="button" class="ess-btn ess-btn--primary" disabled={busyId === openPost.id} onclick={() => act(openPost!.id, 'ack')}>Acknowledge</button>
				</div>
			{/if}
		{:else}
			<div class="ess-empty">
				<span class="ess-empty__icon"><Megaphone size={22} /></span>
				<span class="ess-empty__title">Stay in the know</span>
				<span>Pick an announcement to read it in full.</span>
			</div>
		{/if}
	</aside>
</div>

<style>
	.feed {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		gap: 20px;
		align-items: start;
	}
	.list {
		display: grid;
		gap: 16px;
		min-width: 0;
	}
	.sec {
		padding: 18px 20px 16px;
	}
	.sec .ess-card-head {
		margin-bottom: 10px;
	}
	.cnt {
		margin-left: 6px;
		font-family: var(--ess-font-sans);
		font-size: 12px;
		font-weight: 600;
		padding: 1px 8px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
		vertical-align: middle;
	}
	.needs {
		display: grid;
		gap: 8px;
	}
	.group-label {
		margin: 14px 0 6px;
		font-size: var(--ess-fs-eyebrow);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.ess-card-head + .group-label {
		margin-top: 0;
	}
	.rows {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		overflow: hidden;
	}
	.all-clear {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--ess-radius-md);
		background: var(--ess-success-bg);
		color: var(--ess-success);
		font-weight: 500;
		font-size: 13px;
	}
	.empty {
		margin: 0;
		font-size: var(--ess-fs-caption);
		color: var(--ess-text-muted);
	}
	.earlier {
		margin-top: 8px;
	}

	/* ---------- reader ---------- */
	.reader {
		position: sticky;
		top: 16px;
		display: grid;
		gap: 18px;
		padding: 20px 22px 22px;
		min-height: 320px;
	}
	.r-head {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}
	.r-title {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.r-title .ess-h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		font-size: 24px;
	}
	.r-title .ess-badge {
		font-family: var(--ess-font-sans);
	}
	.r-meta {
		font-size: 13.5px;
		color: var(--ess-text-secondary);
	}
	.r-body {
		padding-top: 4px;
	}
	.bang {
		font-weight: 700;
		font-size: 14px;
	}
	.ess-notice .ess-btn {
		flex: none;
	}
	@media (max-width: 1000px) {
		.feed {
			grid-template-columns: minmax(0, 1fr);
		}
		.reader {
			position: static;
			order: -1;
			min-height: 0;
		}
		.feed:not(.reading) .reader {
			display: none;
		}
	}
	@media (max-width: 560px) {
		.ess-notice {
			flex-wrap: wrap;
		}
	}
</style>
