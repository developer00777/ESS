<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Download from '@lucide/svelte/icons/download';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Info from '@lucide/svelte/icons/info';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Car from '@lucide/svelte/icons/car';
	import Moon from '@lucide/svelte/icons/moon';
	import CabMap from '$lib/components/cabs/CabMap.svelte';
	import { clockLabel } from '$lib/cabs/clock';
	import { DEFAULT_SETTINGS, type DayPlan, type Flag, type Run } from '$lib/cabs/types';

	type Result = {
		filename: string;
		sheet: {
			tabs: Record<'riders' | 'cabs' | 'oneOffs' | 'settings', string | null>;
			skippedRows: { tab: string; row: number; reason: string }[];
			unmappedHeaders: { tab: string; header: string }[];
		};
		plan: DayPlan;
		hexes: { cell: string; boundary: [number, number][]; riderIds: string[] }[];
	};

	const today = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	let file = $state<File | null>(null);
	let date = $state(today());
	let settings = $state({ office: '', nightStart: '', nightEnd: '', maxMergeWaitMin: '', maxRideMin: '', serviceRadiusKm: '' });
	let busy = $state(false);
	let exporting = $state(false);
	let errorMsg = $state('');
	let result = $state<Result | null>(null);

	type View = 'map' | 'roster' | 'cabs';
	let view = $state<View>('roster');
	let runFilter = $state<string>('');
	let showPins = $state(true);
	let focusTrip = $state<string | null>(null);

	function onFileChange(e: Event) {
		file = (e.target as HTMLInputElement).files?.[0] ?? null;
		errorMsg = '';
	}

	function buildForm(): FormData {
		const form = new FormData();
		form.set('file', file!);
		form.set('date', date);
		form.set('settings', JSON.stringify(settings));
		return form;
	}

	async function messageOf(res: Response): Promise<string> {
		try {
			const body = await res.json();
			return body.message ?? 'Something went wrong';
		} catch {
			return 'Something went wrong';
		}
	}

	async function runPlan(e?: SubmitEvent) {
		e?.preventDefault();
		if (!file) return;
		busy = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/admin/cabs/plan', { method: 'POST', body: buildForm() });
			if (!res.ok) {
				errorMsg = await messageOf(res);
				return;
			}
			result = await res.json();
			runFilter = '';
			focusTrip = null;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Planning failed';
		} finally {
			busy = false;
		}
	}

	async function exportRoster() {
		if (!file) return;
		exporting = true;
		try {
			const res = await fetch('/api/admin/cabs/export', { method: 'POST', body: buildForm() });
			if (!res.ok) {
				errorMsg = await messageOf(res);
				return;
			}
			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = `cab-roster-${date}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			exporting = false;
		}
	}

	const plan = $derived(result?.plan ?? null);
	const effective = $derived(plan?.settings ?? DEFAULT_SETTINGS);
	const trips = $derived(plan ? plan.runs.flatMap((r) => r.trips) : []);
	const riderById = $derived(new Map((plan?.riders ?? []).map((r) => [r.id, r])));
	const seatedCount = $derived(trips.reduce((n, t) => n + t.stops.length, 0));
	const redCount = $derived(plan ? plan.flags.filter((f) => f.severity === 'bad').length : 0);
	const cabsUsed = $derived(new Set(trips.map((t) => t.cabId)).size);
	const flagsBySeverity = $derived({
		bad: plan?.flags.filter((f) => f.severity === 'bad') ?? [],
		warn: plan?.flags.filter((f) => f.severity === 'warn') ?? [],
		info: plan?.flags.filter((f) => f.severity === 'info') ?? []
	});
	const flagsForTrip = (tripId: string) => (plan?.flags ?? []).filter((f) => f.tripId === tripId && f.severity !== 'info');

	const RUN_TOKENS = ['--ess-ev-blue', '--ess-ev-green', '--ess-ev-purple', '--ess-ev-pink', '--ess-ev-yellow', '--ess-primary'];
	const tokenFor = (run: Run) => RUN_TOKENS[(plan?.runs.indexOf(run) ?? 0) % RUN_TOKENS.length];
	const colorOf = (run: Run) => getComputedStyle(document.documentElement).getPropertyValue(tokenFor(run)).trim();

	const SEVERITY_LABEL: Record<Flag['severity'], string> = { bad: 'Red flag', warn: 'Check', info: 'Note' };
	const SEVERITY_BADGE: Record<Flag['severity'], string> = { bad: 'ess-badge--bad', warn: 'ess-badge--warn', info: 'ess-badge--info' };

	function openFlag(f: Flag) {
		if (!f.tripId && !f.runId) return;
		view = 'roster';
		focusTrip = f.tripId;
		const target = f.tripId ?? f.runId;
		requestAnimationFrame(() => document.getElementById(`cab-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	}

	const runTitle = (r: Run) => (r.slots.length > 1 ? `${clockLabel(r.depart)} run · ${r.slots.map(clockLabel).join(' + ')} merged` : `${clockLabel(r.depart)} run`);
</script>

<svelte:head>
	<title>Cab planner — Champ HR</title>
</svelte:head>

<div class="ess-split page ess-fill">
	<div class="ess-stack main-col">
		<section class="ess-card" aria-labelledby="sheet-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="sheet-h">HR's cab sheet</h2>
				<a class="ess-btn ess-btn--ghost ess-btn--sm" href="/api/admin/cabs/template" download><Download size={15} /> Template</a>
			</div>

			<form class="upload-form" onsubmit={runPlan}>
				<label class="file-drop" class:has-file={!!file}>
					<span class="ess-tile" class:ess-tile--ok={!!file}>
						{#if file}<FileSpreadsheet size={20} strokeWidth={1.75} />{:else}<UploadCloud size={20} strokeWidth={1.75} />{/if}
					</span>
					<span class="file-text">
						<strong>{file ? file.name : 'Choose the cab sheet'}</strong>
						<span>{file ? `${(file.size / 1024).toFixed(0)} KB · .xlsx` : 'Riders, Cabs, One-offs and Settings tabs'}</span>
					</span>
					<span class="ess-btn ess-btn--secondary ess-btn--sm">{file ? 'Replace' : 'Browse'}</span>
					<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={onFileChange} />
				</label>
				<label class="ess-field date-field">
					<span class="ess-label">Plan for</span>
					<input class="ess-input" type="date" bind:value={date} />
				</label>
				<button type="submit" class="ess-btn ess-btn--primary" disabled={!file || busy}>{busy ? 'Planning…' : 'Plan cabs'}</button>
			</form>

			<details class="settings">
				<summary>Rules and settings</summary>
				<p class="ess-help">Blank fields use the sheet's Settings tab, then these defaults. Pins stay in this request only; nothing is saved.</p>
				<div class="settings-grid">
					<label class="ess-field office">
						<span class="ess-label">Office pin</span>
						<input class="ess-input" placeholder={effective.office ? `${effective.office.lat}, ${effective.office.lng}` : 'lat, lng or Maps link'} bind:value={settings.office} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Night starts</span>
						<input class="ess-input" placeholder={clockLabel(effective.nightStart)} bind:value={settings.nightStart} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Night ends</span>
						<input class="ess-input" placeholder={clockLabel(effective.nightEnd)} bind:value={settings.nightEnd} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Max wait to share (min)</span>
						<input class="ess-input" inputmode="numeric" placeholder={String(effective.maxMergeWaitMin)} bind:value={settings.maxMergeWaitMin} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Max ride (min)</span>
						<input class="ess-input" inputmode="numeric" placeholder={String(effective.maxRideMin)} bind:value={settings.maxRideMin} />
					</label>
					<label class="ess-field">
						<span class="ess-label">Service radius (km)</span>
						<input class="ess-input" inputmode="numeric" placeholder={String(effective.serviceRadiusKm)} bind:value={settings.serviceRadiusKm} />
					</label>
				</div>
				<ul class="rules">
					<li>Women are seated first. Anyone without a seat claims that day's Ola, Uber or Rapido at actuals.</li>
					<li>No woman is the last drop alone at night without a guard. The guard takes a seat.</li>
					<li>Cabs follow shifts. Nobody leaves early; an earlier rider may wait up to the cap to share.</li>
					<li>No single-passenger trip where a merge is possible.</li>
					<li>One-offs (errand, new joiner, late stay) fit around the roster.</li>
				</ul>
			</details>

			{#if errorMsg}
				<p class="ess-error msg"><AlertTriangle size={15} /> {errorMsg}</p>
			{/if}

			{#if result && (result.sheet.skippedRows.length || result.sheet.unmappedHeaders.length)}
				<div class="ess-notice ess-notice--info notice">
					<span class="ess-notice__icon"><Info size={15} /></span>
					<div class="ess-notice__body">
						{#if result.sheet.skippedRows.length}
							<strong>{result.sheet.skippedRows.length} row(s) skipped.</strong>
							{result.sheet.skippedRows.slice(0, 6).map((s) => `${s.tab} row ${s.row}: ${s.reason}`).join('; ')}{result.sheet.skippedRows.length > 6 ? '…' : ''}
						{/if}
						{#if result.sheet.unmappedHeaders.length}
							Columns not used: {result.sheet.unmappedHeaders.map((h) => `${h.header} (${h.tab})`).join(', ')}.
						{/if}
					</div>
				</div>
			{/if}
		</section>

		{#if plan && result}
			<section class="ess-card" aria-labelledby="plan-h">
				<div class="ess-card-head">
					<h2 class="ess-h2" id="plan-h">Suggested roster</h2>
					<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" onclick={exportRoster} disabled={exporting}>
						<Download size={15} />
						{exporting ? 'Preparing…' : 'Export .xlsx'}
					</button>
				</div>

				<div class="ess-figures figures">
					<div class="ess-figure">
						<span class="ess-figure__dot" class:ess-figure__dot--ok={seatedCount === plan.riders.length} class:ess-figure__dot--bad={seatedCount < plan.riders.length}></span>
						<div><span class="ess-figure__value">{seatedCount}/{plan.riders.length}</span><br /><span class="ess-figure__label">Riders seated</span></div>
					</div>
					<div class="ess-figure">
						<span class="ess-figure__dot ess-figure__dot--neutral"></span>
						<div><span class="ess-figure__value">{plan.runs.length}</span><br /><span class="ess-figure__label">Runs, {trips.length} trips</span></div>
					</div>
					<div class="ess-figure">
						<span class="ess-figure__dot ess-figure__dot--neutral"></span>
						<div><span class="ess-figure__value">{cabsUsed}/{plan.cabs.length}</span><br /><span class="ess-figure__label">Cabs used</span></div>
					</div>
					<div class="ess-figure">
						<span class="ess-figure__dot" class:ess-figure__dot--ok={redCount === 0} class:ess-figure__dot--bad={redCount > 0}></span>
						<div><span class="ess-figure__value">{redCount}</span><br /><span class="ess-figure__label">Red flags</span></div>
					</div>
				</div>

				<div class="toolbar">
					<div class="ess-tabs" role="tablist" aria-label="Show">
						<button type="button" role="tab" class="ess-tab" aria-selected={view === 'roster'} onclick={() => (view = 'roster')}>Roster</button>
						<button type="button" role="tab" class="ess-tab" aria-selected={view === 'map'} onclick={() => (view = 'map')}>Map</button>
						<button type="button" role="tab" class="ess-tab" aria-selected={view === 'cabs'} onclick={() => (view = 'cabs')}>Cabs</button>
					</div>
					{#if view === 'map'}
						<div class="map-controls">
							<select class="ess-select" bind:value={runFilter} aria-label="Run">
								<option value="">All runs</option>
								{#each plan.runs as r (r.id)}<option value={r.id}>{runTitle(r)}</option>{/each}
							</select>
							<label class="check"><input type="checkbox" bind:checked={showPins} /> Exact pins</label>
						</div>
					{/if}
				</div>

				{#if view === 'map'}
					<CabMap {plan} hexes={result.hexes} runId={runFilter || null} {showPins} {colorOf} />
					<div class="legend">
						{#each plan.runs as r (r.id)}
							<span><i style="background: var({tokenFor(r)})"></i>{runTitle(r)}</span>
						{/each}
						<span class="muted">Dashed line: night trip with no guard. Shaded hexes: H3 areas, about 0.7 km² each.</span>
					</div>
				{:else if view === 'roster'}
					<div class="runs">
						{#each plan.runs as r (r.id)}
							<div class="run" id="cab-{r.id}">
								<h3 class="ess-h3 run-head">
									<i style="background: var({tokenFor(r)})"></i>
									{runTitle(r)}
									{#if r.trips.some((t) => t.night)}<span class="ess-caption"><Moon size={13} /> night</span>{/if}
								</h3>
								<div class="ess-rows">
									{#each r.trips as t (t.id)}
										<div class="ess-row trip" id="cab-{t.id}" class:ess-row--selected={focusTrip === t.id}>
											<span class="ess-tile ess-tile--sm"><Car size={16} strokeWidth={1.75} /></span>
											<div class="ess-row__body">
												<span class="ess-row__title">
													{t.cabLabel}{#if t.driver}<span class="muted"> · {t.driver}</span>{/if}
												</span>
												<ol class="stops">
													{#each t.stops as s, i (s.riderId)}
														<li>
															<span class="ess-num">{i + 1}.</span>
															<strong>{s.name}</strong>
															<span class="muted">{s.team || '—'}</span>
															<span class="ess-num">drop {clockLabel(s.eta)}</span>
															<span class="muted ess-num">{s.rideMin} min{#if s.waitMin} · waits {s.waitMin}{/if}</span>
														</li>
													{/each}
												</ol>
												<span class="ess-row__meta">
													{t.stops.length}/{t.capacity} seats<span class="sep"></span>{t.distanceKm} km<span class="sep"></span>back {clockLabel(t.returnAt)}
												</span>
											</div>
											<div class="ess-row__end">
												{#if t.guard}
													<span class="ess-badge ess-badge--ok"><ShieldCheck size={12} /> Guard</span>
												{:else if t.night}
													<span class="ess-badge ess-badge--bad">No guard</span>
												{/if}
												{#each flagsForTrip(t.id).filter((f) => f.rule === 'full-cab' || f.rule === 'single-trip') as f (f.id)}
													<span class="ess-badge {SEVERITY_BADGE[f.severity]}">{f.rule === 'full-cab' ? 'Full' : 'Alone'}</span>
												{/each}
											</div>
										</div>
									{/each}
									{#each r.unseated as id (id)}
										<div class="ess-row">
											<span class="ess-tile ess-tile--sm ess-tile--bad"><AlertTriangle size={16} strokeWidth={1.75} /></span>
											<div class="ess-row__body">
												<span class="ess-row__title">{riderById.get(id)?.name ?? id}</span>
												<span class="ess-row__meta">No seat: claims Ola, Uber or Rapido at actuals</span>
											</div>
											<div class="ess-row__end"><span class="ess-badge ess-badge--bad">Ride-hail</span></div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="ess-table-shell">
						<table class="ess-table">
							<thead>
								<tr>
									<th>Cab</th>
									<th class="ess-num">Seats</th>
									<th>Night guard</th>
									<th>Out and back</th>
								</tr>
							</thead>
							<tbody>
								{#each plan.cabs as c (c.id)}
									<tr>
										<td>{c.label}{#if c.driver}<span class="muted"> · {c.driver}</span>{/if}</td>
										<td class="ess-num">{c.seats}</td>
										<td>{c.guard ? 'Yes' : 'No'}</td>
										<td>
											{#each plan.cabTimelines[c.id] ?? [] as e, i (i)}
												<span class="slot">{e.label}: {clockLabel(e.from)}–{clockLabel(e.to)}</span>
											{:else}
												<span class="muted">Free all day</span>
											{/each}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	</div>

	<aside class="ess-stack">
		<section class="ess-card" aria-labelledby="flags-h">
			<div class="ess-card-head">
				<h2 class="ess-h2" id="flags-h">Red flags</h2>
				{#if plan}<span class="ess-caption">{plan.flags.length} total</span>{/if}
			</div>
			{#if !plan}
				<p class="ess-help">Upload the sheet to see what breaks a rule: a woman dropped last alone at night, a full cab, someone without a seat.</p>
			{:else if plan.flags.length === 0}
				<p class="ess-help">Every rule holds for this day.</p>
			{:else}
				<div class="ess-rows">
					{#each [...flagsBySeverity.bad, ...flagsBySeverity.warn, ...flagsBySeverity.info] as f (f.id)}
						<button type="button" class="ess-row flag" onclick={() => openFlag(f)} disabled={!f.tripId && !f.runId}>
							<div class="ess-row__body">
								<span class="flag-title"><span class="ess-badge {SEVERITY_BADGE[f.severity]}">{SEVERITY_LABEL[f.severity]}</span> {f.title}</span>
								<span class="flag-detail">{f.detail}</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</section>
	</aside>
</div>

<style>
	.page {
		--ess-aside-width: 360px;
	}
	.upload-form {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: end;
	}
	.file-drop {
		flex: 1;
		min-width: 260px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border: 1px dashed var(--ess-border-strong);
		border-radius: var(--ess-radius-md);
		background: var(--ess-sunken);
		cursor: pointer;
		transition: border-color var(--ess-t-fast);
	}
	.file-drop:hover {
		border-color: var(--ess-primary);
	}
	.file-drop.has-file {
		border-style: solid;
		border-color: var(--ess-border);
		background: var(--ess-surface);
	}
	.file-drop input {
		display: none;
	}
	.file-drop .ess-tile {
		width: 36px;
		height: 36px;
	}
	.file-text {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.file-text strong {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.file-text span {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.date-field {
		width: 170px;
	}

	.settings {
		margin-top: 12px;
		font-size: 13px;
	}
	.settings summary {
		cursor: pointer;
		font-weight: 500;
		color: var(--ess-text);
	}
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px 12px;
		margin-top: 8px;
	}
	.settings-grid .office {
		grid-column: 1 / -1;
	}
	.rules {
		margin: 12px 0 0;
		padding-left: 18px;
		color: var(--ess-text-secondary);
		display: grid;
		gap: 3px;
	}
	.msg {
		margin-top: 10px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.notice {
		margin-top: 12px;
	}

	.figures {
		margin-bottom: 14px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
	}
	.map-controls {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin-top: 10px;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.legend i,
	.run-head i {
		width: 10px;
		height: 10px;
		border-radius: var(--ess-radius-pill);
		display: inline-block;
	}

	.runs {
		display: grid;
		gap: 18px;
	}
	.run-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 2px;
	}
	.run-head .ess-caption {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.trip {
		align-items: flex-start;
		padding-inline: 8px;
	}
	.stops {
		margin: 4px 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 2px;
		font-size: 13px;
	}
	.stops li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		align-items: baseline;
	}
	.stops strong {
		font-weight: 500;
	}
	.muted {
		color: var(--ess-text-muted);
	}
	.slot {
		display: inline-block;
		margin-right: 12px;
		white-space: nowrap;
	}

	.flag {
		width: 100%;
		border: none;
		padding: 12px 4px;
	}
	.flag:disabled {
		cursor: default;
	}
	.flag-title {
		font-size: 13.5px;
		font-weight: 500;
		line-height: 1.4;
	}
	.flag-title .ess-badge {
		margin-right: 4px;
	}
	.flag-detail {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
		line-height: 1.45;
	}

	@media (max-width: 1100px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
