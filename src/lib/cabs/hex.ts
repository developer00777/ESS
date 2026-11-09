import { latLngToCell, gridDisk, cellToBoundary, cellToLatLng } from 'h3-js';
import type { AreaGroup, LatLng } from './types';

export function toCell(p: LatLng, resolution: number): string {
	return latLngToCell(p.lat, p.lng, resolution);
}

export function cellCentre(cell: string): LatLng {
	const [lat, lng] = cellToLatLng(cell);
	return { lat, lng };
}

export function cellBoundary(cell: string): [number, number][] {
	return cellToBoundary(cell) as [number, number][];
}

export function areaGroups(points: { id: string; cell: string }[]): AreaGroup[] {
	const parent = points.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[rb] = ra;
	};

	const byCell = new Map<string, number[]>();
	points.forEach((p, i) => byCell.set(p.cell, [...(byCell.get(p.cell) ?? []), i]));

	points.forEach((p, i) => {
		for (const n of gridDisk(p.cell, 1)) {
			for (const j of byCell.get(n) ?? []) union(i, j);
		}
	});

	const groups = new Map<number, { cells: Set<string>; riderIds: string[] }>();
	points.forEach((p, i) => {
		const root = find(i);
		const g = groups.get(root) ?? { cells: new Set<string>(), riderIds: [] };
		g.cells.add(p.cell);
		g.riderIds.push(p.id);
		groups.set(root, g);
	});

	return [...groups.values()]
		.sort((a, b) => b.riderIds.length - a.riderIds.length)
		.map((g, i) => ({ id: `area-${i + 1}`, cells: [...g.cells], riderIds: g.riderIds }));
}
