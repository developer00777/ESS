import { describe, expect, it } from 'vitest';
import { gridDisk } from 'h3-js';
import { areaGroups, cellBoundary, toCell } from './hex';

describe('areaGroups', () => {
	const home = toCell({ lat: 17.4933, lng: 78.3915 }, 8);
	const [, neighbour] = gridDisk(home, 1);
	const twoAway = gridDisk(neighbour, 1).find((c) => !gridDisk(home, 1).includes(c))!;
	const far = toCell({ lat: 17.4122, lng: 78.34 }, 8);

	it('groups riders in the same or touching cells', () => {
		const groups = areaGroups([
			{ id: 'a', cell: home },
			{ id: 'b', cell: home },
			{ id: 'c', cell: neighbour },
			{ id: 'd', cell: far }
		]);
		expect(groups).toHaveLength(2);
		expect(groups[0].riderIds.sort()).toEqual(['a', 'b', 'c']);
		expect(groups[1].riderIds).toEqual(['d']);
	});

	it('chains neighbours transitively', () => {
		const groups = areaGroups([
			{ id: 'a', cell: home },
			{ id: 'b', cell: neighbour },
			{ id: 'c', cell: twoAway }
		]);
		expect(groups).toHaveLength(1);
	});

	it('gives a six-sided outline for the map', () => {
		expect(cellBoundary(home)).toHaveLength(6);
	});
});
