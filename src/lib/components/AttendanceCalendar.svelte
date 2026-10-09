<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import { dayMarker, leaveLetter, isHalfDayLeave, isPinkLeave, prohancePresence } from '$lib/attendance-markers';
	import { financialYearLabel } from '$lib/financial-year';
	import { cycleDates, cycleForDate, cycleForKey, cycleLabel } from '$lib/attendance-cycle';
	import type { ShiftDay } from '$lib/shift-hours';
	import {
		makeWeekOffResolver,
		type WeekOffRosterShape,
		type WeekOffAssignmentShape
	} from '$lib/week-off';

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
		days?: string | number | null;
		typeName: string;
		typeCode?: string | null;
	}

	interface ProhanceDayRow {
		sessionDate: string;
		firstLogin: string | Date | null;
		lastLogout: string | Date | null;
		timeOnSystemMinutes: number | null;
		dayType: string | null;
	}

	/**
	 * One component, three faces, so the month grid, the records table and
	 * the selected day's detail all read the same data the same way:
	 *
	 *   grid     the month calendar (the "Calendar" tab)
	 *   records  one row per day of the cycle (the "Records" tab)
	 *   detail   the selected day's punch timeline, for the page's aside
	 *
	 * `selectedKey` is bindable so the page can pair a grid or records
	 * instance with a detail instance.
	 */
	let {
		month, // 'YYYY-MM' — data is loaded per month by the server
		records,
		punchDays,
		holidays,
		leaves,
		prohanceDays = [],
		prohanceEnabled = false,
		shifts = [],
		weekOffRosters = [],
		weekOffAssignments = [],
		mode = 'grid',
		selectedKey = $bindable(null),
		onraise
	}: {
		month: string;
		records: AttendanceRecord[];
		punchDays: PunchDay[];
		holidays: HolidayRow[];
		leaves: LeaveRow[];
		prohanceDays?: ProhanceDayRow[];
		prohanceEnabled?: boolean;
		/**
		 * Attendance rows already paired into shifts by the server, so an overnight
		 * shift reports its full span against its start date instead of appearing
		 * as two half-days.
		 */
		shifts?: ShiftDay[];
		/**
		 * The employee's week-off roster. Absent, the resolver falls back to
		 * Saturday + Sunday — the behaviour before rosters existed.
		 */
		weekOffRosters?: WeekOffRosterShape[];
		weekOffAssignments?: WeekOffAssignmentShape[];
		mode?: 'grid' | 'records' | 'detail';
		selectedKey?: string | null;
		/** Called with the date when the person wants to raise a correction for it. */
		onraise?: (date: string) => void;
	} = $props();

	const isWeekOffDate = $derived(makeWeekOffResolver(weekOffRosters, weekOffAssignments));

	const shiftByDate = $derived(new Map(shifts.map((s) => [s.date, s])));
	/**
	 * Dates whose check-out belongs to the previous day's overnight shift.
	 *
	 * A date that also starts its own shift is excluded: on back-to-back night
	 * shifts the middle day both ends one shift and begins the next, and its own
	 * shift is the more useful thing to show.
	 */
	const absorbedInto = $derived(
		new Map(
			shifts
				.filter((s) => s.absorbedDate && !shifts.some((o) => o.date === s.absorbedDate))
				.map((s) => [s.absorbedDate as string, s])
		)
	);

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const MONTH_SHORT = [
		'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
	];

	const now = new Date();
	const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	// `month` identifies a payroll cycle by the month it ends in, so "today's"
	// cycle is the one containing today — on the 28th that is next month's.
	const currentMonthKey = cycleForDate(now).key;

	const cycle = $derived(cycleForKey(month));
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
	const prohanceByDate = $derived(
		new Map(prohanceDays.map((p) => [p.sessionDate.slice(0, 10), p]))
	);

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

	/**
	 * The leave markers actually present this month, so the legend explains the
	 * letters on screen instead of listing every type in the policy.
	 */
	const legendLeaveTypes = $derived.by(() => {
		const seen = new Map<string, { name: string; tone: string }>();
		for (const l of leaves) {
			if (isHalfDayLeave(l)) continue; // half days show H, covered above
			const letter = leaveLetter(l);
			if (!seen.has(letter)) {
				seen.set(letter, { name: l.typeName, tone: isPinkLeave(l) ? 'pink' : 'leave' });
			}
		}
		return [...seen].map(([letter, v]) => ({ letter, ...v }));
	});

	interface Cell {
		date: number;
		key: string;
		/** True for days inside the cycle; false for the grid's leading/trailing padding. */
		inMonth: boolean;
		isToday: boolean;
		isWeekend: boolean;
		/** Days from the cycle's opening month show it, so "26 Jul" reads clearly. */
		showMonth: boolean;
		monthShort: string;
	}

	const dayCells = $derived.by((): Cell[] =>
		cycleDates(cycle).map((key) => {
			const [, m, d] = key.split('-').map(Number);
			return {
				date: d,
				key,
				inMonth: true,
				isToday: key === todayKey,
				// The employee's own week off, from the roster assigned to them —
				// Saturday + Sunday only when they have no roster.
				isWeekend: isWeekOffDate(key),
				// A cycle spans two months, so days from the opening month carry
				// their month name to make the boundary unmistakable.
				showMonth: m !== cycle.endMonth,
				monthShort: MONTH_SHORT[m - 1]
			};
		})
	);

	const gridDays = $derived.by(() => {
		const cells: Cell[] = [];
		if (dayCells.length === 0) return cells;

		const blank = (key: string): Cell => ({
			date: 0,
			key,
			inMonth: false,
			isToday: false,
			isWeekend: false,
			showMonth: false,
			monthShort: ''
		});

		// Pad to the weekday the cycle opens on, so columns line up under Sun–Sat.
		const [fy, fm, fd] = dayCells[0].key.split('-').map(Number);
		const startWeekday = new Date(fy, fm - 1, fd).getDay();
		for (let i = 0; i < startWeekday; i++) cells.push(blank(`lead-${i}`));
		cells.push(...dayCells);

		let i = 0;
		while (cells.length % 7 !== 0) cells.push(blank(`trail-${i++}`));
		return cells;
	});

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
			!prohancePresence(prohanceByDate.get(cell.key)?.timeOnSystemMinutes) &&
			!(holidaysByDate.get(cell.key)?.length ?? 0) &&
			!(leaveByDate.get(cell.key)?.length ?? 0)
		);
	}

	/**
	 * Office hours are always shown in the company's timezone, not the viewer's.
	 * A punch recorded at 09:01 in the office must read "09:01" for everyone,
	 * including someone opening the portal while travelling.
	 */
	const OFFICE_TZ = 'Asia/Kolkata';

	function fmtTime(value: string | Date | null | undefined): string {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString('en-IN', {
			timeZone: OFFICE_TZ,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	const STANDARD_HOURS_LABEL = '9h';

	function formatMinutes(mins: number): string {
		return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
	}

	function anomalyLabel(a: NonNullable<ShiftDay['anomaly']>): string {
		switch (a) {
			case 'missing-check-out':
				return 'Check-in recorded but no check-out';
			case 'orphan-check-out':
				return 'Check-out with no matching check-in';
			case 'gap-too-long':
				return 'Check-out too far from check-in to pair as one shift';
			case 'check-out-before-check-in':
				return 'Check-out is earlier than check-in — device clock fault';
		}
	}

	function duration(from: string | Date, to: string | Date): string {
		const ms = new Date(to).getTime() - new Date(from).getTime();
		const h = Math.floor(ms / 3_600_000);
		const m = Math.floor((ms % 3_600_000) / 60_000);
		return `${h}h ${m}m`;
	}

	function minutesLabel(mins: number | null | undefined): string | null {
		if (mins === null || mins === undefined || mins === 0) return null;
		return `${Math.floor(mins / 60)}h ${mins % 60}m`;
	}

	/** Compact 24h time for a calendar cell. */
	function cellTime(value: string | Date | null | undefined): string {
		if (!value) return '';
		return fmtTime(value);
	}

	function fmtHeading(key: string): string {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function fmtShort(key: string): { date: string; day: string } {
		const [y, m, d] = key.split('-').map(Number);
		const dt = new Date(y, m - 1, d);
		return { date: `${d} ${MONTH_SHORT[m - 1]}`, day: WEEKDAY_NAMES[dt.getDay()] };
	}

	function markerFor(cell: Cell) {
		const rec = recordsByDate.get(cell.key);
		return dayMarker({
			hasCheckIn: Boolean(rec?.checkInAt),
			leaves: leaveByDate.get(cell.key) ?? [],
			isHoliday: (holidaysByDate.get(cell.key)?.length ?? 0) > 0,
			isAbsent: isAbsent(cell),
			prohanceMinutes: prohanceByDate.get(cell.key)?.timeOnSystemMinutes,
			isWeekOff: cell.isWeekend
		});
	}

	function cellLabel(cell: Cell): string {
		const rec = recordsByDate.get(cell.key);
		const dayHolidays = holidaysByDate.get(cell.key) ?? [];
		// Named from the cell's own date, not the cycle's end month — a 26 Jul
		// cell in the August cycle must not read as "August 26".
		const cellMonth = Number(cell.key.slice(5, 7)) - 1;
		const base = `${MONTH_NAMES[cellMonth]} ${cell.date}`;

		// The marker is a letter on screen; screen readers get its full meaning.
		const marker = markerFor(cell);

		const parts = [base];
		if (marker) parts.push(marker.label);
		if (rec?.checkInAt) {
			parts.push(`in ${fmtTime(rec.checkInAt)}`);
			if (rec.checkOutAt) {
				parts.push(`out ${fmtTime(rec.checkOutAt)}`);
				parts.push(duration(rec.checkInAt, rec.checkOutAt));
			}
		}
		if (!marker && dayHolidays.length > 0) parts.push(dayHolidays[0].name);
		return parts.join(', ');
	}

	/** Everything known about one day, for the detail panel and the records table. */
	function dayInfo(key: string) {
		const record = recordsByDate.get(key) ?? null;
		const shift = shiftByDate.get(key) ?? null;
		const tailOf = absorbedInto.get(key) ?? null;
		return {
			key,
			record,
			shift,
			tailOf,
			punches: punchesByDate.get(key) ?? null,
			holidays: holidaysByDate.get(key) ?? [],
			leaves: leaveByDate.get(key) ?? [],
			prohance: prohanceByDate.get(key) ?? null,
			isWeekend: isWeekOffDate(key),
			isPast: key < todayKey,
			isToday: key === todayKey,
			// A check-in with no check-out on a day that has ended.
			missingOut: Boolean(record?.checkInAt && !record.checkOutAt && !shift?.checkOutAt && key < todayKey)
		};
	}

	type Status = { label: string; badge: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'leave' | 'pink' | 'none' };

	function statusFor(key: string): Status {
		const d = dayInfo(key);
		if (d.shift?.anomaly || d.missingOut) {
			return { label: d.shift?.anomaly === 'orphan-check-out' ? 'Missing check-in' : 'Missing check-out', badge: 'pending', tone: 'warn' };
		}
		if (d.record?.checkInAt) {
			const half = prohancePresence(d.prohance?.timeOnSystemMinutes) === 'half' && !d.record.checkOutAt;
			return half ? { label: 'Half day', badge: 'pending', tone: 'warn' } : { label: 'Present', badge: 'present', tone: 'ok' };
		}
		const approvedLeave = d.leaves.find((l) => l.status === 'approved');
		if (approvedLeave) return { label: 'On leave', badge: 'approved', tone: isPinkLeave(approvedLeave) ? 'pink' : 'leave' };
		const ph = prohancePresence(d.prohance?.timeOnSystemMinutes);
		if (ph === 'present') return { label: 'Present · ProHance', badge: 'present', tone: 'ok' };
		if (ph === 'half') return { label: 'Half day · ProHance', badge: 'pending', tone: 'warn' };
		if (d.leaves.length > 0) return { label: 'Leave pending', badge: 'pending', tone: 'warn' };
		if (d.holidays.length > 0) return { label: 'Holiday', badge: 'info', tone: 'info' };
		if (d.isWeekend) return { label: 'Week off', badge: 'optional', tone: 'neutral' };
		if (d.isPast) return { label: 'Absent', badge: 'absent', tone: 'bad' };
		if (d.isToday) return { label: 'No activity yet', badge: 'optional', tone: 'none' };
		return { label: 'Upcoming', badge: 'optional', tone: 'none' };
	}

	/** Whether a day is one the person might reasonably want to correct. */
	function correctable(key: string): boolean {
		if (key > todayKey) return false;
		const d = dayInfo(key);
		if (d.isWeekend || d.holidays.length > 0) return false;
		if (d.leaves.some((l) => l.status === 'approved')) return false;
		return Boolean(d.shift?.anomaly || d.missingOut || (!d.record?.checkInAt && d.isPast) || d.shift?.isShort);
	}

	const selected = $derived(selectedKey ? dayInfo(selectedKey) : null);
	const selectedStatus = $derived(selectedKey ? statusFor(selectedKey) : null);

	function workedLabel(key: string): string {
		const d = dayInfo(key);
		if (d.tailOf) return `ends ${cellTime(d.tailOf.checkOutAt)}`;
		if (d.shift?.workedMinutes !== null && d.shift?.workedMinutes !== undefined) return formatMinutes(d.shift.workedMinutes);
		if (d.record?.checkInAt && d.record.checkOutAt) return duration(d.record.checkInAt, d.record.checkOutAt);
		return '—';
	}
</script>

{#if mode === 'grid'}
	<div class="calendar-box ess-card">
		<div class="calendar-header">
			<h2 class="month-label">
				{cycleLabel(cycle)}
				<span class="fy-label">{financialYearLabel(viewYear, viewMonth)}</span>
			</h2>
			<div class="month-nav">
				{#if month !== currentMonthKey}
					<a class="ess-btn ess-btn--ghost ess-btn--sm" href="?month={currentMonthKey}" data-sveltekit-noscroll>Today</a>
				{/if}
				<a class="ess-icon-btn ess-icon-btn--bordered nav-btn" href="?month={shiftMonth(-1)}" data-sveltekit-noscroll aria-label="Previous month">
					<ChevronLeft size={16} />
				</a>
				<a class="ess-icon-btn ess-icon-btn--bordered nav-btn" href="?month={shiftMonth(1)}" data-sveltekit-noscroll aria-label="Next month">
					<ChevronRight size={16} />
				</a>
			</div>
		</div>

		<div class="weekday-row">
			{#each WEEKDAY_NAMES as wd (wd)}
				<span class="weekday" class:is-today={WEEKDAY_NAMES[now.getDay()] === wd && month === currentMonthKey}>{wd}</span>
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
					{@const shift = shiftByDate.get(cell.key)}
					{@const tailOf = absorbedInto.get(cell.key)}
					{@const ph = prohanceByDate.get(cell.key)}
					{@const marker = markerFor(cell)}
					{@const status = statusFor(cell.key)}
					<button
						class="day-cell"
						class:is-today={cell.isToday}
						class:is-weekend={cell.isWeekend}
						class:is-selected={selectedKey === cell.key}
						class:is-future={cell.key > todayKey}
						aria-pressed={selectedKey === cell.key}
						aria-label={cellLabel(cell)}
						onclick={() => (selectedKey = selectedKey === cell.key ? null : cell.key)}
					>
						<span class="day-head">
							<span class="day-number">
								{cell.date}{#if cell.showMonth}<span class="day-month">{cell.monthShort}</span>{/if}
							</span>
							<span class="day-dots">
								{#if rec?.source === 'manual' && rec.checkInAt}<i class="dot dot-portal" title="Portal"></i>{/if}
								{#if punch || rec?.source === 'biometric'}<i class="dot dot-biometric" title="Biometric"></i>{/if}
								{#if prohanceByDate.get(cell.key)?.firstLogin}<i class="dot dot-prohance" title="ProHance"></i>{/if}
							</span>
						</span>

						<!-- The day's status as one dot, as in the mockup; the marker letter
						     bottom-right keeps the exact code (P / H / EL / SL …). -->
						<span class="status-dot" data-tone={status.tone} aria-hidden="true"></span>

						<!-- In-time, ProHance activity, out-time on one row. An overnight
						     shift shows its own span on the start date; the morning it ends
						     on shows the tail. -->
						<span class="cell-times">
							{#if tailOf}
								<span class="t-in t-cont">↳ shift</span>
							{:else}
								<span class="t-in">{cellTime(shift?.checkInAt ?? rec?.checkInAt)}</span>
							{/if}
							<span class="t-mid">
								{#if ph && minutesLabel(ph.timeOnSystemMinutes)}
									<span class="mid-prohance" title="ProHance time on system">{minutesLabel(ph.timeOnSystemMinutes)}</span>
								{/if}
							</span>
							{#if tailOf}
								<span class="t-out">{cellTime(tailOf.checkOutAt)}</span>
							{:else}
								<span class="t-out">
									{cellTime(shift?.checkOutAt ?? rec?.checkOutAt)}{#if shift?.crossesMidnight}<span class="next-day">+1</span>{/if}
								</span>
							{/if}
						</span>

						<span class="cell-foot">
							<span class="cell-middle">
								{#if tailOf}
									<span class="mid-tag">ends {cellTime(tailOf.checkOutAt)}</span>
								{:else if shift?.workedMinutes !== null && shift?.workedMinutes !== undefined}
									<span class:short-hours={shift.isShort} title={shift.isShort ? `Under ${STANDARD_HOURS_LABEL}` : ''}>
										{formatMinutes(shift.workedMinutes)}{#if shift.isShort}<span class="short-flag">!</span>{/if}
									</span>
								{:else if shift?.anomaly}
									<span class="mid-tag anomaly" title={anomalyLabel(shift.anomaly)}>needs review</span>
								{:else if dayLeaves.length > 0}
									<span class="mid-tag">{dayLeaves[0].typeName}</span>
								{:else if dayHolidays.length > 0}
									<span class="mid-tag" title={dayHolidays.map((h) => h.name).join(', ')}>{dayHolidays[0].name}</span>
								{:else if cell.isWeekend}
									<span class="mid-tag mid-weekoff">Week off</span>
								{/if}
							</span>
							{#if marker}
								<span class="marker marker-{marker.tone}" title={marker.label}>{marker.letter}</span>
							{/if}
						</span>
					</button>
				{/if}
			{/each}
		</div>

		<div class="legend">
			<span class="legend-item"><i class="sdot" data-tone="ok"></i> Present</span>
			<span class="legend-item"><i class="sdot" data-tone="warn"></i> Missing punch / half day</span>
			<span class="legend-item"><i class="sdot" data-tone="leave"></i> Leave</span>
			<span class="legend-item"><i class="sdot" data-tone="info"></i> Holiday</span>
			<span class="legend-item"><i class="sdot" data-tone="neutral"></i> Week off</span>
			<span class="legend-item"><i class="sdot" data-tone="bad"></i> Absent</span>
			{#each legendLeaveTypes as lt (lt.letter)}
				<span class="legend-item"><span class="marker marker-{lt.tone}">{lt.letter}</span> {lt.name}</span>
			{/each}
			<span class="legend-sep" aria-hidden="true"></span>
			<span class="legend-item"><i class="dot dot-portal"></i> Portal</span>
			<span class="legend-item"><i class="dot dot-biometric"></i> Biometric</span>
			{#if prohanceEnabled}
				<span class="legend-item"><i class="dot dot-prohance"></i> ProHance</span>
			{/if}
		</div>
	</div>
{:else if mode === 'records'}
	<div class="ess-card records-box">
		<div class="calendar-header">
			<div class="month-nav">
				<a class="ess-icon-btn nav-btn" href="?month={shiftMonth(-1)}" data-sveltekit-noscroll aria-label="Previous month">
					<ChevronLeft size={16} />
				</a>
				<h2 class="month-label">{cycleLabel(cycle)} <span class="fy-label">{financialYearLabel(viewYear, viewMonth)}</span></h2>
				<a class="ess-icon-btn nav-btn" href="?month={shiftMonth(1)}" data-sveltekit-noscroll aria-label="Next month">
					<ChevronRight size={16} />
				</a>
			</div>
			{#if month !== currentMonthKey}
				<a class="ess-btn ess-btn--soft ess-btn--sm" href="?month={currentMonthKey}" data-sveltekit-noscroll><CalendarDays size={14} /> This month</a>
			{/if}
		</div>
		<div class="table-wrap">
			<table class="ess-table records">
				<thead>
					<tr>
						<th>Date</th>
						<th>Day</th>
						<th>Check-in</th>
						<th>Check-out</th>
						<th>Total hours</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each dayCells as cell (cell.key)}
						{@const d = dayInfo(cell.key)}
						{@const status = statusFor(cell.key)}
						{@const s = fmtShort(cell.key)}
						{@const future = cell.key > todayKey}
						<tr
							class:is-selected={selectedKey === cell.key}
							class:is-flag={status.tone === 'warn' || status.tone === 'bad'}
							class:is-future={future}
							aria-selected={selectedKey === cell.key}
							onclick={() => (selectedKey = cell.key)}
						>
							<td class="c-date">{s.date}{#if cell.isToday}<span class="today-tag">Today</span>{/if}</td>
							<td class="c-day">{s.day}</td>
							<td class="c-time">{d.tailOf ? '↳ shift' : d.shift?.checkInAt || d.record?.checkInAt ? cellTime(d.shift?.checkInAt ?? d.record?.checkInAt) : '—'}</td>
							<td class="c-time">
								{#if d.tailOf}{cellTime(d.tailOf.checkOutAt)}{:else if d.shift?.checkOutAt || d.record?.checkOutAt}{cellTime(d.shift?.checkOutAt ?? d.record?.checkOutAt)}{#if d.shift?.crossesMidnight}<span class="next-day">+1</span>{/if}{:else}—{/if}
							</td>
							<td class="c-time">
								{workedLabel(cell.key)}{#if d.shift?.isShort}<span class="short-flag" title="Under {STANDARD_HOURS_LABEL}">!</span>{/if}
								{#if d.prohance && minutesLabel(d.prohance.timeOnSystemMinutes)}<span class="ph-note">· {minutesLabel(d.prohance.timeOnSystemMinutes)} ProHance</span>{/if}
							</td>
							<td>
								{#if future}<span class="muted">Upcoming</span>{:else}<span class="ess-badge ess-badge--{status.badge}">{status.label}</span>{/if}
							</td>
							<td class="c-act">
								{#if correctable(cell.key)}
									<button type="button" class="ess-btn ess-btn--outline ess-btn--sm" onclick={(e) => { e.stopPropagation(); onraise?.(cell.key); }}>Raise correction</button>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{:else}
	<div class="ess-card detail-box">
		{#if selected && selectedStatus}
			<div class="detail-head">
				<h2 class="ess-h2">{fmtHeading(selected.key)}</h2>
				<span class="ess-badge ess-badge--{selectedStatus.badge}">{selectedStatus.label}</span>
			</div>

			<ol class="punches">
				<li class="punch" data-tone={selected.record?.checkInAt || selected.shift?.checkInAt ? 'ok' : selected.isPast && !selected.isWeekend && !selected.holidays.length && !selected.leaves.length ? 'bad' : 'none'}>
					<span class="p-time">{selected.tailOf ? '↳' : cellTime(selected.shift?.checkInAt ?? selected.record?.checkInAt) || '--:--'}</span>
					<span class="p-dot" aria-hidden="true"></span>
					<span class="p-body">
						<strong>Check-in</strong>
						<small>
							{#if selected.tailOf}Continues the shift that started on {fmtShort(selected.tailOf.date).date}
							{:else if selected.record?.checkInAt}{selected.record.source === 'biometric' ? 'Biometric (Office)' : 'Portal'}
							{:else}Not recorded{/if}
						</small>
					</span>
					{#if selected.record?.checkInAt}<span class="ess-badge ess-badge--present">Recorded</span>{/if}
				</li>
				<li class="punch" data-tone={selected.tailOf || selected.shift?.checkOutAt || selected.record?.checkOutAt ? 'ok' : selected.missingOut ? 'warn' : 'none'}>
					<span class="p-time">{selected.tailOf ? cellTime(selected.tailOf.checkOutAt) : cellTime(selected.shift?.checkOutAt ?? selected.record?.checkOutAt) || '--:--'}</span>
					<span class="p-dot" aria-hidden="true"></span>
					<span class="p-body">
						<strong>Check-out</strong>
						<small>
							{#if selected.tailOf || selected.shift?.checkOutAt || selected.record?.checkOutAt}
								{#if selected.shift?.workedMinutes != null}{formatMinutes(selected.shift.workedMinutes)} worked{#if selected.shift.crossesMidnight} · next day{/if}{:else if selected.record?.checkInAt && selected.record.checkOutAt}{duration(selected.record.checkInAt, selected.record.checkOutAt)} worked{:else}Recorded{/if}
							{:else if selected.isToday && selected.record?.checkInAt}Not yet recorded
							{:else}Not recorded{/if}
						</small>
					</span>
					{#if selected.missingOut}<span class="ess-badge ess-badge--pending">Missing punch</span>
					{:else if selected.shift?.isShort}<span class="ess-badge ess-badge--pending">Short day</span>{/if}
				</li>
			</ol>

			{#if selected.shift?.anomaly && selected.shift.anomaly !== 'missing-check-out'}
				<p class="anomaly-line"><CircleAlert size={14} /> {anomalyLabel(selected.shift.anomaly)}</p>
			{/if}

			<div class="source-rows">
				<div class="source-row">
					<span class="source-label">Biometric sync</span>
					{#if selected.punches}
						<span class="source-value">First {fmtTime(selected.punches.firstAt)} · Last {fmtTime(selected.punches.lastAt)} <span class="source-note">{selected.punches.count} {selected.punches.count === 1 ? 'punch' : 'punches'}</span></span>
					{:else}
						<span class="source-value muted">No punches synced</span>
					{/if}
				</div>
				<div class="source-row">
					<span class="source-label">ProHance</span>
					{#if selected.prohance}
						<!-- ProHance contributes activity volume only. In/out times come
						     strictly from biometric/portal attendance, never from here. -->
						<span class="source-value">
							{#if minutesLabel(selected.prohance.timeOnSystemMinutes)}{minutesLabel(selected.prohance.timeOnSystemMinutes)} on system{#if selected.prohance.dayType} <span class="source-note">{selected.prohance.dayType}</span>{/if}{:else}{selected.prohance.dayType ?? 'No activity'}{/if}
						</span>
					{:else if prohanceEnabled}
						<span class="source-value muted">No ProHance data</span>
					{:else}
						<span class="source-value muted">Not connected yet</span>
					{/if}
				</div>
			</div>

			{#each selected.holidays as h (h.name)}
				<p class="detail-row"><i class="sdot" data-tone="info"></i> {h.name} <span class="detail-type">{h.type.toLowerCase()} holiday</span></p>
			{/each}
			{#each selected.leaves as l (l.id)}
				<p class="detail-row"><i class="sdot" data-tone={l.status === 'approved' ? 'leave' : 'warn'}></i> {l.typeName} <span class="detail-type">{l.status}</span></p>
			{/each}

			{#if selected.missingOut}
				<div class="ess-notice">
					<span class="ess-notice__icon"><CircleAlert size={15} /></span>
					<div class="ess-notice__body"><strong>Your check-out is missing.</strong>Raise a correction request with the actual check-out time to update your record.</div>
					<button type="button" class="ess-btn ess-btn--primary" onclick={() => onraise?.(selected.key)}>Raise correction</button>
				</div>
			{:else if selectedStatus.tone === 'bad'}
				<div class="ess-notice ess-notice--danger">
					<span class="ess-notice__icon"><CircleAlert size={15} /></span>
					<div class="ess-notice__body"><strong>No attendance recorded.</strong>If you were working, raise a correction so HR can review it.</div>
					<button type="button" class="ess-btn ess-btn--primary" onclick={() => onraise?.(selected.key)}>Raise correction</button>
				</div>
			{:else if correctable(selected.key)}
				<div class="ess-notice ess-notice--info">
					<span class="ess-notice__icon"><CircleAlert size={15} /></span>
					<div class="ess-notice__body"><strong>Something not right?</strong>Attendance comes from the biometric terminal; a correction asks HR to review it.</div>
					<button type="button" class="ess-btn ess-btn--outline ess-btn--sm" onclick={() => onraise?.(selected.key)}>Raise correction</button>
				</div>
			{/if}
		{:else}
			<div class="detail-empty">
				<span class="ess-tile ess-tile--neutral"><CalendarDays size={20} /></span>
				<p>Pick a day on the calendar to see its punches.</p>
			</div>
		{/if}
	</div>
{/if}

<style>
	.calendar-box {
		padding: 18px 20px 16px;
	}

	/* A 7-column month grid can't compress below ~300px and stay legible,
	   so on phones the calendar scrolls horizontally inside its own box
	   rather than forcing the whole page to scroll. */
	@media (max-width: 560px) {
		.calendar-box {
			padding: 14px;
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
		font-family: var(--ess-font-display);
		font-size: 22px;
		font-weight: 600;
		color: var(--ess-text);
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* Secondary to the month itself — it qualifies the date rather than
	   naming it. */
	.fy-label {
		font-family: var(--ess-font-sans);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ess-text-muted);
		background: var(--ess-sunken);
		border-radius: var(--ess-radius-pill);
		padding: 2px 8px;
	}

	.nav-btn {
		width: 32px;
		height: 32px;
	}

	.weekday-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border: 1px solid var(--ess-border);
		border-bottom: none;
		border-radius: var(--ess-radius-md) var(--ess-radius-md) 0 0;
		background: var(--ess-sunken);
	}

	.weekday {
		text-align: center;
		padding: 9px 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--ess-text-secondary);
	}
	.weekday.is-today {
		color: var(--ess-text);
		font-weight: 600;
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border: 1px solid var(--ess-border);
		border-radius: 0 0 var(--ess-radius-md) var(--ess-radius-md);
		overflow: hidden;
		background: var(--ess-border-subtle);
		gap: 1px;
	}

	.day-cell {
		min-height: 82px;
		border: none;
		background: var(--ess-surface);
		padding: 8px 9px 6px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 3px;
		cursor: pointer;
		text-align: left;
		overflow: hidden;
		position: relative;
		transition: background var(--ess-t-fast);
		font: inherit;
	}

	.day-cell:hover {
		background: var(--ess-surface-hover);
	}
	.day-cell:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 2px var(--ess-primary);
		z-index: 1;
	}

	.day-empty {
		background: var(--ess-canvas);
		cursor: default;
	}

	.day-cell.is-weekend .day-number {
		color: var(--ess-text-muted);
	}
	.day-cell.is-future .day-number {
		color: var(--ess-text-muted);
	}

	.day-cell.is-today .day-number {
		color: var(--ess-primary-text);
	}

	.day-cell.is-selected {
		background: var(--ess-primary-soft);
	}

	.day-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}

	.day-number {
		font-size: 14px;
		font-weight: 500;
		color: var(--ess-text);
	}

	/* Marks the tail of the opening month ("26 Jul") so the cycle boundary is
	   obvious without a separate divider. */
	.day-month {
		font-size: 10px;
		font-weight: 500;
		color: var(--ess-text-muted);
		margin-left: 3px;
	}

	.day-dots {
		display: flex;
		gap: 3px;
		align-items: center;
	}

	.dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot-portal {
		background: var(--ess-primary);
	}
	.dot-biometric {
		background: var(--acc2);
	}
	.dot-prohance {
		background: var(--ess-warning);
	}

	.status-dot,
	.sdot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: transparent;
		flex-shrink: 0;
	}
	.status-dot[data-tone='ok'],
	.sdot[data-tone='ok'] {
		background: var(--ess-success);
	}
	.status-dot[data-tone='warn'],
	.sdot[data-tone='warn'] {
		background: var(--ess-warning);
	}
	.status-dot[data-tone='bad'],
	.sdot[data-tone='bad'] {
		background: var(--ess-danger);
	}
	.status-dot[data-tone='info'],
	.sdot[data-tone='info'] {
		background: var(--ess-info);
	}
	.status-dot[data-tone='leave'],
	.sdot[data-tone='leave'] {
		background: var(--acc2);
	}
	.status-dot[data-tone='pink'] {
		background: var(--ess-pink);
	}
	.status-dot[data-tone='neutral'],
	.sdot[data-tone='neutral'] {
		background: var(--ess-border-strong);
	}

	/* In-time, ProHance activity, out-time on one line. */
	.cell-times {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: baseline;
		gap: 2px;
		font-size: 11px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		min-height: 14px;
	}
	.t-in {
		justify-self: start;
	}
	.t-mid {
		justify-self: center;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.t-out {
		justify-self: end;
		color: var(--ess-text-muted);
	}
	.mid-prohance {
		color: var(--ess-warning);
		font-variant-numeric: tabular-nums;
	}
	.t-cont {
		color: var(--ess-text-muted);
		font-size: 10px;
	}

	.cell-foot {
		margin-top: auto;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 4px;
		min-height: 16px;
	}

	.cell-middle {
		font-size: 11px;
		font-weight: 500;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
		min-width: 0;
		overflow: hidden;
	}

	.mid-tag {
		font-size: 10.5px;
		font-weight: 500;
		color: var(--ess-text-secondary);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	/* Worked less than a standard shift. Amber, not red — a short day is worth
	   noticing but it isn't an error. */
	.short-hours {
		color: var(--ess-warning);
	}
	.short-flag {
		font-weight: 700;
		margin-left: 2px;
		color: var(--ess-warning);
	}
	.mid-tag.anomaly {
		color: var(--ess-danger);
	}
	.mid-tag.mid-weekoff {
		color: var(--ess-text-muted);
	}

	/* "+1" after a check-out that happened the following morning. */
	.next-day {
		font-size: 9px;
		font-weight: 700;
		vertical-align: super;
		color: var(--ess-text-muted);
		margin-left: 1px;
	}

	/* The day's single status marker: P present, H half day, A absent, or the
	   leave type's own policy code (EL, SL, PI…). */
	.marker {
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.02em;
		padding: 3px 5px;
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}
	.marker-present {
		background: var(--ess-success-bg);
		color: var(--ess-success);
	}
	.marker-half {
		background: var(--ess-warning-bg);
		color: var(--ess-warning);
	}
	.marker-leave {
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.marker-absent {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}
	.marker-holiday {
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}
	.marker-weekoff {
		background: var(--ess-neutral-bg);
		color: var(--ess-neutral);
	}
	.marker-pink {
		background: var(--ess-pink-bg);
		color: var(--ess-pink);
	}

	.legend {
		display: flex;
		gap: 6px 18px;
		margin-top: 14px;
		flex-wrap: wrap;
		align-items: center;
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 12.5px;
		color: var(--ess-text-secondary);
	}
	.legend-sep {
		width: 1px;
		height: 14px;
		background: var(--ess-border);
	}

	/* ---------- records table ---------- */
	.records-box {
		padding: 18px 20px 8px;
	}
	.table-wrap {
		margin: 0 -20px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.records th:first-child,
	.records td:first-child {
		padding-left: 20px;
	}
	.records th:last-child,
	.records td:last-child {
		padding-right: 20px;
	}
	.records tbody tr {
		cursor: pointer;
	}
	.records tbody tr.is-flag td {
		background: var(--ess-warning-bg);
	}
	.records tbody tr.is-future td {
		color: var(--ess-text-muted);
	}
	.records td {
		padding-top: 11px;
		padding-bottom: 11px;
	}
	.c-date {
		font-weight: 500;
		white-space: nowrap;
	}
	.today-tag {
		margin-left: 8px;
		font-size: 10.5px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: var(--ess-radius-pill);
		background: var(--ess-primary-soft);
		color: var(--ess-primary-text);
	}
	.c-day {
		color: var(--ess-text-secondary);
	}
	.c-time {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.ph-note {
		font-size: 12px;
		color: var(--ess-warning);
	}
	.c-act {
		white-space: nowrap;
	}
	.muted {
		color: var(--ess-text-muted);
	}

	/* ---------- day detail ---------- */
	.detail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 14px;
		margin-bottom: 6px;
		border-bottom: 1px solid var(--ess-border);
	}
	.detail-head .ess-h2 {
		font-size: 22px;
	}

	.punches {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: grid;
	}
	.punch {
		position: relative;
		display: grid;
		grid-template-columns: 48px 20px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0 12px;
		padding: 12px 0;
	}
	.punch::before {
		content: '';
		position: absolute;
		left: 69px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--ess-border-subtle);
	}
	.punch:first-child::before {
		top: 50%;
	}
	.punch:last-child::before {
		bottom: 50%;
	}
	.p-time {
		font-size: 14px;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.p-dot {
		position: relative;
		z-index: 1;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		justify-self: center;
		background: var(--ess-border-strong);
		box-shadow: 0 0 0 3px var(--ess-surface);
	}
	.punch[data-tone='ok'] .p-dot {
		background: var(--ess-success);
	}
	.punch[data-tone='warn'] .p-dot {
		background: var(--ess-warning);
	}
	.punch[data-tone='bad'] .p-dot {
		background: var(--ess-danger);
	}
	.p-body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.p-body strong {
		font-size: 15px;
		font-weight: 500;
	}
	.p-body small {
		font-size: 13px;
		color: var(--ess-text-secondary);
	}

	.anomaly-line {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ess-danger);
		margin: -6px 0 12px;
	}

	.source-rows {
		display: grid;
		border: 1px solid var(--ess-border);
		border-radius: var(--ess-radius-md);
		margin-bottom: 14px;
	}
	.source-row {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 10px;
		align-items: baseline;
		padding: 9px 12px;
		font-size: 13px;
	}
	.source-row:not(:last-child) {
		border-bottom: 1px solid var(--ess-border-subtle);
	}
	.source-label {
		font-size: 12.5px;
		color: var(--ess-text-muted);
	}
	.source-value {
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
	}
	.source-value.muted {
		color: var(--ess-text-muted);
	}
	.source-note {
		font-size: 12px;
		color: var(--ess-text-muted);
		margin-left: 4px;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13.5px;
		color: var(--ess-text);
		margin-bottom: 10px;
	}
	.detail-type {
		margin-left: auto;
		font-size: 12px;
		text-transform: capitalize;
		color: var(--ess-text-secondary);
	}

	.detail-box .ess-notice {
		flex-wrap: wrap;
	}
	.detail-box .ess-notice .ess-btn {
		margin-left: auto;
	}

	.detail-empty {
		display: grid;
		justify-items: center;
		gap: 10px;
		padding: 24px 0;
		text-align: center;
		color: var(--ess-text-muted);
		font-size: 13.5px;
	}
	.detail-empty p {
		margin: 0;
	}

	@media (max-width: 900px) {
		.cell-times,
		.cell-middle {
			font-size: 10px;
		}
	}

	@media (max-width: 840px) {
		.cell-times {
			grid-template-columns: 1fr 1fr;
			row-gap: 1px;
		}
		.t-mid {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}

	@media (max-width: 760px) {
		.cell-middle {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.day-cell {
			min-height: 56px;
			padding: 6px;
		}
		.cell-times {
			display: none;
		}
		.source-row {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.day-cell {
			transition: none;
		}
	}
</style>
