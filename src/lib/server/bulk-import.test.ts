import { describe, test, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseHrTeamSheet, type ParsedImportRow } from './bulk-import';

/**
 * These cover the tracker's misaligned rows, where a value sits under a header
 * that does not describe it. The repair pass rebuilds such blocks by value
 * shape, and the cases below are the ones that were getting it wrong: a UAN
 * copied into the licence field, and a bachelor's degree filed as a master's.
 */

const HEADERS = [
	'Name Of the Champion',
	'Official E Mail ',
	'Total Experience in Years',
	'Aadhar Number',
	'PAN No',
	'UAN Number',
	'DL #',
	'Under Graduate',
	'Graduate',
	'Masters'
];

/** Builds a one-row workbook with the tracker's header names. */
async function parseRow(cells: (string | number | null)[]): Promise<ParsedImportRow> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('HR Team Master Tracker');
	sheet.addRow(HEADERS);
	sheet.addRow(cells);
	const buffer = await workbook.xlsx.writeBuffer();
	const result = await parseHrTeamSheet(Buffer.from(buffer) as never);
	return result.rows[0];
}

describe('government ID repair', () => {
	test('a UAN is not also copied into the licence field', async () => {
		// The drifted block leaves no Aadhaar, so the single 12-digit value is the
		// UAN. Matching claims by value rather than by position left that same
		// value looking unclaimed, and it was written to the licence field too.
		const row = await parseRow([
			'Test Person', 't@example.com',
			'2.8 yrs', '249293242615', 'FKJPP9632R', '101558316456', '101558316456',
			null, null, null
		]);
		expect(row.uanNumber).toBe('101558316456');
		expect(row.drivingLicenseNumber).toBeNull();
	});

	test('a bare number is never recorded as a licence', async () => {
		// "14.5" is years of service that drifted into the licence column.
		const row = await parseRow([
			'Test Person', 't@example.com',
			null, '822488521019', 'ABCPP1234X', null, '14.5',
			null, null, null
		]);
		expect(row.drivingLicenseNumber).toBeNull();
	});

	test('a genuine licence survives the rebuild', async () => {
		const row = await parseRow([
			'Test Person', 't@example.com',
			'3.5 yrs', '249293242615', 'FKJPP9632R', '101558316456', 'KA5120170071762',
			null, null, null
		]);
		expect(row.drivingLicenseNumber).toBe('KA5120170071762');
		expect(row.aadharNumber).toBe('249293242615');
		expect(row.uanNumber).toBe('101558316456');
	});
});

describe('education repair', () => {
	test('a bachelor degree under the Masters header is filed as a graduate one', async () => {
		// The tracker puts Masters straight after Graduate, so a one-column shift
		// is enough to record a BBA as a postgraduate qualification.
		const row = await parseRow([
			'Test Person', 't@example.com',
			null, null, null, null, null,
			null, null, 'BBA'
		]);
		expect(row.graduate).toBe('BBA');
		expect(row.masters).toBeNull();
	});

	test('a real postgraduate qualification stays in Masters', async () => {
		const row = await parseRow([
			'Test Person', 't@example.com',
			null, null, null, null, null,
			null, 'Bcom', 'MBA'
		]);
		expect(row.graduate).toBe('Bcom');
		expect(row.masters).toBe('MBA');
	});

	test('schooling below a degree is recorded as under-graduate', async () => {
		const row = await parseRow([
			'Test Person', 't@example.com',
			null, null, null, null, null,
			'SSLC', 'BCOM', null
		]);
		expect(row.underGraduate).toBe('SSLC');
		expect(row.graduate).toBe('BCOM');
		expect(row.masters).toBeNull();
	});
});
