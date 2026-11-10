<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Clock from '@lucide/svelte/icons/clock';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Wallet from '@lucide/svelte/icons/wallet';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import TunnelLoader from './TunnelLoader.svelte';
	import HeroBanner from './HeroBanner.svelte';
	import DotGridField from './DotGridField.svelte';

	/**
	 * The signed-out frame. The login page uses the split layout: a hero
	 * banner on the left (HeroBanner) and the form panel on the right, both
	 * fitted to the screen so the page never scrolls.
	 * It opens with the corridor intro (TunnelLoader), and the entrance
	 * animations wait for it (--enter). While logging in, the corridor
	 * covers the screen again until the dashboard takes over with its own
	 * welcome run ((app)/+layout). The password page uses the centred variant
	 * (`centered`). Both follow the light/dark theme (essTheme).
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
		/** While set, the screen shows the corridor loader with this message. */
		busy?: string;
	}

	let { headline, subtext, cardTitle, cardSub, centered = false, back, children, aside, busy }: Props = $props();

	// The intro covers the page for its first ~1.75s, then is removed.
	let intro = $state(true);
	$effect(() => {
		// Signed out: the next login opens the app with its welcome intro.
		// The mark on <html> goes too: logging in moves to the dashboard
		// without a reload, so app.html does not run again to clear it.
		document.documentElement.removeAttribute('data-ess-intro-seen');
		try {
			sessionStorage.removeItem('essIntroSeen');
		} catch {
			/* private mode */
		}
		const timer = setTimeout(() => (intro = false), 1800);
		return () => clearTimeout(timer);
	});

	// The background icons, scattered over a 1600×1000 field: each gets a
	// spot at least SKIN_GAP from the others, a tilt, a size, an icon kind
	// and a timing offset. Seeded, so the server and the browser draw the
	// same layout.
	const SKIN_GAP = 110;
	const skin = (() => {
		let seed = 11;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		const out: { x: number; y: number; r: number; s: number; kind: number; d: number }[] = [];
		for (let tries = 0; tries < 4000 && out.length < 90; tries++) {
			const x = rand() * 1600;
			const y = rand() * 1000;
			if (out.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > SKIN_GAP ** 2)) {
				out.push({ x, y, r: (rand() - 0.5) * 36, s: 1.1 + rand() * 0.5, kind: Math.floor(rand() * 7), d: rand() });
			}
		}
		return out;
	})();

	let date = $state('');
	$effect(() => {
		date = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
	});

	let theme = $state<'light' | 'dark'>('light');

	$effect(() => {
		theme = document.documentElement.getAttribute('data-ess-theme') === 'dark' ? 'dark' : 'light';
	});

	function toggleTheme() {
		const next = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		if (next === 'dark') document.documentElement.setAttribute('data-ess-theme', 'dark');
		else document.documentElement.removeAttribute('data-ess-theme');
		try {
			localStorage.setItem('essTheme', next);
		} catch {
			/* not remembered in private mode */
		}
	}
</script>

{#snippet brand()}
	<a href="/login" class="brand" aria-label="Champ HR">
		<span class="brand-mark" aria-hidden="true">
			<svg viewBox="0 0 40 40" width="22" height="22">
				<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
			</svg>
		</span>
		<span class="brand-text">
			<strong>Champ HR</strong>
			<small>Employee Self-Service</small>
		</span>
	</a>
{/snippet}

{#snippet themeToggle()}
	<button
		type="button"
		class="theme-toggle"
		onclick={toggleTheme}
		aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
	>
		{#key theme}
			<span class="theme-icon">
				{#if theme === 'dark'}<Sun size={17} />{:else}<Moon size={17} />{/if}
			</span>
		{/key}
	</button>
{/snippet}

<div class="screen" class:centered class:fit={!centered}>
	{#if centered}
		<header class="brand-row">
			{@render brand()}
			<div class="row-end">
				{#if back}<a class="back" href={back.href}>← {back.label}</a>{/if}
				{@render themeToggle()}
			</div>
		</header>
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
		{#if intro}<TunnelLoader variant="intro" message="Preparing your workspace…" />{/if}
		{#if busy}<div class="login-busy"><TunnelLoader message={busy} showName /></div>{/if}

		<!-- The page's skin: HR line icons scattered over the screen (see
		     `skin`). Each icon fades in at its own moment, then dims and
		     brightens on its own cycle; the approval tick redraws and the
		     clock's hand turns (SMIL inside the shared drawings, so every copy
		     follows). -->
		<div class="skin" aria-hidden="true">
			<svg class="skin-tiles" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
				<defs>
					<g id="hr-0">
						<circle cx="12" cy="8" r="4" />
						<path d="M5 20a7 7 0 0 1 14 0" />
					</g>
					<g id="hr-1">
						<rect x="3" y="5" width="18" height="16" rx="2" />
						<path d="M3 10h18M8 3v4M16 3v4" />
					</g>
					<g id="hr-2">
						<circle cx="12" cy="12" r="9" />
						<path d="M8 12l3 3 5-6" pathLength="1" stroke-dasharray="1">
							<animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;0.18;1" dur="6s" begin="2.4s" repeatCount="indefinite" />
						</path>
					</g>
					<g id="hr-3">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 12l3 2" />
						<path d="M12 12V7">
							<animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="12s" repeatCount="indefinite" />
						</path>
					</g>
					<g id="hr-4">
						<rect x="3" y="7" width="18" height="13" rx="2" />
						<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
					</g>
					<g id="hr-5">
						<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6" />
					</g>
					<g id="hr-6">
						<rect x="4" y="3" width="16" height="18" rx="2" />
						<circle cx="12" cy="10" r="2.5" />
						<path d="M8.5 17a3.5 3.5 0 0 1 7 0" />
					</g>
				</defs>
				<g class="skin-icon">
					{#each skin as p, k (k)}
						<g
							class="skin-item"
							style="--d: {p.d.toFixed(3)}"
							transform="translate({p.x.toFixed(1)} {p.y.toFixed(1)}) rotate({p.r.toFixed(1)}) scale({p.s.toFixed(2)}) translate(-12 -12)"
						>
							<use href="#hr-{p.kind}" />
						</g>
					{/each}
				</g>
			</svg>
		</div>

		<div class="split">
			<section class="showcase">
				<HeroBanner />
				<!-- Mono and Amber show this instead of the city banner (CSS picks
				     by data-ess-skin, so there is no flash on load). -->
				<div class="dg-hero">
					<DotGridField dotGap={56} interactionRadius={130} />
					<div class="dg-copy">
						<p class="dg-kicker">Champ HR · Employee Self-Service</p>
						<h1 class="dg-title">Your workday,<br /><span class="dg-accent">simplified.</span></h1>
						<p class="dg-sub">Track attendance, request time off and view your payslips from a single portal.</p>
					</div>
				</div>
				<!-- Atur only: the reference's summary block, a heading over four
				     pastel cards, one per part of the portal. -->
				<div class="at-hero">
					<div class="at-head">
						<p class="at-kicker">Champ HR · Employee Self-Service</p>
						<h1 class="at-title">Your workday, <span class="at-accent">simplified.</span></h1>
						<p class="at-sub">Track attendance, request time off and view your payslips from a single portal.</p>
					</div>
					<ul class="at-cards">
						<li class="at-card">
							<span class="at-ic" aria-hidden="true"><Clock size={15} strokeWidth={2.2} /></span>
							<strong>Attendance</strong>
							<small>Check-ins, shifts and corrections</small>
						</li>
						<li class="at-card">
							<span class="at-ic" aria-hidden="true"><Calendar size={15} strokeWidth={2.2} /></span>
							<strong>Leave</strong>
							<small>Apply for time off and track it</small>
						</li>
						<li class="at-card">
							<span class="at-ic" aria-hidden="true"><Wallet size={15} strokeWidth={2.2} /></span>
							<strong>Payroll</strong>
							<small>Your payslip, every month</small>
						</li>
						<li class="at-card">
							<span class="at-ic" aria-hidden="true"><LayoutGrid size={15} strokeWidth={2.2} /></span>
							<strong>Champ Hub</strong>
							<small>Tasks, chats and meetings</small>
						</li>
					</ul>
				</div>
				<!-- Mono only: the shadcnspace "waitlist" layout — the brand, a
				     status pill, a large headline and a footer line on plain white
				     (the form sits in a card on a pastel mesh, right). -->
				<div class="mn-hero">
					<div class="mn-brand">{@render brand()}</div>
					<div class="mn-copy">
						<span class="mn-pill"><i aria-hidden="true"></i>Employee Self-Service is live</span>
						<h1 class="mn-title">Your workday,<br />simplified.</h1>
						<p class="mn-sub">Track attendance, request time off and view your payslips from a single portal. Built for the way your team works.</p>
					</div>
					<p class="mn-foot">© {new Date().getFullYear()} Champ HR <span aria-hidden="true">•</span> Employee Self-Service</p>
				</div>
				{#if date}<span class="date-pill">{date}</span>{/if}
			</section>

			<div class="card card--panel">
				<div class="panel-top">
					{@render brand()}
					{@render themeToggle()}
				</div>
				<div class="panel-body">
					<h2 class="panel-title">
						<span class="title-icon" aria-hidden="true"><LogIn size={30} strokeWidth={2.2} /></span>
						{cardTitle}
					</h2>
					<span class="title-rule" aria-hidden="true"></span>
					<p class="sub">{cardSub}</p>
					{@render children()}
				</div>
				<p class="panel-foot">© {new Date().getFullYear()} Champ HR. All rights reserved.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ---------- palette ----------
	   Warm neutrals with one blue, a yellow highlight on the headline. Text
	   pairs checked for contrast: ink/muted on the panels ≥ 4.5:1, white on
	   the button ≥ 4.5:1. */
	.screen {
		--lg-canvas: #ebeae6;
		--lg-sheet: #ffffff;
		--lg-panel: #ffffff;
		--lg-border: rgba(27, 35, 48, 0.12);
		--lg-shadow: 0 1px 2px rgba(27, 35, 48, 0.06), 0 12px 32px -20px rgba(27, 35, 48, 0.25);
		--lg-ink: #1b2330;
		--lg-muted: #555e6b;
		--lg-faint: #6b7381; /* was #7f8794: 3.6:1 on white, under AA */
		--lg-field: #ffffff;
		--lg-field-border: #cfd3da;
		--lg-blue-a: #1f4fd1;
		--lg-btn: #1f4fd1;
		--lg-btn-hover: #1a43b3;
		--lg-btn-ink: #ffffff;
		--lg-btn-shadow: 0 6px 16px -8px rgba(31, 79, 209, 0.6);
		--lg-ring: rgba(31, 79, 209, 0.2);
		--lg-soft: #f1f3f7;
		--lg-skin: rgba(31, 79, 209, 0.36);

		--lg-ease: cubic-bezier(0.22, 1, 0.36, 1);
		/* Entrance animations start after the intro. */
		--enter: 0ms;

		background: var(--lg-canvas);
		color: var(--lg-ink);
		transition:
			background-color 300ms ease,
			color 300ms ease;
	}
	:global([data-ess-theme='dark']) .screen {
		--lg-canvas: #070a10;
		--lg-sheet: #0f141b;
		--lg-panel: #0f141c;
		--lg-border: rgba(255, 255, 255, 0.09);
		--lg-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 16px 40px -24px rgba(0, 0, 0, 0.9);
		--lg-ink: #e6ebf2;
		--lg-muted: #a3adbb;
		--lg-faint: #7d8696;
		--lg-field: #0b0f16;
		--lg-field-border: rgba(255, 255, 255, 0.16);
		--lg-blue-a: #5b8cff;
		--lg-btn: #2f5fe0;
		--lg-btn-hover: #3a6cf0;
		--lg-ring: rgba(91, 140, 255, 0.28);
		--lg-soft: rgba(255, 255, 255, 0.05);
		--lg-skin: rgba(143, 179, 255, 0.3);
	}
	.screen {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: hidden;
		isolation: isolate;
	}

	/* The login screen is exactly one viewport: no page scroll. Only a screen
	   too small to hold the form scrolls, inside the frame. */
	.screen.fit {
		--enter: 1300ms;
		height: 100vh;
		height: 100dvh;
		overflow-x: hidden;
		overflow-y: auto;
	}
	:global(html:has(.screen.fit)),
	:global(body:has(.screen.fit)) {
		overflow: hidden;
		scrollbar-gutter: auto;
	}

	/* logging in: the corridor over the whole screen */
	.login-busy {
		position: absolute;
		inset: 0;
		z-index: 50;
	}

	/* ---------- brand ---------- */
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--lg-ink);
		text-decoration: none;
		width: fit-content;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		color: var(--lg-btn-ink);
		background: var(--lg-btn);
	}
	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.brand-text strong {
		font-size: 16.5px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.brand-text small {
		font-size: 13px;
		font-weight: 500;
		color: color-mix(in srgb, var(--lg-ink) 72%, var(--lg-panel));
	}
	/* on the login panel the brand sits on its own patch of page colour, so
	   the background icons never run into it */
	.panel-top .brand {
		padding: 4px 10px 4px 4px;
		margin-left: -4px;
		border-radius: 12px;
		background: var(--lg-panel);
		box-shadow: 0 0 16px 12px var(--lg-panel);
	}
	.panel-top .brand-mark {
		width: 38px;
		height: 38px;
		border-radius: 9px;
	}

	.theme-toggle {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 1px solid var(--lg-border);
		background: transparent;
		color: var(--lg-ink);
		cursor: pointer;
		overflow: hidden;
		transition: background-color 200ms ease;
	}
	.theme-toggle:hover {
		background: var(--lg-soft);
	}
	.theme-toggle:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--lg-ring);
	}
	.theme-icon {
		display: grid;
		place-items: center;
		animation: spin-in 450ms var(--lg-ease) both;
	}

	/* ---------- split (login) ---------- */
	/* One surface: the hero fills the left, the form sits on the page. */
	.screen.fit {
		background: var(--lg-panel);
	}
	/* The page's skin, behind the banner and the form alike: HR line icons
	   (person, calendar, approval, clock, briefcase, payslip, ID badge) tiled
	   over the screen. It is still, fades out at the top and bottom edges
	   (where the brand and copyright sit), and the form block carries a soft
	   halo of the page colour (.panel-body), so nothing shows behind the text
	   being read. The page itself stays pure white. */
	.skin {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(180deg, transparent 0, transparent 72px, #000 150px, #000 calc(100% - 70px), transparent 100%);
		mask-image: linear-gradient(180deg, transparent 0, transparent 72px, #000 150px, #000 calc(100% - 70px), transparent 100%);
	}
	.skin-tiles {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.skin-icon {
		fill: none;
		stroke: var(--lg-skin);
		/* icons are scaled 1.1–1.6x, so lines draw at about 1.5–2.2px */
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* Each icon fades in at its own moment, then breathes on its own cycle.
	   Lengths are !important: the app shortens every animation to 0.01ms
	   under reduced motion, and this quiet motion is meant to play there. */
	.skin-item {
		animation:
			skin-in 800ms ease calc(1s + var(--d) * 1.4s) both,
			skin-breathe 10s ease-in-out calc(3s + var(--d) * 10s) infinite;
		animation-duration: 800ms, 10s !important;
	}
	@keyframes skin-in {
		from {
			opacity: 0;
		}
	}
	@keyframes skin-breathe {
		50% {
			opacity: 0.35;
		}
	}
	.split {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
		padding: clamp(10px, 1.6vh, 16px);
	}

	.showcase {
		position: relative;
		min-height: 0;
		animation: slide-right 800ms var(--lg-ease) var(--enter) both;
	}
	/* the date as a frosted chip in the banner's top-left corner */
	.date-pill {
		position: absolute;
		z-index: 2;
		top: clamp(14px, 2.6vh, 24px);
		left: clamp(18px, 2.6vw, 30px);
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.24);
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #ffffff;
		font-size: 12.5px;
		font-weight: 500;
		animation: fade-in 600ms ease calc(var(--enter) + 500ms) both;
	}

	/* ---------- the form panel ---------- */
	.card {
		background: var(--lg-panel);
		border: 1px solid var(--lg-border);
		border-radius: 14px;
		padding: clamp(28px, 4vw, 56px);
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: var(--lg-shadow);
		animation: rise 700ms var(--lg-ease) 150ms both;
	}
	/* the form column: no box of its own, it sits on the page */
	.card--panel {
		position: relative;
		min-height: 0;
		overflow: hidden;
		isolation: isolate;
		padding: clamp(14px, 2.6vh, 26px) clamp(24px, 4vw, 56px) clamp(12px, 2.2vh, 20px);
		gap: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		animation: slide-left 800ms var(--lg-ease) calc(var(--enter) + 100ms) both;
	}
	.panel-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.panel-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		width: min(380px, 100%);
		margin: 0 auto;
		padding: clamp(12px, 3vh, 32px) 0;
		/* the halo that keeps the page pattern out from behind the form */
		align-self: center;
		flex: 0 1 auto;
		margin-block: auto;
		border-radius: 28px;
		background: var(--lg-panel);
		box-shadow: 0 0 56px 44px var(--lg-panel);
	}
	/* The form panel cascades in. Lengths are !important: the app shortens
	   every animation to 0.01ms under reduced motion (ess-components.css),
	   and these small, contained ones are meant to play there too. */
	.panel-body > * {
		animation: fade-up 650ms var(--lg-ease) both;
		animation-duration: 650ms !important;
	}
	.panel-body > :nth-child(1) {
		animation-delay: calc(var(--enter) + 300ms);
	}
	.panel-body > :nth-child(2) {
		animation-delay: calc(var(--enter) + 380ms);
	}
	.panel-body > :nth-child(3) {
		animation-delay: calc(var(--enter) + 450ms);
	}
	.panel-body > :nth-child(4) {
		animation-delay: calc(var(--enter) + 520ms);
	}
	.panel-body > :nth-child(5) {
		animation-delay: calc(var(--enter) + 600ms);
	}
	.panel-body > :nth-child(n + 6) {
		animation-delay: calc(var(--enter) + 760ms);
	}

	.card h2 {
		font-family: var(--ess-font-display);
		font-size: clamp(28px, 4.4vh, 34px);
		font-weight: 650;
		line-height: 1.1;
		letter-spacing: -0.025em;
		color: var(--lg-ink);
		margin: 0;
	}
	.sub {
		font-size: clamp(14px, 2vh, 15px);
		line-height: 1.55;
		color: var(--lg-muted);
		margin: -4px 0 clamp(6px, 1.4vh, 14px);
		max-width: 36ch;
	}
	/* the login column spaces each block itself instead of one even gap */
	/* the login heading: larger, in the brand blue, with the log-in icon */
	.panel-body .panel-title {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 10px;
		font-size: clamp(34px, 5.6vh, 44px);
		color: var(--lg-blue-a);
	}
	.title-icon {
		display: grid;
		place-items: center;
		width: 1em;
		height: 1em;
	}
	.title-icon :global(svg) {
		width: 0.8em;
		height: 0.8em;
	}
	.panel-body .sub {
		margin: 0 0 clamp(20px, 3.4vh, 30px);
	}
	.panel-foot {
		margin: 0;
		text-align: center;
		font-size: 12.5px;
		color: var(--lg-faint);
	}

	/* Soft entrances for the panel's frame: the header settles down from the
	   top, the log-in icon slides in towards the heading, and the footer
	   fades in last. Lengths are !important for the same reason as above. */
	.panel-top {
		animation: fade-down 700ms var(--lg-ease) calc(var(--enter) + 200ms) both;
		animation-duration: 700ms !important;
	}
	.title-icon {
		animation: door-in 800ms var(--lg-ease) calc(var(--enter) + 450ms) both;
		animation-duration: 800ms !important;
	}
	.panel-foot {
		animation: fade-in 900ms ease calc(var(--enter) + 1100ms) both;
		animation-duration: 900ms !important;
	}
	/* A short blue rule under the heading draws in from the left. */
	.panel-body .title-rule {
		display: block;
		width: 44px;
		height: 3px;
		margin: 2px 0 14px;
		border-radius: 2px;
		background: var(--lg-blue-a);
		transform-origin: left center;
		animation: rule-in 700ms var(--lg-ease) calc(var(--enter) + 650ms) both;
		animation-duration: 700ms !important;
	}

	/* Quiet, occasional motion once the page has settled: the log-in arrow
	   gives a small nudge every few seconds, a soft light sweeps over the
	   logo now and then, and the theme icon tilts on hover. */
	.title-icon :global(svg) {
		animation: arrow-nudge 6s ease-in-out calc(var(--enter) + 2.5s) infinite;
		animation-duration: 6s !important;
	}
	.panel-top .brand-mark {
		position: relative;
		overflow: hidden;
	}
	.panel-top .brand-mark::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.45) 50%, transparent 70%);
		transform: translateX(-130%);
		animation: mark-sheen 9s ease-in-out calc(var(--enter) + 3s) infinite;
		animation-duration: 9s !important;
	}
	/* on the drawing, not .theme-icon, whose own spin-in would hold transform */
	.theme-icon :global(svg) {
		transition: transform 300ms var(--lg-ease);
		transition-duration: 300ms !important;
	}
	.theme-toggle:hover .theme-icon :global(svg) {
		transform: rotate(18deg);
	}

	@keyframes rule-in {
		from {
			opacity: 0;
			transform: scaleX(0);
		}
	}
	@keyframes arrow-nudge {
		0%,
		80%,
		100% {
			transform: translateX(0);
		}
		87% {
			transform: translateX(3px);
		}
		93% {
			transform: translateX(-1px);
		}
	}
	@keyframes mark-sheen {
		0%,
		70% {
			transform: translateX(-130%);
		}
		85%,
		100% {
			transform: translateX(130%);
		}
	}
	@keyframes fade-down {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
	}
	@keyframes door-in {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
	}

	/* Form pieces rendered by the page (children). */
	.card :global(form) {
		gap: clamp(12px, 2vh, 18px);
	}
	.card :global(form > *) {
		animation: fade-up 600ms var(--lg-ease) both;
	}
	.card :global(form > :nth-child(1)) {
		animation-delay: calc(var(--enter) + 600ms);
	}
	.card :global(form > :nth-child(2)) {
		animation-delay: calc(var(--enter) + 680ms);
	}
	.card :global(form > :nth-child(n + 3)) {
		animation-delay: calc(var(--enter) + 760ms);
	}
	.card :global(label) {
		display: flex;
		flex-direction: column;
		gap: 7px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--lg-ink);
	}
	.card :global(.field) {
		position: relative;
		display: flex;
		align-items: center;
	}
	.card :global(.field:not(.field--rich) > svg:first-child) {
		position: absolute;
		left: 14px;
		color: var(--lg-faint);
		pointer-events: none;
		transition: color 200ms ease;
	}
	.card :global(.field:focus-within > svg:first-child) {
		color: var(--lg-blue-a);
	}
	.card :global(.field:not(.field--rich) input) {
		width: 100%;
		height: clamp(44px, 6.2vh, 48px);
		border: 1px solid var(--lg-field-border);
		border-radius: 8px;
		padding: 0 44px;
		font-size: 15px;
		font-family: inherit;
		color: var(--lg-ink);
		background: var(--lg-field);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease;
	}
	.card :global(.field input::placeholder) {
		color: var(--lg-faint);
	}
	.card :global(.field:not(.field--rich) input:hover) {
		border-color: color-mix(in srgb, var(--lg-ink) 35%, var(--lg-field-border));
	}
	.card :global(.field:not(.field--rich) input:focus) {
		outline: none;
		border-color: var(--lg-blue-a);
		box-shadow: 0 0 0 3px var(--lg-ring);
	}
	.card :global(.field:not(.field--rich) .eye) {
		position: absolute;
		right: 6px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--lg-faint);
		cursor: pointer;
	}
	.card :global(.field .eye:hover) {
		color: var(--lg-ink);
		background: var(--lg-soft);
	}
	.card :global(.error) {
		color: var(--ess-danger);
		font-size: 14px;
		font-weight: 500;
		margin: 0;
	}
	/* solid button: darkens and lifts slightly on hover, presses in on click */
	.card :global(.submit-btn) {
		justify-content: center;
		gap: 8px;
		height: clamp(46px, 6.2vh, 50px);
		border: none;
		border-radius: var(--lg-radius-btn, 10px);
		font-size: 15px;
		font-weight: 600;
		color: var(--lg-btn-ink);
		background: var(--lg-btn);
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
		margin-top: 8px;
		transition:
			background-color 180ms ease,
			box-shadow 180ms ease,
			transform 140ms ease;
		transition-duration: 180ms, 180ms, 140ms !important;
	}
	.card :global(.submit-btn:hover:not(:disabled)) {
		background: var(--lg-btn-hover);
		box-shadow: var(--lg-btn-shadow);
		transform: translateY(-1px);
	}
	.card :global(.submit-btn:active:not(:disabled)) {
		transform: translateY(0) scale(0.99);
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
	}
	.card :global(.submit-btn:focus-visible) {
		outline: none;
		box-shadow:
			0 0 0 2px var(--lg-panel),
			0 0 0 4px var(--lg-blue-a);
	}
	.card :global(.submit-btn:disabled) {
		opacity: 0.9;
		cursor: progress;
	}
	.card :global(.submit-btn svg) {
		transition: transform 250ms var(--lg-ease);
		transition-duration: 250ms !important;
	}
	.card :global(.submit-btn:hover:not(:disabled) svg) {
		transform: translateX(3px);
	}
	.card :global(.help) {
		font-size: 13px;
		color: var(--lg-muted);
	}
	/* the help line under the form, set off by a hairline rule */
	.card :global(.note) {
		margin: clamp(20px, 3.4vh, 28px) 0 0;
		padding-top: clamp(14px, 2.4vh, 20px);
		border-top: 1px solid var(--lg-border);
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--lg-muted);
	}
	.card :global(.note strong) {
		color: var(--lg-ink);
		font-weight: 600;
	}

	/* ---------- centred (password) ---------- */
	.brand-row {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 28px clamp(24px, 7vw, 112px) 0;
		animation: fade-up 600ms var(--lg-ease) both;
	}
	.row-end {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.back {
		font-size: 14px;
		color: var(--lg-muted);
	}
	.back:hover {
		color: var(--lg-ink);
	}
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
		animation: fade-up 700ms var(--lg-ease) 100ms both;
	}
	.center-text h1 {
		font-family: var(--ess-font-display);
		font-size: clamp(36px, 4.6vw, 56px);
		font-weight: 650;
		line-height: 1.05;
		letter-spacing: -0.03em;
		color: var(--lg-ink);
		text-wrap: balance;
	}
	.center-text p {
		font-size: 17px;
		margin-top: 12px;
		color: var(--lg-muted);
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
		font-size: 32px;
	}
	.aside {
		padding-top: 12px;
	}

	/* ---------- the dot-grid hero (Mono, Amber) ----------
	   Hidden in Original and Atur, which keep the city banner. */
	.dg-hero {
		display: none;
		position: absolute;
		inset: 0;
		overflow: hidden;
		isolation: isolate;
		border: 1px solid var(--lg-border);
		border-radius: var(--ess-radius-xl, 14px);
		background: var(--dg-bg, var(--lg-soft));
		color: var(--dg-ink, var(--lg-ink));
	}
	/* the dashes thin out behind the copy, so the text reads on a clear patch */
	.dg-hero :global(.dot-grid-field) {
		-webkit-mask-image: radial-gradient(ellipse 52% 40% at 50% 50%, transparent 35%, #000 80%);
		mask-image: radial-gradient(ellipse 52% 40% at 50% 50%, transparent 35%, #000 80%);
	}
	.dg-copy {
		position: relative;
		z-index: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(14px, 2.4vh, 22px);
		padding: clamp(28px, 5vh, 56px) clamp(24px, 4vw, 56px);
		text-align: center;
	}
	.dg-copy > * {
		margin: 0;
	}
	.dg-kicker {
		font-size: 13px;
		font-weight: 500;
		color: var(--dg-muted, var(--lg-muted));
	}
	.dg-title {
		font-family: var(--ess-font-display);
		font-size: clamp(40px, 5.2vw, 72px);
		font-weight: 700;
		line-height: 1.04;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}
	.dg-accent {
		color: var(--dg-accent, var(--lg-muted));
	}
	.dg-sub {
		max-width: 42ch;
		font-size: clamp(15px, 2.1vh, 17px);
		line-height: 1.6;
		color: var(--dg-muted, var(--lg-muted));
	}
	/* the copy rises in, one line after another */
	.dg-copy > * {
		animation: fade-up 700ms var(--lg-ease) both;
		animation-duration: 700ms !important;
	}
	.dg-kicker {
		animation-delay: calc(var(--enter) + 200ms);
	}
	.dg-title {
		animation-delay: calc(var(--enter) + 300ms);
	}
	.dg-sub {
		animation-delay: calc(var(--enter) + 400ms);
	}

	/* ---------- themes (data-ess-skin) ----------
	   Original keeps the palette at the top of this file. Every other theme
	   maps the login's colours onto its own ESS tokens (set on :root by the
	   theme's stylesheet), so light/dark follows the theme automatically. */
	:global([data-ess-skin]) .screen {
		--lg-canvas: var(--ess-backdrop);
		--lg-sheet: var(--ess-surface);
		--lg-panel: var(--ess-canvas);
		--lg-border: var(--ess-border);
		--lg-shadow: var(--ess-elev-3);
		--lg-ink: var(--ess-text);
		--lg-muted: var(--ess-text-secondary);
		--lg-faint: var(--ess-text-muted);
		--lg-field: var(--ess-field-bg);
		--lg-field-border: var(--ess-border-strong);
		--lg-blue-a: var(--ess-primary-text);
		--lg-btn: var(--ess-primary);
		--lg-btn-hover: var(--ess-primary-hover);
		--lg-btn-ink: var(--ess-text-on-primary);
		--lg-btn-shadow: var(--ess-primary-shadow);
		--lg-ring: var(--ess-primary-ring);
		--lg-soft: var(--ess-surface-hover);
		--lg-skin: color-mix(in srgb, var(--ess-primary) 30%, transparent);
		--lg-radius-field: var(--ess-radius-sm);
		--lg-radius-btn: var(--ess-radius-sm);
		font-family: var(--ess-font-sans);
	}
	:global([data-ess-skin]) .brand-mark {
		border-radius: var(--ess-radius-sm);
	}

	/* Mono (shadcn neutral): black on white, grey dashes on the sidebar
	   tone, no icon pattern, no blue anywhere. */
	:global([data-ess-skin='mono']) .screen {
		--lg-field-border: var(--mono-input);
		--lg-ring: var(--mono-ring-50);
		--dg-bg: var(--mono-sidebar);
		--dg-accent: var(--mono-muted-fg);
		--dg-muted: var(--mono-muted-fg);
	}
	:global([data-ess-skin='mono']) .skin {
		display: none;
	}
	:global([data-ess-skin='mono']) .panel-body .title-rule {
		background: var(--ess-border-strong);
	}
	:global([data-ess-skin='mono']) .card :global(.field:focus-within) {
		border-color: var(--mono-ring);
	}
	:global([data-ess-skin='mono']) .date-pill {
		border-color: var(--mono-border);
		background: var(--mono-card);
		color: var(--mono-muted-fg);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	/* Atur: the reference look, as in the app. A flat light-grey page with
	   two white blocks: on the left the summary (heading and four pastel
	   cards), on the right the form. Blue hexagon mark, blue gradient pill
	   button, headings in the display face (Jost). */
	.at-hero {
		display: none;
	}
	:global([data-ess-skin='atur']) .screen {
		--lg-panel: var(--ess-surface);
		--lg-field: var(--ess-surface);
		--lg-field-border: var(--ess-border-strong);
		--lg-radius-field: 12px;
		--lg-radius-btn: 999px;
	}
	:global([data-ess-skin='atur']) .screen.fit {
		background: var(--ess-canvas);
	}
	:global([data-ess-skin='atur']) .skin,
	:global([data-ess-skin='atur']) .showcase :global(.hero-wrap) {
		display: none;
	}
	:global([data-ess-skin='atur']) .split {
		gap: 12px;
		padding: 12px;
	}
	:global([data-ess-skin='atur']) .card--panel {
		border-radius: 16px;
		background: var(--ess-surface);
		box-shadow: var(--atur-block-shadow);
	}
	:global([data-ess-skin='atur']) .panel-top .brand {
		box-shadow: none;
	}
	:global([data-ess-skin='atur']) .brand-mark {
		border-radius: 0;
		color: #ffffff;
		background: var(--atur-accent-grad);
		clip-path: polygon(50% 0, 93% 24%, 93% 76%, 50% 100%, 7% 76%, 7% 24%);
	}
	:global([data-ess-skin='atur']) .brand-mark svg {
		width: 18px;
		height: 18px;
	}
	:global([data-ess-skin='atur']) .brand-text strong {
		font-family: var(--ess-font-display);
		font-weight: 600;
	}
	:global([data-ess-skin='atur']) .theme-toggle {
		border: none;
		border-radius: 50%;
		background: var(--ess-sunken);
	}
	:global([data-ess-skin='atur']) .theme-toggle:hover {
		background: var(--ess-border-subtle);
	}
	/* the heading in ink, its icon in a small near-black square */
	:global([data-ess-skin='atur']) .panel-body .panel-title {
		font-weight: 600;
		letter-spacing: -0.015em;
		color: var(--ess-text);
	}
	:global([data-ess-skin='atur']) .title-icon {
		width: 1.05em;
		height: 1.05em;
		border-radius: 14px;
		background: var(--ess-primary-grad);
		color: var(--atur-on-primary);
		box-shadow: var(--ess-primary-shadow);
	}
	:global([data-ess-skin='atur']) .title-icon :global(svg) {
		width: 0.55em;
		height: 0.55em;
	}
	:global([data-ess-skin='atur']) .panel-body .title-rule {
		background: var(--atur-accent-grad);
	}
	:global([data-ess-skin='atur']) .card :global(.submit-btn) {
		background: var(--ess-primary-grad, var(--lg-btn));
		color: var(--atur-on-primary);
		box-shadow: var(--ess-primary-shadow);
	}
	:global([data-ess-skin='atur']) .card :global(.submit-btn:hover:not(:disabled)) {
		background: var(--ess-primary-grad, var(--lg-btn-hover));
		filter: brightness(1.05);
	}
	:global([data-ess-skin='atur']) .date-pill {
		border-color: var(--ess-border);
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	/* the summary block */
	:global([data-ess-skin='atur']) .at-hero {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: clamp(22px, 4vh, 40px);
		padding: clamp(56px, 9vh, 88px) clamp(28px, 4vw, 56px) clamp(28px, 5vh, 48px);
		border-radius: 16px;
		background:
			radial-gradient(70% 55% at 100% 0%, color-mix(in srgb, #ff8a5c 9%, transparent), transparent 70%),
			var(--ess-surface);
		box-shadow: var(--atur-block-shadow);
	}
	.at-head > * {
		margin: 0;
	}
	.at-kicker {
		font-size: 13px;
		color: var(--ess-text-muted);
	}
	.at-title {
		margin-top: 8px !important;
		font-family: var(--ess-font-display);
		font-size: clamp(36px, 4.6vw, 60px);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--ess-text);
		text-wrap: balance;
	}
	.at-accent {
		background: var(--atur-accent-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.at-sub {
		margin-top: 14px !important;
		max-width: 44ch;
		font-size: clamp(14.5px, 2vh, 16px);
		line-height: 1.6;
		color: var(--ess-text-secondary);
	}
	.at-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.at-card {
		--at-tint: var(--ess-tint-pink);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		column-gap: 10px;
		row-gap: 6px;
		padding: clamp(14px, 2.2vh, 20px) 18px;
		border-radius: 16px;
		background: var(--atur-wave) right center / auto 100% no-repeat, var(--at-tint);
	}
	.at-card:nth-child(2) {
		--at-tint: var(--ess-tint-peach);
	}
	.at-card:nth-child(3) {
		--at-tint: var(--ess-tint-lavender);
	}
	.at-card:nth-child(4) {
		--at-tint: var(--ess-tint-mint);
	}
	.at-ic {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 9px;
		background: #1c1d22;
		color: #ffffff;
	}
	.at-card strong {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
		color: var(--ess-text);
	}
	.at-card small {
		grid-column: 1 / -1;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	/* the block's pieces rise in one after another */
	.at-head > *,
	.at-card {
		animation: fade-up 700ms var(--lg-ease) both;
		animation-duration: 700ms !important;
	}
	.at-kicker {
		animation-delay: calc(var(--enter) + 200ms);
	}
	.at-title {
		animation-delay: calc(var(--enter) + 280ms);
	}
	.at-sub {
		animation-delay: calc(var(--enter) + 360ms);
	}
	.at-card:nth-child(1) {
		animation-delay: calc(var(--enter) + 440ms);
	}
	.at-card:nth-child(2) {
		animation-delay: calc(var(--enter) + 500ms);
	}
	.at-card:nth-child(3) {
		animation-delay: calc(var(--enter) + 560ms);
	}
	.at-card:nth-child(4) {
		animation-delay: calc(var(--enter) + 620ms);
	}

	/* Amber: cream page, yellow pill button with black text, black for
	   headings and focus, and the hero on the dark ink panel. */
	:global([data-ess-skin='amber']) .screen {
		--lg-blue-a: var(--ess-text);
		--lg-radius-btn: 999px;
		--dg-bg: var(--amb-ink);
		--dg-ink: #ffffff;
		--dg-accent: var(--amb-yellow);
		--dg-muted: rgba(255, 255, 255, 0.92);
		--dg-colors: #ffca20, #f2bc12, #ffd84f, #ffffff, #9db3ff;
	}
	:global([data-ess-skin='amber']) .dg-hero {
		border-color: transparent;
		border-radius: var(--ess-radius-lg, 28px);
	}
	:global([data-ess-skin='amber'][data-ess-theme='dark']) .dg-hero {
		border-color: rgba(255, 255, 255, 0.09);
	}
	:global([data-ess-skin='amber']) .panel-body .title-rule {
		background: var(--amb-yellow);
	}
	:global([data-ess-skin='amber']) .card :global(.field:focus-within) {
		border-color: var(--amb-yellow-hover);
	}

	/* Mono and Amber swap the city banner for the dot-grid hero. */
	:global([data-ess-skin='mono']) .showcase :global(.hero-wrap),
	:global([data-ess-skin='amber']) .showcase :global(.hero-wrap) {
		display: none;
	}
	:global([data-ess-skin='amber']) .dg-hero {
		display: block;
	}

	/* ---------- Mono: the shadcnspace waitlist layout (2026-11-05) ----------
	   Left: plain page colour with the brand, a status pill, a big tight
	   headline and a footer line. Right: a soft pastel mesh (pink, butter,
	   mint, sky) with the form in a white rounded card. Dark keeps the same
	   mesh, dimmed, on Mono's charcoal. */
	.mn-hero {
		display: none;
	}
	:global([data-ess-skin='mono']) .screen.fit {
		background: var(--mono-background);
	}
	@media (min-width: 961px) {
		:global([data-ess-skin='mono']) .split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			padding: 0;
		}
	}
	:global([data-ess-skin='mono']) .date-pill {
		display: none;
	}
	:global([data-ess-skin='mono']) .mn-hero {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: clamp(28px, 7vh, 64px) clamp(28px, 8vw, 132px);
		background: var(--mono-background);
		color: var(--mono-foreground);
	}
	:global([data-ess-skin='mono']) .mn-copy {
		max-width: 520px;
		animation: mn-rise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms backwards;
		animation-duration: 700ms !important;
	}
	:global([data-ess-skin='mono']) .mn-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px 4px 10px;
		border: 1px solid var(--mono-border);
		border-radius: 999px;
		background: var(--mono-card);
		font-size: 12.5px;
		font-weight: 500;
		color: var(--mono-foreground);
	}
	:global([data-ess-skin='mono']) .mn-pill i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #14b8a6;
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.18);
	}
	:global([data-ess-skin='mono']) .mn-title {
		margin: clamp(16px, 3vh, 24px) 0 clamp(12px, 2.4vh, 18px);
		font-size: clamp(40px, 5.2vh + 1.6vw, 68px);
		font-weight: 600;
		line-height: 1.02;
		letter-spacing: -0.035em;
		color: var(--mono-foreground);
	}
	:global([data-ess-skin='mono']) .mn-sub {
		max-width: 42ch;
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--mono-muted-fg);
	}
	:global([data-ess-skin='mono']) .mn-foot {
		margin: 0;
		font-size: 12.5px;
		color: var(--mono-muted-fg);
	}
	:global([data-ess-skin='mono']) .mn-foot span {
		margin: 0 6px;
	}
	/* right: the pastel mesh with the form as a white card */
	:global([data-ess-skin='mono']) .card--panel {
		display: flex;
		flex-direction: column;
		padding: clamp(14px, 2.6vh, 26px) clamp(20px, 4vw, 64px) clamp(14px, 2.4vh, 22px);
		border-left: 1px solid var(--mono-border);
		background:
			radial-gradient(46% 42% at 16% 12%, rgba(255, 182, 196, 0.62), transparent 70%),
			radial-gradient(48% 46% at 88% 16%, rgba(255, 226, 140, 0.6), transparent 70%),
			radial-gradient(48% 48% at 20% 92%, rgba(150, 236, 200, 0.55), transparent 70%),
			radial-gradient(50% 48% at 92% 88%, rgba(160, 214, 255, 0.6), transparent 70%),
			#fafafa;
	}
	:global([data-ess-skin='mono'][data-ess-theme='dark']) .card--panel {
		background:
			radial-gradient(46% 42% at 16% 12%, rgba(255, 140, 170, 0.18), transparent 70%),
			radial-gradient(48% 46% at 88% 16%, rgba(255, 210, 110, 0.15), transparent 70%),
			radial-gradient(48% 48% at 20% 92%, rgba(90, 220, 170, 0.15), transparent 70%),
			radial-gradient(50% 48% at 92% 88%, rgba(110, 180, 255, 0.17), transparent 70%),
			#17171a;
	}
	:global([data-ess-skin='mono']) .panel-top {
		justify-content: flex-end;
	}
	:global([data-ess-skin='mono']) .panel-top :global(.brand) {
		display: none;
	}
	:global([data-ess-skin='mono']) .panel-body {
		width: min(440px, 100%);
		padding: clamp(24px, 4.4vh, 40px) clamp(24px, 3vw, 40px);
		border: 1px solid var(--mono-border);
		border-radius: 24px;
		background: var(--mono-card);
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.04),
			0 30px 60px -30px rgba(40, 30, 60, 0.35);
	}
	:global([data-ess-skin='mono'][data-ess-theme='dark']) .panel-body {
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 30px 60px -30px rgba(0, 0, 0, 0.7);
	}
	:global([data-ess-skin='mono']) .panel-body .panel-title {
		gap: 10px;
		margin-bottom: 6px;
		font-size: clamp(24px, 3.6vh, 30px);
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--mono-foreground);
	}
	:global([data-ess-skin='mono']) .panel-body .title-icon :global(svg) {
		width: 24px;
		height: 24px;
	}
	:global([data-ess-skin='mono']) .panel-body .title-rule {
		display: none;
	}
	:global([data-ess-skin='mono']) .panel-body .sub {
		margin-top: 0;
		font-size: 14px;
		color: var(--mono-muted-fg);
	}
	/* the © line lives in the left footer here (as in the reference); on
	   phones, where the left side is hidden, it shows under the form */
	:global([data-ess-skin='mono']) .panel-foot {
		visibility: hidden;
		color: var(--mono-muted-fg);
	}
	@media (max-width: 960px) {
		:global([data-ess-skin='mono']) .panel-foot {
			visibility: visible;
		}
	}
	@keyframes mn-rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}

	/* ---------- responsive ---------- */
	@media (max-width: 960px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
		.showcase {
			display: none;
		}
		.center-grid.with-aside {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 520px) {
		.split {
			padding: 10px;
		}
	}

	/* ---------- motion ---------- */
	@keyframes slide-right {
		from {
			opacity: 0;
			transform: translateX(-20px);
		}
	}
	@keyframes slide-left {
		from {
			opacity: 0;
			transform: translateX(20px);
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
	}
	@keyframes fade-up {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes spin-in {
		from {
			opacity: 0;
			transform: rotate(-90deg) scale(0.5);
		}
	}

	/* The login panels slide in and the form cascades even under reduced
	   motion (contained, short), after the intro, which plays there too in
	   a calmer form (TunnelLoader). */
	.showcase,
	.card--panel,
	.date-pill,
	.theme-icon,
	.card :global(form > *) {
		animation-duration: 700ms !important;
	}
	@media (prefers-reduced-motion: reduce) {
		.brand-row,
		.center-text {
			animation: none !important;
		}
	}
</style>
