import { describe, expect, it } from 'vitest';
import { assignRun } from './assign';
import { bestSequence } from './sequence';
import { OFFICE, SETTINGS } from './fixture.test-data';

const north = (km: number) => ({ lat: OFFICE.lat + km / 111.2, lng: OFFICE.lng });
const east = (km: number) => ({ lat: OFFICE.lat, lng: OFFICE.lng + km / 106.1 });

describe('bestSequence', () => {
	it('drops the nearer rider first on a straight line', () => {
		const s = bestSequence(OFFICE, [north(8), north(3), north(5)], true, SETTINGS);
		expect(s.order).toEqual([1, 2, 0]);
		expect(s.rides[0]).toBeLessThan(s.rides[1]);
	});

	it('counts riders over the ride cap', () => {
		const s = bestSequence(OFFICE, [north(50)], true, { ...SETTINGS, maxRideMin: 60 });
		expect(s.overCap).toBe(1);
	});
});

describe('assignRun', () => {
	const r = (pin: { lat: number; lng: number }, priority = 0) => ({ pin, priority, group: '' });

	it('splits two directions into two cabs rather than one long loop', () => {
		const a = assignRun(
			OFFICE,
			[r(north(10)), r(north(11)), r(east(10)), r(east(11))],
			[
				{ index: 0, capacity: 4, guarded: true },
				{ index: 1, capacity: 4, guarded: true }
			],
			true,
			SETTINGS
		);
		expect(a.blocks).toHaveLength(2);
		const sets = a.blocks.map((b) => [...b.riders].sort()).sort();
		expect(sets).toEqual([
			[0, 1],
			[2, 3]
		]);
	});

	it('keeps neighbours together in one cab', () => {
		const a = assignRun(OFFICE, [r(north(6)), r(north(6.3)), r(north(6.6))], [{ index: 0, capacity: 3, guarded: true }, { index: 1, capacity: 3, guarded: true }], true, SETTINGS);
		expect(a.blocks).toHaveLength(1);
		expect(a.singles).toBe(0);
	});

	it('respects capacity and seats nobody beyond it', () => {
		const a = assignRun(OFFICE, [r(north(5)), r(north(6)), r(north(7)), r(north(8))], [{ index: 0, capacity: 3, guarded: true }], true, SETTINGS);
		expect(a.blocks[0].riders).toHaveLength(3);
		expect(a.unseated).toHaveLength(1);
	});

	it('gives up a one-off seat before a roster seat', () => {
		const a = assignRun(OFFICE, [r(north(20), 0), r(north(2), 1)], [{ index: 0, capacity: 1, guarded: true }], true, SETTINGS);
		expect(a.unseated).toEqual([1]);
	});

	it('prefers a guarded cab at night', () => {
		const a = assignRun(
			OFFICE,
			[r(north(5)), r(north(5.5))],
			[
				{ index: 0, capacity: 4, guarded: false },
				{ index: 1, capacity: 3, guarded: true }
			],
			true,
			SETTINGS
		);
		expect(a.blocks.map((b) => b.cab)).toEqual([1]);
	});

	it('falls back to sweep packing above the exact limit', () => {
		const riders = Array.from({ length: 12 }, (_, i) => r(i % 2 ? north(4 + i) : east(4 + i)));
		const a = assignRun(OFFICE, riders, [0, 1, 2].map((index) => ({ index, capacity: 4, guarded: true })), true, SETTINGS);
		expect(a.blocks.flatMap((b) => b.riders).sort((x, y) => x - y)).toEqual([...Array(12).keys()]);
		expect(a.blocks.every((b) => b.riders.length <= 4)).toBe(true);
	});
});
