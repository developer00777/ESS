<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface HolidayRow {
		date: string;
		name: string;
		type: string;
	}

	interface LeaveEvent {
		id: string;
		startDate: string;
		endDate: string;
		status: string;
		applicantName: string;
		typeName: string;
	}

	let {
		holidays,
		leaveEvents,
		showNames = false,
		size = 'default'
	}: { holidays: HolidayRow[]; leaveEvents: LeaveEvent[]; showNames?: boolean; size?: 'default' | 'large' } =
		$props();

	const today = new Date();
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth()); // 0-indexed

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function toKey(y: number, m: number, d: number): string {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	function parseDateOnly(s: string): { y: number; m: number; d: number } {
		const [y, m, d] = s.slice(0, 10).split('-').map(Number);
		return { y, m: m - 1, d };
	}

	function eachDateInRange(startStr: string, endStr: string): string[] {
		const start = parseDateOnly(startStr);
		const end = parseDateOnly(endStr);
		const cursor = new Date(start.y, start.m, start.d);
		const last = new Date(end.y, end.m, end.d);
		const out: string[] = [];
		while (cursor <= last) {
			out.push(toKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
			cursor.setDate(cursor.getDate() + 1);
		}
		return out;
	}

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
		const map = new Map<string, LeaveEvent[]>();
		for (const ev of leaveEvents) {
			for (const key of eachDateInRange(ev.startDate, ev.endDate)) {
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(ev);
			}
		}
		return map;
	});

	const gridDays = $derived.by(() => {
		const firstOfMonth = new Date(viewYear, viewMonth, 1);
		const startWeekday = firstOfMonth.getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

		const cells: Array<{ date: number; key: string; inMonth: boolean; isToday: boolean }> = [];

		const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
		for (let i = startWeekday - 1; i >= 0; i--) {
			const date = prevMonthDays - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			cells.push({ date, key: toKey(y, m, date), inMonth: false, isToday: false });
		}

		for (let date = 1; date <= daysInMonth; date++) {
			cells.push({
				date,
				key: toKey(viewYear, viewMonth, date),
				inMonth: true,
				isToday:
					viewYear === today.getFullYear() && viewMonth === today.getMonth() && date === today.getDate()
			});
		}

		let nextDate = 1;
		while (cells.length % 7 !== 0) {
			const m = viewMonth === 11 ? 0 : viewMonth + 1;
			const y = viewMonth === 11 ? viewYear + 1 : viewYear;
			cells.push({ date: nextDate, key: toKey(y, m, nextDate), inMonth: false, isToday: false });
			nextDate++;
		}

		return cells;
	});

	function goToPrevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear -= 1;
		} else {
			viewMonth -= 1;
		}
	}

	function goToNextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear += 1;
		} else {
			viewMonth += 1;
		}
	}

	function goToToday() {
		viewYear = today.getFullYear();
		viewMonth = today.getMonth();
	}

	let selectedKey = $state<string | null>(null);
	const selectedHolidays = $derived(selectedKey ? (holidaysByDate.get(selectedKey) ?? []) : []);
	const selectedLeave = $derived(selectedKey ? (leaveByDate.get(selectedKey) ?? []) : []);
</script>

<div class="calendar-box" class:large={size === 'large'}>
	<div class="calendar-header">
		<div class="month-nav">
			<button class="nav-btn" onclick={goToPrevMonth} aria-label="Previous month">
				<ChevronLeft size={size === 'large' ? 22 : 18} />
			</button>
			<h2 class="month-label">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
			<button class="nav-btn" onclick={goToNextMonth} aria-label="Next month">
				<ChevronRight size={size === 'large' ? 22 : 18} />
			</button>
		</div>
		<button class="today-btn" onclick={goToToday}>Today</button>
	</div>

	<div class="legend">
		<span class="legend-item"><i class="dot dot-holiday"></i> Holiday</span>
		<span class="legend-item"><i class="dot dot-approved"></i> Approved leave</span>
		<span class="legend-item"><i class="dot dot-pending"></i> Pending leave</span>
	</div>

	<div class="weekday-row">
		{#each WEEKDAY_NAMES as wd (wd)}
			<span class="weekday">{wd}</span>
		{/each}
	</div>

	<div class="month-grid">
		{#each gridDays as cell (cell.key)}
			{@const dayHolidays = holidaysByDate.get(cell.key) ?? []}
			{@const dayLeave = leaveByDate.get(cell.key) ?? []}
			{@const hasApproved = dayLeave.some((l) => l.status === 'approved')}
			{@const hasPending = dayLeave.some((l) => l.status === 'pending')}
			<button
				class="day-cell"
				class:out-of-month={!cell.inMonth}
				class:is-today={cell.isToday}
				class:is-selected={selectedKey === cell.key}
				onclick={() => (selectedKey = selectedKey === cell.key ? null : cell.key)}
			>
				<span class="day-number">{cell.date}</span>
				{#if dayHolidays.length > 0}
					<span class="day-tag tag-holiday" title={dayHolidays.map((h) => h.name).join(', ')}>
						{dayHolidays[0].name}
					</span>
				{/if}
				{#if showNames && dayLeave.length > 0}
					<span class="day-tag" class:tag-approved={hasApproved} class:tag-pending={!hasApproved && hasPending}>
						{dayLeave.length === 1 ? dayLeave[0].applicantName : `${dayLeave.length} on leave`}
					</span>
				{:else if dayLeave.length > 0}
					<span class="day-dots">
						{#if hasApproved}<i class="dot dot-approved"></i>{/if}
						{#if hasPending}<i class="dot dot-pending"></i>{/if}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if selectedKey && (selectedHolidays.length > 0 || selectedLeave.length > 0)}
		<div class="day-detail">
			<strong>{selectedKey}</strong>
			{#each selectedHolidays as h (h.name)}
				<p class="detail-row"><i class="dot dot-holiday"></i> {h.name} <span class="detail-type">{h.type}</span></p>
			{/each}
			{#each selectedLeave as l (l.id)}
				<p class="detail-row">
					<i class="dot" class:dot-approved={l.status === 'approved'} class:dot-pending={l.status !== 'approved'}></i>
					{l.applicantName} · {l.typeName}
					<span class="detail-type">{l.status}</span>
				</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.calendar-box {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 1.5rem 1.75rem;
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
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--color-ink);
		min-width: 11rem;
		text-align: center;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: none;
		background: var(--color-mint);
		color: var(--color-ink);
		cursor: pointer;
	}

	.nav-btn:hover {
		background: var(--color-accent);
		color: var(--color-white);
	}

	.today-btn {
		border: 1px solid var(--color-mint);
		background: var(--color-white);
		color: var(--color-primary);
		font-weight: 600;
		font-size: 0.85rem;
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.today-btn:hover {
		background: var(--color-mint);
	}

	.legend {
		display: flex;
		gap: 1.25rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--color-text-soft);
	}

	.dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.dot-holiday {
		background: var(--color-primary);
	}

	.dot-approved {
		background: #027a5f;
	}

	.dot-pending {
		background: #a16207;
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
		color: var(--color-text-soft);
		text-transform: uppercase;
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.35rem;
	}

	.day-cell {
		aspect-ratio: 1 / 0.85;
		min-height: 4.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: var(--color-mint);
		padding: 0.4rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		cursor: pointer;
		text-align: left;
		overflow: hidden;
	}

	.day-cell:hover {
		border-color: var(--color-accent);
	}

	.day-cell.out-of-month {
		background: transparent;
		opacity: 0.35;
	}

	.day-cell.is-today {
		background: var(--color-primary);
	}

	.day-cell.is-today .day-number {
		color: var(--color-white);
	}

	.day-cell.is-selected {
		border-color: var(--color-primary);
		border-width: 2px;
	}

	.day-number {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.day-tag {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.1rem 0.35rem;
		border-radius: 6px;
		background: var(--color-white);
		color: var(--color-text-soft);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-holiday {
		background: #dbe9f7;
		color: var(--color-primary);
	}

	.tag-approved {
		background: #d5f5ec;
		color: #027a5f;
	}

	.tag-pending {
		background: #fdf0d5;
		color: #a16207;
	}

	.day-dots {
		display: flex;
		gap: 0.2rem;
	}

	.day-detail {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-mint);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.detail-type {
		margin-left: auto;
		font-size: 0.7rem;
		text-transform: capitalize;
		color: var(--color-text-soft);
	}

	@media (max-width: 700px) {
		.day-cell {
			min-height: 3.2rem;
		}
		.day-tag {
			display: none;
		}
	}

	/* Large / hero variant */
	.calendar-box.large {
		padding: 2rem 2.5rem 2.25rem;
	}

	.calendar-box.large .month-label {
		font-size: 1.75rem;
		min-width: 15rem;
	}

	.calendar-box.large .nav-btn {
		width: 2.6rem;
		height: 2.6rem;
	}

	.calendar-box.large .today-btn {
		font-size: 0.95rem;
		padding: 0.55rem 1.15rem;
	}

	.calendar-box.large .legend {
		gap: 1.75rem;
		margin-bottom: 1.5rem;
	}

	.calendar-box.large .legend-item {
		font-size: 0.9rem;
	}

	.calendar-box.large .dot {
		width: 0.7rem;
		height: 0.7rem;
	}

	.calendar-box.large .weekday {
		font-size: 0.85rem;
	}

	.calendar-box.large .month-grid {
		gap: 0.6rem;
	}

	.calendar-box.large .day-cell {
		min-height: 8rem;
		padding: 0.7rem;
		gap: 0.4rem;
		border-radius: var(--radius-md);
	}

	.calendar-box.large .day-number {
		font-size: 1.15rem;
	}

	.calendar-box.large .day-tag {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
	}

	.calendar-box.large .day-dots .dot {
		width: 0.6rem;
		height: 0.6rem;
	}

	.calendar-box.large .day-detail {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
	}

	.calendar-box.large .detail-row {
		font-size: 1rem;
	}

	@media (max-width: 900px) {
		.calendar-box.large {
			padding: 1.25rem 1.25rem 1.5rem;
		}
		.calendar-box.large .day-cell {
			min-height: 4.5rem;
		}
		.calendar-box.large .month-label {
			font-size: 1.3rem;
			min-width: auto;
		}
	}
</style>
