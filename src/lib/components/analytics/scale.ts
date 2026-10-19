/** A clean axis top at or above `max`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(max: number): number {
	if (!(max > 0)) return 1;
	const p = 10 ** Math.floor(Math.log10(max));
	for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
	return 10 * p;
}

/** How many steps split `top` into clean values: 25 → 5 (steps of 5), 20 → 4. */
export function tickCount(top: number): number {
	const clean = (v: number) => {
		const p = 10 ** Math.floor(Math.log10(v));
		return [1, 2, 2.5, 5, 10].some((m) => Math.abs(v - m * p) < 1e-9);
	};
	return [4, 5, 2].find((n) => clean(top / n)) ?? 4;
}

/** Evenly spaced ticks from 0 to `top`. */
export function ticks(top: number, count = tickCount(top)): number[] {
	return Array.from({ length: count + 1 }, (_, i) => Math.round(((top * i) / count) * 100) / 100);
}

/** 1,284 → "1.3K" from a thousand up; small numbers keep one decimal at most. */
export function compact(n: number): string {
	if (Math.abs(n) >= 1000) return `${Math.round(n / 100) / 10}K`;
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Every k-th label so x-axis text never collides. */
export function labelStep(count: number, width: number, minGap = 52): number {
	return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / minGap))));
}
