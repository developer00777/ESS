import { clockLabel, opMinutes } from './clock';
import type { Rider } from './types';

export interface RunDraft {
	depart: string;
	slots: string[];
	riders: Rider[];
}

export interface RunEval {
	cost: number;
	singles: number;
}

export interface MergeNote {
	kind: 'merged' | 'single-kept';
	depart: string;
	slots: string[];
	riderIds: string[];
	waitMin: number;
	message: string;
}

export function waitMinutes(rider: Rider, depart: string): number {
	return opMinutes(depart) - opMinutes(rider.dropTime);
}

function draftWait(d: RunDraft): number {
	return d.riders.reduce((s, r) => s + waitMinutes(r, d.depart), 0);
}

export function groupSlots(riders: Rider[], maxMergeWaitMin: number, evaluate: (d: RunDraft) => RunEval): { drafts: RunDraft[]; notes: MergeNote[] } {
	const bySlot = new Map<string, Rider[]>();
	for (const r of riders) bySlot.set(r.dropTime, [...(bySlot.get(r.dropTime) ?? []), r]);
	let drafts: RunDraft[] = [...bySlot.entries()]
		.sort(([a], [b]) => opMinutes(a) - opMinutes(b))
		.map(([slot, rs]) => ({ depart: slot, slots: [slot], riders: rs }));

	const cache = new Map<RunDraft, RunEval>();
	const evalOf = (d: RunDraft) => {
		let e = cache.get(d);
		if (!e) {
			e = evaluate(d);
			cache.set(d, e);
		}
		return e;
	};

	const notes: MergeNote[] = [];
	let changed = true;
	while (changed) {
		changed = false;
		for (let i = 0; i + 1 < drafts.length; i++) {
			const a = drafts[i];
			const b = drafts[i + 1];
			const gap = opMinutes(b.depart) - opMinutes(a.depart);
			if (gap > maxMergeWaitMin) continue;
			const ea = evalOf(a);
			const eb = evalOf(b);
			if (ea.singles === 0 && eb.singles === 0) continue;
			const merged: RunDraft = { depart: b.depart, slots: [...a.slots, ...b.slots], riders: [...a.riders, ...b.riders] };
			const em = evalOf(merged);
			const before = ea.cost + eb.cost + draftWait(a) + draftWait(b);
			const after = em.cost + draftWait(merged);
			if (after >= before) continue;
			drafts = [...drafts.slice(0, i), merged, ...drafts.slice(i + 2)];
			changed = true;
			break;
		}
	}

	for (let i = 0; i < drafts.length; i++) {
		const d = drafts[i];
		if (d.slots.length > 1) {
			const waiting = d.riders.filter((r) => waitMinutes(r, d.depart) > 0);
			const maxWait = Math.max(...waiting.map((r) => waitMinutes(r, d.depart)));
			notes.push({
				kind: 'merged',
				depart: d.depart,
				slots: d.slots,
				riderIds: waiting.map((r) => r.id),
				waitMin: maxWait,
				message: `${d.slots.map(clockLabel).join(' and ')} share one run at ${clockLabel(d.depart)}. ${waiting.length} rider${waiting.length === 1 ? '' : 's'} wait up to ${maxWait} min; nobody leaves before their shift ends.`
			});
			continue;
		}
		if (evalOf(d).singles === 0) continue;
		const next = drafts[i + 1];
		const gap = next ? opMinutes(next.depart) - opMinutes(d.depart) : null;
		const reason =
			gap === null
				? 'There is no later run that night to merge into, and moving earlier would mean leaving before the shift ends.'
				: gap > maxMergeWaitMin
					? `Merging into the ${clockLabel(next!.depart)} run needs a ${gap}-min wait; the cap is ${maxMergeWaitMin} min.`
					: `Merging into the ${clockLabel(next!.depart)} run did not remove the single trip within the seat and ride-time limits.`;
		notes.push({
			kind: 'single-kept',
			depart: d.depart,
			slots: d.slots,
			riderIds: d.riders.map((r) => r.id),
			waitMin: gap ?? 0,
			message: reason
		});
	}

	return { drafts, notes };
}
