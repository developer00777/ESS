import { describe, expect, it } from 'vitest';
import {
	csvCell,
	effectiveSalaryAction,
	hhmm,
	leaveBalance,
	leaveDayCode,
	payrollDay,
	statusFromHours,
	summarizeDays,
	toCsv,
	type DayInput
} from './payroll';

const base: DayInput = {
	date: '2026-10-07',
	today: '2026-10-20',
	dateOfJoining: '2020-01-01',
	lastWorkingDay: null,
	isWeekOff: false,
	isHoliday: false,
	leave: null,
	bioMinutes: null,
	proMinutes: null
};

describe('statusFromHours (HR sheet thresholds)', () => {
	it('biometric 6:55 or ProHance 5:55 is present', () => {
		expect(statusFromHours(415, null)).toBe('P');
		expect(statusFromHours(null, 355)).toBe('P');
		expect(statusFromHours(414, 354)).toBe('H');
	});
	it('either at 2:55 is a half day, below is absent', () => {
		expect(statusFromHours(175, null)).toBe('H');
		expect(statusFromHours(null, 175)).toBe('H');
		expect(statusFromHours(174, 174)).toBe('A');
		expect(statusFromHours(null, null)).toBe('A');
	});
});

describe('payrollDay', () => {
	it('week off and holiday outrank hours and leave', () => {
		expect(payrollDay({ ...base, isWeekOff: true, bioMinutes: 500 }).code).toBe('WO');
		expect(payrollDay({ ...base, isHoliday: true }).code).toBe('HD');
		expect(payrollDay({ ...base, isWeekOff: true, leave: { code: 'EL', name: 'Earned', half: false } }).code).toBe('WO');
	});
	it('maps leave to its code: pink, comp-off, half, others', () => {
		expect(payrollDay({ ...base, leave: { code: 'PINK', name: 'Pink Leave', half: false } }).code).toBe('PH');
		expect(payrollDay({ ...base, leave: { code: 'COMP_OFF', name: 'Comp Off', half: false } }).code).toBe('CO');
		expect(payrollDay({ ...base, leave: { code: 'COMP_OFF', name: 'Comp Off', half: true } }).code).toBe('CH');
		expect(payrollDay({ ...base, leave: { code: 'EL', name: 'Earned Leave', half: true } })).toEqual({ code: 'H', kind: 'half' });
		expect(payrollDay({ ...base, leave: { code: 'EL', name: 'Earned Leave', half: false } })).toEqual({ code: 'EL', kind: 'leave' });
		expect(payrollDay({ ...base, leave: { code: 'MATERNITY', name: 'Maternity', half: false } }).code).toBe('MA');
	});
	it('before joining, after leaving, and days still to come', () => {
		expect(payrollDay({ ...base, dateOfJoining: '2026-10-10' }).code).toBe('NJ');
		expect(payrollDay({ ...base, lastWorkingDay: '2026-10-01' }).code).toBe('EX');
		expect(payrollDay({ ...base, date: '2026-10-22' }).kind).toBe('upcoming');
		// Today with no hours yet is not an absence; with hours it counts.
		expect(payrollDay({ ...base, date: '2026-10-20' }).kind).toBe('upcoming');
		expect(payrollDay({ ...base, date: '2026-10-20', bioMinutes: 420 }).code).toBe('P');
	});
	it('falls back to hours', () => {
		expect(payrollDay({ ...base, bioMinutes: 430 }).code).toBe('P');
		expect(payrollDay({ ...base, proMinutes: 200 }).code).toBe('H');
		expect(payrollDay(base).code).toBe('A');
	});
});

describe('leaveDayCode', () => {
	it('keeps short codes, never collides with P/H/A', () => {
		expect(leaveDayCode({ code: 'SL', name: '', half: false })).toBe('SL');
		expect(leaveDayCode({ code: 'P', name: '', half: false })).toBe('PL');
		expect(leaveDayCode({ code: null, name: 'x', half: false })).toBe('L');
	});
});

describe('summarizeDays and leaveBalance (HR formulas)', () => {
	const codes = ['P', 'P', 'H', 'A', 'WO', 'WO', 'HD', 'PH', 'CO', 'CH', 'EL', 'NJ', ''];
	const kinds = ['present', 'present', 'half', 'absent', 'weekoff', 'weekoff', 'holiday', 'pink', 'compoff', 'compoff_half', 'leave', 'not_joined', 'upcoming'] as const;
	const days = codes.map((code, i) => ({ code, kind: kinds[i] }));
	const s = summarizeDays(days);

	it('Total Days = P + H/2 + WO + CH/2 + CO + HD + PH', () => {
		expect(s.totalDays).toBe(2 + 0.5 + 2 + 0.5 + 1 + 1 + 1);
		expect(s.compOffDays).toBe(1.5);
		expect(s.cycleDays).toBe(13);
		// 13 days − 1 still to come − 8 covered.
		expect(s.uncoveredDays).toBe(4);
		expect(s.notEmployed).toBe(1);
	});

	it('absences and leave come out of the balance; what it cannot cover is LOP', () => {
		// availed = 1 leave + 1 absent + 0.5 (half day) = 2.5
		const ok = leaveBalance({ opening: 3, elCredit: 1.5, slCredit: 0.5, compOffCredit: 0, summary: s });
		expect(ok).toMatchObject({ availed: 2.5, closing: 2.5, lopDays: 0, paidDays: 12 });
		const short = leaveBalance({ opening: 0, elCredit: 0, slCredit: 0, compOffCredit: 0.5, summary: s });
		expect(short).toMatchObject({ closing: -2, lopDays: 2, paidDays: 10 });
	});
});

describe('effectiveSalaryAction', () => {
	it('Finance’s choice wins; otherwise leavers in the cycle are stopped', () => {
		expect(effectiveSalaryAction('hold', null, '2026-10-25')).toBe('hold');
		expect(effectiveSalaryAction(null, '2026-10-10', '2026-10-25')).toBe('stop');
		expect(effectiveSalaryAction(null, '2026-11-02', '2026-10-25')).toBe('pay');
		expect(effectiveSalaryAction('pay', '2026-10-10', '2026-10-25')).toBe('pay');
	});
});

describe('csv', () => {
	it('neutralises formulas but keeps negative numbers', () => {
		expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(csvCell('-2')).toBe('-2');
		expect(csvCell(-2.5)).toBe('-2.5');
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
	});
	it('writes a BOM and CRLF rows', () => {
		expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
	});
	it('formats hours like the sheet', () => {
		expect(hhmm(415)).toBe('6:55');
		expect(hhmm(0)).toBe('');
	});
});
