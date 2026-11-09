import { clockLabel } from './clock';
import type { Flag, FlagRule, FlagSeverity, Rider, Run, Trip } from './types';

export class FlagList {
	readonly items: Flag[] = [];
	private n = 0;

	add(severity: FlagSeverity, rule: FlagRule, title: string, detail: string, refs: { runId?: string; tripId?: string; riderIds?: string[] } = {}): void {
		this.n++;
		this.items.push({
			id: `${rule}-${this.n}`,
			severity,
			rule,
			title,
			detail,
			runId: refs.runId ?? null,
			tripId: refs.tripId ?? null,
			riderIds: refs.riderIds ?? []
		});
	}

	sorted(): Flag[] {
		const rank: Record<FlagSeverity, number> = { bad: 0, warn: 1, info: 2 };
		return [...this.items].sort((a, b) => rank[a.severity] - rank[b.severity]);
	}
}

export function checkTrip(flags: FlagList, run: Run, trip: Trip, maxRideMin: number, singleReason: string | null): void {
	const refs = { runId: run.id, tripId: trip.id, riderIds: trip.stops.map((s) => s.riderId) };
	const last = trip.stops.at(-1);
	if (!last) return;

	if (trip.night && !trip.guard) {
		flags.add(
			'bad',
			'last-drop-alone',
			`${last.name} is dropped last, alone, at ${clockLabel(last.eta)} with no guard`,
			`${trip.cabLabel}, ${clockLabel(trip.depart)} run. Rule: no woman is the last drop alone at night without a guard. Put a guard on ${trip.cabLabel} (Cabs tab) or move this run to a cab that has one.`,
			{ ...refs, riderIds: [last.riderId] }
		);
	}

	if (trip.stops.length >= trip.capacity) {
		flags.add(
			'warn',
			'full-cab',
			`${trip.cabLabel} is full on the ${clockLabel(trip.depart)} run`,
			`${trip.stops.length} of ${trip.capacity} seats${trip.guard ? ' (one seat goes to the guard)' : ''}. A late stay or new joiner on this run will need another cab.`,
			refs
		);
	}

	if (trip.stops.length === 1) {
		flags.add(
			'warn',
			'single-trip',
			`${last.name} rides alone on the ${clockLabel(trip.depart)} run`,
			singleReason ?? 'Sharing a cab would push someone past the maximum ride time.',
			refs
		);
	}

	for (const s of trip.stops) {
		if (s.rideMin > maxRideMin) {
			flags.add(
				'warn',
				'ride-too-long',
				`${s.name} spends ${s.rideMin} min in the cab`,
				`${trip.cabLabel}, ${clockLabel(trip.depart)} run. The cap is ${maxRideMin} min.`,
				{ ...refs, riderIds: [s.riderId] }
			);
		}
	}
}

export function flagUnseated(flags: FlagList, run: Run, riders: Rider[], reason: string): void {
	for (const r of riders) {
		flags.add(
			'bad',
			'no-seat',
			`${r.name} has no seat at ${clockLabel(run.depart)}`,
			`${reason} She claims that day's Ola, Uber or Rapido at actuals.`,
			{ runId: run.id, riderIds: [r.id] }
		);
	}
}
