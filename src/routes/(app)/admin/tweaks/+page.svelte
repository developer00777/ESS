<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	/**
	 * Each tweak maps to a data-* attribute on <html>. `null` means "don't set
	 * the attribute" — i.e. the shipped default, so the panel's default state is
	 * exactly what employees see.
	 */
	type Tweak = {
		key: string;
		attr: string;
		label: string;
		hint: string;
		options: { value: string | null; label: string }[];
	};

	const TWEAKS: Tweak[] = [
		{
			key: 'palette',
			attr: 'data-ess-theme',
			label: 'Palette',
			hint: 'Also switchable from the sidebar — employees keep their own choice.',
			options: [
				{ value: null, label: 'Light' },
				{ value: 'dark', label: 'Dark' }
			]
		},
		{
			key: 'shell',
			attr: 'data-ess-shell',
			label: 'Nav shell',
			hint: 'Also switchable from the collapse button in the sidebar.',
			options: [
				{ value: null, label: 'Classic' },
				{ value: 'rail', label: 'Rail' }
			]
		},
		{
			key: 'card',
			attr: 'data-ess-card',
			label: 'Card surface',
			hint: 'Applies to cards, panels, stat cards and table shells.',
			options: [
				{ value: null, label: 'Glass' },
				{ value: 'outline', label: 'Outline' },
				{ value: 'solid', label: 'Solid' },
				{ value: 'elevated', label: 'Elevated' }
			]
		},
		{
			key: 'corner',
			attr: 'data-ess-corner',
			label: 'Corner radius',
			hint: 'Global radius scale.',
			options: [
				{ value: 'sharp', label: 'Sharp' },
				{ value: null, label: 'Soft' },
				{ value: 'round', label: 'Round' }
			]
		},
		{
			key: 'density',
			attr: 'data-ess-density',
			label: 'Density',
			hint: 'Padding and figure size in stat cards and table rows.',
			options: [
				{ value: null, label: 'Comfortable' },
				{ value: 'compact', label: 'Compact' }
			]
		},
		{
			key: 'glow',
			attr: 'data-ess-glow',
			label: 'Ambient glow',
			hint: 'Background gradient intensity and heading glow.',
			options: [
				{ value: 'subtle', label: 'Subtle' },
				{ value: null, label: 'Medium' },
				{ value: 'intense', label: 'Intense' }
			]
		},
		{
			key: 'stars',
			attr: 'data-ess-stars',
			label: 'Starfield',
			hint: 'The drifting star layer behind every page.',
			options: [
				{ value: null, label: 'On' },
				{ value: 'off', label: 'Off' }
			]
		},
		{
			key: 'depth',
			attr: 'data-ess-depth',
			label: 'Hover depth',
			hint: 'The lift effect on cards. Always off under reduced-motion.',
			options: [
				{ value: null, label: 'On' },
				{ value: 'off', label: 'Off' }
			]
		},
		{
			key: 'spark',
			attr: 'data-ess-spark',
			label: 'Sparklines',
			hint: 'Trend charts inside KPI cards.',
			options: [
				{ value: null, label: 'On' },
				{ value: 'off', label: 'Off' }
			]
		}
	];

	const STORAGE_KEY = 'essTweaks';

	let current = $state<Record<string, string | null>>({});
	let copied = $state(false);

	$effect(() => {
		// Read whatever is already on <html> so the panel reflects reality,
		// including the palette/shell the user picked from the sidebar.
		const root = document.documentElement;
		const next: Record<string, string | null> = {};
		for (const t of TWEAKS) next[t.key] = root.getAttribute(t.attr);
		current = next;
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

	/** The non-default choices, as the CSS/markup change needed to ship them. */
	const changed = $derived(
		TWEAKS.filter((t) => current[t.key] != null).map((t) => ({
			label: t.label,
			attr: t.attr,
			value: current[t.key],
			optionLabel: t.options.find((o) => o.value === current[t.key])?.label ?? current[t.key]
		}))
	);

	async function copySummary() {
		const text =
			changed.length === 0
				? 'All tweaks at their shipped defaults.'
				: changed.map((c) => `${c.label}: ${c.optionLabel}  →  ${c.attr}="${c.value}"`).join('\n');
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1800);
	}
</script>

<svelte:head>
	<title>Design Tweaks — Champ HR ESS Portal</title>
</svelte:head>

<header class="page-header">
	<h1 class="ess-page-title">Design Tweaks</h1>
	<p class="ess-page-sub">
		Preview the Cosmic design variants against real screens. Changes apply to your browser only —
		employees are unaffected. Once you've settled on a look, share the summary and it gets baked in
		as the default.
	</p>
</header>

<div class="tweak-grid">
	{#each TWEAKS as tweak (tweak.key)}
		<div class="ess-card tweak">
			<div class="tweak-head">
				<span class="ess-h3">{tweak.label}</span>
				<span class="ess-caption">{tweak.hint}</span>
			</div>
			<div class="ess-segmented tweak-options">
				{#each tweak.options as opt (opt.label)}
					<button
						type="button"
						aria-pressed={current[tweak.key] === opt.value}
						onclick={() => apply(tweak, opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>

<div class="ess-panel summary">
	<div class="summary-head">
		<div>
			<span class="ess-h3">Current selection</span>
			<p class="ess-caption">
				{changed.length === 0
					? 'Everything is at its shipped default.'
					: `${changed.length} tweak${changed.length === 1 ? '' : 's'} changed from default.`}
			</p>
		</div>
		<div class="summary-actions">
			<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={copySummary}>
				{#if copied}<Check size={14} />Copied{:else}<Copy size={14} />Copy summary{/if}
			</button>
			<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={resetAll}>
				<RotateCcw size={14} />
				Reset
			</button>
		</div>
	</div>

	{#if changed.length > 0}
		<ul class="summary-list">
			{#each changed as c (c.attr)}
				<li>
					<strong>{c.label}:</strong>
					{c.optionLabel}
					<code>{c.attr}="{c.value}"</code>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="ess-caption footnote">
		Visit any page (Dashboard, Leave, Team) with these applied to judge them in context — the
		settings follow you around the app.
	</p>
</div>

<style>
	.page-header {
		margin-bottom: 1.5rem;
		max-width: 720px;
	}

	.tweak-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 14px;
		margin-bottom: 1.5rem;
	}

	.tweak {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		justify-content: space-between;
	}

	.tweak-head {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.tweak-options {
		flex-wrap: wrap;
		align-self: flex-start;
	}

	.summary {
		max-width: 900px;
	}

	.summary-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.summary-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.summary-list {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		font-size: var(--ess-fs-body);
	}

	.summary-list code {
		font-family: var(--ess-font-mono);
		font-size: var(--ess-fs-caption);
		background: var(--ess-sunken);
		padding: 0.15rem 0.45rem;
		border-radius: 6px;
		margin-left: 0.4rem;
	}

	.footnote {
		margin-top: 1rem;
	}
</style>
