<script lang="ts">
		import CircleCheck from '@lucide/svelte/icons/circle-check';
	import NeedsYouCard from '$lib/components/announcements/NeedsYouCard.svelte';
	import PostRow from '$lib/components/announcements/PostRow.svelte';
	import { weekGroup, type ComingUpItem, type Feed } from '$lib/announcements';

	/**
	 * The #announcements channel in Champ Chat: what needs you, what is coming
	 * up by date, and updates. `onchanged` re-reads the feed after an action.
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
					? 'Your confirmation was not saved. Check your connection and press "I\'ve read this" again.'
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
</script>

{#if errorMsg}
	<p class="ess-error" role="alert">{errorMsg}</p>
{/if}

<div class="feed">
	<section aria-labelledby="needs-h">
		<div class="sec-h">
			<h2 id="needs-h">Needs you</h2>
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
						open={openId === p.id}
						busy={busyId === p.id}
						ontoggle={() => toggle(p)}
						ondismiss={() => act(p.id, 'dismiss')}
						onconfirm={() => act(p.id, 'ack')}
					/>
				{/each}
			</div>
		{/if}
	</section>

	<section aria-labelledby="coming-h">
		<div class="sec-h"><h2 id="coming-h">Coming up</h2></div>
		{#if groups.length === 0}
			<p class="empty">Nothing planned in the next two months.</p>
		{:else}
			{#each groups as g (g.label)}
				<h3 class="group-label">{g.label}</h3>
				<div class="rows">
					{#each g.items as item (item.id)}
						<PostRow {item} {now} variant="event" open={openId === item.id} ontoggle={() => toggle(item)} />
					{/each}
				</div>
			{/each}
		{/if}
	</section>

	<section aria-labelledby="updates-h">
		<div class="sec-h">
			<h2 id="updates-h">Updates</h2>
			{#if unreadUpdates.length}<span class="cnt">{unreadUpdates.length} new</span>{/if}
			<span class="spacer"></span>
			{#if unreadUpdates.length}
				<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={markAllRead}>Mark all read</button>
			{/if}
		</div>
		{#if updates.length === 0}
			<p class="empty">No updates this week.</p>
		{:else}
			<div class="rows">
				{#each updates as item (item.id)}
					<PostRow {item} {now} variant="update" open={openId === item.id} ontoggle={() => toggle(item)} />
				{/each}
			</div>
		{/if}

		{#if feed.earlier.length}
			{#if showEarlier}
				<h3 class="group-label">Earlier</h3>
				<div class="rows">
					{#each feed.earlier as item (item.id)}
						<PostRow {item} {now} variant="update" muted open={openId === item.id} ontoggle={() => toggle(item)} />
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

<style>
	.feed {
		display: grid;
		gap: 28px;
		max-width: 760px;
	}
	.sec-h {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
		min-height: 28px;
	}
	.sec-h h2 {
		margin: 0;
		font-family: var(--ess-font-display);
		font-size: 15px;
		font-weight: 600;
	}
	.cnt {
		font-size: var(--ess-fs-caption);
		font-weight: 700;
		color: var(--ess-text-muted);
	}
	.spacer {
		flex: 1;
	}
	.needs {
		display: grid;
		gap: 8px;
	}
	.group-label {
		margin: 14px 0 6px;
		font-size: var(--ess-fs-eyebrow);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ess-text-muted);
	}
	.sec-h + .group-label {
		margin-top: 0;
	}
	.rows {
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-glass-raised-bg);
		overflow: hidden;
	}
	.all-clear {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--ess-radius-sm);
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
</style>
