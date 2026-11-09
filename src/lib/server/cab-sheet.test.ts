import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseCabSheet, CabSheetError } from './cab-sheet';
import { buildCabTemplate, buildRosterWorkbook } from './cab-workbooks';
import { planDay } from '$lib/cabs/plan';
import { BRIEF_CABS, BRIEF_RIDERS, SETTINGS } from '$lib/cabs/fixture.test-data';

async function book(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	build(wb);
	return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseCabSheet', () => {
	it('reads all four tabs with aliased headers', async () => {
		const buf = await book((wb) => {
			const r = wb.addWorksheet('Employees');
			r.addRow(['Employee ID', 'Employee Name', 'Department', 'Logout Time', 'Google Maps Link', 'Gender']);
			r.addRow(['E1', 'Asha', 'Sales', '4:00 PM', 'https://www.google.com/maps/@17.4933,78.3915,17z', 'F']);
			r.addRow(['E2', 'Ravi', 'Sales', '4:00 PM', '17.49, 78.39', 'Male']);
			r.addRow(['E3', 'Bina', 'Data', 'later', '17.49, 78.39', 'F']);
			r.addRow(['E4', 'Chaya', 'Data', '21:00', 'https://maps.app.goo.gl/xyz', 'F']);
			r.getCell('E6').value = { text: 'Home', hyperlink: 'https://maps.google.com/?q=17.42,78.41' };
			r.getCell('B6').value = 'Dia';
			r.getCell('D6').value = new Date(Date.UTC(1899, 11, 30, 0, 0));
			const c = wb.addWorksheet('Fleet');
			c.addRow(['Vehicle No', 'Seats (excl. driver)', 'Driver Name', 'Guard at night']);
			c.addRow(['TS09 AB 1234', 4, 'Ramesh', 'Y']);
			c.addRow(['TS09 AB 9999', '', 'Suresh', 'N']);
			const o = wb.addWorksheet('One-offs');
			o.addRow(['Date', 'Kind', 'Person or cab', 'Time', 'Duration (min)']);
			o.addRow(['10/11/2026', 'Late stay', 'E1', '9:00 PM', '']);
			o.addRow(['', 'picnic', 'E1', '9:00 PM', '']);
			const s = wb.addWorksheet('Settings');
			s.addRow(['Office pin', '17.4474, 78.3762']);
			s.addRow(['Max merge wait (min)', 20]);
			s.addRow(['Night starts', '9:30 PM']);
		});
		const p = await parseCabSheet(buf);

		expect(p.tabs).toEqual({ riders: 'Employees', cabs: 'Fleet', oneOffs: 'One-offs', settings: 'Settings' });
		expect(p.riders.map((r) => r.name)).toEqual(['Asha', 'Chaya', 'Dia']);
		expect(p.riders[0]).toMatchObject({ empCode: 'E1', team: 'Sales', dropTime: '16:00', pin: { lat: 17.4933, lng: 78.3915 } });
		expect(p.riders[1].pin).toBeNull();
		expect(p.riders[1].pinIssue).toMatch(/Short share link/);
		expect(p.riders[2]).toMatchObject({ dropTime: '00:00', pin: { lat: 17.42, lng: 78.41 } });
		expect(p.skippedRows.map((s) => s.reason)).toEqual(
			expect.arrayContaining([expect.stringMatching(/women only/), expect.stringMatching(/"later" not understood/), expect.stringMatching(/seats missing/), expect.stringMatching(/picnic/)])
		);
		expect(p.cabs).toEqual([{ id: 'cab-2', label: 'TS09 AB 1234', seats: 4, driver: 'Ramesh', guard: true, sourceRow: 2 }]);
		expect(p.oneOffs).toEqual([expect.objectContaining({ date: '2026-11-10', kind: 'late_stay', who: 'E1', time: '21:00' })]);
		expect(p.settings).toEqual({ office: { lat: 17.4474, lng: 78.3762 }, maxMergeWaitMin: 20, nightStart: '21:30' });
		expect(p.unmappedHeaders).toEqual([]);
	});

	it('treats a single unnamed sheet as the riders list', async () => {
		const buf = await book((wb) => {
			const r = wb.addWorksheet('Sheet1');
			r.addRow(['Name', 'Drop', 'Lat', 'Lng', 'Shoe size']);
			r.addRow(['Asha', '4pm', 17.49, 78.39, 6]);
		});
		const p = await parseCabSheet(buf);
		expect(p.riders[0].pin).toEqual({ lat: 17.49, lng: 78.39 });
		expect(p.cabs).toEqual([]);
		expect(p.unmappedHeaders).toEqual([{ tab: 'Sheet1', header: 'Shoe size' }]);
	});

	it('explains a missing column or a non-Excel file', async () => {
		const buf = await book((wb) => wb.addWorksheet('Riders').addRow(['Name', 'Team']));
		await expect(parseCabSheet(buf)).rejects.toThrow(CabSheetError);
		await expect(parseCabSheet(Buffer.from('not a workbook'))).rejects.toThrow(/not an Excel workbook/);
	});

	it('reads back its own template', async () => {
		const p = await parseCabSheet(await buildCabTemplate());
		expect(p.tabs).toEqual({ riders: 'Riders', cabs: 'Cabs', oneOffs: 'One-offs', settings: 'Settings' });
		expect(p.riders).toHaveLength(1);
		expect(p.cabs).toHaveLength(1);
		expect(p.oneOffs).toEqual([]);
		expect(p.unmappedHeaders).toEqual([]);
	});
});

describe('buildRosterWorkbook', () => {
	it('writes one row per drop plus the flags and cab timeline', async () => {
		const plan = planDay({ riders: BRIEF_RIDERS, cabs: BRIEF_CABS, oneOffs: [], settings: SETTINGS, date: null });
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load((await buildRosterWorkbook(plan)) as never);
		expect(wb.worksheets.map((w) => w.name)).toEqual(['Roster', 'Flags', 'Cab timeline']);
		expect(wb.getWorksheet('Roster')!.rowCount).toBe(1 + BRIEF_RIDERS.length);
		expect(wb.getWorksheet('Flags')!.rowCount).toBe(1 + plan.flags.length);
	});
});
