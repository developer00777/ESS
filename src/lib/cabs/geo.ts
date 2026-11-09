import type { LatLng, PlannerSettings } from './types';

export type PinResult = { pin: LatLng; issue: null } | { pin: null; issue: string };

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

const PATTERNS: RegExp[] = [
	new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
	new RegExp(String.raw`[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?${NUM}\s*,\s*${NUM}`, 'i'),
	new RegExp(String.raw`[?&]mlat=${NUM}&mlon=${NUM}`, 'i'),
	new RegExp(String.raw`#map=\d+(?:\.\d+)?/${NUM}/${NUM}`),
	new RegExp(String.raw`@${NUM},${NUM}`),
	new RegExp(String.raw`^geo:${NUM},${NUM}`, 'i'),
	new RegExp(String.raw`^${NUM}\s*[,;\s]\s*${NUM}$`)
];

const SHORT_LINK = /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|bit\.ly|tinyurl\.com)/i;

function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

export function parsePin(raw: string | null | undefined): PinResult {
	const text = safeDecode((raw ?? '').trim()).replace(/\+/g, ' ');
	if (!text) return { pin: null, issue: 'No home pin given' };
	if (SHORT_LINK.test(text)) {
		return { pin: null, issue: 'Short share link: open it and paste the full Maps link or the "lat, lng" instead' };
	}
	for (const re of PATTERNS) {
		const m = text.match(re);
		if (!m) continue;
		const lat = Number(m[1]);
		const lng = Number(m[2]);
		if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
			return { pin: { lat, lng }, issue: null };
		}
	}
	return { pin: null, issue: `Couldn't read a location from "${text.slice(0, 60)}"` };
}

export function haversineKm(a: LatLng, b: LatLng): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roadKm(a: LatLng, b: LatLng, settings: PlannerSettings): number {
	return haversineKm(a, b) * settings.roadFactor;
}

export function travelMinutes(a: LatLng, b: LatLng, night: boolean, settings: PlannerSettings): number {
	const speed = night ? settings.nightSpeedKmh : settings.daySpeedKmh;
	return (roadKm(a, b, settings) / speed) * 60;
}
