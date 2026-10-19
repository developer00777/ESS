<script lang="ts">
	/**
	 * Payroll → Preview: every sheet exactly as it will download, before it
	 * downloads. With "Edit payroll", any cell can be changed by hand, a row
	 * added or removed; edits are saved as they are made, marked here and in
	 * the .xlsx, and can be reverted. Downloads only start from this window.
	 */
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Search from '@lucide/svelte/icons/search';
	import { cellText, type FinalSheet } from '$lib/payroll-sheet';

	type SheetKey = 'tracker' | 'leave-balance' | 'hr-comments' | 'to-be-paid' | 'lop' | 'stop-salary';
	const SHEETS: { key: SheetKey; label: string }[] = [
		{ key: 'leave-balance', label: 'Leave Balance' },
		{ key: 'hr-comments', label: 'HR Comments' },
		{ key: 'to-be-paid', label: 'To Be Paid' },
		{ key: 'lop', label: 'LOP' },
		{ key: 'stop-salary', label: 'Stop Salary' },
		{ key: 'tracker', label: 'Payroll Attendance' }
	];

	let {
		cycleKey,
		label,
		initial,
		canEdit,
		onclose
	}: { cycleKey: string; label: string; initial: SheetKey; canEdit: boolean; onclose: (changed: boolean) => void } = $props();

	let sheet = $state<SheetKey>('leave-balance');
	let data = $state<(FinalSheet & { editCounts: Partial<Record<SheetKey, number>> }) | null>(null);
	let loading = $state(false);
	let error = $state('');
	let query = $state('');
	let onlyEdited = $state(false);
	let editing = $state<{ row: number; col: number; text: string } | null>(null);
	let busy = $state(false);
	let changed = false;

	$effect(() => {
		sheet = initial;
	});

	async function load(which: SheetKey) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/payroll/sheet?cycle=${cycleKey}&sheet=${which}`);
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Could not load the sheet');
			const body = await res.json();
			if (which === sheet) data = body;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		void load(sheet);
	});

	async function send(body: Record<string, unknown>) {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/payroll/sheet', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cycle: cycleKey, sheet, ...body })
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Could not save');
			changed = true;
			await load(sheet);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function startEdit(ri: number, ci: number) {
		const row = data?.rows[ri];
		if (!canEdit || !row || row.locked || row.removed || busy) return;
		editing = { row: ri, col: ci, text: cellText(row.cells[ci].value) };
	}

	async function commit() {
		if (!editing || !data) return;
		const { row: ri, col: ci, text } = editing;
		editing = null;
		const row = data.rows[ri];
		const cell = row.cells[ci];
		const column = data.header[ci];
		if (text === cellText(cell.value)) return;
		// Typing the portal's own value back is the same as reverting the edit.
		if (!row.added && text === cellText(cell.computed)) {
			await send({ op: 'clear', rowKey: row.key, column });
			return;
		}
		await send({ op: 'set', rowKey: row.key, column, value: text, original: row.added ? null : cellText(cell.computed) });
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (editing) editing = null;
			else onclose(changed);
		}
	}

	const focus = (node: HTMLInputElement) => {
		node.focus();
		node.select();
	};

	const visibleRows = $derived.by(() => {
		if (!data) return [];
		const q = query.trim().toLowerCase();
		return data.rows
			.map((r, i) => ({ r, i }))
			.filter(({ r }) => (!onlyEdited || r.added || r.removed || r.cells.some((c) => c.edited)) && (!q || r.locked || r.cells.some((c) => cellText(c.value).toLowerCase().includes(q))));
	});
	const totalEdits = $derived(Object.values(data?.editCounts ?? {}).reduce((a, b) => a + (b ?? 0), 0));
	const exportUrl = (s: string) => `/api/payroll/export?cycle=${cycleKey}&sheet=${s}`;
	const tip = (c: { edited: boolean; computed: unknown; by?: string | null; at?: string | null }) =>
		c.edited ? `Edited by hand${c.by ? ` by ${c.by}` : ''}${c.at ? ` · ${new Date(c.at).toLocaleString('en-IN')}` : ''}\nPortal computed: ${cellText(c.computed as never) || '(blank)'}` : '';
</script>

<svelte:window onkeydown={onKey} />

<div class="ess-scrim" role="presentation" onclick={() => onclose(changed)}></div>
<div class="preview" role="dialog" aria-modal="true" aria-labelledby="pv-title">
	<header class="head">
		<div>
			<h2 id="pv-title" class="ess-h2">Preview · {label}</h2>
			<p class="sub">
				This is exactly what downloads.
				{#if canEdit}Click a cell to change it by hand; changes save as you go and show <mark>highlighted</mark>, with the portal's value on hover.{/if}
				{#if totalEdits}<strong> {totalEdits} manual {totalEdits === 1 ? 'edit' : 'edits'} this month.</strong>{/if}
			</p>
		</div>
		<button type="button" class="ess-icon-btn" onclick={() => onclose(changed)} aria-label="Close"><X size={18} /></button>
	</header>

	<div class="bar">
		<div class="ess-tabs" role="tablist">
			{#each SHEETS as s (s.key)}
				<button type="button" class="ess-tab" role="tab" aria-selected={sheet === s.key} onclick={() => { editing = null; sheet = s.key; }}>
					{s.label}
					{#if data?.editCounts?.[s.key]}<span class="ess-count edits">{data.editCounts[s.key]}</span>{/if}
				</button>
			{/each}
		</div>
	</div>

	<div class="tools">
		<label class="ess-search find">
			<Search size={15} />
			<input class="ess-input" type="search" placeholder="Find in this sheet" bind:value={query} aria-label="Find in this sheet" />
		</label>
		<label class="toggle"><input type="checkbox" bind:checked={onlyEdited} /> Only edited rows</label>
		{#if canEdit}
			<button type="button" class="ess-btn ess-btn--secondary ess-btn--sm" disabled={busy || !data} onclick={() => send({ op: 'add' })}><Plus size={15} /> Add row</button>
		{/if}
		<span class="spacer"></span>
		{#if busy || loading}<span class="state">Saving…</span>{/if}
		<a class="ess-btn ess-btn--secondary ess-btn--sm" href={exportUrl(sheet)} download><Download size={15} /> Download CSV</a>
		<a class="ess-btn ess-btn--primary ess-btn--sm" href={exportUrl('workbook')} download><FileSpreadsheet size={15} /> Download all sheets (.xlsx)</a>
	</div>

	{#if error}<p class="err" role="alert">{error}</p>{/if}

	<div class="grid-wrap ess-scroll">
		{#if data}
			<table class="grid">
				<thead>
					<tr>
						{#if canEdit}<th class="act"></th>{/if}
						{#each data.header as h, ci (ci)}<th>{h}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each visibleRows as { r, i } (r.key)}
						<tr class:locked={r.locked} class:removed={r.removed} class:added={r.added}>
							{#if canEdit}
								<td class="act">
									{#if !r.locked}
										{#if r.removed}
											<button type="button" class="icon" title="Put this row back" onclick={() => send({ op: 'restore', rowKey: r.key })}><RotateCcw size={14} /></button>
										{:else}
											<button type="button" class="icon" title={r.added ? 'Delete this added row' : 'Leave this row out of the download'} onclick={() => send({ op: 'remove', rowKey: r.key })}><Trash2 size={14} /></button>
										{/if}
									{/if}
								</td>
							{/if}
							{#each r.cells as c, ci (ci)}
								<td class:edited={c.edited} title={tip(c)}>
									{#if editing && editing.row === i && editing.col === ci}
										<input
											class="cell-input"
											bind:value={editing.text}
											use:focus
											onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commit(); } }}
											onblur={() => void commit()}
											aria-label={`${data.header[ci]}`}
										/>
									{:else if canEdit && !r.locked && !r.removed}
										<button type="button" class="cell" onclick={() => startEdit(i, ci)}>{cellText(c.value)}</button>
									{:else}
										<span class="cell ro">{cellText(c.value)}</span>
									{/if}
								</td>
							{/each}
						</tr>
					{:else}
						<tr><td colspan={data.header.length + 1} class="empty">{onlyEdited ? 'No edited rows on this sheet.' : 'This sheet has no rows this month.'}</td></tr>
					{/each}
				</tbody>
			</table>
		{:else if loading}
			<p class="empty">Loading…</p>
		{/if}
	</div>
</div>

<style>
	.ess-scrim {
		z-index: 70;
	}
	.preview {
		position: fixed;
		inset: 24px;
		z-index: 71;
		display: flex;
		flex-direction: column;
		background: var(--ess-modal-bg);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg);
		box-shadow: var(--ess-elev-4);
		overflow: hidden;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px 10px;
	}
	.sub {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	mark {
		background: #fff3c4;
		color: inherit;
		padding: 0 3px;
		border-radius: 3px;
	}
	.bar {
		padding: 0 20px;
		border-bottom: 1px solid var(--ess-border);
	}
	.edits {
		background: #f5b400;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 10px 20px;
	}
	.find {
		flex: 0 1 280px;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.spacer {
		flex: 1;
	}
	.state {
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.err {
		margin: 0 20px 8px;
		color: var(--ess-danger);
		font-size: 13px;
	}
	.grid-wrap {
		flex: 1 1 auto;
		overflow: auto;
		border-top: 1px solid var(--ess-border);
	}
	.grid {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12.5px;
		min-width: 100%;
	}
	.grid th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--ess-sunken);
		text-align: left;
		font-weight: 600;
		padding: 7px 8px;
		white-space: nowrap;
		border-bottom: 1px solid var(--ess-border);
	}
	.grid td {
		padding: 0;
		border-bottom: 1px solid var(--ess-border-subtle);
		border-right: 1px solid var(--ess-border-subtle);
		white-space: nowrap;
	}
	.cell {
		all: unset;
		box-sizing: border-box;
		display: block;
		min-width: 44px;
		min-height: 28px;
		padding: 6px 8px;
		cursor: text;
	}
	.cell.ro {
		cursor: default;
	}
	button.cell:hover {
		background: var(--ess-surface-hover);
	}
	button.cell:focus-visible {
		outline: 2px solid var(--ess-focus-ring);
		outline-offset: -2px;
	}
	.cell-input {
		box-sizing: border-box;
		width: 100%;
		min-width: 90px;
		height: 28px;
		padding: 4px 6px;
		border: 2px solid var(--ess-primary);
		border-radius: 4px;
		font: inherit;
		background: var(--ess-surface);
		color: var(--ess-text);
	}
	td.edited {
		background: #fff3c4;
	}
	:global([data-ess-theme='dark']) td.edited {
		background: #4a3d0c;
	}
	tr.added td {
		background: var(--ess-success-bg);
	}
	tr.removed td {
		color: var(--ess-text-muted);
		text-decoration: line-through;
		background: var(--ess-sunken);
	}
	tr.locked td {
		font-weight: 700;
		background: var(--ess-sunken);
	}
	.act {
		width: 30px;
		text-align: center;
		position: sticky;
		left: 0;
		background: var(--ess-surface);
		z-index: 1;
	}
	.icon {
		all: unset;
		cursor: pointer;
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		color: var(--ess-text-secondary);
	}
	.icon:hover {
		background: var(--ess-surface-hover);
		color: var(--ess-danger);
	}
	.empty {
		padding: 28px;
		text-align: center;
		color: var(--ess-text-secondary);
	}
</style>
