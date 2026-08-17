import { describe, test, expect } from 'vitest';
import { parseLeaveBalanceSheet, LeaveBalanceSheetError } from './leave-balance-sheet';

/**
 * Parsing the leave-balance sheet HR uploads.
 *
 * The figures here become people's leave entitlement, so the parser's job is to
 * refuse anything ambiguous rather than guess. These tests pin the two layouts
 * HR actually sends and, more importantly, the cases that must NOT be silently
 * read as zero — a cell reading "N/A" or "twelve" wiping someone's leave is the
 * failure worth guarding against.
 */

const csv = (rows: string[][]): Buffer =>
	Buffer.from(rows.map((r) => r.join(',')).join('\n'), 'utf8');

const parse = (rows: string[][], knownTypeTokens = ['EL', 'SL', 'CL']) =>
	parseLeaveBalanceSheet(csv(rows), { filename: 'balances.csv', knownTypeTokens });

describe('the wide layout — one column per leave type', () => {
	test('reads a balance per employee per type', async () => {
		const out = await parse([
			['Employee Code', 'EL', 'SL'],
			['CIPL001', '12', '6'],
			['CIPL002', '3.5', '0']
		]);

		expect(out.layout).toBe('wide');
		expect(out.balances).toEqual([
			{ empCode: 'CIPL001', leaveTypeToken: 'EL', days: 12, sourceRow: 2 },
			{ empCode: 'CIPL001', leaveTypeToken: 'SL', days: 6, sourceRow: 2 },
			{ empCode: 'CIPL002', leaveTypeToken: 'EL', days: 3.5, sourceRow: 3 },
			{ empCode: 'CIPL002', leaveTypeToken: 'SL', days: 0, sourceRow: 3 }
		]);
	});

	test('an empty cell leaves that balance alone rather than zeroing it', async () => {
		// The distinction that matters: "not stated" is not the same as "zero
		// days". Reading a blank as 0 would strip leave HR never mentioned.
		const out = await parse([
			['Employee Code', 'EL', 'SL'],
			['CIPL001', '12', '']
		]);
		expect(out.balances).toEqual([
			{ empCode: 'CIPL001', leaveTypeToken: 'EL', days: 12, sourceRow: 2 }
		]);
	});

	test('an explicit zero IS applied', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '0']
		]);
		expect(out.balances[0].days).toBe(0);
	});

	test('ignores the descriptive columns an HR export carries', async () => {
		const out = await parse([
			['Sr No', 'Employee Code', 'Employee Name', 'Department', 'EL'],
			['1', 'CIPL001', 'Asha R', 'Ops', '9']
		]);
		expect(out.balances).toEqual([
			{ empCode: 'CIPL001', leaveTypeToken: 'EL', days: 9, sourceRow: 2 }
		]);
		// Named columns are expected, so they must not be reported as problems.
		expect(out.unmappedHeaders).toEqual([]);
	});

	test('reports a column that matches no published leave type', async () => {
		const out = await parse([
			['Employee Code', 'EL', 'Gratuity'],
			['CIPL001', '9', '4']
		]);
		expect(out.unmappedHeaders).toEqual(['Gratuity']);
		expect(out.balances).toHaveLength(1);
	});
});

describe('the long layout — one row per employee and type', () => {
	test('reads employee, type and balance from named columns', async () => {
		const out = await parse([
			['Employee Code', 'Leave Type', 'Balance'],
			['CIPL001', 'EL', '12'],
			['CIPL001', 'SL', '6']
		]);
		expect(out.layout).toBe('long');
		expect(out.balances).toEqual([
			{ empCode: 'CIPL001', leaveTypeToken: 'EL', days: 12, sourceRow: 2 },
			{ empCode: 'CIPL001', leaveTypeToken: 'SL', days: 6, sourceRow: 3 }
		]);
	});

	test('accepts "Leave Count" as the balance column', async () => {
		// The wording in the request: employee code with the leave counts.
		const out = await parse([
			['Emp Code', 'Leave Type', 'Leave Count'],
			['CIPL001', 'EL', '7']
		]);
		expect(out.layout).toBe('long');
		expect(out.balances[0].days).toBe(7);
	});

	test('a row with no type is skipped and reported, not guessed', async () => {
		const out = await parse([
			['Employee Code', 'Leave Type', 'Balance'],
			['CIPL001', '', '12']
		]);
		expect(out.balances).toHaveLength(0);
		expect(out.skippedRows[0]).toMatchObject({ row: 2, empCode: 'CIPL001' });
	});
});

describe('figures that must not be trusted', () => {
	test('text in a balance cell is reported rather than read as zero', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', 'N/A']
		]);
		expect(out.balances).toHaveLength(0);
		expect(out.skippedRows[0].reason).toContain('not a number');
	});

	test('a negative balance is refused', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '-3']
		]);
		expect(out.skippedRows[0].reason).toContain('negative');
	});

	test('a quarter day is refused — leave is booked in halves', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '1.25']
		]);
		expect(out.skippedRows[0].reason).toContain('whole or half day');
	});

	test('an implausibly large figure is refused', async () => {
		// Usually a date or an employee code keyed into the wrong column.
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '20260817']
		]);
		expect(out.skippedRows[0].reason).toContain('implausibly large');
	});

	test('a half day is accepted', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '2.5']
		]);
		expect(out.balances[0].days).toBe(2.5);
	});

	test('"12 days" is read as 12', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '12 days']
		]);
		expect(out.balances[0].days).toBe(12);
	});
});

describe('rows and files that are not data', () => {
	test('employee codes are matched case-insensitively and trimmed', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			[' cipl001 ', '5']
		]);
		expect(out.balances[0].empCode).toBe('CIPL001');
	});

	test('blank spacer rows are ignored', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '5'],
			['', ''],
			['CIPL002', '6']
		]);
		expect(out.balances).toHaveLength(2);
		expect(out.skippedRows).toEqual([]);
	});

	test('a totals row is ignored', async () => {
		const out = await parse([
			['Employee Code', 'EL'],
			['CIPL001', '5'],
			['Total', '5']
		]);
		expect(out.balances).toHaveLength(1);
	});

	test('a header row below some preamble is still found', async () => {
		const out = await parse([
			['Leave Balance Report 2026'],
			[''],
			['Employee Code', 'EL'],
			['CIPL001', '5']
		]);
		expect(out.balances).toEqual([
			{ empCode: 'CIPL001', leaveTypeToken: 'EL', days: 5, sourceRow: 4 }
		]);
	});

	test('a file with no employee-code column is refused with a usable message', async () => {
		await expect(
			parse([
				['Name', 'EL'],
				['Asha', '5']
			])
		).rejects.toThrow(/Employee Code/);
	});

	test('a file with no balance figures at all is refused', async () => {
		await expect(
			parse([
				['Employee Code', 'EL'],
				['CIPL001', '']
			])
		).rejects.toThrow(LeaveBalanceSheetError);
	});

	test('the same employee and type twice is refused rather than picked between', async () => {
		// Two contradictory figures for one entitlement. The later row is probably
		// a correction, but acting on that guess could halve someone's leave.
		await expect(
			parse([
				['Employee Code', 'Leave Type', 'Balance'],
				['CIPL001', 'EL', '12'],
				['CIPL001', 'EL', '6']
			])
		).rejects.toThrow(/more than one/);
	});

	test('the same employee with two DIFFERENT types is fine', async () => {
		const out = await parse([
			['Employee Code', 'Leave Type', 'Balance'],
			['CIPL001', 'EL', '12'],
			['CIPL001', 'SL', '6']
		]);
		expect(out.balances).toHaveLength(2);
	});
});
