import { addMinutes, clockLabel, isNight, opMinutes } from './clock';
import { haversineKm } from './geo';
import { areaGroups, toCell } from './hex';
import { assignRun, type AssignCab, type AssignRider } from './assign';
import { groupSlots, waitMinutes, type RunDraft } from './slots';
import { FlagList, checkTrip, flagUnseated } from './flags';
import type { Cab, CabTimelineEntry, DayPlan, LatLng, OneOff, PlannerSettings, Rider, Run, Trip } from './types';

export class PlannerError extends Error {}

export interface PlanInput {
	riders: Rider[];
	cabs: Cab[];
	oneOffs: OneOff[];
	settings: PlannerSettings;
	date: string | null;
}

interface Busy {
	from: number;
	to: number;
	tripId: string | null;
	label: string;
}

const DEFAULT_ERRAND_MIN = 60;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function applyOneOffs(riders: Rider[], cabs: Cab[], oneOffs: OneOff[], date: string | null, flags: FlagList) {
	const out = [...riders];
	const busy = new Map<string, Busy[]>();
	const todays = oneOffs.filter((o) => !o.date || !date || o.date === date);

	for (const o of todays) {
		if (o.kind === 'errand') {
			const cab = cabs.find((c) => same(c.label, o.who)) ?? null;
			if (!cab) {
				flags.add('warn', 'one-off', `Errand at ${clockLabel(o.time)} has no cab`, `Row ${o.sourceRow} of One-offs names "${o.who}", which is not in the Cabs tab. Put the cab's name in the Person or cab column.`);
				continue;
			}
			const from = opMinutes(o.time);
			const dur = o.durationMin ?? DEFAULT_ERRAND_MIN;
			busy.set(cab.id, [...(busy.get(cab.id) ?? []), { from, to: from + dur, tripId: null, label: 'Errand' }]);
			flags.add('info', 'one-off', `${cab.label} is out on an errand from ${clockLabel(o.time)}`, `Blocked for ${dur} min; runs in that window use the other cabs.`);
			continue;
		}

		if (o.kind === 'late_stay') {
			const idx = out.findIndex((r) => same(r.empCode, o.who) || same(r.name, o.who));
			if (idx >= 0) {
				const r = out[idx];
				out[idx] = { ...r, dropTime: o.time, oneOff: 'late_stay' };
				flags.add('info', 'one-off', `${r.name} stays late: drop moves to ${clockLabel(o.time)}`, `Was ${clockLabel(r.dropTime)}.`, { riderIds: [r.id] });
				continue;
			}
			if (!o.pin) {
				flags.add('warn', 'one-off', `Late stay for "${o.who}" not found`, `Row ${o.sourceRow} of One-offs: no rider with that code or name, and no home pin to add her.`);
				continue;
			}
		}

		const id = `oneoff-${o.sourceRow}`;
		out.push({
			id,
			empCode: '',
			name: o.who || `One-off row ${o.sourceRow}`,
			team: o.team,
			dropTime: o.time,
			pin: o.pin,
			pinIssue: o.pinIssue,
			notes: '',
			sourceRow: o.sourceRow,
			oneOff: o.kind
		});
		flags.add(
			'info',
			'one-off',
			o.kind === 'new_joiner' ? `New joiner ${o.who} needs a seat at ${clockLabel(o.time)}` : `${o.who} added at ${clockLabel(o.time)}`,
			'Seated around the roster: if a run is full, a one-off gives up the seat before a regular rider.',
			{ riderIds: [id] }
		);
	}
	return { riders: out, busy };
}

function capacityOf(cab: Cab, night: boolean): number {
	return night && cab.guard ? Math.max(0, cab.seats - 1) : cab.seats;
}

export function planDay(input: PlanInput): DayPlan {
	const { settings } = input;
	const office = settings.office;
	if (!office) throw new PlannerError('The office pin is missing. Add it in the Settings tab of the sheet or in the page settings.');
	if (!input.cabs.length) throw new PlannerError('No cabs found. Fill in the Cabs tab.');

	const flags = new FlagList();
	const { riders: all, busy } = applyOneOffs(input.riders, input.cabs, input.oneOffs, input.date, flags);

	const placed: (Rider & { pin: LatLng })[] = [];
	for (const r of all) {
		if (!r.pin) {
			flags.add('bad', 'no-pin', `${r.name} has no usable home pin`, `${r.pinIssue ?? 'No home pin given'}. She can't be planned until the pin is fixed.`, { riderIds: [r.id] });
			continue;
		}
		const km = haversineKm(office, r.pin);
		if (km > settings.serviceRadiusKm) {
			flags.add('warn', 'outside-area', `${r.name} lives ${km.toFixed(1)} km from the office`, `Outside the ${settings.serviceRadiusKm} km service radius. Planned anyway; check the pin.`, { riderIds: [r.id] });
		}
		placed.push(r as Rider & { pin: LatLng });
	}

	const cells: Record<string, string> = {};
	for (const r of placed) cells[r.id] = toCell(r.pin, settings.hexResolution);
	const groups = areaGroups(placed.map((r) => ({ id: r.id, cell: cells[r.id] })));
	const groupOf = new Map<string, string>();
	for (const g of groups) for (const id of g.riderIds) groupOf.set(id, g.id);

	const toAssignRiders = (rs: Rider[]): AssignRider[] =>
		rs.map((r) => ({ pin: r.pin!, priority: r.oneOff ? 1 : 0, group: groupOf.get(r.id) ?? '' }));
	const toAssignCabs = (cabs: Cab[], night: boolean): AssignCab[] =>
		cabs.map((c) => ({ index: input.cabs.indexOf(c), capacity: capacityOf(c, night), guarded: c.guard }));

	const evaluate = (d: RunDraft) => {
		const night = isNight(d.depart, settings.nightStart, settings.nightEnd);
		const a = assignRun(office, toAssignRiders(d.riders), toAssignCabs(input.cabs, night), night, settings);
		return { cost: a.cost + a.unseated.length * 1000, singles: a.singles };
	};
	const { drafts, notes } = groupSlots(placed, settings.maxMergeWaitMin, evaluate);

	const runs: Run[] = [];
	drafts.forEach((d, i) => {
		const runId = `run-${i + 1}`;
		const departOp = opMinutes(d.depart);
		const night = isNight(d.depart, settings.nightStart, settings.nightEnd);
		const free = input.cabs.filter((c) => !(busy.get(c.id) ?? []).some((b) => b.from <= departOp && departOp < b.to));
		const a = assignRun(office, toAssignRiders(d.riders), toAssignCabs(free, night), night, settings);

		const trips: Trip[] = a.blocks.map((b, k) => {
			const cab = input.cabs[b.cab];
			const stops = b.riders.map((ri, pos) => {
				const r = d.riders[ri];
				const rideMin = Math.round(b.seq.rides[pos]);
				return {
					riderId: r.id,
					name: r.name,
					team: r.team,
					slot: r.dropTime,
					waitMin: waitMinutes(r, d.depart),
					rideMin,
					eta: addMinutes(d.depart, rideMin),
					pin: r.pin!,
					cell: cells[r.id]
				};
			});
			const lastEta = stops.at(-1)!.eta;
			const tripNight = night || isNight(lastEta, settings.nightStart, settings.nightEnd);
			const totalMin = Math.round(b.seq.routeMin + settings.stopMin + b.seq.returnMin);
			return {
				id: `${runId}-t${k + 1}`,
				runId,
				cabId: cab.id,
				cabLabel: cab.label,
				driver: cab.driver,
				depart: d.depart,
				night: tripNight,
				guard: cab.guard && night,
				capacity: capacityOf(cab, night),
				stops,
				routeMin: Math.round(b.seq.routeMin),
				returnAt: addMinutes(d.depart, totalMin),
				distanceKm: Math.round(b.seq.distanceKm * 10) / 10
			};
		});

		const run: Run = { id: runId, depart: d.depart, slots: d.slots, riderIds: d.riders.map((r) => r.id), trips, unseated: a.unseated.map((ri) => d.riders[ri].id) };
		runs.push(run);

		for (const t of trips) {
			const from = departOp;
			const to = departOp + (opMinutes(t.returnAt) - departOp + 1440) % 1440;
			const clash = (busy.get(t.cabId) ?? []).find((b) => b.from < to && from < b.to);
			if (clash) {
				flags.add('warn', 'one-off', `${t.cabLabel} is back too late for its ${clash.label.toLowerCase()}`, `The ${clockLabel(t.depart)} run returns at ${clockLabel(t.returnAt)}.`, { runId, tripId: t.id });
			}
			busy.set(t.cabId, [...(busy.get(t.cabId) ?? []), { from, to, tripId: t.id, label: `${clockLabel(t.depart)} run` }]);
		}

		const note = notes.find((n) => n.kind === 'single-kept' && n.depart === d.depart);
		for (const t of trips) checkTrip(flags, run, t, settings.maxRideMin, t.stops.length === 1 && d.riders.length === 1 ? (note?.message ?? null) : null);

		if (a.unseated.length) {
			const reason = free.length < input.cabs.length ? `${input.cabs.length - free.length} cab(s) are still out on earlier runs or errands, and the rest are full.` : 'Every cab is full on this run.';
			flagUnseated(flags, run, a.unseated.map((ri) => d.riders[ri]), reason);
		}

		const merged = notes.find((n) => n.kind === 'merged' && n.depart === d.depart);
		if (merged) flags.add('info', 'merge', `Runs merged at ${clockLabel(d.depart)}`, merged.message, { runId, riderIds: merged.riderIds });
	});

	const cabTimelines: Record<string, CabTimelineEntry[]> = {};
	for (const cab of input.cabs) {
		cabTimelines[cab.id] = (busy.get(cab.id) ?? [])
			.sort((a, b) => a.from - b.from)
			.map((b) => ({
				tripId: b.tripId,
				label: b.label,
				from: addMinutes('06:00', b.from),
				to: addMinutes('06:00', b.to)
			}));
	}

	return {
		date: input.date,
		riders: all,
		cabs: input.cabs,
		runs,
		flags: flags.sorted(),
		areaGroups: groups,
		cells,
		cabTimelines,
		settings
	};
}
