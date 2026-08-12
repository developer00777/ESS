import { describe, test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
	parseBiometricSheet,
	parseTimeCell,
	parseDateCell,
	parseDateText,
	parsePunchListCell,
	dateFromBanner,
	dateFromFilename,
	instantFor,
	BiometricSheetError
} from './biometric-sheet';

/**
 * These cover what a real biometric export throws at the parser: times as Excel
 * serials, as fractions and as free text; the three sheet layouts; night shifts
 * whose out time precedes their in time; and the placeholder cells ("Absent",
 * "--:--", 00:00) that must never become a real punch.
 */

async function build(rows: unknown[][], sheetName = 'Attendance'): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet(sheetName);
	for (const row of rows) sheet.addRow(row as never);
	const buffer = await workbook.xlsx.writeBuffer();
	return Buffer.from(buffer);
}

describe('parseTimeCell', () => {
	test('reads a true Excel time cell without shifting it by the server zone', () => {
		// ExcelJS anchors a time-only cell to the epoch date in UTC.
		expect(parseTimeCell(new Date(Date.UTC(1899, 11, 30, 9, 31)))).toBe('09:31');
		expect(parseTimeCell(new Date(Date.UTC(1899, 11, 30, 18, 47)))).toBe('18:47');
	});

	test('reads a fraction-of-a-day time', () => {
		expect(parseTimeCell(0.5)).toBe('12:00');
		expect(parseTimeCell(9.5 / 24)).toBe('09:30');
	});

	test('reads the time half of a full datetime serial', () => {
		// 45874 is a date; .5 of a day past midnight is noon.
		expect(parseTimeCell(45874.5)).toBe('12:00');
	});

	test('reads text times in the shapes people type', () => {
		expect(parseTimeCell('09:31')).toBe('09:31');
		expect(parseTimeCell('9:31')).toBe('09:31');
		expect(parseTimeCell('18:47:03')).toBe('18:47');
		expect(parseTimeCell('9.31')).toBe('09:31');
		expect(parseTimeCell('0931')).toBe('09:31');
		expect(parseTimeCell('931')).toBe('09:31');
		expect(parseTimeCell('9:31 AM')).toBe('09:31');
		expect(parseTimeCell('6:47 PM')).toBe('18:47');
		expect(parseTimeCell('12:15 AM')).toBe('00:15');
		expect(parseTimeCell('12:15 PM')).toBe('12:15');
		expect(parseTimeCell('2026-08-05 09:31')).toBe('09:31');
	});

	test('treats absence placeholders as no punch, never as midnight', () => {
		for (const v of ['', '-', '--:--', 'Absent', 'A', 'WO', 'Holiday', 'N/A', '00:00', 0]) {
			expect(parseTimeCell(v)).toBeNull();
		}
	});

	test('rejects impossible clock values instead of wrapping them', () => {
		expect(parseTimeCell('25:00')).toBeNull();
		expect(parseTimeCell('09:75')).toBeNull();
		expect(parseTimeCell('13:00 PM')).toBeNull();
	});
});

describe('parseDateText', () => {
	test('reads Indian day-first dates', () => {
		expect(parseDateText('05-08-2026')).toBe('2026-08-05');
		expect(parseDateText('5/8/2026')).toBe('2026-08-05');
		expect(parseDateText('05.08.26')).toBe('2026-08-05');
	});

	test('reads ISO dates by their four-digit year', () => {
		expect(parseDateText('2026-08-05')).toBe('2026-08-05');
	});

	test('reads a day past the 12th as unambiguous', () => {
		expect(parseDateText('26-08-2026')).toBe('2026-08-26');
		// Month-first is only assumed when day-first is impossible.
		expect(parseDateText('08-26-2026')).toBe('2026-08-26');
	});

	test('reads named months', () => {
		expect(parseDateText('05-Aug-2026')).toBe('2026-08-05');
		expect(parseDateText('5 August 2026')).toBe('2026-08-05');
		expect(parseDateText('Aug 5, 2026')).toBe('2026-08-05');
	});

	test('rejects a date that does not exist', () => {
		expect(parseDateText('31-02-2026')).toBeNull();
	});
});

describe('parseDateCell', () => {
	test('reads an Excel date serial', () => {
		// 2026-08-05 is serial 46239 on Excel's 1899-12-30 epoch.
		const serial = Math.round((Date.UTC(2026, 7, 5) - Date.UTC(1899, 11, 30)) / 86_400_000);
		expect(parseDateCell(serial)).toBe('2026-08-05');
	});

	test('reads a bare day number against a month banner', () => {
		expect(parseDateCell(5, 'Monthly Report Aug 2026')).toBe('2026-08-05');
	});
});

describe('parsePunchListCell', () => {
	test('takes the first and last of many punches in one cell', () => {
		expect(parsePunchListCell('09:31 13:02 13:44 18:47')).toEqual({
			inTime: '09:31',
			outTime: '18:47'
		});
	});

	test('splits a hyphenated pair', () => {
		expect(parsePunchListCell('09:31 - 18:47')).toEqual({ inTime: '09:31', outTime: '18:47' });
	});

	test('a lone punch is the arrival', () => {
		expect(parsePunchListCell('09:31')).toEqual({ inTime: '09:31', outTime: null });
	});
});

describe('dateFromBanner', () => {
	test('takes a labelled date', () => {
		expect(dateFromBanner('Champions Infometric | Date: 05-08-2026')).toBe('2026-08-05');
	});

	test('accepts a single-day range', () => {
		expect(dateFromBanner('From 05-08-2026 to 05-08-2026')).toBe('2026-08-05');
	});

	test('refuses to date a sheet from a genuine multi-day range', () => {
		expect(dateFromBanner('From 01-08-2026 to 31-08-2026')).toBeNull();
	});
});

describe('dateFromFilename', () => {
	test('finds a date in the usual export filenames', () => {
		expect(dateFromFilename('Attendance_05-08-2026.xlsx')).toBe('2026-08-05');
		expect(dateFromFilename('report 2026-08-05.xlsx')).toBe('2026-08-05');
		expect(dateFromFilename('daily-5-Aug-2026.xls')).toBe('2026-08-05');
	});

	test('returns null when there is no date to find', () => {
		expect(dateFromFilename('attendance.xlsx')).toBeNull();
	});
});

describe('parseBiometricSheet — long layout', () => {
	test('reads one row per employee-day', async () => {
		const buffer = await build([
			['Emp Code', 'Employee Name', 'Date', 'In Time', 'Out Time'],
			['CIPL001', 'Asha Rao', '05-08-2026', '09:31', '18:47'],
			['CIPL002', 'Vikram Nair', '05-08-2026', '10:02', '19:15'],
			['CIPL001', 'Asha Rao', '06-08-2026', '09:28', '18:33']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.layout).toBe('long');
		expect(result.days).toHaveLength(3);
		expect(result.days[0]).toMatchObject({
			empCode: 'CIPL001',
			employeeName: 'Asha Rao',
			date: '2026-08-05',
			inTime: '09:31',
			outTime: '18:47',
			crossesMidnight: false
		});
		expect(result.days[2].date).toBe('2026-08-06');
	});

	test('skips a row whose times are all placeholders rather than marking a 00:00 arrival', async () => {
		const buffer = await build([
			['Emp Code', 'Date', 'In Time', 'Out Time'],
			['CIPL001', '05-08-2026', '09:31', '18:47'],
			['CIPL002', '05-08-2026', 'Absent', '--:--']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.days).toHaveLength(1);
		expect(result.skippedRows).toEqual([
			{ row: 3, empCode: 'CIPL002', reason: 'no in or out time on this row' }
		]);
	});

	test('ignores banner rows above the table and a repeated header mid-sheet', async () => {
		const buffer = await build([
			['Champions Infometric Pvt Ltd'],
			['Attendance Report'],
			[],
			['Emp Code', 'Date', 'In Time', 'Out Time'],
			['CIPL001', '05-08-2026', '09:31', '18:47'],
			['Emp Code', 'Date', 'In Time', 'Out Time'],
			['CIPL002', '05-08-2026', '09:45', '18:50']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.days.map((d) => d.empCode)).toEqual(['CIPL001', 'CIPL002']);
	});

	test('reads a night shift as ending the next day', async () => {
		const buffer = await build([
			['Emp Code', 'Date', 'In Time', 'Out Time'],
			['CIPL003', '05-08-2026', '21:00', '06:00']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.days[0]).toMatchObject({
			date: '2026-08-05',
			inTime: '21:00',
			outTime: '06:00',
			crossesMidnight: true
		});
		expect(result.days[0].notes[0]).toContain('2026-08-06');
	});
});

describe('parseBiometricSheet — day-wise layout', () => {
	test('takes the single date from the sheet banner', async () => {
		const buffer = await build([
			['Daily Attendance', 'Date: 05-08-2026'],
			['Emp Code', 'In Time', 'Out Time'],
			['CIPL001', '09:31', '18:47']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.layout).toBe('day-wise');
		expect(result.dateSource).toBe('sheet-banner');
		expect(result.days[0].date).toBe('2026-08-05');
	});

	test('falls back to the filename when the sheet states no date', async () => {
		const buffer = await build([
			['Emp Code', 'In Time', 'Out Time'],
			['CIPL001', '09:31', '18:47']
		]);

		const result = await parseBiometricSheet(buffer, { filename: 'Attendance_05-08-2026.xlsx' });

		expect(result.dateSource).toBe('filename');
		expect(result.days[0].date).toBe('2026-08-05');
	});

	test('prefers the sheet banner over the filename', async () => {
		const buffer = await build([
			['Date: 05-08-2026'],
			['Emp Code', 'In Time', 'Out Time'],
			['CIPL001', '09:31', '18:47']
		]);

		const result = await parseBiometricSheet(buffer, {
			filename: 'Attendance_09-09-2026.xlsx',
			suppliedDate: '2026-12-25'
		});

		expect(result.dateSource).toBe('sheet-banner');
		expect(result.days[0].date).toBe('2026-08-05');
	});

	test('uses the uploader’s date only as a last resort', async () => {
		const buffer = await build([
			['Emp Code', 'In Time', 'Out Time'],
			['CIPL001', '09:31', '18:47']
		]);

		const result = await parseBiometricSheet(buffer, {
			filename: 'attendance.xlsx',
			suppliedDate: '2026-08-05'
		});

		expect(result.dateSource).toBe('supplied');
		expect(result.days[0].date).toBe('2026-08-05');
	});

	test('refuses a dateless day-wise sheet rather than guessing today', async () => {
		const buffer = await build([
			['Emp Code', 'In Time', 'Out Time'],
			['CIPL001', '09:31', '18:47']
		]);

		await expect(parseBiometricSheet(buffer, { filename: 'attendance.xlsx' })).rejects.toThrow(
			BiometricSheetError
		);
	});
});

describe('parseBiometricSheet — matrix layout', () => {
	test('reads dates running across the header row', async () => {
		const buffer = await build([
			['Monthly Attendance Aug 2026'],
			['Emp Code', 'Name', '01-08-2026', '02-08-2026', '03-08-2026'],
			['CIPL001', 'Asha Rao', '09:31 - 18:47', 'Absent', '09:20 - 18:30']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.layout).toBe('matrix');
		expect(result.days).toHaveLength(2);
		expect(result.days[0]).toMatchObject({ date: '2026-08-01', inTime: '09:31', outTime: '18:47' });
		expect(result.days[1]).toMatchObject({ date: '2026-08-03', inTime: '09:20', outTime: '18:30' });
	});

	test('reads In/Out sub-columns beneath each date', async () => {
		const buffer = await build([
			['Monthly Register — Aug 2026'],
			['Emp Code', 'Name', '01-08-2026', null, '02-08-2026', null],
			[null, null, 'In', 'Out', 'In', 'Out'],
			['CIPL001', 'Asha Rao', '09:31', '18:47', '09:40', '18:20']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.layout).toBe('matrix');
		expect(result.days).toHaveLength(2);
		expect(result.days[0]).toMatchObject({ date: '2026-08-01', inTime: '09:31', outTime: '18:47' });
		expect(result.days[1]).toMatchObject({ date: '2026-08-02', inTime: '09:40', outTime: '18:20' });
	});

	test('reads bare day numbers against the month named in the banner', async () => {
		const buffer = await build([
			['Attendance Register for Aug 2026'],
			['Emp Code', 'Name', 1, 2],
			['CIPL001', 'Asha Rao', '09:31 - 18:47', '09:35 - 18:40']
		]);

		const result = await parseBiometricSheet(buffer);

		expect(result.days.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-02']);
	});
});

describe('parseBiometricSheet — failure messages', () => {
	test('says what is missing when there is no recognisable table', async () => {
		const buffer = await build([
			['Some', 'Unrelated', 'Spreadsheet'],
			['a', 'b', 'c']
		]);

		await expect(parseBiometricSheet(buffer)).rejects.toThrow(/employee code column/i);
	});
});

describe('instantFor', () => {
	test('pins wall-clock times to the device zone, not the server zone', () => {
		// 09:31 IST is 04:01 UTC regardless of where this runs.
		expect(instantFor('2026-08-05', '09:31').toISOString()).toBe('2026-08-05T04:01:00.000Z');
	});
});
