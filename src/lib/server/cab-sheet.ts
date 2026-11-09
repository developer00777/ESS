import ExcelJS from 'exceljs';
import { parseClock } from '$lib/cabs/clock';
import { parsePin } from '$lib/cabs/geo';
import type { Cab, LatLng, OneOff, OneOffKind, PlannerSettings, Rider } from '$lib/cabs/types';

export class CabSheetError extends Error {}

export type TabKind = 'riders' | 'cabs' | 'oneOffs' | 'settings';

export interface CabSheetResult {
	riders: Rider[];
	cabs: Cab[];
	oneOffs: OneOff[];
	settings: Partial<PlannerSettings>;
	tabs: Record<TabKind, string | null>;
	skippedRows: { tab: string; row: number; reason: string }[];
	unmappedHeaders: { tab: string; header: string }[];
}

const squash = (v: unknown): string =>
	String(v ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');

const TAB_NAMES: Record<TabKind, string[]> = {
	riders: ['riders', 'rider', 'employees', 'roster', 'people', 'staff', 'drops', 'cabusers'],
	cabs: ['cabs', 'cab', 'fleet', 'vehicles', 'vehicle'],
	oneOffs: ['oneoffs', 'oneoff', 'exceptions', 'adhoc', 'extras'],
	settings: ['settings', 'setup', 'config']
};

const PIN = ['pin', 'homepin', 'location', 'homelocation', 'maplink', 'map', 'maps', 'googlemaps', 'googlemapslink', 'mapslink', 'latlng', 'latlong', 'coordinates', 'coords', 'geo'];
const LAT = ['lat', 'latitude'];
const LNG = ['lng', 'lon', 'long', 'longitude'];
const TEAM = ['team', 'department', 'dept', 'process', 'function', 'vertical'];

const RIDER_COLUMNS = {
	empCode: ['empcode', 'employeecode', 'employeeid', 'empid', 'empno', 'code', 'id'],
	name: ['name', 'employeename', 'empname', 'fullname'],
	team: TEAM,
	drop: ['droptime', 'drop', 'dropslot', 'slot', 'logout', 'logouttime', 'shiftend', 'shiftends', 'cabtime', 'time', 'out', 'outtime'],
	pin: PIN,
	lat: LAT,
	lng: LNG,
	gender: ['gender', 'sex'],
	notes: ['notes', 'note', 'remarks', 'comment', 'comments']
};

const CAB_COLUMNS = {
	label: ['cab', 'cabname', 'cabno', 'vehicle', 'vehicleno', 'registration', 'registrationno', 'regno', 'number', 'name'],
	seats: ['seats', 'seatsexcldriver', 'seatsexcludingdriver', 'capacity', 'seat'],
	driver: ['driver', 'drivername'],
	guard: ['guard', 'guardavailable', 'guardavailablenight', 'guardatnight', 'nightguard', 'escort', 'security']
};

const ONE_OFF_COLUMNS = {
	date: ['date', 'day', 'on'],
	kind: ['kind', 'type', 'what'],
	who: ['person', 'personorcab', 'who', 'name', 'employee', 'cab', 'empcode', 'employeecode'],
	team: TEAM,
	time: ['time', 'droptime', 'drop', 'at', 'from', 'start'],
	pin: PIN,
	lat: LAT,
	lng: LNG,
	duration: ['duration', 'durationmin', 'durationmins', 'minutes', 'mins']
};

const SETTING_KEYS: Record<string, keyof PlannerSettings> = {
	officepin: 'office',
	office: 'office',
	officelocation: 'office',
	nightstarts: 'nightStart',
	nightstart: 'nightStart',
	nightends: 'nightEnd',
	nightend: 'nightEnd',
	maxmergewait: 'maxMergeWaitMin',
	maxmergewaitmin: 'maxMergeWaitMin',
	mergewait: 'maxMergeWaitMin',
	maxride: 'maxRideMin',
	maxridemin: 'maxRideMin',
	maxridetime: 'maxRideMin',
	maxridetimemin: 'maxRideMin',
	serviceradius: 'serviceRadiusKm',
	serviceradiuskm: 'serviceRadiusKm',
	radius: 'serviceRadiusKm',
	roadfactor: 'roadFactor',
	dayspeed: 'daySpeedKmh',
	dayspeedkmh: 'daySpeedKmh',
	nightspeed: 'nightSpeedKmh',
	nightspeedkmh: 'nightSpeedKmh',
	stopmin: 'stopMin',
	stopminutes: 'stopMin',
	minutesperstop: 'stopMin'
};

function unwrap(value: unknown): unknown {
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		const obj = value as Record<string, unknown>;
		if ('result' in obj) return unwrap(obj.result);
		if (Array.isArray(obj.richText)) return obj.richText.map((r) => String((r as { text?: unknown }).text ?? '')).join('');
		if ('text' in obj) return unwrap(obj.text);
	}
	return value;
}

function cellText(value: unknown): string {
	const v = unwrap(value);
	if (v === null || v === undefined) return '';
	if (v instanceof Date) return v.toISOString();
	return String(v).trim();
}

function cellLink(value: unknown): string {
	if (value && typeof value === 'object' && 'hyperlink' in (value as object)) {
		const link = String((value as { hyperlink?: unknown }).hyperlink ?? '');
		if (link && !link.startsWith('mailto:')) return link;
	}
	return cellText(value);
}

function cellNumber(value: unknown): number | null {
	const v = unwrap(value);
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
	return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
}

function cellDate(value: unknown): string | null {
	const v = unwrap(value);
	if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
	const s = String(v ?? '').trim();
	let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
	if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
	return null;
}

function yes(value: unknown): boolean {
	return /^(y|yes|true|1|available|guard)$/i.test(cellText(value));
}

function oneOffKind(value: unknown): OneOffKind | null {
	const s = squash(cellText(value));
	if (!s) return null;
	if (s.includes('errand') || s.includes('driver')) return 'errand';
	if (s.includes('join') || s === 'new') return 'new_joiner';
	if (s.includes('late') || s.includes('stay')) return 'late_stay';
	return null;
}

type Columns<K extends string> = Partial<Record<K, number>>;

function findHeader<K extends string>(sheet: ExcelJS.Worksheet, aliases: Record<K, string[]>): { row: number; cols: Columns<K>; unmapped: string[] } | null {
	const limit = Math.min(sheet.rowCount, 10);
	for (let r = 1; r <= limit; r++) {
		const cols: Columns<K> = {};
		const unmapped: string[] = [];
		let hits = 0;
		sheet.getRow(r).eachCell((cell, col) => {
			const text = cellText(cell.value);
			const forms = [squash(text), squash(text.replace(/\(.*?\)/g, ''))];
			if (!forms[0]) return;
			const kind = (Object.keys(aliases) as K[]).find((k) => cols[k] === undefined && forms.some((f) => aliases[k].includes(f)));
			if (kind) {
				cols[kind] = col;
				hits++;
			} else {
				unmapped.push(text);
			}
		});
		if (hits >= 2) return { row: r, cols, unmapped };
	}
	return null;
}

function pinFrom(row: ExcelJS.Row, cols: { pin?: number; lat?: number; lng?: number }): { pin: LatLng | null; pinIssue: string | null } {
	if (cols.lat && cols.lng) {
		const lat = cellNumber(row.getCell(cols.lat).value);
		const lng = cellNumber(row.getCell(cols.lng).value);
		if (lat !== null && lng !== null) {
			const r = parsePin(`${lat},${lng}`);
			return { pin: r.pin, pinIssue: r.issue };
		}
	}
	if (cols.pin) {
		const r = parsePin(cellLink(row.getCell(cols.pin).value));
		return { pin: r.pin, pinIssue: r.issue };
	}
	return { pin: null, pinIssue: 'No home pin column' };
}

function pickTabs(workbook: ExcelJS.Workbook): Record<TabKind, ExcelJS.Worksheet | null> {
	const out: Record<TabKind, ExcelJS.Worksheet | null> = { riders: null, cabs: null, oneOffs: null, settings: null };
	for (const ws of workbook.worksheets) {
		const s = squash(ws.name);
		const kind = (Object.keys(TAB_NAMES) as TabKind[]).find((k) => TAB_NAMES[k].includes(s));
		if (kind && !out[kind]) out[kind] = ws;
	}
	if (!out.riders) out.riders = workbook.worksheets.find((ws) => !Object.values(out).includes(ws)) ?? null;
	return out;
}

export async function parseCabSheet(buffer: Buffer | ArrayBuffer): Promise<CabSheetResult> {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer as never);
	} catch {
		throw new CabSheetError('That file is not an Excel workbook (.xlsx). Download the template and fill that in.');
	}
	const tabs = pickTabs(workbook);
	const skippedRows: CabSheetResult['skippedRows'] = [];
	const unmappedHeaders: CabSheetResult['unmappedHeaders'] = [];

	if (!tabs.riders) throw new CabSheetError('No riders tab found.');
	const riders = readRiders(tabs.riders, skippedRows, unmappedHeaders);
	const cabs = tabs.cabs ? readCabs(tabs.cabs, skippedRows, unmappedHeaders) : [];
	const oneOffs = tabs.oneOffs ? readOneOffs(tabs.oneOffs, skippedRows, unmappedHeaders) : [];
	const settings = tabs.settings ? readSettings(tabs.settings, skippedRows) : {};

	return {
		riders,
		cabs,
		oneOffs,
		settings,
		tabs: {
			riders: tabs.riders.name,
			cabs: tabs.cabs?.name ?? null,
			oneOffs: tabs.oneOffs?.name ?? null,
			settings: tabs.settings?.name ?? null
		},
		skippedRows,
		unmappedHeaders
	};
}

function readRiders(ws: ExcelJS.Worksheet, skipped: CabSheetResult['skippedRows'], unmapped: CabSheetResult['unmappedHeaders']): Rider[] {
	const head = findHeader(ws, RIDER_COLUMNS);
	if (!head || !head.cols.name || !head.cols.drop) {
		throw new CabSheetError(`The "${ws.name}" tab needs at least a Name and a Drop time column.`);
	}
	unmapped.push(...head.unmapped.map((header) => ({ tab: ws.name, header })));
	const { cols } = head;
	const nameCol = head.cols.name;
	const dropCol = head.cols.drop;
	const riders: Rider[] = [];
	for (let r = head.row + 1; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		const name = cellText(row.getCell(nameCol).value);
		const dropRaw = row.getCell(dropCol).value;
		if (!name && !cellText(dropRaw)) continue;
		if (!name) {
			skipped.push({ tab: ws.name, row: r, reason: 'No name' });
			continue;
		}
		if (cols.gender && /^m/i.test(cellText(row.getCell(cols.gender).value))) {
			skipped.push({ tab: ws.name, row: r, reason: `${name}: cabs are for women only` });
			continue;
		}
		const dropTime = parseClock(unwrap(dropRaw));
		if (!dropTime) {
			skipped.push({ tab: ws.name, row: r, reason: `${name}: drop time "${cellText(dropRaw)}" not understood` });
			continue;
		}
		riders.push({
			id: `r${r}`,
			empCode: cols.empCode ? cellText(row.getCell(cols.empCode).value) : '',
			name,
			team: cols.team ? cellText(row.getCell(cols.team).value) : '',
			dropTime,
			...pinFrom(row, cols),
			notes: cols.notes ? cellText(row.getCell(cols.notes).value) : '',
			sourceRow: r,
			oneOff: null
		});
	}
	return riders;
}

function readCabs(ws: ExcelJS.Worksheet, skipped: CabSheetResult['skippedRows'], unmapped: CabSheetResult['unmappedHeaders']): Cab[] {
	const head = findHeader(ws, CAB_COLUMNS);
	if (!head || !head.cols.label || !head.cols.seats) {
		throw new CabSheetError(`The "${ws.name}" tab needs at least a Cab and a Seats column.`);
	}
	unmapped.push(...head.unmapped.map((header) => ({ tab: ws.name, header })));
	const { cols } = head;
	const labelCol = head.cols.label;
	const seatsCol = head.cols.seats;
	const cabs: Cab[] = [];
	for (let r = head.row + 1; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		const label = cellText(row.getCell(labelCol).value);
		if (!label) continue;
		const seats = cellNumber(row.getCell(seatsCol).value);
		if (!seats || seats < 1) {
			skipped.push({ tab: ws.name, row: r, reason: `${label}: seats missing` });
			continue;
		}
		cabs.push({
			id: `cab-${r}`,
			label,
			seats: Math.floor(seats),
			driver: cols.driver ? cellText(row.getCell(cols.driver).value) : '',
			guard: cols.guard ? yes(row.getCell(cols.guard).value) : false,
			sourceRow: r
		});
	}
	return cabs;
}

function readOneOffs(ws: ExcelJS.Worksheet, skipped: CabSheetResult['skippedRows'], unmapped: CabSheetResult['unmappedHeaders']): OneOff[] {
	const head = findHeader(ws, ONE_OFF_COLUMNS);
	if (!head) return [];
	unmapped.push(...head.unmapped.map((header) => ({ tab: ws.name, header })));
	const { cols } = head;
	const out: OneOff[] = [];
	for (let r = head.row + 1; r <= ws.rowCount; r++) {
		const row = ws.getRow(r);
		const kindRaw = cols.kind ? row.getCell(cols.kind).value : null;
		const who = cols.who ? cellText(row.getCell(cols.who).value) : '';
		const timeRaw = cols.time ? row.getCell(cols.time).value : null;
		if (!cellText(kindRaw) && !who && !cellText(timeRaw)) continue;
		const kind = oneOffKind(kindRaw);
		if (!kind) {
			skipped.push({ tab: ws.name, row: r, reason: `Kind "${cellText(kindRaw)}" should be errand, new joiner or late stay` });
			continue;
		}
		const time = parseClock(unwrap(timeRaw));
		if (!time) {
			skipped.push({ tab: ws.name, row: r, reason: `${who || kind}: time not understood` });
			continue;
		}
		const hasPin = Boolean(cols.pin || (cols.lat && cols.lng));
		const place = hasPin ? pinFrom(row, cols) : { pin: null, pinIssue: 'No home pin given' };
		out.push({
			date: cols.date ? cellDate(row.getCell(cols.date).value) : null,
			kind,
			who,
			team: cols.team ? cellText(row.getCell(cols.team).value) : '',
			time,
			pin: place.pin,
			pinIssue: place.pinIssue,
			durationMin: cols.duration ? cellNumber(row.getCell(cols.duration).value) : null,
			sourceRow: r
		});
	}
	return out;
}

function readSettings(ws: ExcelJS.Worksheet, skipped: CabSheetResult['skippedRows']): Partial<PlannerSettings> {
	const out: Partial<PlannerSettings> = {};
	ws.eachRow((row, r) => {
		const key = SETTING_KEYS[squash(cellText(row.getCell(1).value))];
		if (!key) return;
		const raw = row.getCell(2).value;
		if (!cellText(raw)) return;
		if (key === 'office') {
			const p = parsePin(cellLink(raw));
			if (p.pin) out.office = p.pin;
			else skipped.push({ tab: ws.name, row: r, reason: `Office pin: ${p.issue}` });
		} else if (key === 'nightStart' || key === 'nightEnd') {
			const t = parseClock(unwrap(raw));
			if (t) out[key] = t;
			else skipped.push({ tab: ws.name, row: r, reason: `${cellText(row.getCell(1).value)}: time not understood` });
		} else {
			const n = cellNumber(raw);
			if (n !== null && n > 0) out[key] = n;
			else skipped.push({ tab: ws.name, row: r, reason: `${cellText(row.getCell(1).value)}: expected a number` });
		}
	});
	return out;
}
