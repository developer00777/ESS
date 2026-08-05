<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { dayMarker, leaveLetter, isHalfDayLeave } from '$lib/attendance-markers';
	import { financialYearLabel } from '$lib/financial-year';
	import { cycleDates, cycleForDate, cycleForKey, cycleLabel } from '$lib/attendance-cycle';
	import type { ShiftDay } from '$lib/shift-hours';

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

	let {
		month, // 'YYYY-MM' — data is loaded per month by the server
		records,
		punchDays,
		holidays,
		leaves,
		prohanceDays = [],
		prohanceEnabled = false,
		shifts = []
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
	} = $props();

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
		const seen = new Map<string, string>();
		for (const l of leaves) {
			if (isHalfDayLeave(l)) continue; // half days show H, covered above
			const letter = leaveLetter(l);
			if (!seen.has(letter)) seen.set(letter, l.typeName);
		}
		return [...seen].map(([letter, name]) => ({ letter, name }));
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

	const gridDays = $derived.by(() => {
		const cells: Cell[] = [];
		const dates = cycleDates(cycle);
		if (dates.length === 0) return cells;

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
		const [fy, fm, fd] = dates[0].split('-').map(Number);
		const startWeekday = new Date(fy, fm - 1, fd).getDay();
		for (let i = 0; i < startWeekday; i++) cells.push(blank(`lead-${i}`));

		for (const key of dates) {
			const [y, m, d] = key.split('-').map(Number);
			const weekday = new Date(y, m - 1, d).getDay();
			cells.push({
				date: d,
				key,
				inMonth: true,
				isToday: key === todayKey,
				// Saturday and Sunday are the weekly offs.
				isWeekend: weekday === 0 || weekday === 6,
				// A cycle spans two months, so days from the opening month carry
				// their month name to make the boundary unmistakable.
				showMonth: m !== cycle.endMonth,
				monthShort: MONTH_SHORT[m - 1]
			});
		}

		let i = 0;
		while (cells.length % 7 !== 0) cells.push(blank(`trail-${i++}`));
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

	/**
	 * Office hours are always shown in the company's timezone, not the viewer's.
	 * A punch recorded at 09:01 in the office must read "9:01 AM" for everyone,
	 * including someone opening the portal while travelling.
	 */
	const OFFICE_TZ = 'Asia/Kolkata';

	function fmtTime(value: string | Date | null | undefined): string {
		if (!value) return '—';
		return new Date(value).toLocaleTimeString('en-IN', {
			timeZone: OFFICE_TZ,
			hour: 'numeric',
			minute: '2-digit'
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

	/**
	 * Compact time for a calendar cell. Two timestamps sit side by side in a
	 * cell that can be ~90px wide, so the meridiem is reduced to a single
	 * letter ("9:02a") — still unambiguous, but roughly a third narrower than
	 * "9:02 AM".
	 */
	function cellTime(value: string | Date | null | undefined): string {
		if (!value) return '';
		// Office timezone, not the viewer's — getHours() would render an office
		// 9:01 AM punch as 3:31 AM for anyone outside IST.
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: OFFICE_TZ,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(new Date(value));
		const [hh, mm] = parts.split(':').map(Number);
		const hour12 = hh % 12 === 0 ? 12 : hh % 12;
		return `${hour12}:${String(mm).padStart(2, '0')}${hh < 12 ? 'a' : 'p'}`;
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
		const dayLeaves = leaveByDate.get(cell.key) ?? [];
		const dayHolidays = holidaysByDate.get(cell.key) ?? [];
		// Named from the cell's own date, not the cycle's end month — a 26 Jul
		// cell in the August cycle must not read as "August 26".
		const cellMonth = Number(cell.key.slice(5, 7)) - 1;
		const base = `${MONTH_NAMES[cellMonth]} ${cell.date}`;

		// The marker is a letter on screen; screen readers get its full meaning.
		const marker = dayMarker({
			hasCheckIn: Boolean(rec?.checkInAt),
			leaves: dayLeaves,
			isHoliday: dayHolidays.length > 0,
			isAbsent: isAbsent(cell)
		});

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
			prohance: prohanceByDate.get(selectedKey) ?? null,
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
			<h2 class="month-label">
				{cycleLabel(cycle)}
				<span class="fy-label">{financialYearLabel(viewYear, viewMonth)}</span>
			</h2>
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
		<span class="legend-item"><span class="marker marker-present">P</span> Present</span>
		<span class="legend-item"><span class="marker marker-half">H</span> Half day</span>
		<span class="legend-item"><span class="marker marker-absent">A</span> Absent</span>
		<!-- Leave markers come from each type's policy code, so the legend names
		     the types actually in use this month rather than a fixed list. -->
		{#each legendLeaveTypes as lt (lt.letter)}
			<span class="legend-item"><span class="marker marker-leave">{lt.letter}</span> {lt.name}</span>
		{/each}
		<span class="legend-item"><i class="dot dot-portal"></i> Portal</span>
		<span class="legend-item"><i class="dot dot-biometric"></i> Biometric</span>
		{#if prohanceEnabled}
			<span class="legend-item"><i class="dot dot-prohance"></i> ProHance</span>
		{/if}
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
				{@const shift = shiftByDate.get(cell.key)}
				{@const tailOf = absorbedInto.get(cell.key)}
				{@const ph = prohanceByDate.get(cell.key)}
				{@const phOnly = !(shift?.checkInAt ?? rec?.checkInAt) && !(shift?.checkOutAt ?? rec?.checkOutAt) && Boolean(ph?.firstLogin)}
				{@const marker = dayMarker({
					hasCheckIn: Boolean(rec?.checkInAt),
					leaves: dayLeaves,
					isHoliday: dayHolidays.length > 0,
					isAbsent: absent
				})}
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
						<span class="day-number">
							{cell.date}{#if cell.showMonth}<span class="day-month">{cell.monthShort}</span>{/if}
						</span>
						<span class="day-dots">
							{#if rec?.source === 'manual' && rec.checkInAt}<i class="dot dot-portal"></i>{/if}
							{#if punch || rec?.source === 'biometric'}<i class="dot dot-biometric"></i>{/if}
							{#if prohanceByDate.get(cell.key)?.firstLogin}<i class="dot dot-prohance"></i>{/if}
						</span>
					</span>

					<!-- in-time left / out-time right. An overnight shift shows its own
					     span on the start date; the morning it ends on shows the tail. -->
					<span class="cell-times">
						{#if tailOf}
							<span class="t-in t-cont">↳ shift</span>
							<span class="t-out">{cellTime(tailOf.checkOutAt)}</span>
						{:else if phOnly}
							<!-- No portal/biometric record — ProHance's own login/logout stand in,
							     tinted to match the ProHance dot so the source is unmistakable. -->
							<span class="t-in t-prohance">{cellTime(ph?.firstLogin)}</span>
							<span class="t-out t-prohance">{ph?.lastLogout ? cellTime(ph.lastLogout) : '…'}</span>
						{:else}
							<span class="t-in">{cellTime(shift?.checkInAt ?? rec?.checkInAt)}</span>
							<span class="t-out">
								{cellTime(shift?.checkOutAt ?? rec?.checkOutAt)}{#if shift?.crossesMidnight}<span
										class="next-day">+1</span
									>{/if}
							</span>
						{/if}
					</span>

					<!-- centre: worked hours, or what the day was instead -->
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
							<span class="mid-tag" title={dayHolidays.map((h) => h.name).join(', ')}>
								{dayHolidays[0].name}
							</span>
						{:else if ph && minutesLabel(ph.timeOnSystemMinutes)}
							<span class="mid-prohance" title="ProHance time on system"
								>{minutesLabel(ph.timeOnSystemMinutes)}</span
							>
						{/if}
					</span>

					<!-- bottom right: P / H / policy-derived leave code / A -->
					<span class="cell-foot">
						{#if marker}
							<span class="marker marker-{marker.tone}" title={marker.label}>{marker.letter}</span>
						{/if}
					</span>
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
					{#if selected.prohance}
						<span class="source-value">
							{#if selected.prohance.firstLogin}
								{fmtTime(selected.prohance.firstLogin)} – {selected.prohance.lastLogout
									? fmtTime(selected.prohance.lastLogout)
									: 'active'}
							{/if}
							{#if minutesLabel(selected.prohance.timeOnSystemMinutes)}
								<span class="source-extra"
									>· {minutesLabel(selected.prohance.timeOnSystemMinutes)} on system</span
								>
							{/if}
							{#if !selected.prohance.firstLogin && !minutesLabel(selected.prohance.timeOnSystemMinutes)}
								{selected.prohance.dayType ?? 'No activity'}
							{/if}
						</span>
						<span class="source-note">
							{#if selected.prohance.dayType}{selected.prohance.dayType}{/if}
						</span>
					{:else if prohanceEnabled}
						<span class="source-value muted">No ProHance data</span>
					{:else}
						<span class="source-value muted">Not connected yet</span>
					{/if}
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

	.dot-prohance {
		background: var(--ess-warning);
	}

	/* ProHance-sourced values in a day cell share the amber of its legend dot. */
	.t-prohance {
		color: var(--ess-warning);
	}

	.mid-prohance {
		color: var(--ess-warning);
		font-variant-numeric: tabular-nums;
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

	/* Marks the tail of the opening month ("26 Jul") so the cycle boundary is
	   obvious without a separate divider. */
	.day-month {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--ess-text-muted);
		margin-left: 0.15rem;
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

	/* In-time and out-time on one line, pinned to opposite edges. */
	.cell-times {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.2rem;
		font-size: 0.66rem;
		color: var(--ess-text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		min-height: 0.9rem;
	}

	.t-out {
		color: var(--ess-text-muted);
	}

	/* Worked hours (the ProHance slot until that feed is connected), or the
	   name of whatever the day was instead. */
	.cell-middle {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 0;
		font-size: 0.66rem;
		font-weight: 600;
		color: var(--ess-text);
		font-variant-numeric: tabular-nums;
		overflow: hidden;
	}

	.mid-tag {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--ess-text-secondary);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Worked less than a standard shift. Amber, not red — a short day is worth
	   noticing but it isn't an error. */
	.short-hours {
		color: var(--ess-warning);
	}

	.short-flag {
		font-weight: 800;
		margin-left: 0.1rem;
	}

	.mid-tag.anomaly {
		color: var(--ess-danger);
	}

	/* "+1" after a check-out that happened the following morning. */
	.next-day {
		font-size: 0.52rem;
		font-weight: 700;
		vertical-align: super;
		color: var(--ess-text-muted);
		margin-left: 0.05rem;
	}

	/* The morning half of an overnight shift — its hours are credited to the
	   previous day, so this cell only marks the continuation. */
	.t-cont {
		color: var(--ess-text-muted);
		font-size: 0.58rem;
	}

	.cell-foot {
		display: flex;
		justify-content: flex-end;
		align-items: flex-end;
		min-height: 1rem;
	}

	/* The day's single status marker: P present, H half day, A absent, or the
	   leave type's own policy code (EL, SL, PI…). */
	.marker {
		font-size: 0.62rem;
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.02em;
		padding: 0.12rem 0.3rem;
		border-radius: 5px;
		font-variant-numeric: tabular-nums;
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
		background: var(--ess-info-bg);
		color: var(--ess-info);
	}

	.marker-absent {
		background: var(--ess-danger-bg);
		color: var(--ess-danger);
	}

	.marker-holiday {
		background: var(--ess-info-bg);
		color: var(--ess-info);
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

	/* Two timestamps plus a duration won't fit once a cell drops below ~90px.
	   The marker survives longest because it carries the day's status on its
	   own; times go first, then the middle line. */
	@media (max-width: 900px) {
		.cell-times,
		.cell-middle {
			font-size: 0.6rem;
		}
	}

	@media (max-width: 760px) {
		.cell-middle {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.day-cell {
			min-height: 3.4rem;
			padding: 0.3rem 0.32rem;
		}

		.cell-times {
			display: none;
		}

		.cell-foot {
			min-height: 0;
		}

		.marker {
			font-size: 0.58rem;
			padding: 0.1rem 0.24rem;
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
