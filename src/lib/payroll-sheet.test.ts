import { describe, expect, it } from 'vitest';
import { ADDED_COLUMN, REMOVED_COLUMN, applyOverrides, exportRows, parseCellValue } from './payroll-sheet';

const base = {
	header: ['Sl', 'EMP Code', 'Employee name', 'LOP'],
	rows: [
		[1, 'C1', 'Asha', -0.5],
		[2, 'C2', 'Ravi', -2],
		[3, 'C3', 'Meera', -1]
	],
	keys: ['u1', 'u2', 'u3']
};

describe('applyOverrides', () => {
	it('returns the computed sheet untouched when nothing was edited', () => {
		const s = applyOverrides(base, []);
		expect(s.editCount).toBe(0);
		expect(exportRows(s)).toEqual(base.rows);
	});

	it('applies a cell edit, keeps the computed value, and parses numbers back', () => {
		const s = applyOverrides(base, [{ rowKey: 'u2', column: 'LOP', value: '-1.5', by: 'Finance' }]);
		const cell = s.rows[1].cells[3];
		expect(cell).toMatchObject({ value: -1.5, computed: -2, edited: true, by: 'Finance' });
		expect(s.editCount).toBe(1);
	});

	it('removes a row and renumbers Sl', () => {
		const s = applyOverrides(base, [{ rowKey: 'u1', column: REMOVED_COLUMN, value: '1' }]);
		expect(exportRows(s)).toEqual([
			[1, 'C2', 'Ravi', -2],
			[2, 'C3', 'Meera', -1]
		]);
		expect(s.rows[0].removed).toBe(true);
	});

	it('adds a manual row at the end with its edited cells', () => {
		const s = applyOverrides(base, [
			{ rowKey: 'manual:x', column: ADDED_COLUMN, value: '1', at: '2026-10-20T10:00:00Z' },
			{ rowKey: 'manual:x', column: 'EMP Code', value: 'C9' },
			{ rowKey: 'manual:x', column: 'LOP', value: '-3' }
		]);
		expect(exportRows(s).at(-1)).toEqual([4, 'C9', null, -3]);
		expect(s.rows.at(-1)!.added).toBe(true);
		expect(s.editCount).toBe(1);
	});

	it('restarts numbering after a block heading and never edits locked rows', () => {
		const stop = {
			header: ['S. #', 'EMP ID'],
			rows: [[1, 'A'], [], ['S. #', 'EMP ID'], [1, 'B'], [2, 'C']],
			keys: ['2026-10:u1', '__blank:1', '__sub:2026-09', '2026-09:u2', '2026-09:u3']
		};
		const s = applyOverrides(stop, [{ rowKey: '2026-09:u2', column: REMOVED_COLUMN, value: '1' }]);
		expect(exportRows(s)).toEqual([[1, 'A'], [null, null], ['S. #', 'EMP ID'], [1, 'C']]);
		expect(s.rows[2].locked).toBe(true);
	});
});

describe('parseCellValue', () => {
	it('numbers become numbers, other text stays text', () => {
		expect(parseCellValue('2.5')).toBe(2.5);
		expect(parseCellValue('-1')).toBe(-1);
		expect(parseCellValue('12-Oct-2026')).toBe('12-Oct-2026');
		expect(parseCellValue(null)).toBe(null);
	});
});
