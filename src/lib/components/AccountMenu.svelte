<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import PanelLeftDashed from '@lucide/svelte/icons/panel-left-dashed';

	/**
	 * The account menu: who you are, profile and password, then the look
	 * (light or dark, theme, text size, dock) and log out. Opened from the
	 * top bar's avatar, or from the sidebar's footer in themes that put the
	 * user there (Mono). `placement` says where it opens from its anchor.
	 */
	interface Props {
		fullName: string;
		/** What the person is here as ("Employee", "Administrator"). */
		roleLabel: string;
		/** Called when an item is chosen, so the opener can close the menu. */
		onclose?: () => void;
		placement?: 'below-end' | 'above-start' | 'beside-end';
	}

	let { fullName, roleLabel, onclose, placement = 'below-end' }: Props = $props();

	let theme = $state<'light' | 'dark'>('light');

	$effect(() => {
		theme = document.documentElement.getAttribute('data-ess-theme') === 'dark' ? 'dark' : 'light';
	});

	function setTheme(next: 'light' | 'dark') {
		theme = next;
		if (next === 'dark') document.documentElement.setAttribute('data-ess-theme', 'dark');
		else document.documentElement.removeAttribute('data-ess-theme');
		try {
			localStorage.setItem('essTheme', next);
		} catch {
			/* not remembered in private mode */
		}
	}

	/* The look: Original (no attribute) or a skin (ess-skin-*.css,
	   ess-skins.css), kept per browser and applied pre-paint by app.html. */
	type Skin = 'original' | 'mono' | 'atur' | 'amber';
	const SKINS: { id: Skin; label: string; note: string; swatch: [string, string, string]; soon?: boolean }[] = [
		{ id: 'original', label: 'Original', note: 'Default', swatch: ['#f5f5f7', '#ffffff', '#0071e3'] },
		{ id: 'mono', label: 'Mono', note: 'shadcn/ui', swatch: ['#ffffff', '#f5f5f5', '#171717'] },
		{ id: 'atur', label: 'Atur', note: 'Pastel blocks', swatch: ['#f3f4f7', '#ffe0f4', '#1c1d22'] },
		{ id: 'amber', label: 'Amber', note: 'Cream & yellow', swatch: ['#f8f4ec', '#ffca20', '#2055ff'] }
	];
	let skin = $state<Skin>('original');

	$effect(() => {
		const s = document.documentElement.getAttribute('data-ess-skin');
		skin = s === 'mono' || s === 'atur' || s === 'amber' ? s : 'original';
	});

	function setSkin(next: Skin) {
		skin = next;
		if (next === 'original') document.documentElement.removeAttribute('data-ess-skin');
		else document.documentElement.setAttribute('data-ess-skin', next);
		try {
			if (next === 'original') localStorage.removeItem('essSkin');
			else localStorage.setItem('essSkin', next);
		} catch {
			/* not remembered in private mode */
		}
	}

	/* Text size: a bar per step, each taller than the last. The choice is a
	   multiplier on the workspace zoom (--ess-text-scale, see .ess-shell). */
	const TEXT_STEPS = [0.9, 1, 1.1, 1.2, 1.3];
	let textStep = $state(1);

	/* The dock either floats (slides in from the left edge) or stays fixed. */
	let dock = $state<'floating' | 'fixed'>('floating');

	$effect(() => {
		const root = document.documentElement;
		const scale = parseFloat(root.style.getPropertyValue('--ess-text-scale')) || 1;
		const i = TEXT_STEPS.indexOf(scale);
		textStep = i === -1 ? 1 : i;
		dock = root.getAttribute('data-ess-dock') === 'fixed' ? 'fixed' : 'floating';
	});

	function setTextStep(i: number) {
		textStep = Math.max(0, Math.min(TEXT_STEPS.length - 1, i));
		const scale = TEXT_STEPS[textStep];
		const root = document.documentElement;
		if (scale === 1) root.style.removeProperty('--ess-text-scale');
		else root.style.setProperty('--ess-text-scale', String(scale));
		// Enlarged text: pages flow and scroll instead of fitting the screen.
		root.toggleAttribute('data-ess-flow', scale > 1);
		try {
			if (scale === 1) localStorage.removeItem('essTextScale');
			else localStorage.setItem('essTextScale', String(scale));
		} catch {
			/* not remembered in private mode */
		}
	}

	function setDock(next: 'floating' | 'fixed') {
		dock = next;
		if (next === 'fixed') document.documentElement.setAttribute('data-ess-dock', 'fixed');
		else document.documentElement.removeAttribute('data-ess-dock');
		try {
			localStorage.setItem('essDock', next);
		} catch {
			/* not remembered in private mode */
		}
	}
</script>

<div class="menu acct-menu" role="menu" data-placement={placement}>
	<div class="who">
		<strong>{fullName}</strong>
		<span>{roleLabel}</span>
	</div>
	<div class="menu-sep"></div>
	<a role="menuitem" href="/profile" onclick={() => onclose?.()}><User size={15} /> My profile</a>
	<a role="menuitem" href="/change-password" onclick={() => onclose?.()}><KeyRound size={15} /> Change password</a>
	<div class="menu-sep"></div>
	<div class="seg" role="group" aria-label="Appearance">
		<button type="button" aria-pressed={theme === 'light'} onclick={() => setTheme('light')}><Sun size={14} /> Light</button>
		<button type="button" aria-pressed={theme === 'dark'} onclick={() => setTheme('dark')}><Moon size={14} /> Dark</button>
	</div>
	<div class="pref">
		<span class="pref-label">Theme <b>{SKINS.find((s) => s.id === skin)?.label}</b></span>
		<div class="skins" role="group" aria-label="Theme">
			{#each SKINS as s (s.id)}
				<button
					type="button"
					class="skin"
					aria-pressed={skin === s.id}
					disabled={s.soon}
					title={s.soon ? `${s.label}: coming soon` : `${s.label}: ${s.note}`}
					onclick={() => setSkin(s.id)}
				>
					<span class="skin-preview" aria-hidden="true" style:background={s.swatch[0]}>
						<i style:background={s.swatch[1]}></i>
						<i style:background={s.swatch[2]}></i>
					</span>
					<span class="skin-name">{s.label}</span>
					<span class="skin-note">{s.note}</span>
				</button>
			{/each}
		</div>
	</div>
	<div class="pref">
		<span class="pref-label">Text size <b>{Math.round(TEXT_STEPS[textStep] * 100)}%</b></span>
		<div class="text-size" role="group" aria-label="Text size">
			<button type="button" class="ts-step sm" aria-label="Smaller text" disabled={textStep === 0} onclick={() => setTextStep(textStep - 1)}>A</button>
			<div class="bars">
				{#each TEXT_STEPS as s, i (s)}
					<button
						type="button"
						class="bar"
						class:on={i <= textStep}
						style="height: {36 + i * 16}%"
						aria-label="{Math.round(s * 100)}%"
						aria-pressed={i === textStep}
						onclick={() => setTextStep(i)}
					></button>
				{/each}
			</div>
			<button type="button" class="ts-step lg" aria-label="Larger text" disabled={textStep === TEXT_STEPS.length - 1} onclick={() => setTextStep(textStep + 1)}>A</button>
		</div>
	</div>
	<div class="pref">
		<span class="pref-label">Dock</span>
		<div class="seg" role="group" aria-label="Dock">
			<button type="button" aria-pressed={dock === 'floating'} onclick={() => setDock('floating')}><PanelLeftDashed size={14} /> Floating</button>
			<button type="button" aria-pressed={dock === 'fixed'} onclick={() => setDock('fixed')}><PanelLeft size={14} /> Fixed</button>
		</div>
	</div>
	<div class="menu-sep"></div>
	<form method="POST" action="/logout">
		<button type="submit" role="menuitem" class="logout"><LogOut size={15} /> Log out</button>
	</form>
</div>

<style>
	.menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 80;
		min-width: 264px;
		padding: 6px;
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		border-radius: 14px;
		box-shadow: var(--ess-elev-3);
		display: grid;
		gap: 2px;
	}
	.who {
		display: grid;
		padding: 6px 10px 4px;
		line-height: 1.3;
	}
	.who strong {
		font-size: 13.5px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who span {
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.menu a,
	.menu .logout {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--ess-text);
		font: inherit;
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
	}
	.menu a:hover,
	.menu .logout:hover {
		background: var(--ess-surface-hover);
	}
	.menu .logout:hover {
		color: var(--ess-danger);
	}
	.menu-sep {
		height: 1px;
		background: var(--ess-border);
		margin: 4px 0;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		background: var(--ess-sunken);
		border-radius: 9px;
	}
	.seg button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 0;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--ess-text-secondary);
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.seg button[aria-pressed='true'] {
		background: var(--ess-surface);
		color: var(--ess-primary-text);
		box-shadow: 0 1px 2px rgba(20, 22, 40, 0.08);
	}
	/* Dark mode: the raised surface was barely lighter than the track, so
	   Light / Dark (and Floating / Fixed) could not be told apart. The
	   chosen one is a solid pill in the theme's action colour instead. */
	:global([data-ess-theme='dark']) .seg {
		background: rgba(255, 255, 255, 0.06);
		box-shadow: inset 0 0 0 1px var(--ess-border);
	}
	:global([data-ess-theme='dark']) .seg button {
		color: var(--ess-text-muted);
	}
	:global([data-ess-theme='dark']) .seg button:hover:not([aria-pressed='true']) {
		color: var(--ess-text);
	}
	:global([data-ess-theme='dark']) .seg button[aria-pressed='true'] {
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
		font-weight: 600;
		box-shadow: 0 2px 8px -3px rgba(0, 0, 0, 0.6);
	}

	/* ---------- theme picker: four small cards with a colour preview ---------- */
	.skins {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.skin {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 8px;
		padding: 7px 8px;
		border: 1px solid var(--ess-border);
		border-radius: 10px;
		background: var(--ess-surface);
		color: var(--ess-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--ess-t-fast),
			background var(--ess-t-fast);
	}
	.skin:hover:not(:disabled) {
		background: var(--ess-surface-hover);
	}
	.skin[aria-pressed='true'] {
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 1px var(--ess-primary);
	}
	.skin:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.skin-preview {
		grid-row: 1 / 3;
		display: flex;
		align-items: flex-end;
		gap: 2px;
		width: 26px;
		height: 26px;
		padding: 4px;
		border-radius: 7px;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
	}
	.skin-preview i {
		flex: 1;
		height: 60%;
		border-radius: 2px;
	}
	.skin-preview i:last-child {
		height: 100%;
	}
	.skin-name {
		font-size: 12.5px;
		font-weight: 600;
		line-height: 1.2;
	}
	.skin-note {
		font-size: 11px;
		color: var(--ess-text-muted);
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---------- text size and dock, under the theme ---------- */
	.pref {
		display: grid;
		gap: 5px;
		padding: 6px 2px 0;
	}
	.pref-label {
		display: flex;
		justify-content: space-between;
		padding: 0 8px;
		font-size: 12px;
		color: var(--ess-text-muted);
	}
	.pref-label b {
		font-weight: 600;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.text-size {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: var(--ess-sunken);
		border-radius: 9px;
	}
	.ts-step {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--ess-text-secondary);
		font: inherit;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
	}
	.ts-step.sm {
		font-size: 11px;
	}
	.ts-step.lg {
		font-size: 16px;
	}
	.ts-step:hover:not(:disabled) {
		background: var(--ess-surface);
		color: var(--ess-text);
	}
	.ts-step:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.bars {
		flex: 1;
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 24px;
	}
	.bar {
		flex: 1;
		padding: 0;
		border: none;
		border-radius: 3px;
		background: color-mix(in srgb, var(--ess-text) 14%, transparent);
		cursor: pointer;
		transition: background var(--ess-t-fast);
	}
	.bar:hover {
		background: color-mix(in srgb, var(--ess-primary) 45%, transparent);
	}
	.bar.on {
		background: var(--ess-primary);
	}
	/* where it opens: under the top-bar avatar (default), above the
	   sidebar footer, or beside a collapsed sidebar footer */
	.menu[data-placement='above-start'] {
		top: auto;
		right: auto;
		bottom: calc(100% + 8px);
		left: 0;
	}
	.menu[data-placement='beside-end'] {
		top: auto;
		right: auto;
		bottom: 0;
		left: calc(100% + 12px);
	}
</style>
