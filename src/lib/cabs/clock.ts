const DAY = 1440;
export const OPERATING_DAY_START = 6 * 60;

const pad = (n: number) => String(n).padStart(2, '0');

function fromMinutes(total: number): string {
	const m = ((Math.round(total) % DAY) + DAY) % DAY;
	return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function clockMinutes(clock: string): number {
	const [h, m] = clock.split(':').map(Number);
	return h * 60 + m;
}

export function opMinutes(clock: string): number {
	return (clockMinutes(clock) - OPERATING_DAY_START + DAY) % DAY;
}

export function fromOpMinutes(op: number): string {
	return fromMinutes(op + OPERATING_DAY_START);
}

export function addMinutes(clock: string, minutes: number): string {
	return fromMinutes(clockMinutes(clock) + minutes);
}

export function clockLabel(clock: string): string {
	const [h, m] = clock.split(':').map(Number);
	const suffix = h < 12 ? 'AM' : 'PM';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12}:${pad(m)} ${suffix}`;
}

export function isNight(clock: string, nightStart: string, nightEnd: string): boolean {
	const t = clockMinutes(clock);
	const s = clockMinutes(nightStart);
	const e = clockMinutes(nightEnd);
	return s <= e ? t >= s && t < e : t >= s || t < e;
}

export function parseClock(value: unknown): string | null {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
	}
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		const frac = value - Math.floor(value);
		return fromMinutes(Math.round(frac * DAY));
	}
	if (typeof value !== 'string') return null;
	const s = value.trim().toLowerCase().replace(/\s+/g, ' ');
	if (!s) return null;
	if (s === 'midnight') return '00:00';
	if (s === 'noon') return '12:00';
	const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?$/);
	if (!m) return null;
	let h = Number(m[1]);
	const min = m[2] ? Number(m[2]) : 0;
	const mer = m[3]?.[0];
	if (min > 59) return null;
	if (mer) {
		if (h < 1 || h > 12) return null;
		if (mer === 'a') h = h === 12 ? 0 : h;
		else h = h === 12 ? 12 : h + 12;
	} else if (!m[2]) {
		return null;
	}
	if (h > 23) return null;
	return `${pad(h)}:${pad(min)}`;
}
