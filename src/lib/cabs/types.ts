export type LatLng = { lat: number; lng: number };

export type OneOffKind = 'errand' | 'new_joiner' | 'late_stay';

export interface Rider {
	id: string;
	empCode: string;
	name: string;
	team: string;
	dropTime: string;
	pin: LatLng | null;
	pinIssue: string | null;
	notes: string;
	sourceRow: number;
	oneOff: OneOffKind | null;
}

export interface Cab {
	id: string;
	label: string;
	seats: number;
	driver: string;
	guard: boolean;
	sourceRow: number;
}

export interface OneOff {
	date: string | null;
	kind: OneOffKind;
	who: string;
	team: string;
	time: string;
	pin: LatLng | null;
	pinIssue: string | null;
	durationMin: number | null;
	sourceRow: number;
}

export interface PlannerSettings {
	office: LatLng | null;
	nightStart: string;
	nightEnd: string;
	maxMergeWaitMin: number;
	maxRideMin: number;
	serviceRadiusKm: number;
	roadFactor: number;
	daySpeedKmh: number;
	nightSpeedKmh: number;
	stopMin: number;
	hexResolution: number;
}

export const DEFAULT_SETTINGS: PlannerSettings = {
	office: null,
	nightStart: '20:00',
	nightEnd: '06:00',
	maxMergeWaitMin: 30,
	maxRideMin: 75,
	serviceRadiusKm: 30,
	roadFactor: 1.4,
	daySpeedKmh: 20,
	nightSpeedKmh: 30,
	stopMin: 2,
	hexResolution: 8
};

export interface Stop {
	riderId: string;
	name: string;
	team: string;
	slot: string;
	waitMin: number;
	rideMin: number;
	eta: string;
	pin: LatLng;
	cell: string;
}

export interface Trip {
	id: string;
	runId: string;
	cabId: string;
	cabLabel: string;
	driver: string;
	depart: string;
	night: boolean;
	guard: boolean;
	capacity: number;
	stops: Stop[];
	routeMin: number;
	returnAt: string;
	distanceKm: number;
}

export interface Run {
	id: string;
	depart: string;
	slots: string[];
	riderIds: string[];
	trips: Trip[];
	unseated: string[];
}

export type FlagSeverity = 'bad' | 'warn' | 'info';

export type FlagRule =
	| 'last-drop-alone'
	| 'no-seat'
	| 'full-cab'
	| 'single-trip'
	| 'merge'
	| 'ride-too-long'
	| 'no-pin'
	| 'outside-area'
	| 'one-off';

export interface Flag {
	id: string;
	severity: FlagSeverity;
	rule: FlagRule;
	title: string;
	detail: string;
	runId: string | null;
	tripId: string | null;
	riderIds: string[];
}

export interface AreaGroup {
	id: string;
	cells: string[];
	riderIds: string[];
}

export interface CabTimelineEntry {
	tripId: string | null;
	label: string;
	from: string;
	to: string;
}

export interface DayPlan {
	date: string | null;
	riders: Rider[];
	cabs: Cab[];
	runs: Run[];
	flags: Flag[];
	areaGroups: AreaGroup[];
	cells: Record<string, string>;
	cabTimelines: Record<string, CabTimelineEntry[]>;
	settings: PlannerSettings;
}
