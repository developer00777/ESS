import { describe, expect, it } from 'vitest';
import { addMinutes, clockLabel, isNight, opMinutes, parseClock } from './clock';

describe('parseClock', () => {
	it.each([
		['4:00 PM', '16:00'],
		['4pm', '16:00'],
		['16:00', '16:00'],
		['12:00 AM', '00:00'],
		['12 am', '00:00'],
		['12:30 p.m.', '12:30'],
		['3.30 am', '03:30'],
		['midnight', '00:00'],
		['21:00:00', '21:00']
	])('%s → %s', (input, out) => expect(parseClock(input)).toBe(out));

	it('reads Excel day fractions and exceljs time Dates', () => {
		expect(parseClock(0.6666667)).toBe('16:00');
		expect(parseClock(45000.875)).toBe('21:00');
		expect(parseClock(new Date(Date.UTC(1899, 11, 30, 3, 30)))).toBe('03:30');
	});

	it.each(['', 'soon', '25:00', '13 pm', '4'])('rejects %s', (input) => expect(parseClock(input)).toBeNull());
});

describe('operating minutes', () => {
	it('orders the afternoon before the small hours', () => {
		const order = ['04:00', '00:00', '16:00', '03:30', '21:00'].sort((a, b) => opMinutes(a) - opMinutes(b));
		expect(order).toEqual(['16:00', '21:00', '00:00', '03:30', '04:00']);
	});

	it('wraps past midnight', () => {
		expect(addMinutes('23:40', 45)).toBe('00:25');
		expect(clockLabel('00:25')).toBe('12:25 AM');
		expect(clockLabel('16:00')).toBe('4:00 PM');
	});
});

describe('isNight', () => {
	it('handles a window that crosses midnight', () => {
		expect(isNight('21:00', '20:00', '06:00')).toBe(true);
		expect(isNight('03:30', '20:00', '06:00')).toBe(true);
		expect(isNight('16:00', '20:00', '06:00')).toBe(false);
		expect(isNight('06:00', '20:00', '06:00')).toBe(false);
	});
});
