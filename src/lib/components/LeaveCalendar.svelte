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
		/* Widened from 11rem to fit the FY chip without the arrows shifting
		   as the month name changes length. */
		min-width: 19rem;
		text-align: center;
		white-space: nowrap;
	}

	/* Secondary to the month itself — it qualifies the date rather than
	   naming it. */
	.fy-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ess-text-secondary);
		background: var(--ess-sunken);
		border: 1px solid var(--ess-border-subtle);
		border-radius: var(--ess-radius-pill);
		padding: 0.12rem 0.45rem;
		margin-left: 0.35rem;
		vertical-align: middle;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--ess-radius-pill);
		border: none;
		background: var(--ess-sunken);
		color: var(--ess-text);
		cursor: pointer;
	}

	.nav-btn:hover {
		background: var(--ess-primary);
		color: #fff;
	}

	.today-btn {
		border: 1px solid var(--ess-border-strong);
		background: var(--ess-surface);
		color: var(--ess-primary-text);
		font-weight: 600;
		font-size: 0.85rem;
		padding: 0.4rem 0.9rem;
		border-radius: var(--ess-radius-sm);
		cursor: pointer;
	}

	.today-btn:hover {
		background: var(--ess-sunken);
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
		color: var(--ess-text-secondary);
	}

	.dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
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
		aspect-ratio: 1 / 0.85;
		min-height: 4.5rem;
		border-radius: var(--ess-radius-sm);
		border: 1px solid transparent;
		background: var(--ess-sunken);
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
		border-color: var(--ess-border-strong);
	}

	.day-cell.out-of-month {
		background: transparent;
		opacity: 0.35;
	}

	/* A week off is a non-working day, so it recedes rather than competing with
	   holidays and leave — the day number stays readable, the cell does not
	   invite a click. Today keeps its own emphasis. */
	/* Tinted rather than merely dimmed: --ess-surface is nearly the same as the
	   cell's own background, so a week off was indistinguishable from a working
	   day with nothing on it. */
	.day-cell.is-week-off:not(.is-today) {
		background: var(--ess-neutral-bg);
		border-color: var(--ess-border-subtle);
		box-shadow: inset 3px 0 0 var(--ess-neutral-bg);
	}

	.day-cell.is-week-off:not(.is-today) .day-number {
		color: var(--ess-neutral);
	}

	/* Slate, so it never competes with holiday (blue), approved (green) or
	   pending (amber) leave. 7.3:1 light, 11.8:1 dark. */
	.tag-weekoff {
		background: var(--ess-neutral-bg);
		color: var(--ess-neutral);
		font-weight: 700;
	}

	.swatch {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.swatch-weekoff {
		background: var(--ess-neutral-bg);
		border: 1px solid var(--ess-neutral);
	}

	.day-cell.is-today {
		background: var(--ess-primary);
	}

	.day-cell.is-today .day-number {
		color: var(--ess-text-on-primary);
	}

	.day-cell.is-selected {
		border-color: var(--ess-primary);
		border-width: 2px;
	}

	.day-number {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ess-text);
	}

	/* Marks the tail of the opening month ("26 Jul") so the cycle boundary is
	   obvious without a separate divider. */
	.day-month {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--ess-text-muted);
		margin-left: 0.15rem;
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
	}

	.tag-holiday {
		background: var(--ess-info-bg);
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
		gap: 0.2rem;
	}

	.day-detail {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--ess-border);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
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
		min-width: 19rem;
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
		border-radius: var(--ess-radius-md);
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
