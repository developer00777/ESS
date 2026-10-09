<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Sun from '@lucide/svelte/icons/sun';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import Layers from '@lucide/svelte/icons/layers';
	import Square from '@lucide/svelte/icons/square';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Waves from '@lucide/svelte/icons/waves';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Video from '@lucide/svelte/icons/video';
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import Users from '@lucide/svelte/icons/users';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	/**
	 * Each setting maps to a data-* attribute on <html>. `null` means "don't
	 * set the attribute" — i.e. the shipped default, so the panel's default
	 * state is exactly what employees see. The pre-paint script in app.html
	 * reads the same localStorage keys, so a choice never flashes.
	 */
	type Tweak = {
		key: string;
		attr: string;
		label: string;
		hint: string;
		icon: typeof Sun;
		options: { value: string | null; label: string }[];
	};

	const TWEAKS: Tweak[] = [
		{ key: 'palette', attr: 'data-ess-theme', label: 'Theme', hint: 'Choose the colour theme for the workspace.', icon: Sun, options: [{ value: null, label: 'Light' }, { value: 'dark', label: 'Dark' }] },
		{ key: 'shell', attr: 'data-ess-shell', label: 'Navigation', hint: 'Set the width of the left navigation.', icon: PanelLeft, options: [{ value: null, label: 'Expanded' }, { value: 'rail', label: 'Compact' }] },
		{ key: 'card', attr: 'data-ess-card', label: 'Surface style', hint: 'Choose how cards and panels appear.', icon: Layers, options: [{ value: null, label: 'Outline' }, { value: 'solid', label: 'Solid' }, { value: 'elevated', label: 'Elevated' }] },
		{ key: 'corner', attr: 'data-ess-corner', label: 'Corner style', hint: 'Set the roundness of card and control corners.', icon: Square, options: [{ value: 'sharp', label: 'Sharp' }, { value: null, label: 'Soft' }, { value: 'round', label: 'Round' }] },
		{ key: 'density', attr: 'data-ess-density', label: 'Density', hint: 'Adjust spacing and element size.', icon: LayoutGrid, options: [{ value: null, label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] },
		{ key: 'motion', attr: 'data-ess-motion', label: 'Motion', hint: 'Control interface animations.', icon: Waves, options: [{ value: null, label: 'Standard' }, { value: 'reduced', label: 'Reduced' }] },
		{ key: 'spark', attr: 'data-ess-spark', label: 'Sparklines', hint: 'Show mini charts in metric cards.', icon: TrendingUp, options: [{ value: null, label: 'On' }, { value: 'off', label: 'Off' }] }
	];

	/* Attributes from the earlier skin that no longer do anything; cleared so
	   they stop lingering in localStorage. */
	const RETIRED = ['data-ess-glow', 'data-ess-stars', 'data-ess-depth'];

	const STORAGE_KEY = 'essTweaks';

	let current = $state<Record<string, string | null>>({});
	let copied = $state(false);

	$effect(() => {
		// Read whatever is already on <html> so the panel reflects reality,
		// including the palette/shell the user picked from the top bar.
		const root = document.documentElement;
		const next: Record<string, string | null> = {};
		for (const t of TWEAKS) next[t.key] = root.getAttribute(t.attr);
		current = next;
		try {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
			let dirty = false;
			for (const attr of RETIRED) {
				if (attr in stored) {
					delete stored[attr];
					dirty = true;
				}
				root.removeAttribute(attr);
			}
			if (dirty) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
		} catch {
			/* nothing stored */
		}
	});

	function apply(tweak: Tweak, value: string | null) {
		const root = document.documentElement;
		if (value === null) root.removeAttribute(tweak.attr);
		else root.setAttribute(tweak.attr, value);

		current = { ...current, [tweak.key]: value };

		// Persist so the choice survives navigation while you evaluate it.
		// Palette and shell keep using their own existing keys.
		if (tweak.key === 'palette') localStorage.setItem('essTheme', value === 'dark' ? 'dark' : 'light');
		else if (tweak.key === 'shell') localStorage.setItem('essShell', value === 'rail' ? 'rail' : 'classic');
		else {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
			if (value === null) delete stored[tweak.attr];
			else stored[tweak.attr] = value;
			localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
		}
	}

	function resetAll() {
		for (const t of TWEAKS) apply(t, t.options.find((o) => o.value === null)?.value ?? null);
		localStorage.removeItem(STORAGE_KEY);
	}

	const optionLabel = (t: Tweak) => t.options.find((o) => o.value === (current[t.key] ?? null))?.label ?? String(current[t.key]);

	/** The non-default choices, as the CSS/markup change needed to ship them. */
	const changed = $derived(
		TWEAKS.filter((t) => current[t.key] != null).map((t) => ({
			label: t.label,
			attr: t.attr,
			value: current[t.key],
			optionLabel: optionLabel(t)
		}))
	);

	async function copySummary() {
		const text = changed.length === 0 ? 'All settings at their shipped defaults.' : changed.map((c) => `${c.label}: ${c.optionLabel}  →  ${c.attr}="${c.value}"`).join('\n');
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1800);
	}

	/* The preview reflects the chosen options through the same attributes the
	   real app uses, scoped to the miniature. */
	const previewAttrs = $derived(Object.fromEntries(TWEAKS.map((t) => [t.attr, current[t.key] ?? undefined])));
	const today = new Date();
	const week = Array.from({ length: 5 }, (_, i) => {
		const d = new Date(today);
		d.setDate(today.getDate() - 1 + i);
		return { wd: d.toLocaleDateString('en-IN', { weekday: 'short' }), d: d.getDate(), on: i === 1 };
	});
	const longToday = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
</script>

<svelte:head>
	<title>Appearance — Champ HR ESS Portal</title>
</svelte:head>

<div class="ess-split ess-split--wide layout">
	<section class="ess-card">
		<div class="ess-card-head">
			<h2 class="ess-h2">Interface style</h2>
		</div>
		<div class="settings">
			{#each TWEAKS as tweak (tweak.key)}
				{@const Icon = tweak.icon}
				<div class="setting">
					<span class="setting-icon"><Icon size={20} strokeWidth={1.75} /></span>
					<div class="setting-text">
						<strong>{tweak.label}</strong>
						<small>{tweak.hint}</small>
					</div>
					<div class="choices" role="radiogroup" aria-label={tweak.label}>
						{#each tweak.options as opt (opt.label)}
							{@const on = (current[tweak.key] ?? null) === opt.value}
							<button type="button" class="choice" role="radio" aria-checked={on} onclick={() => apply(tweak, opt.value)}>
								<span class="radio" aria-hidden="true"></span>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<aside class="ess-card preview-card">
		<div class="ess-card-head">
			<h2 class="ess-h2">Live preview</h2>
			<span class="ess-caption"><em>This preview reflects your current selections.</em></span>
		</div>
		<div class="preview" {...previewAttrs} data-theme={current.palette ?? 'light'}>
			<div class="p-rail" class:compact={current.shell === 'rail'}>
				<div class="p-brand"><span class="p-mark">CH</span><span class="p-label">Champ HR</span></div>
				<div class="p-nav on"><CalendarDays size={13} /><span class="p-label">Today</span></div>
				<div class="p-nav"><LayoutGrid size={13} /><span class="p-label">Champ Hub</span></div>
				<div class="p-nav"><Calendar size={13} /><span class="p-label">Leave</span></div>
				<div class="p-nav"><Clock size={13} /><span class="p-label">Attendance</span></div>
				<div class="p-nav"><FileText size={13} /><span class="p-label">Policies</span></div>
				<div class="p-nav"><Users size={13} /><span class="p-label">Team</span></div>
			</div>
			<div class="p-main">
				<div class="p-head">
					<div>
						<div class="p-title">A clear view of your day.</div>
						<div class="p-sub">{longToday}</div>
					</div>
					<span class="p-btn"><Calendar size={11} /> Apply leave</span>
				</div>
				<div class="p-days">
					<span class="p-daynav"><ChevronLeft size={11} /></span>
					{#each week as d (d.wd + d.d)}
						<span class="p-day" class:on={d.on}><small>{d.wd}</small><strong>{d.d}</strong></span>
					{/each}
					<span class="p-daynav"><ChevronRight size={11} /></span>
				</div>
				<div class="p-card">
					<div class="p-card-head"><span>Today's timeline</span><span class="p-link">View full day ›</span></div>
					<div class="p-row"><span class="p-t">09:00</span><span class="p-dot ok"></span><span class="p-body"><strong>Shift started</strong><small>You checked in at 09:00. Have a great day!</small></span><span class="p-badge ok">On time</span></div>
					<div class="p-row"><span class="p-t">11:30</span><span class="p-dot acc"></span><span class="p-body"><strong>Product team sync</strong><small>30 min · Zoom</small></span><span class="p-btn sm"><Video size={10} /> Join</span></div>
					<div class="p-row"><span class="p-t">14:00</span><span class="p-dot warn"></span><span class="p-body"><strong>Review leave requests</strong><small>2 waiting</small></span><span class="p-spark" aria-hidden="true"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:90%"></i><i style="height:65%"></i></span></div>
					<div class="p-row"><span class="p-t">16:00</span><span class="p-dot"></span><span class="p-body"><strong>Wrap up</strong><small>Plan for tomorrow</small></span></div>
				</div>
			</div>
		</div>
	</aside>
</div>

<section class="ess-card summary">
	<div class="ess-card-head">
		<div>
			<h2 class="ess-h2">Current selection summary</h2>
			<p class="ess-caption">
				{changed.length === 0 ? 'Everything is at its shipped default. These settings apply to this browser only.' : `${changed.length} setting${changed.length === 1 ? '' : 's'} changed from default, in this browser only.`}
			</p>
		</div>
		<div class="summary-actions">
			<button type="button" class="ess-btn ess-btn--secondary" onclick={resetAll}><RotateCcw size={15} /> Reset defaults</button>
			<button type="button" class="ess-btn ess-btn--primary" onclick={copySummary}>
				{#if copied}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy summary{/if}
			</button>
		</div>
	</div>
	<div class="summary-grid">
		{#each TWEAKS as t (t.key)}
			{@const Icon = t.icon}
			<div class="sum" class:changed={current[t.key] != null}>
				<span class="setting-icon sm"><Icon size={16} strokeWidth={1.75} /></span>
				<span><small>{t.label}</small><strong>{optionLabel(t)}</strong></span>
			</div>
		{/each}
	</div>
	<p class="ess-help">Visit any page (Today, Leave, Team) with these applied to judge them in context — the settings follow you around the app.</p>
</section>

<style>
	.layout {
		margin-bottom: 20px;
		align-items: stretch;
	}
	.layout {
		--ess-aside-width: minmax(380px, 1.1fr);
	}

	/* ---------- settings ---------- */
	.settings {
		display: grid;
	}
	.setting {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: 14px;
		padding: 16px 0;
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.setting:last-child {
		border-bottom: none;
	}
	.setting-icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		color: var(--ess-text);
	}
	.setting-icon.sm {
		width: 32px;
		height: 32px;
	}
	.setting-text {
		display: grid;
		gap: 2px;
	}
	.setting-text strong {
		font-size: 15px;
		font-weight: 500;
	}
	.setting-text small {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-width: 120px;
		height: 42px;
		padding: 0 16px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition:
			border-color var(--ess-t-fast),
			background var(--ess-t-fast),
			color var(--ess-t-fast);
	}
	.choice:hover {
		border-color: var(--ess-border-strong);
		color: var(--ess-text);
	}
	.choice[aria-checked='true'] {
		border-color: var(--ess-primary);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.radio {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--ess-border-strong);
		background: var(--ess-surface);
		flex: none;
	}
	.choice[aria-checked='true'] .radio {
		border-color: var(--ess-primary);
		background: var(--ess-primary);
		box-shadow: inset 0 0 0 3px var(--ess-primary-soft);
	}

	/* ---------- preview miniature ----------
	   Uses the real tokens, re-resolved inside the miniature by the same
	   data-ess-* attributes, so Solid / Elevated / Sharp / Dark show here. */
	.preview-card {
		display: grid;
		grid-template-rows: auto 1fr;
	}
	.preview {
		--pc: var(--ess-canvas);
		--ps: var(--ess-surface);
		--pb: var(--ess-border);
		--pt: var(--ess-text);
		--pt2: var(--ess-text-secondary);
		--pt3: var(--ess-text-muted);
		--pa: var(--ess-primary);
		--pas: var(--ess-primary-soft);
		--pat: var(--ess-primary-text);
		--pr: var(--ess-radius-md);
		--prail: var(--ess-inverse);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		min-height: 420px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		overflow: hidden;
		background: var(--pc);
		color: var(--pt);
		font-size: 11px;
		line-height: 1.35;
		pointer-events: none;
		user-select: none;
	}
	.preview[data-theme='dark'] {
		--pc: #0f1222;
		--ps: #171a2e;
		--pb: rgba(255, 255, 255, 0.09);
		--pt: #f2f1f8;
		--pt2: rgba(242, 241, 248, 0.78);
		--pt3: rgba(242, 241, 248, 0.58);
		--pa: #8b7bff;
		--pas: rgba(139, 123, 255, 0.18);
		--pat: #b3a7ff;
		--prail: #12152a;
	}
	.preview[data-ess-corner='sharp'] {
		--pr: 4px;
	}
	.preview[data-ess-corner='round'] {
		--pr: 16px;
	}
	.preview[data-ess-card='solid'] .p-card,
	.preview[data-ess-card='solid'] .p-day {
		border-color: transparent;
		background: color-mix(in oklab, var(--pt) 4%, var(--ps));
	}
	.preview[data-ess-card='elevated'] .p-card,
	.preview[data-ess-card='elevated'] .p-day {
		border-color: transparent;
		box-shadow: 0 10px 24px -12px rgba(27, 31, 59, 0.25);
	}
	.preview[data-ess-density='compact'] .p-row {
		padding: 5px 0;
	}
	.preview[data-ess-density='compact'] .p-card {
		padding: 10px 12px;
	}
	.preview[data-ess-spark='off'] .p-spark {
		display: none;
	}
	.preview[data-ess-motion='reduced'] * {
		transition: none !important;
	}

	.p-rail {
		width: 118px;
		padding: 12px 8px;
		background: var(--prail);
		border-right: 1px solid var(--pb);
		display: grid;
		align-content: start;
		gap: 4px;
		transition: width var(--ess-t);
	}
	.p-rail.compact {
		width: 44px;
	}
	.p-rail.compact .p-label {
		display: none;
	}
	.p-rail.compact .p-nav,
	.p-rail.compact .p-brand {
		justify-content: center;
		padding: 0;
	}
	.p-brand {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 6px 10px;
		font-weight: 600;
		font-size: 12px;
	}
	.p-mark {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 5px;
		background: var(--pa);
		color: #fff;
		font-size: 8px;
		font-weight: 700;
	}
	.p-nav {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 26px;
		padding: 0 8px;
		border-radius: calc(var(--pr) * 0.7);
		color: var(--pt2);
	}
	.p-nav.on {
		background: var(--pas);
		color: var(--pat);
	}
	.p-main {
		padding: 16px 16px 12px;
		display: grid;
		align-content: start;
		gap: 12px;
	}
	.p-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.p-title {
		font-family: var(--ess-font-display);
		font-size: 19px;
		font-weight: 600;
		line-height: 1.1;
	}
	.p-sub {
		color: var(--pt2);
		margin-top: 2px;
	}
	.p-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 24px;
		padding: 0 9px;
		border-radius: calc(var(--pr) * 0.6);
		background: var(--pa);
		color: #fff;
		font-weight: 500;
		white-space: nowrap;
	}
	.p-btn.sm {
		height: 20px;
		padding: 0 7px;
		font-size: 10px;
	}
	.p-days {
		display: grid;
		grid-template-columns: 20px repeat(5, 1fr) 20px;
		gap: 5px;
	}
	.p-daynav {
		display: grid;
		place-items: center;
		color: var(--pt3);
	}
	.p-day {
		display: grid;
		justify-items: center;
		padding: 5px 0;
		border: 1px solid var(--pb);
		border-radius: calc(var(--pr) * 0.7);
		background: var(--ps);
		color: var(--pt3);
		font-size: 9px;
	}
	.p-day strong {
		font-family: var(--ess-font-display);
		font-size: 13px;
		color: var(--pt);
	}
	.p-day.on {
		background: var(--pas);
		border-color: var(--pas);
		color: var(--pat);
	}
	.p-day.on strong {
		color: var(--pat);
	}
	.p-card {
		padding: 12px 14px;
		border: 1px solid var(--pb);
		border-radius: var(--pr);
		background: var(--ps);
		display: grid;
	}
	.p-card-head {
		display: flex;
		justify-content: space-between;
		font-family: var(--ess-font-display);
		font-size: 13px;
		font-weight: 600;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--pb);
		margin-bottom: 4px;
	}
	.p-link {
		font-family: var(--ess-font-sans);
		font-size: 10px;
		font-weight: 500;
		color: var(--pat);
	}
	.p-row {
		display: grid;
		grid-template-columns: 32px 10px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		padding: 7px 0;
		border-bottom: 1px solid var(--pb);
		transition: padding var(--ess-t);
	}
	.p-row:last-child {
		border-bottom: none;
	}
	.p-t {
		color: var(--pt3);
		font-variant-numeric: tabular-nums;
	}
	.p-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--pt3);
	}
	.p-dot.ok {
		background: #157f52;
	}
	.p-dot.acc {
		background: var(--pa);
	}
	.p-dot.warn {
		background: #e0a526;
	}
	.p-body {
		display: grid;
		min-width: 0;
	}
	.p-body strong {
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.p-body small {
		font-size: 10px;
		color: var(--pt2);
	}
	.p-badge {
		padding: 2px 7px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
	}
	.p-badge.ok {
		background: #e6f6ee;
		color: #157f52;
	}
	.p-spark {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 16px;
		width: 36px;
	}
	.p-spark i {
		flex: 1;
		border-radius: 1px;
		background: var(--pa);
		opacity: 0.75;
	}

	/* ---------- summary ---------- */
	.summary-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
		margin-top: 6px;
	}
	.sum {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
	}
	.sum.changed {
		border-color: var(--ess-primary-soft);
		background: var(--ess-primary-softer);
	}
	.sum > span:last-child {
		display: grid;
		line-height: 1.25;
	}
	.sum small {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.sum strong {
		font-size: 14px;
		font-weight: 600;
	}
	.summary .ess-help {
		margin-top: 14px;
	}

	@media (max-width: 860px) {
		.setting {
			grid-template-columns: 40px minmax(0, 1fr);
		}
		.choices {
			grid-column: 2;
			justify-content: flex-start;
		}
		.choice {
			min-width: 0;
		}
	}
</style>
