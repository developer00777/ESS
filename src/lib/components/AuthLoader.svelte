<script lang="ts">
	/**
	 * Loading on the signed-out pages, drawn as an ID badge being scanned.
	 * - `intro`: covers the page while it opens, the scan runs once, the
	 *   progress line fills and the cover lifts away. CSS only, so it ends on
	 *   its own even before the page's script runs.
	 * - `busy`: the scan line keeps sweeping while work is in progress
	 *   (logging in). Covers its nearest positioned ancestor.
	 */
	interface Props {
		variant?: 'intro' | 'busy';
		message?: string;
	}

	let { variant = 'busy', message = 'Loading…' }: Props = $props();
</script>

<div class="loader loader--{variant}" role="status" aria-live="polite">
	<div class="stage">
		<div class="badge" aria-hidden="true">
			<span class="clip"></span>
			<span class="mark">
				<svg viewBox="0 0 40 40" width="22" height="22">
					<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
					<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				</svg>
			</span>
			<span class="line line--a"></span>
			<span class="line line--b"></span>
			<span class="code">
				{#each Array.from({ length: 14 }, (_, k) => k) as k (k)}<i style="width: {k % 3 ? 2 : 3}px"></i>{/each}
			</span>
			<span class="scan"></span>
		</div>
		{#if variant === 'intro'}<strong class="name">Champ HR</strong>{/if}
		<p>{message}</p>
		<div class="track"><span></span></div>
	</div>
</div>

<style>
	.loader {
		--ld-surface: var(--lg-panel, #fff);
		--ld-ink: var(--lg-ink, #1b2330);
		--ld-muted: var(--lg-muted, #555e6b);
		--ld-line: var(--lg-border, rgba(27, 35, 48, 0.12));
		--ld-accent: var(--lg-btn, #1f4fd1);
		position: absolute;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--ld-surface) 90%, transparent);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: var(--ld-ink);
		animation: fade-in 200ms ease both;
	}
	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		width: min(220px, 80%);
	}

	/* the badge */
	.badge {
		position: relative;
		width: 96px;
		height: 124px;
		margin-bottom: 8px;
		border-radius: 10px;
		border: 1px solid var(--ld-line);
		background: var(--ld-surface);
		box-shadow: 0 10px 24px -14px rgba(15, 23, 42, 0.45);
		overflow: hidden;
	}
	.clip {
		position: absolute;
		top: 8px;
		left: 50%;
		width: 26px;
		height: 5px;
		margin-left: -13px;
		border-radius: 3px;
		background: var(--ld-line);
	}
	.mark {
		position: absolute;
		top: 24px;
		left: 50%;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		margin-left: -19px;
		border-radius: 50%;
		color: #fff;
		background: var(--ld-accent);
	}
	.line {
		position: absolute;
		left: 50%;
		height: 5px;
		border-radius: 3px;
		background: var(--ld-ink);
		opacity: 0.18;
	}
	.line--a {
		top: 72px;
		width: 56px;
		margin-left: -28px;
	}
	.line--b {
		top: 82px;
		width: 36px;
		margin-left: -18px;
	}
	.code {
		position: absolute;
		left: 18px;
		right: 18px;
		bottom: 12px;
		height: 12px;
		display: flex;
		justify-content: space-between;
	}
	.code i {
		display: block;
		height: 100%;
		background: var(--ld-ink);
		opacity: 0.55;
	}
	.scan {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 2px;
		background: var(--ld-accent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--ld-accent) 25%, transparent);
	}

	.name {
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--ld-muted);
	}
	.track {
		width: 100%;
		height: 3px;
		margin-top: 4px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--ld-line);
	}
	.track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--ld-accent);
	}

	/* busy: the scan sweeps, the line slides */
	.loader--busy .scan {
		animation: scan 1.3s ease-in-out infinite alternate;
	}
	.loader--busy .track span {
		width: 40%;
		animation: slide 1.3s ease-in-out infinite;
	}

	/* intro: one scan, the line fills, the cover lifts away */
	.loader--intro {
		z-index: 60;
		background: var(--lg-canvas, #e9e7e1);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		animation: lift 450ms cubic-bezier(0.7, 0, 0.3, 1) 1050ms forwards;
	}
	.loader--intro .badge {
		animation: badge-in 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.loader--intro .scan {
		animation: scan 700ms ease-in-out 250ms both;
	}
	.loader--intro .mark {
		animation: ok 300ms ease 900ms both;
	}
	.loader--intro .track span {
		width: 100%;
		transform-origin: left;
		animation: fill 900ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both;
	}
	.loader--intro .stage {
		animation: fade-out 400ms ease 1000ms forwards;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes scan {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(122px);
		}
	}
	@keyframes slide {
		0% {
			transform: translateX(-110%);
		}
		100% {
			transform: translateX(260%);
		}
	}
	@keyframes badge-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@keyframes ok {
		to {
			background: #0f8a68;
		}
	}
	@keyframes fill {
		from {
			transform: scaleX(0);
		}
	}
	@keyframes fade-out {
		to {
			opacity: 0;
			transform: translateY(-12px);
		}
	}
	@keyframes lift {
		to {
			clip-path: inset(0 0 100% 0);
			visibility: hidden;
		}
	}

	/* Atur: the loader wears the login headline's warm gradient (the pink →
	   orange → amber of "simplified."), not the black button colour. */
	:global([data-ess-skin='atur']) .loader {
		--ld-accent: #f2857f;
	}
	:global([data-ess-skin='atur']) .mark,
	:global([data-ess-skin='atur']) .track span {
		background: var(--atur-accent-grad);
	}
	:global([data-ess-skin='atur']) .scan {
		height: 3px;
		background: var(--atur-accent-grad);
		box-shadow: 0 0 12px 1px rgba(255, 140, 100, 0.45);
	}
	:global([data-ess-skin='atur']) .track {
		background: color-mix(in srgb, #ff9c72 18%, transparent);
	}

	/* The intro is a full-screen cover: skipped under reduced motion. The busy
	   loader is small, contained motion and keeps playing. */
	@media (prefers-reduced-motion: reduce) {
		.loader--intro {
			display: none;
		}
	}
</style>
