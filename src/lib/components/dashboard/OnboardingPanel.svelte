<script lang="ts">
	/**
	 * New joiners from the last 90 days among the people the viewer looks
	 * after, with how far their portal setup has got. Each step is read from
	 * the account itself (password chosen, photo, reporting line, shift
	 * calendar, employee code). Someone with nobody to look after sees their
	 * own setup instead.
	 */
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
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
	<header class="p-head">
		<div>
			<h2 id="onboarding-h">{mode === 'self' ? 'Your setup' : 'Onboarding'}</h2>
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
		<p class="quiet">No one has joined in the last 90 days.</p>
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
							{#each p.steps as s (s.label)}
								<li class:done={s.done}><span class="tick" aria-hidden="true"></span>{s.label}<span class="ess-sr-only">{s.done ? ', done' : ', not done'}</span></li>
							{/each}
						</ul>
					{/if}
					<div class="progress">
						<span class="segs" aria-hidden="true">
							{#each p.steps as s, i (i)}<span class:on={s.done}></span>{/each}
						</span>
						<span class="count"><b>{done}</b>/{p.steps.length}<span class="ess-sr-only"> setup steps done</span></span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
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
		margin: 0;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
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
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		border-radius: 50%;
		border: 1.5px solid var(--ess-border-strong);
	}
	.steps li.done .tick {
		border-color: var(--ess-primary);
		background: var(--ess-primary);
		box-shadow: inset 0 0 0 2px var(--ess-sunken);
	}
	.steps li.done {
		color: var(--ess-text-muted);
	}
	.quiet {
		margin: 0;
		color: var(--ess-text-muted);
		font-size: 13px;
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
