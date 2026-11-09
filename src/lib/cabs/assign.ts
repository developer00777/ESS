import { bestSequence, type SequenceResult } from './sequence';
import { haversineKm } from './geo';
import type { LatLng, PlannerSettings } from './types';

export const CAB_PENALTY = 20;
export const SINGLE_PENALTY = 120;
export const UNGUARDED_NIGHT_PENALTY = 600;
export const EXACT_RIDERS = 10;

export interface AssignRider {
	pin: LatLng;
	priority: number;
	group: string;
}

export interface AssignCab {
	index: number;
	capacity: number;
	guarded: boolean;
}

export interface Block {
	riders: number[];
	cab: number;
	seq: SequenceResult;
}

export interface Assignment {
	blocks: Block[];
	unseated: number[];
	cost: number;
	singles: number;
}

function bearing(office: LatLng, p: LatLng): number {
	const y = Math.sin(((p.lng - office.lng) * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180);
	const x =
		Math.cos((office.lat * Math.PI) / 180) * Math.sin((p.lat * Math.PI) / 180) -
		Math.sin((office.lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.cos(((p.lng - office.lng) * Math.PI) / 180);
	return (Math.atan2(y, x) * 180) / Math.PI;
}

function matchCabs(blocks: number[][], cabs: AssignCab[], night: boolean): number[] | null {
	const order = blocks.map((_, i) => i).sort((a, b) => blocks[b].length - blocks[a].length || a - b);
	const used = new Set<number>();
	const result = new Array<number>(blocks.length);
	for (const bi of order) {
		const size = blocks[bi].length;
		const pick = cabs
			.filter((c) => !used.has(c.index) && c.capacity >= size)
			.sort((a, b) => (night ? Number(b.guarded) - Number(a.guarded) : 0) || a.capacity - b.capacity || a.index - b.index)[0];
		if (!pick) return null;
		used.add(pick.index);
		result[bi] = pick.index;
	}
	return result;
}

function chooseSeated(office: LatLng, riders: AssignRider[], capacity: number): { seated: number[]; unseated: number[] } {
	const all = riders.map((_, i) => i);
	if (riders.length <= capacity) return { seated: all, unseated: [] };
	const byLeastClaim = [...all].sort(
		(a, b) => riders[b].priority - riders[a].priority || haversineKm(office, riders[b].pin) - haversineKm(office, riders[a].pin) || a - b
	);
	const unseated = byLeastClaim.slice(0, riders.length - capacity);
	return { seated: all.filter((i) => !unseated.includes(i)), unseated: unseated.sort((a, b) => a - b) };
}

export function assignRun(office: LatLng, riders: AssignRider[], cabs: AssignCab[], night: boolean, settings: PlannerSettings): Assignment {
	const usable = cabs.filter((c) => c.capacity > 0);
	const totalCap = usable.reduce((s, c) => s + c.capacity, 0);
	const { seated, unseated } = chooseSeated(office, riders, totalCap);
	if (!seated.length) return { blocks: [], unseated, cost: 0, singles: 0 };

	const seqCache = new Map<string, SequenceResult>();
	const seqFor = (members: number[]): SequenceResult => {
		const key = members.join(',');
		let s = seqCache.get(key);
		if (!s) {
			s = bestSequence(office, members.map((i) => riders[i].pin), night, settings);
			seqCache.set(key, s);
		}
		return s;
	};

	const costOf = (groups: number[][], cabFor: number[]) => {
		let cost = 0;
		let singles = 0;
		groups.forEach((g, i) => {
			cost += seqFor(g).score + CAB_PENALTY;
			if (g.length === 1) {
				cost += SINGLE_PENALTY;
				singles++;
			}
			const cab = usable.find((c) => c.index === cabFor[i])!;
			if (night && !cab.guarded) cost += UNGUARDED_NIGHT_PENALTY;
		});
		return { cost, singles };
	};

	const finish = (groups: number[][], cabFor: number[]): Assignment => {
		const { cost, singles } = costOf(groups, cabFor);
		const blocks = groups.map((g, i) => {
			const seq = seqFor(g);
			return { riders: seq.order.map((k) => g[k]), cab: cabFor[i], seq };
		});
		return { blocks, unseated, cost, singles };
	};

	if (seated.length > EXACT_RIDERS) {
		const groupBearing = new Map<string, number>();
		for (const g of new Set(seated.map((i) => riders[i].group))) {
			const members = seated.filter((i) => riders[i].group === g);
			groupBearing.set(g, members.reduce((s, i) => s + bearing(office, riders[i].pin), 0) / members.length);
		}
		const ordered = [...seated].sort(
			(a, b) =>
				groupBearing.get(riders[a].group)! - groupBearing.get(riders[b].group)! ||
				bearing(office, riders[a].pin) - bearing(office, riders[b].pin)
		);
		const cabOrder = [...usable].sort((a, b) => (night ? Number(b.guarded) - Number(a.guarded) : 0) || b.capacity - a.capacity);
		const groups: number[][] = [];
		const cabFor: number[] = [];
		let at = 0;
		for (const cab of cabOrder) {
			if (at >= ordered.length) break;
			groups.push(ordered.slice(at, at + cab.capacity));
			cabFor.push(cab.index);
			at += cab.capacity;
		}
		return finish(groups, cabFor);
	}

	const maxCap = Math.max(...usable.map((c) => c.capacity));
	const blockOf = new Array<number>(seated.length);
	const sizes: number[] = [];
	let best: { groups: number[][]; cabFor: number[]; cost: number } | null = null;

	const leaf = () => {
		const groups: number[][] = sizes.map(() => []);
		seated.forEach((r, i) => groups[blockOf[i]].push(r));
		const cabFor = matchCabs(groups, usable, night);
		if (!cabFor) return;
		const { cost } = costOf(groups, cabFor);
		if (!best || cost < best.cost) best = { groups, cabFor, cost };
	};

	const rec = (i: number) => {
		if (i === seated.length) return leaf();
		for (let b = 0; b < sizes.length; b++) {
			if (sizes[b] >= maxCap) continue;
			blockOf[i] = b;
			sizes[b]++;
			rec(i + 1);
			sizes[b]--;
		}
		if (sizes.length < usable.length) {
			blockOf[i] = sizes.length;
			sizes.push(1);
			rec(i + 1);
			sizes.pop();
		}
	};
	rec(0);

	const found = best as { groups: number[][]; cabFor: number[]; cost: number } | null;
	if (!found) return { blocks: [], unseated: [...unseated, ...seated].sort((a, b) => a - b), cost: 0, singles: 0 };
	return finish(found.groups, found.cabFor);
}
