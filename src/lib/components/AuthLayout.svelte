<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The signed-out frame: the CH mark top left, a wide editorial headline and
	 * the "People. Progress. Possibility." timeline motif on the left, and a
	 * focused card on the right. Used by sign-in; the password page uses the
	 * centred variant (`centered`).
	 */
	interface Props {
		headline: string;
		subtext: string;
		cardTitle: string;
		cardSub: string;
		/** One column, card in the middle — for the password page. */
		centered?: boolean;
		/** A link shown top-right beside the brand ("Back"). */
		back?: { href: string; label: string };
		children: Snippet;
		/** Rendered beside the card on the centred layout (a small timeline). */
		aside?: Snippet;
	}

	let { headline, subtext, cardTitle, cardSub, centered = false, back, children, aside }: Props = $props();
</script>

<div class="screen" class:centered>
	<header class="brand-row">
		<a href="/login" class="brand" aria-label="Champ HR">
			<span class="brand-mark" aria-hidden="true">
				<svg viewBox="0 0 40 40" width="34" height="34">
					<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
					<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				</svg>
			</span>
			<span>Champ HR</span>
		</a>
		{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
	</header>

	{#if centered}
		<div class="center-wrap">
			<div class="center-text">
				<h1>{headline}</h1>
				<p>{subtext}</p>
			</div>
			<div class="center-grid" class:with-aside={!!aside}>
				<div class="card">
					<h2>{cardTitle}</h2>
					<p class="sub">{cardSub}</p>
					{@render children()}
				</div>
				{#if aside}
					<div class="aside">{@render aside()}</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="split">
			<div class="hero">
				<h1>{headline}</h1>
				<p>{subtext}</p>
				<!-- Three fine dots and lines: People → Progress → Possibility. -->
				<svg class="motif" viewBox="0 0 640 260" aria-hidden="true">
					<path d="M0 240 C 60 240, 90 220, 110 190 C 125 165, 128 150, 128 130 L 128 120" fill="none" stroke="var(--ess-primary-soft)" stroke-width="2" />
					<path d="M128 190 L 360 190 C 380 190, 390 180, 390 160 L 390 110" fill="none" stroke="var(--ess-primary-soft)" stroke-width="2" />
					<path d="M390 190 L 560 190 C 600 190, 610 170, 610 140 L 610 60" fill="none" stroke="var(--ess-primary-soft)" stroke-width="2" />
					<circle cx="128" cy="118" r="11" fill="var(--ess-primary-soft)" stroke="var(--ess-surface)" stroke-width="3" />
					<circle cx="390" cy="104" r="11" fill="var(--ess-primary)" />
					<circle cx="610" cy="54" r="11" fill="var(--ess-primary-soft)" stroke="var(--ess-surface)" stroke-width="3" />
					<text x="112" y="92" font-size="15" fill="var(--ess-text-secondary)">People</text>
					<text x="362" y="78" font-size="15" fill="var(--ess-text-secondary)">Progress</text>
					<text x="570" y="28" font-size="15" fill="var(--ess-text-secondary)">Possibility</text>
				</svg>
			</div>
			<div class="card-col">
				<div class="card">
					<h2>{cardTitle}</h2>
					<p class="sub">{cardSub}</p>
					{@render children()}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.screen {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--ess-canvas);
		position: relative;
		overflow: hidden;
	}
	/* A pale lavender arc low on the page, as in the sign-in mockup. */
	.screen::before {
		content: '';
		position: absolute;
		left: 18%;
		bottom: -36vw;
		width: 48vw;
		height: 48vw;
		border-radius: 50%;
		background: var(--ess-primary-softer);
		pointer-events: none;
	}
	.screen::after {
		content: '';
		position: absolute;
		left: 34%;
		bottom: -40vw;
		width: 44vw;
		height: 44vw;
		border-radius: 50%;
		background: var(--ess-primary-soft);
		opacity: 0.6;
		pointer-events: none;
	}

	.brand-row {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 36px clamp(24px, 7vw, 112px) 0;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--ess-text);
		font-size: 24px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		color: var(--ess-primary);
	}
	.back {
		font-size: 14px;
		color: var(--ess-text-secondary);
	}
	.back:hover {
		color: var(--ess-text);
	}

	.split {
		position: relative;
		z-index: 1;
		flex: 1;
		display: grid;
		grid-template-columns: 1.05fr 0.95fr;
		align-items: center;
		gap: 48px;
		padding: 24px clamp(24px, 7vw, 112px) 64px;
	}

	.hero h1,
	.center-text h1 {
		font-family: var(--ess-font-display);
		font-size: clamp(44px, 6.4vw, 84px);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
		color: var(--ess-text);
		text-wrap: balance;
		max-width: 11ch;
	}
	.hero p,
	.center-text p {
		margin-top: 18px;
		font-size: 22px;
		color: var(--ess-text-secondary);
	}
	.motif {
		width: min(640px, 100%);
		margin-top: 36px;
		display: block;
	}

	.card-col {
		display: flex;
		justify-content: flex-end;
	}
	.card {
		width: min(560px, 100%);
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: 16px;
		padding: clamp(28px, 4vw, 56px);
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: var(--ess-elev-2);
	}
	.card h2 {
		font-family: var(--ess-font-display);
		font-size: 44px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.01em;
		color: var(--ess-text);
	}
	.sub {
		font-size: 17px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
		margin-top: -4px;
	}

	:global(.card label) {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 15px;
		font-weight: 500;
		color: var(--ess-text);
	}
	:global(.card .field) {
		position: relative;
		display: flex;
		align-items: center;
	}
	:global(.card .field > svg:first-child) {
		position: absolute;
		left: 16px;
		color: var(--ess-text-muted);
		pointer-events: none;
	}
	:global(.card .field input) {
		width: 100%;
		border: 1px solid var(--ess-border);
		border-radius: 10px;
		padding: 15px 48px 15px 50px;
		font-size: 16px;
		font-family: inherit;
		color: var(--ess-text);
		background: var(--ess-field-bg);
		transition:
			border-color var(--ess-t-fast),
			box-shadow var(--ess-t-fast);
	}
	:global(.card .field input:focus) {
		outline: none;
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	:global(.card .field .eye) {
		position: absolute;
		right: 10px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--ess-text-muted);
		cursor: pointer;
	}
	:global(.card .field .eye:hover) {
		color: var(--ess-text);
		background: var(--ess-surface-hover);
	}
	:global(.card .error) {
		color: var(--ess-danger);
		font-size: 14px;
		margin: 0;
	}
	:global(.card .submit-btn) {
		justify-content: center;
		height: 52px;
		font-size: 17px;
		margin-top: 4px;
	}
	:global(.card .help) {
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	:global(.card .note) {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 18px 20px;
		border-radius: 12px;
		background: var(--ess-primary-softer);
		margin-top: 6px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
	}
	:global(.card .note strong) {
		display: block;
		color: var(--ess-text);
		font-weight: 600;
	}
	:global(.card .note .i) {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	/* ---------- centred (password) ---------- */
	.center-wrap {
		position: relative;
		z-index: 1;
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 36px;
		padding: 24px clamp(24px, 7vw, 112px) 64px;
	}
	.center-text {
		text-align: center;
	}
	.center-text h1 {
		max-width: none;
		font-size: clamp(40px, 5vw, 64px);
	}
	.center-text p {
		font-size: 18px;
		margin-top: 12px;
	}
	.center-grid {
		display: grid;
		gap: 28px;
		width: min(560px, 100%);
	}
	.center-grid.with-aside {
		grid-template-columns: minmax(0, 1fr) 240px;
		width: min(860px, 100%);
		align-items: start;
	}
	.center-grid .card {
		width: 100%;
	}
	.center-grid .card h2 {
		font-size: 34px;
	}
	.aside {
		padding-top: 12px;
	}

	@media (max-width: 960px) {
		.split {
			grid-template-columns: 1fr;
			gap: 36px;
			align-items: start;
		}
		.card-col {
			justify-content: stretch;
		}
		.card {
			width: 100%;
		}
		.motif {
			display: none;
		}
		.center-grid.with-aside {
			grid-template-columns: 1fr;
		}
	}
</style>
