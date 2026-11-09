import ExcelJS from 'exceljs';
import { clockLabel } from '$lib/cabs/clock';
import { DEFAULT_SETTINGS, type DayPlan } from '$lib/cabs/types';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

function sheetWith(wb: ExcelJS.Workbook, name: string, columns: { header: string; width: number }[], rows: unknown[][]): ExcelJS.Worksheet {
	const ws = wb.addWorksheet(name);
	ws.columns = columns.map((c) => ({ header: c.header, width: c.width }));
	ws.getRow(1).font = { bold: true };
	ws.getRow(1).fill = HEADER_FILL;
	ws.views = [{ state: 'frozen', ySplit: 1 }];
	for (const r of rows) ws.addRow(r);
	return ws;
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
	return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildCabTemplate(): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	sheetWith(
		wb,
		'Riders',
		[
			{ header: 'Emp Code', width: 12 },
			{ header: 'Name', width: 24 },
			{ header: 'Team', width: 16 },
			{ header: 'Drop time', width: 12 },
			{ header: 'Home pin (lat, lng or full Maps link)', width: 48 },
			{ header: 'Notes', width: 30 }
		],
		[['E1001', 'Example Rider', 'Sales', '4:00 PM', '17.4933, 78.3915', 'Delete this row']]
	);
	sheetWith(
		wb,
		'Cabs',
		[
			{ header: 'Cab', width: 18 },
			{ header: 'Seats (excl. driver)', width: 20 },
			{ header: 'Driver', width: 20 },
			{ header: 'Guard at night', width: 16 }
		],
		[['Cab 1', 4, 'Driver name', 'Y']]
	);
	const oneOffs = sheetWith(
		wb,
		'One-offs',
		[
			{ header: 'Date', width: 14 },
			{ header: 'Kind', width: 14 },
			{ header: 'Person or cab', width: 22 },
			{ header: 'Team', width: 14 },
			{ header: 'Time', width: 10 },
			{ header: 'Home pin', width: 36 },
			{ header: 'Duration (min)', width: 16 }
		],
		[]
	);
	oneOffs.getCell('A1').note = 'Leave blank to apply every day.';
	oneOffs.getCell('B1').note = 'errand, new joiner or late stay';
	oneOffs.getCell('C1').note = 'Late stay: the rider\'s Emp Code or name. New joiner: her name. Errand: the cab, as written in the Cabs tab.';
	oneOffs.getCell('E1').note = 'Late stay and new joiner: the drop time. Errand: when the cab leaves.';
	oneOffs.getCell('F1').note = 'New joiner only: lat, lng or a full Maps link.';
	const s = DEFAULT_SETTINGS;
	sheetWith(
		wb,
		'Settings',
		[
			{ header: 'Setting', width: 26 },
			{ header: 'Value', width: 40 }
		],
		[
			['Office pin', ''],
			['Night starts', s.nightStart],
			['Night ends', s.nightEnd],
			['Max merge wait (min)', s.maxMergeWaitMin],
			['Max ride (min)', s.maxRideMin],
			['Service radius (km)', s.serviceRadiusKm],
			['Road factor', s.roadFactor],
			['Day speed (km/h)', s.daySpeedKmh],
			['Night speed (km/h)', s.nightSpeedKmh],
			['Minutes per stop', s.stopMin]
		]
	);
	return toBuffer(wb);
}

export async function buildRosterWorkbook(plan: DayPlan): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	const rows: unknown[][] = [];
	for (const run of plan.runs) {
		for (const t of run.trips) {
			t.stops.forEach((s, i) => {
				rows.push([
					clockLabel(run.depart),
					t.cabLabel,
					t.driver,
					t.guard ? 'Yes' : t.night ? 'NO GUARD' : '',
					i + 1,
					s.name,
					s.team,
					clockLabel(s.slot),
					s.waitMin || '',
					clockLabel(s.eta),
					s.rideMin,
					clockLabel(t.returnAt)
				]);
			});
		}
		for (const id of run.unseated) {
			const r = plan.riders.find((x) => x.id === id);
			rows.push([clockLabel(run.depart), 'No seat: ride-hail', '', '', '', r?.name ?? id, r?.team ?? '', r ? clockLabel(r.dropTime) : '', '', '', '', '']);
		}
	}
	sheetWith(
		wb,
		'Roster',
		[
			{ header: 'Run', width: 10 },
			{ header: 'Cab', width: 16 },
			{ header: 'Driver', width: 18 },
			{ header: 'Guard', width: 10 },
			{ header: 'Drop #', width: 8 },
			{ header: 'Name', width: 22 },
			{ header: 'Team', width: 14 },
			{ header: 'Shift ends', width: 11 },
			{ header: 'Waits (min)', width: 11 },
			{ header: 'ETA', width: 10 },
			{ header: 'Ride (min)', width: 10 },
			{ header: 'Cab back', width: 10 }
		],
		rows
	);
	sheetWith(
		wb,
		'Flags',
		[
			{ header: 'Severity', width: 10 },
			{ header: 'Rule', width: 16 },
			{ header: 'Flag', width: 60 },
			{ header: 'Detail', width: 90 }
		],
		plan.flags.map((f) => [f.severity === 'bad' ? 'Red' : f.severity === 'warn' ? 'Check' : 'Note', f.rule, f.title, f.detail])
	);
	sheetWith(
		wb,
		'Cab timeline',
		[
			{ header: 'Cab', width: 16 },
			{ header: 'What', width: 24 },
			{ header: 'From', width: 10 },
			{ header: 'Back', width: 10 }
		],
		plan.cabs.flatMap((c) => (plan.cabTimelines[c.id] ?? []).map((e) => [c.label, e.label, clockLabel(e.from), clockLabel(e.to)]))
	);
	return toBuffer(wb);
}
