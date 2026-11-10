<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Users from '@lucide/svelte/icons/users';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';

	/**
	 * Loading, drawn as a flight down a corridor of HR cards: check-ins,
	 * leave, payslips, reviews… come out of the distance, past the camera,
	 * while the brand and a status line hold still in the middle.
	 * - `intro`: covers the signed-out page while it opens. One quick run,
	 *   then the cover lifts. CSS only, so it ends on its own even before the
	 *   page's script runs.
	 * - `navigation`: shown over the workspace while a slow page loads. The
	 *   corridor loops until the parent removes it.
	 * Covers its nearest positioned ancestor. The pointer tilts the corridor
	 * slightly (skipped under reduced motion, where the flight is also
	 * slower and shallower but still plays: see the note at the bottom).
	 */
	interface Props {
		variant?: 'intro' | 'navigation';
		message?: string;
		/** Show the "Champ HR" name under the mark (always on for the intro). */
		showName?: boolean;
	}

	let { variant = 'navigation', message = 'Loading…', showName = false }: Props = $props();

	type Extra =
		| { kind: 'status'; text: string; tone: 'ok' | 'warn' | 'info' }
		| { kind: 'bar'; value: number }
		| { kind: 'lines' }
		| { kind: 'avatars'; people: string[] };

	const CARDS: { icon: typeof Clock; kicker: string; title: string; meta: string; extra: Extra }[] = [
		{ icon: Clock, kicker: 'Attendance', title: 'Checked in', meta: '09:02 AM · On time', extra: { kind: 'status', text: 'Present', tone: 'ok' } },
		{ icon: CalendarCheck, kicker: 'Leave', title: 'Casual leave', meta: '12–13 Nov · 2 days', extra: { kind: 'status', text: 'Approved', tone: 'ok' } },
		{ icon: ReceiptText, kicker: 'Payroll', title: 'Payslip ready', meta: 'October 2026', extra: { kind: 'lines' } },
		{ icon: Users, kicker: 'Your team', title: '12 of 14 present', meta: '2 on leave today', extra: { kind: 'avatars', people: ['AK', 'RS', 'MN', '+9'] } },
		{ icon: ListChecks, kicker: 'Onboarding', title: 'Joining documents', meta: '4 of 6 steps done', extra: { kind: 'bar', value: 0.66 } },
		{ icon: Megaphone, kicker: 'Announcement', title: 'Holiday calendar 2027', meta: 'From HR', extra: { kind: 'lines' } },
		{ icon: CalendarClock, kicker: 'Shift', title: 'General shift', meta: '09:30 – 18:30', extra: { kind: 'status', text: 'Today', tone: 'info' } },
		{ icon: ClipboardCheck, kicker: 'Review', title: 'Mid-year review', meta: 'Due 20 Nov', extra: { kind: 'bar', value: 0.4 } },
		{ icon: BadgeCheck, kicker: 'Approval', title: 'Comp-off claim', meta: 'Sat, 8 Nov', extra: { kind: 'status', text: 'Pending', tone: 'warn' } }
	];

	// Each card's lane: spread round the centre on the golden angle, at a
	// distance that varies a little, with a slight tilt. Offsets are shares of
	// the loader's own width and height (cqw/cqh), so the corridor fits
	// whatever it covers.
	const LANES = CARDS.map((_, i) => {
		const a = i * 137.5 * (Math.PI / 180);
		return {
			cx: (Math.cos(a) * (0.28 + (i % 3) * 0.08)).toFixed(4),
			cy: (Math.sin(a) * (0.26 + (i % 2) * 0.09)).toFixed(4),
			rz: `${(i % 2 === 0 ? 1 : -1) * (3 + (i % 5) * 2)}deg`,
			t: (i / CARDS.length).toFixed(4)
		};
	});

	// Pointer tilt: eased towards the pointer each frame, written as two CSS
	// variables the flight reads. The loop stops once it has caught up.
	let root: HTMLDivElement | undefined = $state();
	$effect(() => {
		const el = root;
		if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let tx = 0;
		let ty = 0;
		let x = 0;
		let y = 0;
		let frame = 0;
		const step = () => {
			x += (tx - x) * 0.08;
			y += (ty - y) * 0.08;
			el.style.setProperty('--px', x.toFixed(4));
			el.style.setProperty('--py', y.toFixed(4));
			frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(step) : 0;
		};
		const onMove = (e: PointerEvent) => {
			tx = (e.clientX / window.innerWidth - 0.5) * 2;
			ty = (e.clientY / window.innerHeight - 0.5) * 2;
			if (!frame) frame = requestAnimationFrame(step);
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		return () => {
			window.removeEventListener('pointermove', onMove);
			cancelAnimationFrame(frame);
		};
	});
</script>

<div class="tl tl--{variant}" bind:this={root} role="status" aria-live="polite">
	<div class="rings" aria-hidden="true"><i></i><i></i></div>

	<div class="space" aria-hidden="true">
		{#each CARDS as card, i (card.title)}
			{@const lane = LANES[i]}
			<div class="card" style="--cx: {lane.cx}; --cy: {lane.cy}; --rz: {lane.rz}; --t: {lane.t}; z-index: {i + 1}">
				<div class="card-head">
					<span class="chip"><card.icon size={14} strokeWidth={2.2} /></span>
					<span class="kicker">{card.kicker}</span>
				</div>
				<strong class="title">{card.title}</strong>
				<span class="meta">{card.meta}</span>
				{#if card.extra.kind === 'status'}
					<span class="status status--{card.extra.tone}">{card.extra.text}</span>
				{:else if card.extra.kind === 'bar'}
					<span class="bar"><span style="width: {card.extra.value * 100}%"></span></span>
				{:else if card.extra.kind === 'lines'}
					<span class="lines"><i></i><i></i></span>
				{:else}
					<span class="avatars">
						{#each card.extra.people as p (p)}<i>{p}</i>{/each}
					</span>
				{/if}
			</div>
		{/each}
	</div>

	<div class="center">
		<span class="mark" aria-hidden="true">
			<svg viewBox="0 0 40 40" width="22" height="22">
				<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
			</svg>
		</span>
		{#if variant === 'intro' || showName}<strong class="name">Champ HR</strong>{/if}
		<p>{message}</p>
		<div class="track"><span></span></div>
	</div>
</div>

<style>
	/* Colours: the login's palette (--lg-*) where it is set, the app's
	   tokens (--ess-*) everywhere else, so it follows every theme. */
	.tl {
		--tl-bg: var(--lg-panel, var(--ess-canvas, #f5f5f7));
		--tl-card: var(--lg-sheet, var(--ess-surface, #fff));
		--tl-ink: var(--lg-ink, var(--ess-text, #1b2330));
		--tl-muted: var(--lg-muted, var(--ess-text-secondary, #555e6b));
		--tl-line: var(--lg-border, var(--ess-border, rgba(27, 35, 48, 0.12)));
		--tl-accent: var(--lg-btn, var(--ess-primary, #1f4fd1));
		--tl-accent-ink: var(--lg-btn-ink, var(--ess-text-on-primary, #fff));
		--tl-accent-fill: var(--tl-accent);
		/* the accent as text and icon colour, on its own pale tint */
		--tl-accent-text: var(--tl-accent);

		/* the corridor: where cards start and end, and how deep it looks */
		--far: -1700px;
		--near: 500px;
		--pan: 45px;
		--px: 0;
		--py: 0;

		position: absolute;
		inset: 0;
		z-index: 40;
		overflow: hidden;
		display: grid;
		place-items: center;
		container-type: size;
		background: var(--tl-bg);
		color: var(--tl-ink);
		user-select: none;
	}

	/* two faint depth rings behind everything */
	.rings,
	.rings i {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
	}
	.rings i {
		inset: auto;
		width: 48vmin;
		height: 48vmin;
		border-radius: 50%;
		border: 1px solid color-mix(in srgb, var(--tl-accent) 14%, transparent);
	}
	.rings i + i {
		width: 76vmin;
		height: 76vmin;
		border: 1px dashed var(--tl-line);
	}

	/* ---------- the corridor ---------- */
	.space {
		position: absolute;
		inset: 0;
		perspective: 1100px;
		transform-style: preserve-3d;
		pointer-events: none;
	}
	.card {
		position: absolute;
		left: 50%;
		top: 50%;
		width: clamp(160px, 17cqw, 224px);
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 14px 13px;
		border: 1px solid var(--tl-line);
		border-radius: 14px;
		background: var(--tl-card);
		box-shadow: 0 18px 40px -22px rgba(15, 23, 42, 0.45);
		opacity: 0;
		will-change: transform, opacity;
		backface-visibility: hidden;
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.chip {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		color: var(--tl-accent-text);
		background: color-mix(in srgb, var(--tl-accent) 12%, transparent);
	}
	.kicker {
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--tl-muted);
	}
	.title {
		font-size: 14.5px;
		font-weight: 650;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}
	.meta {
		font-size: 12.5px;
		color: var(--tl-muted);
	}
	.status {
		align-self: flex-start;
		margin-top: 8px;
		padding: 2px 9px;
		border-radius: 6px;
		font-size: 11.5px;
		font-weight: 600;
	}
	.status--ok {
		color: var(--ess-success, #127448);
		background: var(--ess-success-bg, #e6f6ee);
	}
	.status--warn {
		color: var(--ess-warning, #945600);
		background: var(--ess-warning-bg, #fdf1dc);
	}
	.status--info {
		color: var(--tl-accent-text);
		background: color-mix(in srgb, var(--tl-accent) 12%, transparent);
	}
	.bar {
		height: 5px;
		margin-top: 10px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--tl-line);
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--tl-accent-fill);
	}
	.lines {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-top: 9px;
	}
	.lines i {
		height: 5px;
		border-radius: 3px;
		background: var(--tl-ink);
		opacity: 0.12;
	}
	.lines i + i {
		width: 62%;
	}
	.avatars {
		display: flex;
		margin-top: 9px;
	}
	.avatars i {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		margin-right: -6px;
		border-radius: 50%;
		border: 2px solid var(--tl-card);
		font-size: 9.5px;
		font-style: normal;
		font-weight: 700;
		color: var(--tl-ink);
		background: color-mix(in srgb, var(--tl-accent) 16%, var(--tl-card));
	}
	.avatars i:last-child {
		color: var(--tl-muted);
		background: var(--tl-line);
	}

	/* Each card flies its lane from far to near, fading in after the start
	   and out before it reaches the camera. The pointer shifts the lanes the
	   other way (--px/--py), so near cards move more than far ones. */
	@keyframes tl-fly {
		0% {
			opacity: 0;
			transform: translate3d(
					calc(-50% + var(--cx) * 100cqw - var(--px) * var(--pan)),
					calc(-50% + var(--cy) * 100cqh - var(--py) * var(--pan)),
					var(--far)
				)
				rotateZ(var(--rz));
		}
		18%,
		82% {
			opacity: 1;
		}
		98%,
		100% {
			opacity: 0;
			transform: translate3d(
					calc(-50% + var(--cx) * 100cqw - var(--px) * var(--pan)),
					calc(-50% + var(--cy) * 100cqh - var(--py) * var(--pan)),
					var(--near)
				)
				rotateZ(var(--rz));
		}
	}

	/* ---------- the middle: brand, message, progress ---------- */
	.center {
		position: relative;
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		width: min(240px, 80%);
		padding: 22px 26px 20px;
		border-radius: 24px;
		/* a soft patch of page colour keeps the text clear of passing cards */
		background: var(--tl-bg);
		box-shadow: 0 0 48px 36px var(--tl-bg);
		text-align: center;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 11px;
		color: var(--tl-accent-ink);
		background: var(--tl-accent-fill);
	}
	.name {
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	.center p {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--tl-muted);
	}
	.track {
		width: 100%;
		height: 3px;
		margin-top: 4px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--tl-line);
	}
	.track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--tl-accent-fill);
	}

	/* ---------- intro: one quick run, then the cover lifts ----------
	   Lengths are !important: the app shortens every animation to 0.01ms
	   under reduced motion, and this one is meant to play there (calmer). */
	.tl--intro {
		z-index: 60;
		animation: tl-lift 450ms cubic-bezier(0.7, 0, 0.3, 1) 1300ms forwards;
		animation-duration: 450ms !important;
	}
	.tl--intro .card {
		/* cards already part-way down the corridor when the page appears */
		animation: tl-fly 1.5s linear calc(var(--t) * 0.9s - 0.7s) both;
		animation-duration: 1.5s !important;
	}
	.tl--intro .center {
		animation:
			tl-rise 450ms cubic-bezier(0.22, 1, 0.36, 1) both,
			tl-out 350ms ease 1050ms forwards;
		animation-duration: 450ms, 350ms !important;
	}
	.tl--intro .track span {
		transform-origin: left;
		animation: tl-fill 1s cubic-bezier(0.22, 1, 0.36, 1) 100ms both;
		animation-duration: 1s !important;
	}

	/* ---------- navigation: the corridor loops ---------- */
	.tl--navigation {
		z-index: 30;
		animation: tl-in 220ms ease both;
		animation-duration: 220ms !important;
	}
	.tl--navigation .card {
		/* spread evenly along one cycle, so the corridor is full from the start */
		animation: tl-fly 4.8s linear calc(var(--t) * -4.8s) infinite;
		animation-duration: 4.8s !important;
		animation-iteration-count: infinite !important;
	}
	.tl--navigation .track span {
		width: 40%;
		animation: tl-slide 1.3s ease-in-out infinite;
		animation-duration: 1.3s !important;
		animation-iteration-count: infinite !important;
	}

	@keyframes tl-lift {
		to {
			clip-path: inset(0 0 100% 0);
			visibility: hidden;
		}
	}
	@keyframes tl-in {
		from {
			opacity: 0;
		}
	}
	@keyframes tl-rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@keyframes tl-out {
		to {
			opacity: 0;
			transform: translateY(-12px);
		}
	}
	@keyframes tl-fill {
		from {
			transform: scaleX(0);
		}
	}
	@keyframes tl-slide {
		0% {
			transform: translateX(-110%);
		}
		100% {
			transform: translateX(260%);
		}
	}

	/* ---------- small screens: a shorter corridor, larger cards ---------- */
	@container (max-width: 767px) {
		.card {
			width: clamp(132px, 38cqw, 180px);
		}
	}
	@media (max-width: 767px) {
		.tl {
			--far: -1200px;
			--near: 350px;
			--pan: 20px;
		}
		.space {
			perspective: 900px;
		}
	}

	/* ---------- themes ---------- */
	/* Atur: the login headline's warm gradient, as on the badge loader. */
	:global([data-ess-skin='atur']) .tl {
		--tl-accent: #f2857f;
		--tl-accent-ink: #fff;
		--tl-accent-fill: var(--atur-accent-grad);
	}
	:global([data-ess-skin='atur']) .mark {
		border-radius: 0;
		clip-path: polygon(50% 0, 93% 24%, 93% 76%, 50% 100%, 7% 76%, 7% 24%);
	}
	/* Amber: yellow on a pale yellow tint is unreadable, so icons and tags
	   are in ink there, on the yellow tint. */
	:global([data-ess-skin='amber']) .tl {
		--tl-accent-text: var(--ess-text);
	}
	:global([data-ess-theme='dark']) .card {
		box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.85);
	}

	/* Reduced motion (this machine reports it): the flight still plays, so
	   the loader is not a blank screen, but slower and shallower, and the
	   pointer tilt is off (see the script). */
	@media (prefers-reduced-motion: reduce) {
		.tl {
			--far: -800px;
			--near: 150px;
		}
		.tl--navigation .card {
			animation-duration: 8s !important;
			animation-delay: calc(var(--t) * -8s);
		}
	}
</style>
