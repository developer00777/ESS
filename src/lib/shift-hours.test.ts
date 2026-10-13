import { describe, it, expect } from 'vitest';
import { buildShifts, openShift, parseShiftWindow, CHECKOUT_GRACE_MINUTES } from './shift-hours';

/** An IST wall-clock punch. */
const ist = (stamp: string) => new Date(`${stamp}:00+05:30`);
const punches = (...stamps: string[]) => stamps.map((s) => ({ at: ist(s) }));
const byDate = (list: ReturnType<typeof buildShifts>) => new Map(list.map((s) => [s.date, s]));
const later = ist('2026-12-01T00:00');

describe('buildShifts', () => {
	// The afternoon-to-midnight pattern from the reported calendar (26 Sep –
	// 25 Oct 2026). The old per-calendar-day rows showed 6 Oct as 00:07 →
	// 23:34 = 23h 27m and 30 Sep as 00:12 → 14:32 = 14h 20m.
	const reported = punches(
		'2026-09-29T14:16',
		'2026-09-30T00:12',
		'2026-09-30T14:32',
		'2026-10-01T14:00',
		'2026-10-01T23:09',
		'2026-10-02T14:57',
		'2026-10-02T21:41',
		'2026-10-05T15:03',
		'2026-10-06T00:07',
		'2026-10-06T14:10',
		'2026-10-06T23:34',
		'2026-10-07T13:55',
		'2026-10-07T23:44',
		'2026-10-08T14:28',
		'2026-10-08T23:45',
		'2026-10-12T13:53',
		'2026-10-13T00:06',
		'2026-10-13T23:18'
	);

	it('credits a shift that ends after midnight to the day it started', () => {
		const s = byDate(buildShifts(reported, { now: later }));
		expect(s.get('2026-09-29')).toMatchObject({ workedMinutes: 9 * 60 + 56, crossesMidnight: true, absorbedDate: '2026-09-30', anomaly: null });
		expect(s.get('2026-10-05')).toMatchObject({ workedMinutes: 9 * 60 + 4, crossesMidnight: true, anomaly: null });
		expect(s.get('2026-10-06')).toMatchObject({ workedMinutes: 9 * 60 + 24, crossesMidnight: false, anomaly: null });
	});

	it('never reports more than one shift of hours for a day', () => {
		for (const shift of buildShifts(reported, { now: later })) {
			if (shift.workedMinutes !== null) expect(shift.workedMinutes).toBeLessThan(14 * 60);
		}
	});

	it('leaves a day whose only punch closed the previous night with no shift of its own', () => {
		// 30 Sep holds 00:12 (29 Sep's check-out) and 14:32 (its own check-in, no check-out).
		const s = byDate(buildShifts(reported, { now: later }));
		expect(s.get('2026-09-30')).toMatchObject({ checkInAt: ist('2026-09-30T14:32'), checkOutAt: null, anomaly: 'missing-check-out' });
		// 9 Oct–11 Oct and 3–4 Oct have no punches, so nothing is credited to them —
		// a leave or week off there stays a leave or week off.
		expect(s.has('2026-10-03')).toBe(false);
		expect(s.has('2026-10-04')).toBe(false);
	});

	it('counts a late logout as overtime on the same shift', () => {
		const s = byDate(buildShifts(reported, { now: later }));
		expect(s.get('2026-10-12')).toMatchObject({ workedMinutes: 10 * 60 + 13, overtimeMinutes: 73, isShort: false });
	});

	it('reads a lone punch at the usual shift end as a missed check-in, not a new shift', () => {
		// 13 Oct: 00:06 closes 12 Oct; 23:18 alone is at this person's usual end time.
		const s = byDate(buildShifts(reported, { now: later }));
		expect(s.get('2026-10-13')).toMatchObject({ checkInAt: null, checkOutAt: ist('2026-10-13T23:18'), anomaly: 'orphan-check-out' });
	});

	it('learns the shift so a missed check-in does not swallow the next day', () => {
		// Usual 14:00 → 23:30 shift, then on 20 Oct only the 23:40 punch arrives.
		const list = punches(
			'2026-10-15T14:00', '2026-10-15T23:30',
			'2026-10-16T14:05', '2026-10-16T23:35',
			'2026-10-19T14:00', '2026-10-19T23:30',
			'2026-10-20T23:40',
			'2026-10-21T14:02', '2026-10-21T23:31'
		);
		const s = byDate(buildShifts(list, { now: later }));
		expect(s.get('2026-10-20')).toMatchObject({ anomaly: 'orphan-check-out', checkInAt: null });
		expect(s.get('2026-10-21')).toMatchObject({ workedMinutes: 9 * 60 + 29, anomaly: null });
	});

	it('handles a night shift that starts in the evening', () => {
		const list = punches('2026-10-01T18:00', '2026-10-02T03:30', '2026-10-02T18:05', '2026-10-03T03:20');
		const s = byDate(buildShifts(list, { window: parseShiftWindow('06:00 PM to 03:30 AM'), now: later }));
		expect(s.get('2026-10-01')).toMatchObject({ workedMinutes: 9 * 60 + 30, absorbedDate: '2026-10-02' });
		expect(s.get('2026-10-02')).toMatchObject({ workedMinutes: 9 * 60 + 15, absorbedDate: '2026-10-03' });
	});

	it('credits a late arrival after midnight to the night shift it belongs to', () => {
		const list = punches('2026-10-02T00:40', '2026-10-02T06:00');
		const s = buildShifts(list, { window: parseShiftWindow('6PM-3 AM'), now: later });
		expect(s).toHaveLength(1);
		expect(s[0].date).toBe('2026-10-01');
	});

	it('handles a day shift', () => {
		const list = punches('2026-10-01T09:58', '2026-10-01T13:00', '2026-10-01T13:45', '2026-10-01T19:05');
		const s = buildShifts(list, { window: parseShiftWindow('10.00-7.00'), now: later });
		expect(s).toEqual([expect.objectContaining({ date: '2026-10-01', workedMinutes: 9 * 60 + 7, punchCount: 4 })]);
	});

	it('treats double taps as one punch', () => {
		const s = buildShifts(punches('2026-10-01T10:00', '2026-10-01T10:01', '2026-10-01T19:00'), { now: later });
		expect(s[0]).toMatchObject({ workedMinutes: 540, punchCount: 2 });
	});

	it('keeps a check-in open during the grace period, then flags the missing check-out', () => {
		const list = punches('2026-10-14T14:00');
		const during = buildShifts(list, { now: ist('2026-10-14T23:00') });
		expect(during[0]).toMatchObject({ inProgress: true, anomaly: null });
		const after = buildShifts(list, { now: new Date(ist('2026-10-14T14:00').getTime() + CHECKOUT_GRACE_MINUTES * 60_000) });
		expect(after[0]).toMatchObject({ inProgress: false, anomaly: 'missing-check-out' });
	});

	it('uses known directions from portal corrections', () => {
		const list = [{ at: ist('2026-10-01T23:50'), direction: 'out' as const }];
		expect(buildShifts(list, { now: later })[0]).toMatchObject({ anomaly: 'orphan-check-out', checkInAt: null });
	});
});

describe('openShift', () => {
	it('returns the shift still waiting for a check-out', () => {
		const shifts = buildShifts(punches('2026-10-13T14:00', '2026-10-13T23:30', '2026-10-14T14:05'), { now: ist('2026-10-14T20:00') });
		expect(openShift(shifts, ist('2026-10-14T20:00'))?.checkInAt).toEqual(ist('2026-10-14T14:05'));
	});

	it('is null once the shift has a check-out', () => {
		const shifts = buildShifts(punches('2026-10-14T14:00', '2026-10-14T23:30'), { now: ist('2026-10-14T23:40') });
		expect(openShift(shifts, ist('2026-10-14T23:40'))).toBeNull();
	});
});

describe('parseShiftWindow', () => {
	it('reads freehand office timings', () => {
		expect(parseShiftWindow('06:00 PM to 03:30 AM')).toEqual({ startMinutes: 18 * 60, lengthMinutes: 9 * 60 + 30 });
		expect(parseShiftWindow('10.00-7.00')).toEqual({ startMinutes: 600, lengthMinutes: 540 });
		expect(parseShiftWindow('06:00 PM to 03:30 PM')).toEqual({ startMinutes: 18 * 60, lengthMinutes: 9 * 60 + 30 });
		expect(parseShiftWindow('flexible')).toBeNull();
	});
});
