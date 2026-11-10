<script lang="ts">
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import { mainNavItems, isNavActive } from '$lib/nav-items';
	import type { Role } from '$lib/server/auth';

	/**
	 * The Atur theme's main navigation on desktop and tablet: a bar along the
	 * bottom, as wide as the workspace above it. The brand sits on the left,
	 * the dock of section icons in the middle, and the open section with
	 * today's date and time on the right. Icons grow as the pointer nears
	 * them and ease back on a spring; the hovered (or keyboard-focused) one
	 * shows its label above it. Same sections and badges as the sidebar
	 * (nav-items.ts). Rendered for every theme but only shown by Atur's CSS
	 * (ess-skins.css), so switching themes needs no reload.
	 */
	interface Props {
		activePath: string;
		role: Role;
		canAdmin?: boolean;
		canPayroll?: boolean;
		canTeam?: boolean;
		adminIssueCount?: number;
		chatBadge?: { count: number; urgent: boolean };
		/** Resting tile size (px). */
		size?: number;
		/** Tile size right under the pointer (px). */
		magnification?: number;
		/** How far from the pointer tiles still grow (px). */
		distance?: number;
	}

	let {
		activePath,
		role,
		canAdmin = false,
		canPayroll = false,
		canTeam,
		adminIssueCount = 0,
		chatBadge = { count: 0, urgent: false },
		size = 44,
		magnification = 66,
		distance = 140
	}: Props = $props();

	const items = $derived(mainNavItems({ role, canTeam, canAdmin, canPayroll }));
	// sections + help
	const count = $derived(items.length + 1);
	const h = $derived(items.length);
	const helpActive = $derived(isNavActive('/hr-contacts', activePath));
	const section = $derived(items.find((i) => isNavActive(i.href, activePath))?.label ?? (helpActive ? 'Help & support' : ''));

	// Today's date and time, filled in the browser (no server/client mismatch)
	// and kept current to the minute.
	let now = $state<Date | null>(null);
	$effect(() => {
		now = new Date();
		const t = setInterval(() => (now = new Date()), 20_000);
		return () => clearInterval(t);
	});
	const dateText = $derived(now ? now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }) : '');
	const timeText = $derived(now ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

	let tiles: HTMLElement[] = $state([]);
	let sizes = $state<number[]>([]);
	let mouseX = Infinity;
	let raf = 0;
	let vel: number[] = [];

	// Spring each tile towards the size its distance from the pointer asks
	// for (linear from `magnification` at the centre to `size` at `distance`).
	function step() {
		raf = 0;
		let moving = false;
		const next = sizes.slice();
		for (let i = 0; i < count; i++) {
			const el = tiles[i];
			const cur = next[i] ?? size;
			let target = size;
			if (el && Number.isFinite(mouseX)) {
				const r = el.getBoundingClientRect();
				const d = Math.abs(mouseX - (r.left + r.width / 2));
				if (d < distance) target = size + (magnification - size) * (1 - d / distance);
			}
			// stiffness 170, damping 18, unit mass, ~60fps
			const v = ((vel[i] ?? 0) + (target - cur) * 170 * (1 / 60)) * (1 - 18 * (1 / 60));
			vel[i] = v;
			const s = cur + v * (1 / 60);
			next[i] = s;
			if (Math.abs(target - s) > 0.15 || Math.abs(v) > 0.15) moving = true;
			else next[i] = target;
		}
		sizes = next;
		if (moving) raf = requestAnimationFrame(step);
	}
	const kick = () => {
		if (!raf) raf = requestAnimationFrame(step);
	};
	$effect(() => () => cancelAnimationFrame(raf));

	function onMove(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		mouseX = e.clientX;
		kick();
	}
	function onLeave() {
		mouseX = Infinity;
		kick();
	}

	const px = (i: number) => `${(sizes[i] ?? size).toFixed(2)}px`;
</script>

<nav class="mdock" aria-label="Main">
	<div class="mdock-bar">
		<!-- left: the brand -->
		<a href="/dashboard" class="mdock-brand" aria-label="Champ HR, Today">
			<span class="mdock-mark" aria-hidden="true">
				<svg viewBox="0 0 40 40" width="20" height="20">
					<path d="M20.5 9.5A11 11 0 1 0 20.5 30.5" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
					<path d="M25 10v20M25 20h10M35 10v20" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" />
				</svg>
			</span>
			<span class="mdock-brand-text">
				<strong>Champ HR</strong>
				<small>Employee Self-Service</small>
			</span>
		</a>

		<!-- middle: the dock -->
		<div class="mdock-tiles" role="presentation" onpointermove={onMove} onpointerleave={onLeave}>
			{#each items as item, i (item.href)}
				{@const active = isNavActive(item.href, activePath)}
				<a
					href={item.href}
					class="mdock-tile"
					class:active
					class:soon={item.soon}
					bind:this={tiles[i]}
					style:width={px(i)}
					style:height={px(i)}
					aria-current={active ? 'page' : undefined}
					aria-label={item.soon ? `${item.label}, coming soon` : item.label}
				>
					<item.icon size="46%" strokeWidth={1.8} />
					<span class="mdock-label" aria-hidden="true">{item.soon ? `${item.label} · coming soon` : item.label}</span>
					{#if item.href === '/admin' && adminIssueCount > 0}
						<span class="mdock-count warn" aria-label="{adminIssueCount} need{adminIssueCount === 1 ? 's' : ''} attention">{adminIssueCount}</span>
					{:else if item.href === '/hub' && chatBadge.count > 0}
						<span class="mdock-count" class:urgent={chatBadge.urgent} aria-label="{chatBadge.count} unread">
							{chatBadge.count > 99 ? '99+' : chatBadge.count}
						</span>
					{/if}
				</a>
			{/each}

			<span class="mdock-sep" aria-hidden="true"></span>
			<a
				href="/hr-contacts"
				class="mdock-tile"
				class:active={helpActive}
				bind:this={tiles[h]}
				style:width={px(h)}
				style:height={px(h)}
				aria-current={helpActive ? 'page' : undefined}
				aria-label="Help & support"
			>
				<CircleHelp size="46%" strokeWidth={1.8} />
				<span class="mdock-label" aria-hidden="true">Help &amp; support</span>
			</a>
		</div>

		<!-- right: where you are, and when -->
		<div class="mdock-meta">
			{#if section}<strong class="mdock-section">{section}</strong>{/if}
			{#if now}<span class="mdock-when"><time datetime={now.toISOString()}>{dateText}</time><span aria-hidden="true"> · </span>{timeText}</span>{/if}
		</div>
	</div>
</nav>

<style>
	/* Hidden unless a theme turns it on (Atur, ess-skins.css). */
	.mdock {
		display: none;
		position: fixed;
		left: var(--ess-shell-inset, 12px);
		right: var(--ess-shell-inset, 12px);
		bottom: 10px;
		z-index: 45;
		pointer-events: none;
	}
	.mdock-bar {
		pointer-events: auto;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 16px;
		height: 60px;
		padding: 0 18px 0 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg, 22px);
		background: var(--ess-surface);
		box-shadow:
			0 1px 2px rgba(20, 22, 40, 0.05),
			0 18px 40px -22px rgba(20, 22, 40, 0.3);
	}

	/* ---------- left: brand ---------- */
	/* the brand sits in its own box, as the shot's logo block does */
	.mdock-brand {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		padding: 5px 14px 5px 5px;
		border: 1px solid var(--ess-border-subtle, var(--ess-border));
		border-radius: 14px;
		background: var(--ess-surface);
		color: var(--ess-text);
		text-decoration: none;
	}
	.mdock-brand:hover {
		background: var(--ess-surface-hover);
	}
	.mdock-brand:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--ess-primary-ring);
	}
	.mdock-mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		color: #ffffff;
		background: var(--ess-primary-grad, var(--ess-primary));
		box-shadow: var(--ess-primary-shadow);
	}
	.mdock-brand-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}
	.mdock-brand-text strong {
		font-size: 14.5px;
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.mdock-brand-text small {
		font-size: 12px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---------- middle: the dock ---------- */
	.mdock-tiles {
		align-self: end;
		display: flex;
		align-items: flex-end;
		gap: 8px;
		/* a fixed row (the bar's inner height), so grown tiles spill upward
		   instead of stretching the row and dropping below the bar */
		height: 58px;
		/* the tiles rest 8px off the bar's bottom and grow upward out of it */
		padding: 0 4px 8px;
	}
	.mdock-sep {
		flex: none;
		align-self: center;
		width: 1px;
		height: 30px;
		margin: 6px 2px 0;
		background: var(--ess-border);
	}
	/* idle items: flat grey icons on the white bar, as in Atur's nav pill;
	   the hovered one picks up a soft grey square */
	.mdock-tile {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 30%;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ess-text-muted);
		text-decoration: none;
		transition:
			background-color 160ms ease,
			color 160ms ease;
	}
	.mdock-tile:hover {
		color: var(--ess-text);
		background: var(--ess-sunken, var(--ess-surface-hover));
	}
	.mdock-tile:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--ess-primary-ring);
	}
	/* the open page in the theme's gradient, as on Atur's tabs and pills */
	.mdock-tile.active {
		border-color: transparent;
		color: #ffffff;
		background: var(--ess-primary-grad, var(--ess-primary));
		box-shadow: var(--ess-primary-shadow);
	}
	.mdock-tile.active::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--ess-primary);
	}
	.mdock-tile.soon {
		opacity: 0.55;
	}
	/* the label: a small dark chip above the tile, on hover or focus */
	.mdock-label {
		position: absolute;
		bottom: calc(100% + 10px);
		left: 50%;
		padding: 4px 9px;
		border-radius: 8px;
		background: var(--ess-text);
		color: var(--ess-canvas);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.3;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transform: translate(-50%, 4px);
		transition:
			opacity 140ms ease,
			transform 140ms ease;
		transition-duration: 140ms !important;
	}
	.mdock-tile:hover .mdock-label,
	.mdock-tile:focus-visible .mdock-label {
		opacity: 1;
		transform: translate(-50%, 0);
	}
	.mdock-count {
		position: absolute;
		top: -5px;
		right: -5px;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		border: 2px solid var(--ess-surface);
		background: var(--ess-primary);
		color: #ffffff;
		font-size: 10.5px;
		font-weight: 700;
		line-height: 14px;
		text-align: center;
		box-sizing: border-box;
	}
	.mdock-count.urgent,
	.mdock-count.warn {
		background: var(--ess-danger);
	}

	/* ---------- right: section and time ---------- */
	.mdock-meta {
		justify-self: end;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		min-width: 0;
		line-height: 1.25;
		text-align: right;
	}
	.mdock-section {
		font-size: 14.5px;
		font-weight: 700;
		color: var(--ess-text);
		white-space: nowrap;
	}
	.mdock-when {
		font-size: 12px;
		color: var(--ess-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		font-variant-numeric: tabular-nums;
	}

	/* narrower windows: the side texts give way to the dock */
	@media (max-width: 1180px) {
		.mdock-brand-text small,
		.mdock-when {
			display: none;
		}
	}
	@media (max-width: 960px) {
		.mdock-brand-text,
		.mdock-meta {
			display: none;
		}
		.mdock-bar {
			gap: 8px;
		}
	}

	@media print {
		.mdock {
			display: none !important;
		}
	}
</style>
