<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface AttendanceRecord {
		id: string;
		date: string;
		checkInAt: string | Date | null;
		checkOutAt: string | Date | null;
		source: 'manual' | 'biometric';
	}

	interface PunchDay {
		date: string;
		firstAt: string | Date;
		lastAt: string | Date;
		count: number;
	}

	interface HolidayRow {
		date: string;
		name: string;
		type: string;
	}

	interface LeaveRow {
		id: string;
		startDate: string;
		endDate: string;
		status: string;
		typeName: string;
	}

	let {
		month, // 'YYYY-MM' — data is loaded per month by the server
		records,
		punchDays,
		holidays,
		leaves
	}: {
		month: string;
		records: AttendanceRecord[];
		punchDays: PunchDay[];
		holidays: HolidayRow[];
		leaves: LeaveRow[];
	} = $props();

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const now = new Date();
	const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	const currentMonthKey = todayKey.slice(0, 7);

	const viewYear = $derived(Number(month.slice(0, 4)));
	const viewMonth = $derived(Number(month.slice(5, 7)) - 1); // 0-indexed

	function toKey(y: number, m: number, d: number): string {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	function shiftMonth(delta: number): string {
		const d = new Date(viewYear, viewMonth + delta, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	const recordsByDate = $derived(new Map(records.map((r) => [r.date.slice(0, 10), r])));
	const punchesByDate = $derived(new Map(punchDays.map((p) => [p.date, p])));

	const holidaysByDate = $derived.by(() => {
		const map = new Map<string, HolidayRow[]>();
		for (const h of holidays) {
			const key = h.date.slice(0, 10);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(h);
		}
		return map;
	});

	const leaveByDate = $derived.by(() => {
		const map = new Map<string, LeaveRow[]>();
		const monthPrefix = `${month}-`;
		for (const l of leaves) {
			const start = new Date(l.startDate.slice(0, 10) + 'T00:00');
			const end = new Date(l.endDate.slice(0, 10) + 'T00:00');
			for (const d = start; d <= end; d.setDate(d.getDate() + 1)) {
				const key = toKey(d.getFullYear(), d.getMonth(), d.getDate());
				if (!key.startsWith(monthPrefix)) continue;
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(l);
			}
		}
		return map;
	});

	interface Cell {
		date: number;
		key: string;
		inMonth: boolean;
		isToday: boolean;
		isWeekend: boolean;
	}

	const gridDays = $derived.by(() => {
		const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const cells: Cell[] = [];

		for (let i = 0; i < startWeekday; i++) {
			cells.push({ date: 0, key: `lead-${i}`, inMonth: false, isToday: false, isWeekend: false });
		}
		for (let date = 1; date <= daysInMonth; date++) {
			const key = toKey(viewYear, viewMonth, date);
			const weekday = (startWeekday + date - 1) % 7;
			cells.push({
				date,
				key,
				inMonth: true,
				isToday: key === todayKey,
				isWeekend: weekday === 0 || weekday === 6
			});
		}
		let i = 0;
		while (cells.length % 7 !== 0) {
			cells.push({ date: 0, key: `trail-${i++}`, inMonth: false, isToday: false, isWeekend: false });
		}
		return cells;
	});

	let selectedKey = $state<string | null>(null);

	// New month of data → select today when it's in view, otherwise nothing.
	$effect(() => {
		selectedKey = month === currentMonthKey ? todayKey : null;
	});

	function isAbsent(cell: Cell): boolean {
		return (
			cell.inMonth &&
			!cell.isWeekend &&
			cell.key < todayKey &&
			!recordsByDate.get(cell.key)?.checkInAt &&
			!(holidaysByDate.get(cell.key)?.length ?? 0) &&
			!(leaveByDate.get(cell.key)?.length ?? 0)
		);
	}

	function fmtTime(value: string | Date | null | undefined): string {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function duration(from: string | Date, to: string | Date): string {
		const ms = new Date(to).getTime() - new Date(from).getTime();
		const h = Math.floor(ms / 3_600_000);
		const m = Math.floor((ms % 3_600_000) / 60_000);
		return `${h}h ${m}m`;
	}

	function fmtHeading(key: string): string {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	}

	function cellLabel(cell: Cell): string {
		const rec = recordsByDate.get(cell.key);
		const base = `${MONTH_NAMES[viewMonth]} ${cell.date}`;
		if (rec?.checkInAt) {
			return `${base}, in ${fmtTime(rec.checkInAt)}, out ${fmtTime(rec.checkOutAt)}`;
		}
		if (leaveByDate.get(cell.key)?.length) return `${base}, on leave`;
		if (holidaysByDate.get(cell.key)?.length) return `${base}, holiday`;
		if (isAbsent(cell)) return `${base}, absent`;
		return base;
	}

	const selected = $derived.by(() => {
		if (!selectedKey) return null;
		const [y, m, d] = selectedKey.split('-').map(Number);
		const weekday = new Date(y, m - 1, d).getDay();
		return {
			key: selectedKey,
			record: recordsByDate.get(selectedKey) ?? null,
			punches: punchesByDate.get(selectedKey) ?? null,
			holidays: holidaysByDate.get(selectedKey) ?? [],
			leaves: leaveByDate.get(selectedKey) ?? [],
			isWeekend: weekday === 0 || weekday === 6,
			isPast: selectedKey < todayKey
		};
	});

	const selectedStatus = $derived.by(() => {
		if (!selected) return null;
		if (selected.record?.checkInAt) return { label: 'Present', badge: 'present' };
		const approvedLeave = selected.leaves.find((l) => l.status === 'approved');
		if (approvedLeave) return { label: 'On leave', badge: 'approved' };
		if (selected.leaves.length > 0) return { label: 'Leave pending', badge: 'pending' };
		if (selected.holidays.length > 0) return { label: 'Holiday', badge: 'info' };
		if (selected.isWeekend) return { label: 'Weekend', badge: 'optional' };
		if (selected.isPast) return { label: 'Absent', badge: 'absent' };
		if (selected.key === todayKey) return { label: 'No activity yet', badge: 'optional' };
		return { label: 'Upcoming', badge: 'optional' };
	});
</script>

<div class="calendar-box">
	<div class="calendar-header">
		<div class="month-nav">
			<a
				class="nav-btn"
				href="?month={shiftMonth(-1)}"
				data-sveltekit-noscroll
				aria-label="Previous month"
			>
				<ChevronLeft size={18} />
			</a>
			<h2 class="month-label">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
			<a
				class="nav-btn"
				href="?month={shiftMonth(1)}"
				data-sveltekit-noscroll
				aria-label="Next month"
			>
				<ChevronRight size={18} />
			</a>
		</div>
		{#if month !== currentMonthKey}
			<a class="today-btn" href="?month={currentMonthKey}" data-sveltekit-noscroll>Today</a>
		{/if}
	</div>

	<div class="legend">
		<span class="legend-item"><i class="dot dot-portal"></i> Portal check-in</span>
		<span class="legend-item"><i class="dot dot-biometric"></i> Biometric sync</span>
		<span class="legend-item"><i class="swatch swatch-holiday"></i> Holiday</span>
		<span class="legend-item"><i class="swatch swatch-leave"></i> Leave</span>
		<span class="legend-item"><i class="dot dot-absent"></i> Absent</span>
	</div>

	<div class="weekday-row">
		{#each WEEKDAY_NAMES as wd (wd)}
			<span class="weekday">{wd}</span>
		{/each}
	</div>

	<div class="month-grid">
		{#each gridDays as cell (cell.key)}
			{#if !cell.inMonth}
				<span class="day-cell day-empty" aria-hidden="true"></span>
			{:else}
				{@const rec = recordsByDate.get(cell.key)}
				{@const punch = punchesByDate.get(cell.key)}
				{@const dayHolidays = holidaysByDate.get(cell.key) ?? []}
				{@const dayLeaves = leaveByDate.get(cell.key) ?? []}
				{@const absent = isAbsent(cell)}
				<button
					class="day-cell"
					class:is-today={cell.isToday}
					class:is-weekend={cell.isWeekend}
					class:is-selected={selectedKey === cell.key}
					aria-pressed={selectedKey === cell.key}
					aria-label={cellLabel(cell)}
					onclick={() => (selectedKey = selectedKey === cell.key ? null : cell.key)}
				>
					<span class="day-head">
						<span class="day-number">{cell.date}</span>
						<span class="day-dots">
							{#if rec?.source === 'manual' && rec.checkInAt}<i class="dot dot-portal"></i>{/if}
							{#if punch || rec?.source === 'biometric'}<i class="dot dot-biometric"></i>{/if}
							{#if absent}<i class="dot dot-absent absent-dot"></i>{/if}
						</span>
					</span>
					{#if rec?.checkInAt}
						<span class="cell-time"><span class="t-label">in</span>{fmtTime(rec.checkInAt)}</span>
						<span class="cell-time"><span class="t-label">out</span>{fmtTime(rec.checkOutAt)}</span>
					{:else if dayLeaves.length > 0}
						{@const approved = dayLeaves.some((l) => l.status === 'approved')}
						<span class="day-tag" class:tag-leave={approved} class:tag-pending={!approved}>
							{dayLeaves[0].typeName}
						</span>
					{:else if dayHolidays.length > 0}
						<span class="day-tag tag-holiday" title={dayHolidays.map((h) => h.name).join(', ')}>
							{dayHolidays[0].name}
						</span>
					{:else if absent}
						<span class="cell-absent">Absent</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>

	{#if selected && selectedStatus}
		<div class="day-detail">
			<div class="detail-head">
				<strong>{fmtHeading(selected.key)}</strong>
				<span class="ess-badge ess-badge--{selectedStatus.badge}">{selectedStatus.label}</span>
			</div>

			<div class="source-rows">
				<div class="source-row">
					<span class="source-label">Login · Logout</span>
					{#if selected.record?.checkInAt}
						<span class="source-value">
							{fmtTime(selected.record.checkInAt)} – {selected.record.checkOutAt
								? fmtTime(selected.record.checkOutAt)
								: 'not logged out'}
							{#if selected.record.checkOutAt}
								<span class="source-extra"
									>· {duration(selected.record.checkInAt, selected.record.checkOutAt)}</span
								>
							{/if}
						</span>
						<span class="source-note"
							>{selected.record.source === 'biometric' ? 'via biometric' : 'via portal'}</span
						>
					{:else}
						<span class="source-value muted">Not recorded</span>
					{/if}
				</div>

				<div class="source-row">
					<span class="source-label">Biometric sync</span>
					{#if selected.punches}
						<span class="source-value">
							First punch {fmtTime(selected.punches.firstAt)} · Last {fmtTime(
								selected.punches.lastAt
							)}
						</span>
						<span class="source-note"
							>{selected.punches.count}
							{selected.punches.count === 1 ? 'punch' : 'punches'}</span
						>
					{:else}
						<span class="source-value muted">No punches synced</span>
					{/if}
				</div>

				<div class="source-row">
					<span class="source-label">ProHance</span>
					<span class="source-value muted">Not connected yet</span>
				</div>
			</div>

			{#each selected.holidays as h (h.name)}
				<p class="detail-row">
					<i class="swatch swatch-holiday"></i>
					{h.name}
					<span class="detail-type">{h.type.toLowerCase()}</span>
				</p>
			{/each}
			{#each selected.leaves as l (l.id)}
				<p class="detail-row">
					<i class="swatch" class:swatch-leave={l.status === 'approved'} class:swatch-pending={l.status !== 'approved'}></i>
					{l.typeName}
					<span class="detail-type">{l.status}</span>
				</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.calendar-box {
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-lg);
		padding: 1.5rem 1.75rem;
	}

	/* A 7-column month grid can't compress below ~300px and stay legible,
	   so on phones the calendar scrolls horizontally inside its own box
	   rather than forcing the whole page to scroll. */
	@media (max-width: 560px) {
		.calendar-box {
			padding: 1rem;
			overflow-x: auto;
		}

		.calendar-header,
		.weekday-row,
		.month-grid,
		.legend {
			min-width: 300px;
		}
	}

	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.month-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.month-label {
		font-family: var(--ess-font-display);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--ess-text);
		min-width: 11rem;
		text-align: center;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-sunken);
		color: var(--ess-text);
		transition: background var(--ess-t-fast), color var(--ess-t-fast);
	}

	.nav-btn:hover {
		background: var(--ess-primary);
		color: var(--ess-text-on-primary);
	}

	.nav-btn:focus-visible,
	.today-btn:focus-visible,
	.day-cell:focus-visible {
		outline: none;
		box-shadow: var(--ess-focus-ring);
	}

	.today-btn {
		border: 1px solid var(--ess-border-strong);
		background: var(--ess-surface);
		color: var(--ess-primary);
		font-weight: 600;
		font-size: 0.85rem;
		padding: 0.4rem 0.9rem;
		border-radius: var(--ess-radius-sm);
	}

	.today-btn:hover {
		background: var(--ess-sunken);
	}

	.legend {
		display: flex;
		gap: 1.1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--ess-text-secondary);
	}

	.dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: var(--ess-radius-pill);
		flex-shrink: 0;
	}

	.dot-portal {
		background: var(--acc);
	}

	.dot-biometric {
		background: var(--acc2);
	}

	.dot-absent {
		background: var(--ess-danger);
	}

	.swatch {
		display: inline-block;
		width: 0.8rem;
		height: 0.5rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.swatch-holiday {
		background: var(--ess-info-bg);
		border: 1px solid var(--ess-info);
	}

	.swatch-leave {
		background: var(--ess-success-bg);
		border: 1px solid var(--ess-success);
	}

	.swatch-pending {
		background: var(--ess-warning-bg);
		border: 1px solid var(--ess-warning);
	}

	.weekday-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		margin-bottom: 0.4rem;
	}

	.weekday {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--ess-text-secondary);
		text-transform: uppercase;
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.35rem;
	}

	.day-cell {
		min-height: 4.9rem;
		border-radius: var(--ess-radius-sm);
		border: 1px solid transparent;
		background: var(--ess-sunken);
		padding: 0.4rem 0.45rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.18rem;
		cursor: pointer;
		text-align: left;
		overflow: hidden;
		transition: border-color var(--ess-t-fast);
	}

	.day-cell:hover {
		border-color: var(--ess-border-strong);
	}

	.day-empty {
		background: transparent;
		cursor: default;
	}

	.day-cell.is-weekend:not(.is-today) {
		background: transparent;
		border-color: var(--ess-border-subtle);
	}

	.day-cell.is-weekend .day-number {
		color: var(--ess-text-muted);
	}

	.day-cell.is-today {
		background: var(--ess-primary-soft);
		border-color: var(--ess-primary);
	}

	.day-cell.is-selected {
		border-color: var(--ess-primary);
		box-shadow: 0 0 0 1px var(--ess-primary);
	}

	.day-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
	}

	.day-number {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ess-text);
	}

	.day-dots {
		display: flex;
		gap: 0.22rem;
		align-items: center;
	}

	.day-dots .dot {
		width: 0.4rem;
		height: 0.4rem;
	}

	/* Absent is already spelled out in text on desktop; the dot is the
	   phone-width stand-in once the text is hidden. */
	.absent-dot {
		display: none;
	}

	.cell-time {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		font-size: 0.68rem;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.t-label {
		font-size: 0.58rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ess-text-muted);
		width: 2.2em;
		flex-shrink: 0;
	}

	.cell-absent {
		font-size: 0.66rem;
		font-weight: 600;
		color: var(--ess-danger);
	}

	.day-tag {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.1rem 0.35rem;
		border-radius: 6px;
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		align-self: flex-start;
	}

	.tag-holiday {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}

	.tag-leave {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}

	.tag-pending {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}

	.day-detail {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--ess-border);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.detail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.detail-head strong {
		font-size: 0.95rem;
		color: var(--ess-text);
	}

	.source-rows {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-sm);
		background: var(--ess-sunken);
	}

	.source-row {
		display: grid;
		grid-template-columns: 8.5rem 1fr auto;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.55rem 0.85rem;
		font-size: 0.85rem;
	}

	.source-row:not(:last-child) {
		border-bottom: 1px solid var(--ess-border-subtle);
	}

	.source-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ess-text-secondary);
	}

	.source-value {
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	.source-value.muted {
		color: var(--ess-text-muted);
	}

	.source-extra {
		color: var(--ess-text-secondary);
	}

	.source-note {
		font-size: 0.75rem;
		color: var(--ess-text-muted);
		white-space: nowrap;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--ess-text);
	}

	.detail-type {
		margin-left: auto;
		font-size: 0.7rem;
		text-transform: capitalize;
		color: var(--ess-text-secondary);
	}

	@media (max-width: 700px) {
		.day-cell {
			min-height: 3.2rem;
		}

		.cell-time,
		.cell-absent,
		.day-tag {
			display: none;
		}

		.absent-dot {
			display: inline-block;
		}

		.source-row {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-btn,
		.day-cell {
			transition: none;
		}
	}
</style>
