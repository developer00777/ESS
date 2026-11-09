import { describe, expect, it } from 'vitest';
import { haversineKm, parsePin, travelMinutes } from './geo';
import { SETTINGS } from './fixture.test-data';

describe('parsePin', () => {
	it.each([
		['17.4485, 78.3908', 17.4485, 78.3908],
		['17.4485 78.3908', 17.4485, 78.3908],
		['https://www.google.com/maps/place/Kondapur/@17.4600,78.3600,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d17.4612!4d78.3633', 17.4612, 78.3633],
		['https://www.google.com/maps/@17.4485,78.3908,17z', 17.4485, 78.3908],
		['https://maps.google.com/?q=17.4485,78.3908', 17.4485, 78.3908],
		['https://www.google.com/maps/search/?api=1&query=17.4485%2C78.3908', 17.4485, 78.3908],
		['https://www.google.com/maps/dir/?api=1&destination=17.4485,78.3908', 17.4485, 78.3908],
		['https://www.openstreetmap.org/?mlat=17.4485&mlon=78.3908#map=17/17.4485/78.3908', 17.4485, 78.3908],
		['https://www.openstreetmap.org/#map=17/17.4485/78.3908', 17.4485, 78.3908],
		['geo:17.4485,78.3908', 17.4485, 78.3908]
	])('reads %s', (input, lat, lng) => {
		expect(parsePin(input)).toEqual({ pin: { lat, lng }, issue: null });
	});

	it('asks for the full link when given a short share link', () => {
		const r = parsePin('https://maps.app.goo.gl/AbCdEf123');
		expect(r.pin).toBeNull();
		expect(r.issue).toMatch(/Short share link/);
	});

	it.each(['', 'Flat 4B, Kondapur', '95.1, 78.3', '0, 0'])('rejects %s', (input) => {
		expect(parsePin(input).pin).toBeNull();
	});
});

describe('distance and time', () => {
	it('measures about 11 km per 0.1° of latitude', () => {
		expect(haversineKm({ lat: 17.4, lng: 78.4 }, { lat: 17.5, lng: 78.4 })).toBeCloseTo(11.12, 1);
	});

	it('is slower by day than at night', () => {
		const a = { lat: 17.4, lng: 78.4 };
		const b = { lat: 17.5, lng: 78.4 };
		expect(travelMinutes(a, b, false, SETTINGS)).toBeGreaterThan(travelMinutes(a, b, true, SETTINGS));
		expect(travelMinutes(a, b, true, SETTINGS)).toBeCloseTo((11.12 * 1.4 * 60) / 30, 0);
	});
});
