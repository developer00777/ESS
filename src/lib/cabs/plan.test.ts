import { describe, expect, it } from 'vitest';
import { planDay, PlannerError } from './plan';
import { opMinutes } from './clock';
import { BRIEF_CABS, BRIEF_RIDERS, SETTINGS, cab, rider } from './fixture.test-data';
import type { OneOff } from './types';

const plan = (over: Partial<Parameters<typeof planDay>[0]> = {}) =>
	planDay({ riders: BRIEF_RIDERS, cabs: BRIEF_CABS, oneOffs: [], settings: SETTINGS, date: '2026-11-10', ...over });

describe('planDay on the brief: 15 riders, 6 slots', () => {
	const p = plan();
	const trips = p.runs.flatMap((r) => r.trips);
	const seated = trips.flatMap((t) => t.stops);

	it('seats every rider exactly once', () => {
		expect(seated.map((s) => s.riderId).sort()).toEqual(BRIEF_RIDERS.map((r) => r.id).sort());
		expect(p.runs.every((r) => r.unseated.length === 0)).toBe(true);
	});

	it('never moves anyone earlier than their shift', () => {
		for (const run of p.runs) {
			for (const t of run.trips) {
				for (const s of t.stops) expect(opMinutes(run.depart)).toBeGreaterThanOrEqual(opMinutes(s.slot));
			}
		}
	});

	it('merges 3:30 and 4:00 AM into one shared run', () => {
		const late = p.runs.find((r) => r.slots.includes('03:30'))!;
		expect(late.slots).toEqual(['03:30', '04:00']);
		expect(late.depart).toBe('04:00');
		expect(late.trips).toHaveLength(1);
		expect(late.trips[0].stops.find((s) => s.slot === '03:30')!.waitMin).toBe(30);
		expect(p.flags.some((f) => f.rule === 'merge')).toBe(true);
	});

	it('keeps 11 PM separate, because a 12 AM merge would need a 60-min wait', () => {
		const run = p.runs.find((r) => r.slots.includes('23:00'))!;
		expect(run.slots).toEqual(['23:00']);
		const single = p.flags.find((f) => f.rule === 'single-trip' && f.runId === run.id)!;
		expect(single.detail).toMatch(/60-min wait; the cap is 30/);
	});

	it('puts a guard on every night trip or raises a red flag', () => {
		for (const t of trips.filter((t) => t.night)) {
			if (!t.guard) expect(p.flags.some((f) => f.rule === 'last-drop-alone' && f.tripId === t.id)).toBe(true);
		}
		expect(trips.filter((t) => t.night).every((t) => t.guard)).toBe(true);
	});

	it('leaves the guard seat free', () => {
		for (const t of trips) expect(t.stops.length).toBeLessThanOrEqual(t.capacity);
		for (const t of trips.filter((t) => t.guard)) {
			const c = BRIEF_CABS.find((c) => c.id === t.cabId)!;
			expect(t.capacity).toBe(c.seats - 1);
		}
	});

	it('runs the 4 PM Sales drop by day without a guard', () => {
		const run = p.runs.find((r) => r.depart === '16:00')!;
		expect(run.trips.every((t) => !t.night && !t.guard)).toBe(true);
	});
});

describe('red flags', () => {
	it('flags a night trip on a cab with no guard', () => {
		const p = plan({ riders: [rider('Zara', 'Ops', '00:00', 17.47, 78.36)], cabs: [cab('Cab 9', 4, false)] });
		const f = p.flags.find((f) => f.rule === 'last-drop-alone')!;
		expect(f.severity).toBe('bad');
		expect(f.title).toMatch(/Zara is dropped last, alone/);
	});

	it('flags a rider with no seat and points to the ride-hail claim', () => {
		const riders = [1, 2, 3, 4].map((i) => rider(`R${i}`, 'Ops', '00:00', 17.46 + i / 1000, 78.37));
		const p = plan({ riders, cabs: [cab('Only', 4, true)] });
		const f = p.flags.find((f) => f.rule === 'no-seat')!;
		expect(f.severity).toBe('bad');
		expect(f.detail).toMatch(/Ola, Uber or Rapido/);
		expect(p.flags.some((f) => f.rule === 'full-cab')).toBe(true);
	});

	it('flags a missing pin and an out-of-area pin', () => {
		const lost = { ...rider('Noor', 'Ops', '21:00', 0, 0), pin: null, pinIssue: 'Short share link' };
		const far = rider('Ira', 'Ops', '21:00', 17.9, 78.9);
		const p = plan({ riders: [lost, far] });
		expect(p.flags.find((f) => f.rule === 'no-pin')!.detail).toMatch(/Short share link/);
		expect(p.flags.some((f) => f.rule === 'outside-area')).toBe(true);
	});

	it('flags a ride over the cap', () => {
		const p = plan({ riders: [rider('Far', 'Ops', '21:00', 17.75, 78.38)], settings: { ...SETTINGS, maxRideMin: 30, serviceRadiusKm: 100 } });
		expect(p.flags.some((f) => f.rule === 'ride-too-long')).toBe(true);
	});

	it('needs an office pin', () => {
		expect(() => plan({ settings: { ...SETTINGS, office: null } })).toThrow(PlannerError);
	});
});

describe('one-offs', () => {
	const base = { date: null, team: 'Ops', pin: null, pinIssue: null, durationMin: null } satisfies Partial<OneOff>;

	it('moves a late stay to the later slot', () => {
		const p = plan({ oneOffs: [{ ...base, kind: 'late_stay', who: 'Farah', time: '00:00', sourceRow: 2 }] });
		const midnight = p.runs.find((r) => r.depart === '00:00')!;
		expect(midnight.trips.flatMap((t) => t.stops).some((s) => s.name === 'Farah')).toBe(true);
		expect(p.runs.some((r) => r.slots.includes('23:00'))).toBe(false);
	});

	it('adds a new joiner from day one', () => {
		const p = plan({ oneOffs: [{ ...base, kind: 'new_joiner', who: 'Riya', time: '21:00', pin: { lat: 17.425, lng: 78.412 }, sourceRow: 3 }] });
		const nine = p.runs.find((r) => r.depart === '21:00')!;
		expect(nine.trips.flatMap((t) => t.stops).map((s) => s.name)).toContain('Riya');
	});

	it('takes a cab out for an errand', () => {
		const p = plan({ oneOffs: [{ ...base, kind: 'errand', who: 'Cab 5', time: '23:30', durationMin: 120, sourceRow: 4 }] });
		const midnight = p.runs.find((r) => r.depart === '00:00')!;
		expect(midnight.trips.some((t) => t.cabId === 'cab-5')).toBe(false);
		expect(p.cabTimelines['cab-5'].some((e) => e.label === 'Errand')).toBe(true);
	});

	it('ignores one-offs dated for another day', () => {
		const p = plan({ oneOffs: [{ ...base, date: '2026-11-11', kind: 'late_stay', who: 'Farah', time: '00:00', sourceRow: 2 }] });
		expect(p.runs.some((r) => r.slots.includes('23:00'))).toBe(true);
	});
});
