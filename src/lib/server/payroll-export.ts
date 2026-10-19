import ExcelJS from 'exceljs';
import { hhmm, round2, salaryActionLabel, toCsv } from '$lib/payroll';
import type { PayrollReport } from './payroll';

/**
 * The payroll downloads, in the column layout of HR's own files: the
 * "Payroll Attendance" tracker and the salary report's five sheets (Leave
 * Balance, HR Comments, To Be Paid, LOP, Stop Salary). Each sheet downloads
 * as CSV; the workbook holds all six as an .xlsx.
 */

export const SHEETS = ['tracker', 'leave-balance', 'hr-comments', 'to-be-paid', 'lop', 'stop-salary'] as const;
export type SheetKey = (typeof SHEETS)[number];

export const SHEET_TITLES: Record<SheetKey, string> = {
	tracker: 'Payroll Attendance',
	'leave-balance': 'Leave Balance',
	'hr-comments': 'HR Comments',
	'to-be-paid': 'To Be Paid',
	lop: 'LOP',
	'stop-salary': 'Stop Salary'
};

type Cell = string | number | null;
interface Sheet {
	header: Cell[];
	rows: Cell[][];
	/** Row indexes (into `rows`) that start a new block with their own header. */
	subHeaders?: number[];
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string) => `${Number(d.slice(8))}-${MON[Number(d.slice(5, 7)) - 1]}`;
const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** 'YYYY-MM-DD' → 'DD-Mon-YYYY', the way HR's sheets print dates. */
const fmtDate = (d: string | null) => (d ? `${d.slice(8)}-${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}` : '');
const num = (n: number) => round2(n);

export function buildSheet(report: PayrollReport, key: SheetKey): Sheet {
	const E = report.employees;
	switch (key) {
		case 'tracker': {
			const header: Cell[] = [
				'Sl No', 'Employee ID', 'Employee Name', 'DOJ', 'Gender', 'Department', 'Team', 'Designation', 'Shift', 'Week Off', 'Reporting Manager', 'Status',
				...report.dates.flatMap((d) => [`${dayLabel(d)} Biometric`, `${dayLabel(d)} Pro`, `${dayLabel(d)} ${weekday(d)}`]),
				'Present', 'Absent', 'Half Day', 'Week Off', 'Half day Comp off', 'Comp Off', 'Pink Leave', 'Holidays', 'Leave', 'Total Days', 'Remarks', 'LWD', 'Total payroll Days', 'Actual LOP', 'Comp Off'
			];
			const rows = E.map((e, i) => [
				i + 1, e.empCode, e.name, fmtDate(e.doj), e.gender, e.department, e.team, e.designation, e.shift, e.weekOff, e.manager, e.status,
				...e.days.flatMap((d) => [hhmm(d.bio), hhmm(d.pro), d.code]),
				e.summary.present, e.summary.absent, e.summary.halfDay, e.summary.weekOff, e.summary.compOffHalf, e.summary.compOff, e.summary.pink, e.summary.holidays, e.summary.leave,
				num(e.summary.totalDays), e.remarks, fmtDate(e.lwd), e.summary.cycleDays, num(e.summary.uncoveredDays), num(e.summary.compOffDays)
			]);
			return { header, rows };
		}
		case 'leave-balance': {
			const asOf = new Date(`${report.asOf}T00:00:00Z`).getTime();
			const header = ['Sl', 'EMP Code', 'Employee name', 'Designation', 'Department', 'Team', 'Tenure', 'DOJ', 'AOD', 'Op Leave Bal', 'EL', 'SL', 'Comp OFF', 'Availed Leave', 'CL', 'LWD', 'Remarks'];
			const rows = E.map((e, i) => [
				i + 1, e.empCode, e.name, e.designation, e.department, e.team,
				e.doj ? num((asOf - new Date(`${e.doj}T00:00:00Z`).getTime()) / (365 * 86_400_000)) : null,
				fmtDate(e.doj), fmtDate(report.asOf),
				num(e.balance.opening), num(e.balance.el), num(e.balance.sl), num(e.balance.compOff), num(e.balance.availed), num(e.balance.closing),
				fmtDate(e.lwd), e.remarks
			]);
			return { header, rows };
		}
		case 'hr-comments': {
			const header = ['S.No', 'EMP ID', 'EMP NAME', 'Comment', 'Remarks'];
			const rows = E.filter((e) => e.comment || e.remarks).map((e, i) => [i + 1, e.empCode, e.name, e.comment, e.remarks]);
			return { header, rows };
		}
		case 'to-be-paid': {
			const header = ['Sl', 'EMP Code', 'Employee name', 'Designation', 'Team', 'DOJ', 'Paid Days', 'LOP Days'];
			const rows = E.filter((e) => e.action === 'pay').map((e, i) => [i + 1, e.empCode, e.name, e.designation, e.team, fmtDate(e.doj), num(e.balance.paidDays), num(e.balance.lopDays)]);
			return { header, rows };
		}
		case 'lop': {
			const header = ['Sl', 'EMP Code', 'Employee name', 'Designation', 'Team', 'LOP'];
			// As HR writes it: the shortfall as a negative closing balance.
			const rows = E.filter((e) => e.action === 'pay' && e.balance.lopDays > 0).map((e, i) => [i + 1, e.empCode, e.name, e.designation, e.team, -num(e.balance.lopDays)]);
			return { header, rows };
		}
		case 'stop-salary': {
			const header = ['S. #', 'EMP ID', 'Name', 'Department', 'LWD', 'Remarks', 'DOJ', `${report.stopSalary[0]?.label ?? report.shortLabel} _ Remarks`];
			const rows: Cell[][] = [];
			const subHeaders: number[] = [];
			report.stopSalary.forEach((block, b) => {
				if (b > 0) {
					rows.push([]);
					subHeaders.push(rows.length);
					rows.push(['S. #', 'EMP ID', 'Name', 'Department', 'LWD', 'Remarks', 'DOJ', `${block.label} _ Remarks`]);
				}
				block.rows.forEach((r, i) => {
					const what = salaryActionLabel(r.action);
					rows.push([i + 1, r.empCode, r.name, r.department, fmtDate(r.lwd), r.remarks || what, fmtDate(r.doj), what]);
				});
			});
			return { header, rows, subHeaders };
		}
	}
}

export function sheetCsv(report: PayrollReport, key: SheetKey): string {
	const s = buildSheet(report, key);
	return toCsv(s.header as string[], s.rows);
}

const CODE_FILL: Record<string, string> = {
	A: 'FFF8D7D7',
	H: 'FFFDEFC8',
	WO: 'FFE9E9EE',
	HD: 'FFDCEBFB',
	PH: 'FFFBE0EE',
	CO: 'FFDDF3E8',
	CH: 'FFDDF3E8',
	NJ: 'FFF2F2F2',
	EX: 'FFF2F2F2'
};

/** The whole report as one workbook: the salary report's five sheets, then the tracker. */
export async function payrollWorkbook(report: PayrollReport): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'Champ HR';
	wb.created = new Date();
	const order: SheetKey[] = ['leave-balance', 'hr-comments', 'to-be-paid', 'lop', 'stop-salary', 'tracker'];
	for (const key of order) {
		const s = buildSheet(report, key);
		const ws = wb.addWorksheet(SHEET_TITLES[key]);
		if (key === 'tracker') ws.addRow([`${report.shortLabel} Payroll Attendance · ${report.cycleLabel}`]).font = { bold: true, size: 12 };
		const head = ws.addRow(s.header);
		head.font = { bold: true };
		head.alignment = { vertical: 'middle', wrapText: true };
		head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEBFA' } }));
		s.rows.forEach((r, i) => {
			const row = ws.addRow(r);
			if (s.subHeaders?.includes(i)) row.font = { bold: true };
		});
		ws.views = [{ state: 'frozen', ySplit: key === 'tracker' ? 2 : 1, xSplit: key === 'tracker' ? 3 : 0 }];
		ws.columns.forEach((col, i) => {
			const h = String(s.header[i] ?? '');
			col.width = key === 'tracker' && i >= 12 && i < 12 + report.dates.length * 3 ? 7 : Math.min(32, Math.max(8, h.length + 2));
		});
		if (key === 'tracker') {
			// Colour the status cells the way the dashboard does.
			const firstStatusCol = 13 + 2; // 1-based: 12 fixed columns, then Biometric, Pro, status
			ws.eachRow((row, n) => {
				if (n <= 2) return;
				for (let d = 0; d < report.dates.length; d++) {
					const cell = row.getCell(firstStatusCol + d * 3);
					const fill = CODE_FILL[String(cell.value ?? '')];
					if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
				}
			});
		}
	}
	return Buffer.from(await wb.xlsx.writeBuffer());
}
