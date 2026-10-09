<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { financialYearLabel } from '$lib/financial-year';
	import { cycleDates, cycleForDate, cycleForKey, cycleLabel } from '$lib/attendance-cycle';
	import {
		makeWeekOffResolver,
		type WeekOffRosterShape,
		type WeekOffAssignmentShape
	} from '$lib/week-off';

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
		size = 'default',
		// Week offs come from the roster the employee's manager assigned. With no
		// roster the resolver falls back to Saturday + Sunday, which is what the
		// calendar showed before rosters existed.
		weekOffRosters = [],
		weekOffAssignments = [],
		weekOffLabel = null
	}: {
		holidays: HolidayRow[];
		leaveEvents: LeaveEvent[];
		showNames?: boolean;
		size?: 'default' | 'large';
		weekOffRosters?: WeekOffRosterShape[];
		weekOffAssignments?: WeekOffAssignmentShape[];
		weekOffLabel?: string | null;
	} = $props();

	const isWeekOff = $derived(makeWeekOffResolver(weekOffRosters, weekOffAssignments));

	const today = new Date();
	// Opens on the cycle containing today, which after the 25th is next month's.
	const todayCycle = cycleForDate(today);
	let viewYear = $state(todayCycle.endYear);
	let viewMonth = $state(todayCycle.endMonth - 1); // 0-indexed

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const MONTH_SHORT = [
		'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
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

	// Leave follows the same payroll cycle as attendance — the 26th of one month
	// to the 25th of the next — so both calendars describe the same period.
	const cycle = $derived(cycleForKey(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`));

	const gridDays = $derived.by(() => {
		const cells: Array<{
			date: number;
			key: string;
			inMonth: boolean;
			isToday: boolean;
			isWeekOff: boolean;
			showMonth: boolean;
			monthShort: string;
		}> = [];

		const dates = cycleDates(cycle);
		if (dates.length === 0) return cells;

		const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
		const [fy, fm, fd] = dates[0].split('-').map(Number);
		const startWeekday = new Date(fy, fm - 1, fd).getDay();

		for (let i = 0; i < startWeekday; i++) {
			cells.push({
				date: 0,
				key: `lead-${i}`,
				inMonth: false,
				isToday: false,
				isWeekOff: false,
				showMonth: false,
				monthShort: ''
			});
		}

		for (const key of dates) {
			const [, m, d] = key.split('-').map(Number);
			cells.push({
				date: d,
				key,
				inMonth: true,
				isToday: key === todayKey,
				isWeekOff: isWeekOff(key),
				showMonth: m !== cycle.endMonth,
				monthShort: MONTH_SHORT[m - 1]
			});
		}

		let i = 0;
		while (cells.length % 7 !== 0) {
			cells.push({
				date: 0,
				key: `trail-${i++}`,
				inMonth: false,
				isToday: false,
				isWeekOff: false,
				showMonth: false,
				monthShort: ''
			});
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
		viewYear = todayCycle.endYear;
		viewMonth = todayCycle.endMonth - 1;
	}

	let selectedKey = $state<string | null>(null);
	const selectedHolidays = $derived(selectedKey ? (holidaysByDate.get(selectedKey) ?? []) : []);
	const selectedLeave = $derived(selectedKey ? (leaveByDate.get(selectedKey) ?? []) : []);
	const selectedIsWeekOff = $derived(selectedKey ? isWeekOff(selectedKey) : false);
</script>

<div class="calendar-box" class:large={size === 'large'}>
	<div class="calendar-header">
		<div class="month-nav">
			<button class="nav-btn" onclick={goToPrevMonth} aria-label="Previous month">
				<ChevronLeft size={size === 'large' ? 22 : 18} />
			</button>
			<h2 class="month-label">
				{cycleLabel(cycle)}
				<span class="fy-label">{financialYearLabel(viewYear, viewMonth)}</span>
			</h2>
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
		<span class="legend-item"><i class="swatch swatch-weekoff"></i> Week off{weekOffLabel ? ` · ${weekOffLabel}` : ''}</span>
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
				class:is-week-off={cell.isWeekOff}
				class:is-selected={selectedKey === cell.key}
				onclick={() => (selectedKey = selectedKey === cell.key ? null : cell.key)}
			>
				<span class="day-number">
					{#if cell.inMonth}{cell.date}{#if cell.showMonth}<span class="day-month"
								>{cell.monthShort}</span
							>{/if}{/if}
				</span>
				{#if dayHolidays.length > 0}
					<span class="day-tag tag-holiday" title={dayHolidays.map((h) => h.name).join(', ')}>
						{dayHolidays[0].name}
					</span>
				{:else if cell.isWeekOff && cell.inMonth}
					<!-- Only when no holiday shares the day: a public holiday is the more
					     specific fact, and two tags would not fit the cell anyway. -->
					<span class="day-tag tag-weekoff">Week off</span>
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

	{#if selectedKey && (selectedHolidays.length > 0 || selectedLeave.length > 0 || selectedIsWeekOff)}
		<div class="day-detail">
			<strong>{selectedKey}</strong>
			{#if selectedIsWeekOff}
				<p class="detail-row">
					<i class="swatch swatch-weekoff"></i> Week off
					{#if weekOffLabel}<span class="detail-type">{weekOffLabel}</span>{/if}
				</p>
			{/if}
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
		background: var(--ess-surface);
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		box-shadow: var(--ess-elev-1);
		padding: 20px 22px;
	}

	/* A 7-column month grid can't compress below ~300px and stay legible,
	   so on phones the calendar scrolls horizontally inside its own box
	   rather than forcing the whole page to scroll. */
	@media (max-width: 560px) {
		.calendar-box {
			padding: 1rem;
			overflow-x: auto;
			overscroll-behavior-x: contain;
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
		gap: 12px;
		margin-bottom: 14px;
	}

	.month-nav {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.month-label {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--ess-font-display);
		font-size: 21px;
		font-weight: 600;
		color: var(--ess-text);
		/* Wide enough for the FY chip so the arrows never shift as the month
		   name changes length. */
		min-width: 19rem;
		justify-content: center;
		white-space: nowrap;
	}

	/* Secondary to the month itself — it qualifies the date rather than
	   naming it. */
	.fy-label {
		font-family: var(--ess-font-sans);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-pill);
		padding: 2px 8px;
	}

	.nav-btn {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--ess-radius-sm);
		border: 1px solid var(--ess-border);
		background: var(--ess-surface);
		color: var(--ess-text-secondary);
		cursor: pointer;
		transition:
			border-color var(--ess-t-fast),
			color var(--ess-t-fast);
	}

	.nav-btn:hover {
		border-color: var(--ess-border-strong);
		color: var(--ess-text);
	}

	.today-btn {
		border: 1px solid var(--ess-border-strong);
		background: var(--ess-surface);
		color: var(--ess-text);
		font-weight: 500;
		font-size: 13px;
		padding: 7px 14px;
		border-radius: var(--ess-radius-sm);
		cursor: pointer;
	}

	.today-btn:hover {
		border-color: var(--ess-primary);
		color: var(--ess-primary-text);
	}

	.legend {
		display: flex;
		gap: 18px;
		margin-bottom: 14px;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		color: var(--ess-text-secondary);
	}

	.dot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: var(--ess-radius-pill);
		flex-shrink: 0;
	}

	.dot-holiday {
		background: var(--ess-primary);
	}

	.dot-approved {
		background: var(--ess-success);
	}

	.dot-pending {
		background: var(--ess-warning);
	}

	.weekday-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border: 1px solid var(--ess-border);
		border-bottom: none;
		border-radius: var(--ess-radius-sm) var(--ess-radius-sm) 0 0;
		background: var(--ess-sunken);
	}

	.weekday {
		text-align: center;
		padding: 9px 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--ess-text-secondary);
	}

	/* Hairline grid: the border colour shows through 1px gaps. */
	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
		background: var(--ess-border);
		border: 1px solid var(--ess-border);
		border-radius: 0 0 var(--ess-radius-sm) var(--ess-radius-sm);
		overflow: hidden;
	}

	.day-cell {
		aspect-ratio: 1 / 0.8;
		min-height: 4.5rem;
		border: none;
		background: var(--ess-surface);
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		cursor: pointer;
		text-align: center;
		overflow: hidden;
		transition: background var(--ess-t-fast);
	}

	.day-cell:hover {
		background: var(--ess-surface-hover);
	}

	.day-cell.out-of-month {
		background: var(--ess-sunken);
		cursor: default;
	}

	/* A week off is a non-working day, so it recedes rather than competing with
	   holidays and leave — the day number stays readable, the cell does not
	   invite a click. Today keeps its own emphasis. */
	.day-cell.is-week-off:not(.is-today) {
		background: var(--ess-sunken);
	}

	.day-cell.is-week-off:not(.is-today) .day-number {
		color: var(--ess-text-muted);
	}

	.tag-weekoff {
		background: var(--ess-neutral-bg);
		color: var(--ess-neutral);
	}

	.swatch {
		display: inline-block;
		width: 11px;
		height: 11px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.swatch-weekoff {
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-strong);
	}

	.day-cell.is-today {
		background: var(--ess-primary-soft);
	}

	.day-cell.is-today .day-number {
		color: var(--ess-primary-text);
	}

	.day-cell.is-selected {
		box-shadow: inset 0 0 0 2px var(--ess-primary);
	}

	.day-number {
		font-size: 14px;
		font-weight: 500;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}

	/* Marks the tail of the opening month ("26 Jul") so the cycle boundary is
	   obvious without a separate divider. */
	.day-month {
		font-size: 10px;
		font-weight: 500;
		color: var(--ess-text-muted);
		margin-left: 3px;
	}

	.day-tag {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 7px;
		border-radius: var(--ess-radius-xs);
		background: var(--ess-sunken);
		color: var(--ess-text-secondary);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-holiday {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}

	.tag-approved {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}

	.tag-pending {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}

	.day-dots {
		display: flex;
		gap: 4px;
	}

	.day-detail {
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid var(--ess-border-subtle);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.day-detail strong {
		font-family: var(--ess-font-display);
		font-size: 17px;
		font-weight: 600;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--ess-text);
	}

	.detail-type {
		margin-left: auto;
		font-size: 12.5px;
		text-transform: capitalize;
		color: var(--ess-text-secondary);
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
		padding: 24px 28px 26px;
	}

	.calendar-box.large .month-label {
		font-size: 26px;
	}

	.calendar-box.large .legend {
		gap: 22px;
		margin-bottom: 18px;
	}

	.calendar-box.large .month-grid .day-cell {
		min-height: 7.5rem;
		aspect-ratio: auto;
		padding: 10px;
		align-items: flex-start;
		text-align: left;
		gap: 5px;
	}

	.calendar-box.large .day-number {
		font-size: 15px;
	}

	.calendar-box.large .day-tag {
		font-size: 12px;
		padding: 3px 8px;
	}

	.calendar-box.large .day-detail {
		margin-top: 20px;
		padding-top: 18px;
	}

	@media (max-width: 900px) {
		.calendar-box.large {
			padding: 18px;
		}
		.calendar-box.large .month-grid .day-cell {
			min-height: 4.5rem;
		}
		.calendar-box.large .month-label,
		.month-label {
			font-size: 18px;
			min-width: auto;
		}
	}
</style>
