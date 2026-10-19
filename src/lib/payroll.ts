/**
 * Payroll rules: the month-wise attendance tracker (HR's "Payroll Attendance"
 * sheet) and the salary report built on it (Leave Balance, HR Comments, To Be
 * Paid, LOP, Stop Salary).
 *
 * Pure functions only — the loader in $lib/server/payroll.ts gathers the
 * inputs. A payroll month is the attendance cycle: the 26th of the previous
 * month through the 25th of the month it is named for ($lib/attendance-cycle).
 */

/* ------------------------------------------------------------------ day */

/** Biometric hours that make a full day (6h 55m), as in HR's sheet. */
export const BIO_PRESENT_MINUTES = 6 * 60 + 55;
/** ProHance time on system that makes a full day (5h 55m). */
export const PRO_PRESENT_MINUTES = 5 * 60 + 55;
/** Either source at or above this (2h 55m) is a half day. */
export const HALF_DAY_MINUTES = 2 * 60 + 55;

export type DayKind =
	| 'present'
	| 'half'
	| 'absent'
	| 'weekoff'
	| 'holiday'
	| 'pink'
	| 'compoff'
	| 'compoff_half'
	| 'leave'
	| 'not_joined'
	| 'exited'
	| 'upcoming';

export interface DayLeave {
	/** The leave type's policy code (EL, SL, PINK, COMP_OFF…). */
	code: string | null;
	name: string;
	/** True when the application books half a day. */
	half: boolean;
}

export interface DayInput {
	date: string;
	/** Office calendar day today, 'YYYY-MM-DD'. Later days have not happened. */
	today: string;
	dateOfJoining: string | null;
	lastWorkingDay: string | null;
	isWeekOff: boolean;
	isHoliday: boolean;
	/** The approved leave covering the day, if any. */
	leave: DayLeave | null;
	/** Minutes worked from biometric punches (check-in to check-out). */
	bioMinutes: number | null;
	/** ProHance time on system. */
	proMinutes: number | null;
}

export interface DayResult {
	/** What the tracker cell shows: P, H, A, WO, HD, PH, CO, CH, EL, SL… */
	code: string;
	kind: DayKind;
}

const isPinkCode = (l: DayLeave) => /^(PINK|MENSTRUAL)/i.test(l.code ?? '') || /\bpink\b|\bmenstrual\b/i.test(l.name);
const isCompOffCode = (l: DayLeave) => /^COMP_?OFF$/i.test((l.code ?? '').replace(/[\s-]/g, '_'));

/** A leave type's code as the tracker writes it: EL, SL, ML… never P/H/A. */
export function leaveDayCode(leave: DayLeave): string {
	const code = (leave.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (!code) return 'L';
	const short = code.length <= 3 ? code : code.slice(0, 2);
	return ['P', 'H', 'A'].includes(short) ? `${short}L` : short;
}

/** Status from hours alone, exactly as HR's sheet computes it. */
export function statusFromHours(bioMinutes: number | null, proMinutes: number | null): 'P' | 'H' | 'A' {
	const bio = bioMinutes ?? 0;
	const pro = proMinutes ?? 0;
	if (bio >= BIO_PRESENT_MINUTES || pro >= PRO_PRESENT_MINUTES) return 'P';
	if (bio >= HALF_DAY_MINUTES || pro >= HALF_DAY_MINUTES) return 'H';
	return 'A';
}

/**
 * One tracker cell. Order: not yet joined / already left, days still to come,
 * week off, holiday, approved leave, then hours. A week off or holiday is paid
 * whatever happened that day (working one is a comp-off claim, not a P), and
 * a leave that spans a weekend does not spend the weekend.
 */
export function payrollDay(d: DayInput): DayResult {
	if (d.dateOfJoining && d.date < d.dateOfJoining) return { code: 'NJ', kind: 'not_joined' };
	if (d.lastWorkingDay && d.date > d.lastWorkingDay) return { code: 'EX', kind: 'exited' };
	if (d.date > d.today) return { code: '', kind: 'upcoming' };
	if (d.isWeekOff) return { code: 'WO', kind: 'weekoff' };
	if (d.isHoliday) return { code: 'HD', kind: 'holiday' };

	if (d.leave) {
		if (isPinkCode(d.leave)) return { code: 'PH', kind: 'pink' };
		if (isCompOffCode(d.leave)) return d.leave.half ? { code: 'CH', kind: 'compoff_half' } : { code: 'CO', kind: 'compoff' };
		// Half a day of leave: the other half is worked, so it reads as a half day.
		if (d.leave.half) return { code: 'H', kind: 'half' };
		return { code: leaveDayCode(d.leave), kind: 'leave' };
	}

	const status = statusFromHours(d.bioMinutes, d.proMinutes);
	// Today is still under way: no hours yet is not an absence.
	if (d.date === d.today && status === 'A') return { code: '', kind: 'upcoming' };
	return { code: status, kind: status === 'P' ? 'present' : status === 'H' ? 'half' : 'absent' };
}

/* -------------------------------------------------------------- summary */

export interface DaySummary {
	present: number;
	absent: number;
	halfDay: number;
	weekOff: number;
	compOffHalf: number;
	compOff: number;
	pink: number;
	holidays: number;
	/** Full days of approved paid leave (EL, SL…). */
	leave: number;
	/** Days before joining or after the last working day. */
	notEmployed: number;
	/** Days of the cycle still to come. */
	upcoming: number;
	/** HR's "Total Days": P + H/2 + WO + CH/2 + CO + HD + PH. */
	totalDays: number;
	/** Days in the cycle (26th → 25th). */
	cycleDays: number;
	/**
	 * HR's "Actual LOP": cycle days not covered by Total Days. Leave and
	 * absences are both in here; the leave balance decides which are paid.
	 * Days still to come are left out, so a running month is not penalised.
	 */
	uncoveredDays: number;
	/** HR's "Comp Off" column: comp-off days taken (CH/2 + CO). */
	compOffDays: number;
}

export function summarizeDays(days: DayResult[]): DaySummary {
	const n = (k: DayKind) => days.filter((d) => d.kind === k).length;
	const present = n('present');
	const halfDay = n('half');
	const weekOff = n('weekoff');
	const compOffHalf = n('compoff_half');
	const compOff = n('compoff');
	const pink = n('pink');
	const holidays = n('holiday');
	const upcoming = n('upcoming');
	const totalDays = present + halfDay / 2 + weekOff + compOffHalf / 2 + compOff + holidays + pink;
	const cycleDays = days.length;
	return {
		present,
		absent: n('absent'),
		halfDay,
		weekOff,
		compOffHalf,
		compOff,
		pink,
		holidays,
		leave: n('leave'),
		notEmployed: n('not_joined') + n('exited'),
		upcoming,
		totalDays,
		cycleDays,
		uncoveredDays: round2(cycleDays - upcoming - totalDays),
		compOffDays: compOffHalf / 2 + compOff
	};
}

/* --------------------------------------------------------- leave & LOP */

export interface LeaveBalanceInput {
	/** Balance of accruing leave before this cycle. */
	opening: number;
	/** Earned leave credited for the cycle's month. */
	elCredit: number;
	/** Sick leave credited for the cycle's month. */
	slCredit: number;
	/** Comp-off days earned (approved) for work in the cycle. */
	compOffCredit: number;
	summary: DaySummary;
}

export interface LeaveBalanceResult {
	/**
	 * Leave drawn in the cycle: approved leave days, plus absences and the
	 * missing half of half days, which come out of the balance before they
	 * become loss of pay.
	 */
	availed: number;
	/** Opening + EL + SL + comp-off − availed. Negative = loss of pay. */
	closing: number;
	/** Days without pay: what the balance could not cover. */
	lopDays: number;
	/** Days paid: cycle days less loss of pay and days not employed. */
	paidDays: number;
}

export function leaveBalance(input: LeaveBalanceInput): LeaveBalanceResult {
	const s = input.summary;
	const availed = round2(s.leave + s.absent + s.halfDay / 2);
	const closing = round2(input.opening + input.elCredit + input.slCredit + input.compOffCredit - availed);
	const lopDays = closing < 0 ? -closing : 0;
	return { availed, closing, lopDays, paidDays: round2(s.cycleDays - lopDays - s.notEmployed) };
}

/* -------------------------------------------------------- salary action */

export type SalaryAction = 'pay' | 'stop' | 'hold' | 'sabbatical';

export const SALARY_ACTIONS: { value: SalaryAction; label: string }[] = [
	{ value: 'pay', label: 'Pay' },
	{ value: 'stop', label: 'Stop salary' },
	{ value: 'hold', label: 'Hold salary' },
	{ value: 'sabbatical', label: 'Sabbatical leave' }
];

export function salaryActionLabel(action: SalaryAction): string {
	return SALARY_ACTIONS.find((a) => a.value === action)?.label ?? action;
}

/**
 * What happens to someone's salary this cycle: Finance's choice when there is
 * one, otherwise a leaver whose last working day falls on or before the
 * cycle's last day is stopped and everyone else is paid.
 */
export function effectiveSalaryAction(chosen: string | null | undefined, lastWorkingDay: string | null, cycleEnd: string): SalaryAction {
	if (chosen === 'pay' || chosen === 'stop' || chosen === 'hold' || chosen === 'sabbatical') return chosen;
	return lastWorkingDay && lastWorkingDay <= cycleEnd ? 'stop' : 'pay';
}

/* ----------------------------------------------------------------- csv */

/**
 * A spreadsheet-safe CSV cell. Text that a spreadsheet would run as a formula
 * (=, +, -, @, tab, CR) is prefixed with an apostrophe; plain numbers,
 * negative ones included, stay numbers.
 */
export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	let text = String(value);
	if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
	// BOM so Excel reads ₹ and names in UTF-8.
	return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* -------------------------------------------------------------- format */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Minutes as HR's sheet shows hours: 6:55. Blank for none. */
export function hhmm(minutes: number | null | undefined): string {
	if (!minutes || minutes <= 0) return '';
	return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

/** 'Oct'26' for the cycle ending October 2026. */
export function cycleShortLabel(cycleKey: string): string {
	const [y, m] = cycleKey.split('-').map(Number);
	const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
	return `${mon}'${String(y).slice(2)}`;
}
