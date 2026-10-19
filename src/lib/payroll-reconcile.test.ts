import { describe, expect, it } from 'vitest';
import { columnId, compareSheet, normDate, normNumber, percent, valuesMatch, type SheetRecords } from './payroll-reconcile';

const recs = (rows: [string, string, Record<string, unknown>][]): SheetRecords => ({
	rows: new Map(rows.map(([code, , r]) => [code, new Map(Object.entries(r))])),
	names: new Map(rows.map(([code, name]) => [code, name]))
});

describe('normalisers', () => {
	it('reads every date shape HR uses', () => {
		expect(normDate(new Date(Date.UTC(2026, 9, 9)))).toBe('2026-10-09');
		expect(normDate('09-Oct-2026')).toBe('2026-10-09');
		expect(normDate('9 Oct 2026')).toBe('2026-10-09');
		expect(normDate('09/10/2026')).toBe('2026-10-09');
		expect(normDate(46304)).toBe('2026-10-09'); // Excel serial
		expect(normDate('')).toBe('');
	});
	it('blank numbers are zero; "2 days" and "-0.5" read', () => {
		expect(normNumber('')).toBe(0);
		expect(normNumber(undefined)).toBe(0);
		expect(normNumber('2 days')).toBe(2);
		expect(normNumber('-0.5')).toBe(-0.5);
	});
	it('matches with tolerance, codes with synonyms', () => {
		expect(valuesMatch('number', 1.5, '1.50')).toBe(true);
		expect(valuesMatch('number', 1.5, 2)).toBe(false);
		expect(valuesMatch('code', 'HD', 'ho')).toBe(true);
		expect(valuesMatch('text', 'Maternity  Leave', 'maternity leave')).toBe(true);
		expect(columnId('Comp \nOFF')).toBe('compoff');
	});
});

describe('compareSheet', () => {
	const portal = recs([
		['C1', 'Asha', { cl: 20, lwd: '' }],
		['C2', 'Ravi', { cl: -0.5, lwd: '' }],
		['C3', 'Meera', { cl: 2, lwd: '' }]
	]);
	const manual = recs([
		['C1', 'Asha', { cl: 20, lwd: '' }],
		['C2', 'Ravi', { cl: -2, lwd: '' }],
		['C9', 'Someone', { cl: 1, lwd: '' }]
	]);
	const cols = [
		{ id: 'cl', label: 'CL', kind: 'number' as const },
		{ id: 'lwd', label: 'LWD', kind: 'date' as const },
		{ id: 'el', label: 'EL', kind: 'number' as const }
	];
	const r = compareSheet('leave-balance', portal, manual, cols, new Set(['cl', 'lwd']));

	it('counts who is on each side', () => {
		expect(r.onlyInPortal).toEqual([{ code: 'C3', name: 'Meera' }]);
		expect(r.onlyInManual).toEqual([{ code: 'C9', name: 'Someone' }]);
	});
	it('compares only columns the manual sheet has, and lists each mismatch', () => {
		expect(r.columns.map((c) => c.column)).toEqual(['cl', 'lwd']);
		expect(r.mismatches).toEqual([{ code: 'C2', name: 'Ravi', column: 'cl', label: 'CL', portal: '-0.5', manual: '-2', detail: undefined }]);
		// 4 presence cells (C1, C2 matched; C3, C9 one-sided) + 2 people × 2 columns
		expect(r.compared).toBe(8);
		expect(r.matched).toBe(5);
		expect(percent(r.matched, r.compared)).toBe(62.5);
	});
});
