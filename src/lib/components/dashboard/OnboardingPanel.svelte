<script lang="ts">
	/**
	 * New joiners from the last 90 days among the people the viewer looks
	 * after, with how far their portal setup has got. Each step is read from
	 * the account itself (password chosen, photo, reporting line, shift
	 * calendar, employee code). Someone with nobody to look after sees their
	 * own setup instead.
	 */
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import Check from '@lucide/svelte/icons/check';
	import Avatar from '$lib/components/Avatar.svelte';

	type Person = {
		id: string;
		fullName: string;
		designation: string | null;
		hasPicture: boolean;
		joined: string | null;
		steps: { label: string; done: boolean }[];
	};

	let { people, mode }: { people: Person[]; mode: 'joiners' | 'self' } = $props();

	const shown = $derived(people.slice(0, 4));
	const href = $derived(mode === 'self' ? '/profile' : '/team');

	function joinedLabel(iso: string | null) {
		if (!iso) return 'Joining date not set';
		return `Joined ${new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
	}
</script>

<section class="ess-card panel" aria-labelledby="onboarding-h">
	<div class="fit">
	<header class="p-head">
		<div>
			<h2 id="onboarding-h">
				{#if mode === 'self'}<ListChecks size={15} aria-hidden="true" />{:else}<UserPlus size={15} aria-hidden="true" />{/if}{mode === 'self' ? 'Your setup' : 'Onboarding'}
			</h2>
			<p>
				{#if mode === 'self'}
					What's set up on your account
				{:else}
					{people.length} joined in the last 90 days
				{/if}
			</p>
		</div>
		<a class="more" {href} aria-label={mode === 'self' ? 'My profile' : 'Team'}><ArrowUpRight size={16} /></a>
	</header>

	{#if shown.length === 0}
		<p class="quiet"><UserCheck size={15} aria-hidden="true" />No one has joined in the last 90 days.</p>
	{:else}
		<ul class="cards" class:solo={mode === 'self'}>
			{#each shown as p (p.id)}
				{@const done = p.steps.filter((s) => s.done).length}
				{@const todo = p.steps.filter((s) => !s.done).map((s) => s.label)}
				<li class="card" title={todo.length ? `Still to do: ${todo.join(', ')}` : 'Setup complete'}>
					<div class="who">
						<Avatar userId={p.id} fullName={p.fullName} hasPicture={p.hasPicture} size="md" />
						<span class="who-text">
							<span class="name">{p.fullName}</span>
							<span class="role">{p.designation ?? joinedLabel(p.joined)}</span>
						</span>
					</div>
					{#if mode === 'self'}
						<ul class="steps">
							{#each p.steps as s, i (s.label)}
								<li class:done={s.done} style="--i: {i}"><span class="tick" aria-hidden="true">{#if s.done}<Check size={9} strokeWidth={3.5} />{/if}</span>{s.label}<span class="ess-sr-only">{s.done ? ', done' : ', not done'}</span></li>
							{/each}
						</ul>
					{/if}
					<div class="progress">
						<span class="segs" aria-hidden="true">
							{#each p.steps as s, i (i)}<span class:on={s.done} style="--i: {i}"></span>{/each}
						</span>
						<span class="count"><b>{done}</b>/{p.steps.length}<span class="ess-sr-only"> setup steps done</span></span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	</div>
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		overflow: hidden;
		padding: 16px 18px;
	}
	.p-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.p-head h2 {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.p-head h2 :global(svg) {
		flex: none;
		color: var(--ess-primary-text);
	}
	.p-head p {
		margin: 1px 0 0;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.more {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
	}
	.more:hover {
		color: var(--ess-text);
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: 1fr;
		gap: 8px;
		min-height: 0;
	}
	.cards.solo {
		grid-template-columns: 1fr;
	}
	.card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 14px;
		background: var(--ess-sunken);
		min-width: 0;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
	}
	.who-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.25;
	}
	.name {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.role {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.segs {
		flex: 1;
		display: flex;
		gap: 3px;
	}
	.segs span {
		flex: 1;
		height: 5px;
		border-radius: 999px;
		background: var(--ess-border);
	}
	.segs span.on {
		background: var(--ess-primary);
	}
	.count {
		font-size: 11.5px;
		color: var(--ess-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.count b {
		color: var(--ess-text);
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px 10px;
		font-size: 12px;
		color: var(--ess-text-secondary);
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.tick {
		display: grid;
		place-items: center;
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		border-radius: 50%;
		border: 1.5px solid var(--ess-border-strong);
	}
	.steps li.done .tick {
		border-color: var(--ess-primary);
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
	}
	.steps li.done {
		color: var(--ess-text-muted);
	}
	.quiet {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		color: var(--ess-text-muted);
		font-size: 13px;
	}

	/* ---------- motion ----------
	   Each card rises and the progress segments fill left to right.
	   !important lengths: contained motion that plays under reduced motion
	   too (see INTERACTION FEEDBACK in ess-components.css). */
	@keyframes ob-rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@keyframes ob-fill {
		from {
			transform: scaleX(0);
		}
	}
	.card {
		animation: ob-rise 460ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		animation-duration: 460ms !important;
		animation-delay: 320ms;
	}
	/* The steps themselves don't animate: their fit-to-height rules (the
	   setup container) re-style them, and Chrome restarted their entrance
	   each time, so they flickered on a loop. */
	.segs span.on {
		transform-origin: left center;
		animation: ob-fill 520ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		animation-duration: 520ms !important;
		animation-delay: calc(560ms + var(--i, 0) * 90ms);
	}

	/* Laptop dashboard: the panel is as tall as its row, so its contents
	   size to the room inside it (like My attendance) and it never scrolls:
	   a short panel takes the steps to one tight column (your own name, on
	   your own setup, gives way), a very short one keeps just the progress
	   (what's left is in the tooltip). */
	.fit {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}
	/* The measuring box is this inner wrapper, clipping its own contents,
	   never the panel: the panel may scroll (the dashboard lets panels
	   scroll as a last resort), and a scrolling size container re-styles
	   itself each time an entrance animation nudges its content, which
	   restarted the steps' animation in a loop (the flicker). */
	@media (min-width: 1101px) and (min-height: 480px) {
		/* only in the fit-to-screen layout (ess-fill), where the row gives
		   it a height; with large text the page flows and it sizes itself */
		@container ess-fill (min-width: 0px) {
			.fit {
				container: setup / size;
				overflow: hidden;
			}
		}
	}
	@container setup (max-height: 300px) {
		.p-head p,
		.cards.solo .who {
			display: none;
		}
		.card {
			padding: 8px 10px;
			gap: 6px;
		}
		.steps {
			grid-template-columns: minmax(0, 1fr);
			gap: 2px;
			font-size: 11.5px;
		}
		.steps li {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
	@container setup (max-height: 190px) {
		.steps {
			display: none;
		}
	}

	/* Short laptop screens (about 1280×580): tighter so the dashboard fits. */
	@media (min-width: 721px) and (max-height: 760px) {
		.panel {
			padding: 10px 14px;
			gap: 8px;
		}
		.p-head p {
			display: none;
		}
		.card {
			padding: 8px 10px;
		}
		.steps {
			grid-template-columns: minmax(0, 1fr);
			gap: 3px;
			font-size: 11.5px;
		}
		.steps li {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.more {
			width: 26px;
			height: 26px;
		}
	}
</style>
