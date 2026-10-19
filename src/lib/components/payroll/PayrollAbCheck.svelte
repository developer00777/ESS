<script lang="ts">
	/**
	 * Payroll → A/B check. While HR still makes the salary report by hand, the
	 * manual file is uploaded here and compared with the portal's own figures
	 * (before any manual edits) for the same month: who is on each sheet, and
	 * every figure, employee by employee. The accuracy over time shows when
	 * the portal can be trusted alone. A difference can be settled by taking
	 * the manual value, which becomes a manual edit on that sheet.
	 */
	import Upload from '@lucide/svelte/icons/upload';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Info from '@lucide/svelte/icons/info';
	import type { ReconResult, ReconSheetResult } from '$lib/server/payroll-reconcile';

	let { cycleKey, label, canManage }: { cycleKey: string; label: string; canManage: boolean } = $props();

	type Run = { id: string; fileName: string; createdAt: string; by: string | null; compared: number; matched: number; accuracy: number };
	type Loaded = { id: string; fileName: string; createdAt: string; result: ReconResult };

	let runs = $state<Run[]>([]);
	let current = $state<Loaded | null>(null);
	let file = $state<File | null>(null);
	let uploading = $state(false);
	let error = $state('');
	let sheetFilter = $state('');
	let columnFilter = $state('');
	let query = $state('');
	let accepted = $state(new Set<string>());
	let accepting = $state(false);
	let flash = $state('');

	async function loadRuns() {
		const res = await fetch(`/api/payroll/reconcile?cycle=${cycleKey}`);
		if (res.ok) runs = (await res.json()).runs;
		if (!current && runs[0]) await open(runs[0].id);
	}
	async function open(id: string) {
		const res = await fetch(`/api/payroll/reconcile?id=${id}`);
		if (res.ok) {
			current = await res.json();
			accepted = new Set();
			sheetFilter = '';
			columnFilter = '';
		}
	}
	$effect(() => {
		current = null;
		runs = [];
		void loadRuns();
	});

	async function compare(e: SubmitEvent) {
		e.preventDefault();
		// Held now: after the upload's await the event no longer points at the form.
		const form = e.currentTarget as HTMLFormElement;
		if (!file) return;
		uploading = true;
		error = '';
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`/api/payroll/reconcile?cycle=${cycleKey}`, { method: 'POST', body: fd });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message ?? 'Could not compare that file');
			current = body;
			accepted = new Set();
			file = null;
			form.reset();
			await loadRuns();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			uploading = false;
		}
	}

	const r = $derived(current?.result ?? null);
	const sheets = $derived(r?.sheets ?? []);
	const shown = $derived(sheetFilter ? sheets.filter((s) => s.sheet === sheetFilter) : sheets);
	const columns = $derived([...new Map(shown.flatMap((s) => s.columns.filter((c) => c.mismatched).map((c) => [c.label, c]))).values()]);
	const key = (s: string, m: { code: string; column: string }) => `${s}|${m.code}|${m.column}`;
	const mismatches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return shown.flatMap((s) =>
			s.mismatches
				.filter((m) => (!columnFilter || m.label === columnFilter) && (!q || m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)))
				.map((m) => ({ ...m, sheet: s.sheet, title: s.title }))
		);
	});
	const pct = (m: number, c: number) => (c ? Math.round((m / c) * 1000) / 10 : 100);
	const tone = (p: number) => (p >= 100 ? 'ok' : p >= 95 ? 'warn' : 'bad');

	async function accept(list: { sheet: string; rowKey?: string; portalColumn?: string; value?: string; portal: string; code: string; column: string }[]) {
		const usable = list.filter((m) => m.rowKey && m.portalColumn && !accepted.has(key(m.sheet, m)));
		if (!usable.length) return;
		accepting = true;
		error = '';
		try {
			const bySheet = new Map<string, typeof usable>();
			for (const m of usable) bySheet.set(m.sheet, [...(bySheet.get(m.sheet) ?? []), m]);
			for (const [sheet, items] of bySheet) {
				const res = await fetch('/api/payroll/sheet', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						cycle: cycleKey,
						sheet,
						op: 'batch',
						edits: items.map((m) => ({ rowKey: m.rowKey, column: m.portalColumn, value: m.value ?? '', original: m.portal }))
					})
				});
				if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Could not save');
			}
			const next = new Set(accepted);
			for (const m of usable) next.add(key(m.sheet, m));
			accepted = next;
			flash = `${usable.length} manual ${usable.length === 1 ? 'value' : 'values'} now used in the download. The accuracy score still measures the portal's own figures.`;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			accepting = false;
		}
	}

	const sheetMismatches = (s: ReconSheetResult) => s.mismatches.map((m) => ({ ...m, sheet: s.sheet }));
	const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<div class="ab">
	<section class="ess-card upload">
		<div class="intro">
			<h3>Compare with the manual report</h3>
			<p>
				Upload the salary report HR made by hand for {label} — the whole workbook (Leave Balance, HR Comments, To Be Paid, LOP, Stop
				Salary, Payroll Attendance) or one sheet as .csv. Each sheet is matched by name, each employee by code, and every figure is
				compared with the portal's own computation. Keep making the manual report until the portal matches it in full.
			</p>
		</div>
		<form onsubmit={compare} class="form">
			<input class="ess-input" type="file" accept=".xlsx,.csv" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} aria-label="Manual report file" />
			<button type="submit" class="ess-btn ess-btn--primary" disabled={!file || uploading}><Upload size={15} /> {uploading ? 'Comparing…' : 'Compare'}</button>
		</form>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
	</section>

	{#if r && current}
		<section class="ess-card verdict tone-{tone(r.accuracy)}">
			<div class="score">
				<span class="pct">{r.accuracy}%</span>
				<span class="lbl">match · {r.matched.toLocaleString()} of {r.compared.toLocaleString()} cells</span>
			</div>
			<div class="what">
				{#if r.accuracy >= 100}
					<p><CheckCircle2 size={16} /> The portal matches <strong>{current.fileName}</strong> in every compared cell. When this holds month after month, the manual report can stop.</p>
				{:else}
					<p><TriangleAlert size={16} /> {(r.compared - r.matched).toLocaleString()} differences with <strong>{current.fileName}</strong>. Keep making the manual report in parallel; settle each difference below by fixing the source data, or by taking the manual value.</p>
				{/if}
				<p class="when">Checked {fmtWhen(current.createdAt)}</p>
			</div>
		</section>

		{#if flash}<div class="ess-notice ess-notice--success"><span class="ess-notice__icon"><CheckCircle2 size={15} /></span><div class="ess-notice__body">{flash}</div></div>{/if}
		{#if r.notes.length}
			<div class="ess-notice ess-notice--info">
				<span class="ess-notice__icon"><Info size={15} /></span>
				<div class="ess-notice__body"><ul>{#each r.notes as n (n)}<li>{n}</li>{/each}</ul></div>
			</div>
		{/if}

		<div class="sheets">
			{#each sheets as s (s.sheet)}
				{@const p = pct(s.matched, s.compared)}
				<button type="button" class="ess-card sheet tone-{tone(p)}" class:on={sheetFilter === s.sheet} onclick={() => { sheetFilter = sheetFilter === s.sheet ? '' : s.sheet; columnFilter = ''; }}>
					<span class="t">{s.title}</span>
					<span class="p">{p}%</span>
					<span class="d">{s.compared - s.matched} differences · "{s.manualSheet}"</span>
					{#if s.onlyInPortal.length || s.onlyInManual.length}
						<span class="d">{s.onlyInPortal.length} only in portal · {s.onlyInManual.length} only in manual</span>
					{/if}
				</button>
			{/each}
		</div>

		{#each shown as s (s.sheet)}
			{#if s.onlyInPortal.length || s.onlyInManual.length}
				<details class="ess-card who">
					<summary>{s.title}: {s.onlyInPortal.length} on the portal's sheet only, {s.onlyInManual.length} on the manual sheet only</summary>
					<div class="lists">
						<div><h4>Only in the portal</h4><p>{s.onlyInPortal.map((x) => `${x.code} ${x.name}`.trim()).join(', ') || '—'}</p></div>
						<div><h4>Only in the manual report</h4><p>{s.onlyInManual.map((x) => `${x.code} ${x.name}`.trim()).join(', ') || '—'}</p></div>
					</div>
				</details>
			{/if}
		{/each}

		<section class="ess-card diffs">
			<div class="diff-tools">
				<select class="ess-select" bind:value={columnFilter} aria-label="Column">
					<option value="">All columns</option>
					{#each columns as c (c.label)}<option value={c.label}>{c.label} · {c.mismatched}</option>{/each}
				</select>
				<input class="ess-input" type="search" placeholder="Employee code or name" bind:value={query} aria-label="Find employee" />
				<span class="spacer"></span>
				{#if canManage && mismatches.some((m) => m.rowKey && m.portalColumn && !accepted.has(key(m.sheet, m)))}
					<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={accepting} onclick={() => accept(mismatches)}>
						Use manual values for all {mismatches.length} shown
					</button>
				{/if}
			</div>
			<div class="ess-table-shell ess-scroll table">
				<table class="ess-table">
					<thead><tr><th>Sheet</th><th>Employee</th><th>Column</th><th>Portal</th><th>Manual</th><th>Behind it</th>{#if canManage}<th></th>{/if}</tr></thead>
					<tbody>
						{#each mismatches.slice(0, 600) as m (`${m.sheet}|${m.code}|${m.column}`)}
							<tr class:done={accepted.has(key(m.sheet, m))}>
								<td>{m.title}</td>
								<td><strong>{m.name || '—'}</strong><span class="code">{m.code}</span></td>
								<td>{m.label}</td>
								<td class="v">{m.portal || '(blank)'}</td>
								<td class="v man">{m.manual || '(blank)'}</td>
								<td class="detail">{m.detail ?? ''}</td>
								{#if canManage}
									<td>
										{#if accepted.has(key(m.sheet, m))}
											<span class="ok">Using manual</span>
										{:else if m.rowKey && m.portalColumn}
											<button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" disabled={accepting} onclick={() => accept([m])}>Use manual value</button>
										{/if}
									</td>
								{/if}
							</tr>
						{:else}
							<tr><td colspan="7" class="empty">{sheets.length ? 'No differences here.' : ''}</td></tr>
						{/each}
					</tbody>
				</table>
				{#if mismatches.length > 600}<p class="more">Showing 600 of {mismatches.length}. Narrow by sheet, column or employee.</p>{/if}
			</div>
		</section>
	{:else if !uploading}
		<section class="ess-card empty-state">No manual report has been compared for {label} yet.</section>
	{/if}

	{#if runs.length}
		<section class="ess-card history">
			<h3>Checks for {label}</h3>
			<table class="ess-table">
				<thead><tr><th>When</th><th>File</th><th>By</th><th class="ess-num">Cells</th><th class="ess-num">Match</th><th></th></tr></thead>
				<tbody>
					{#each runs as run (run.id)}
						<tr class:on={current?.id === run.id}>
							<td>{fmtWhen(run.createdAt)}</td><td>{run.fileName}</td><td>{run.by ?? '—'}</td>
							<td class="ess-num">{run.compared.toLocaleString()}</td>
							<td class="ess-num"><span class="badge tone-{tone(run.accuracy)}">{run.accuracy}%</span></td>
							<td><button type="button" class="ess-btn ess-btn--ghost ess-btn--sm" onclick={() => open(run.id)}>Open</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>

<style>
	.ab {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 16px;
	}
	.ess-card {
		padding: 16px 18px;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 15px;
	}
	.intro p {
		margin: 0;
		font-size: 13px;
		color: var(--ess-text-secondary);
		max-width: 110ch;
	}
	.form {
		display: flex;
		gap: 10px;
		margin-top: 12px;
		align-items: center;
	}
	.form .ess-input {
		max-width: 420px;
	}
	.err {
		margin: 8px 0 0;
		color: var(--ess-danger);
		font-size: 13px;
	}
	.verdict {
		display: flex;
		gap: 24px;
		align-items: center;
		border-left: 4px solid var(--tone);
	}
	.tone-ok {
		--tone: var(--ess-success);
	}
	.tone-warn {
		--tone: var(--ess-warning);
	}
	.tone-bad {
		--tone: var(--ess-danger);
	}
	.score {
		display: flex;
		flex-direction: column;
		min-width: 170px;
	}
	.pct {
		font-family: var(--ess-font-display);
		font-size: 40px;
		font-weight: 700;
		color: var(--tone);
		line-height: 1;
	}
	.lbl,
	.when {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.what p {
		margin: 0;
		display: flex;
		gap: 8px;
		align-items: flex-start;
		font-size: 13.5px;
	}
	.what p.when {
		margin-top: 6px;
	}
	.sheets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 10px;
	}
	.sheet {
		all: unset;
		box-sizing: border-box;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 14px;
		border: 1px solid var(--ess-border);
		border-top: 3px solid var(--tone);
		border-radius: var(--ess-radius-md);
		background: var(--ess-surface);
	}
	.sheet.on {
		outline: 2px solid var(--ess-primary);
	}
	.sheet .t {
		font-weight: 600;
		font-size: 13px;
	}
	.sheet .p {
		font-size: 22px;
		font-weight: 700;
		color: var(--tone);
	}
	.sheet .d {
		font-size: 11.5px;
		color: var(--ess-text-secondary);
	}
	.who summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
	}
	.lists {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 8px;
		font-size: 12.5px;
	}
	.lists h4 {
		margin: 0 0 4px;
		font-size: 12px;
	}
	.lists p {
		margin: 0;
		color: var(--ess-text-secondary);
	}
	.diff-tools {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-bottom: 10px;
	}
	.diff-tools .ess-select,
	.diff-tools .ess-input {
		max-width: 260px;
	}
	.spacer {
		flex: 1;
	}
	.table {
		max-height: 520px;
	}
	.code {
		display: block;
		font-family: var(--ess-font-mono);
		font-size: 11px;
		color: var(--ess-text-muted);
	}
	.v {
		font-variant-numeric: tabular-nums;
	}
	.man {
		color: var(--ess-primary-text);
		font-weight: 600;
	}
	.detail {
		font-size: 11.5px;
		color: var(--ess-text-secondary);
		white-space: normal;
		max-width: 300px;
	}
	tr.done td {
		opacity: 0.6;
	}
	.ok {
		color: var(--ess-success);
		font-size: 12px;
		font-weight: 600;
	}
	.more,
	.empty,
	.empty-state {
		text-align: center;
		color: var(--ess-text-secondary);
		font-size: 13px;
	}
	.history tr.on td {
		background: var(--ess-primary-softer);
	}
	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-weight: 700;
		color: var(--tone);
		background: color-mix(in srgb, var(--tone) 12%, transparent);
	}
	ul {
		margin: 0;
		padding-left: 18px;
	}
</style>
