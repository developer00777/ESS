import { roadKm, travelMinutes } from './geo';
import type { LatLng, PlannerSettings } from './types';

export const OVER_CAP_PENALTY = 500;
const EXACT_LIMIT = 8;

export interface SequenceResult {
	order: number[];
	rides: number[];
	routeMin: number;
	returnMin: number;
	distanceKm: number;
	overCap: number;
	score: number;
}

function evaluate(order: number[], office: LatLng, points: LatLng[], night: boolean, settings: PlannerSettings): SequenceResult {
	const rides: number[] = [];
	let t = 0;
	let km = 0;
	let prev = office;
	order.forEach((idx, k) => {
		if (k > 0) t += settings.stopMin;
		t += travelMinutes(prev, points[idx], night, settings);
		km += roadKm(prev, points[idx], settings);
		rides.push(t);
		prev = points[idx];
	});
	const returnMin = order.length ? travelMinutes(prev, office, night, settings) : 0;
	km += order.length ? roadKm(prev, office, settings) : 0;
	const overCap = rides.filter((r) => r > settings.maxRideMin).length;
	const score = rides.reduce((s, r) => s + r, 0) + overCap * OVER_CAP_PENALTY;
	return { order, rides, routeMin: t, returnMin, distanceKm: km, overCap, score };
}

function better(a: SequenceResult, b: SequenceResult | null): boolean {
	if (!b) return true;
	if (a.score !== b.score) return a.score < b.score;
	return a.routeMin < b.routeMin;
}

const permCache = new Map<number, number[][]>();

function permutations(n: number): number[][] {
	const hit = permCache.get(n);
	if (hit) return hit;
	const out: number[][] = [];
	permCache.set(n, out);
	if (n === 0) {
		out.push([]);
		return out;
	}
	const rec = (prefix: number[], rest: number[]) => {
		if (!rest.length) {
			out.push(prefix);
			return;
		}
		rest.forEach((x, i) => rec([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
	};
	rec([], [...Array(n).keys()]);
	return out;
}

function nearestNeighbourWithTwoOpt(office: LatLng, points: LatLng[], night: boolean, settings: PlannerSettings): SequenceResult {
	const left = new Set(points.keys());
	const order: number[] = [];
	let prev = office;
	while (left.size) {
		let pick = -1;
		let bestT = Infinity;
		for (const i of left) {
			const t = travelMinutes(prev, points[i], night, settings);
			if (t < bestT) {
				bestT = t;
				pick = i;
			}
		}
		order.push(pick);
		left.delete(pick);
		prev = points[pick];
	}
	let best = evaluate(order, office, points, night, settings);
	let improved = true;
	while (improved) {
		improved = false;
		for (let i = 0; i < order.length - 1; i++) {
			for (let j = i + 1; j < order.length; j++) {
				const cand = [...best.order.slice(0, i), ...best.order.slice(i, j + 1).reverse(), ...best.order.slice(j + 1)];
				const r = evaluate(cand, office, points, night, settings);
				if (better(r, best)) {
					best = r;
					improved = true;
				}
			}
		}
	}
	return best;
}

export function bestSequence(office: LatLng, points: LatLng[], night: boolean, settings: PlannerSettings): SequenceResult {
	if (points.length > EXACT_LIMIT) return nearestNeighbourWithTwoOpt(office, points, night, settings);
	let best: SequenceResult | null = null;
	for (const order of permutations(points.length)) {
		const r = evaluate(order, office, points, night, settings);
		if (better(r, best)) best = r;
	}
	return best!;
}
