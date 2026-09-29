import { describe, expect, it } from 'vitest';
import {
	channelSlug,
	detectSensitive,
	dmKey,
	isNightShift,
	isQuietTime,
	parseDay,
	parseOfficeHours,
	parseReminder,
	parseSlash,
	verhoeffValid
} from './rules';

// Monday 28 Sep 2026, 12:00 IST.
const NOW = new Date('2026-09-28T06:30:00Z');
const ist = (hhmm: string, date = '2026-09-28') => new Date(`${date}T${hhmm}:00+05:30`);

describe('parseOfficeHours', () => {
	it('reads the ways HR writes office timings', () => {
		expect(parseOfficeHours('9:00 AM - 6:00 PM')).toEqual({ start: 540, end: 1080 });
		expect(parseOfficeHours('9 am to 6 pm')).toEqual({ start: 540, end: 1080 });
		expect(parseOfficeHours('10:30AM–7:30PM')).toEqual({ start: 630, end: 1170 });
		expect(parseOfficeHours('21:00-06:00')).toEqual({ start: 1260, end: 360 });
		expect(parseOfficeHours('9 - 6 PM')).toEqual({ start: 540, end: 1080 });
		expect(parseOfficeHours('9 PM - 6 AM')).toEqual({ start: 1260, end: 360 });
		expect(parseOfficeHours('flexible')).toBeNull();
		expect(parseOfficeHours(null)).toBeNull();
	});

	it('knows a night shift', () => {
		expect(isNightShift(parseOfficeHours('9 PM - 6 AM'))).toBe(true);
		expect(isNightShift(parseOfficeHours('9 AM - 6 PM'))).toBe(false);
	});
});

describe('isQuietTime', () => {
	it('keeps a day shift quiet at night and a night shift quiet at noon', () => {
		expect(isQuietTime('9:00 AM - 6:00 PM', ist('12:00'))).toBe(false);
		expect(isQuietTime('9:00 AM - 6:00 PM', ist('23:30'))).toBe(true);
		expect(isQuietTime('9:00 AM - 6:00 PM', ist('08:15'))).toBe(false); // an hour of slack
		expect(isQuietTime('9 PM - 6 AM', ist('12:00'))).toBe(true);
		expect(isQuietTime('9 PM - 6 AM', ist('02:00'))).toBe(false);
	});

	it('treats no timings as nine to six', () => {
		expect(isQuietTime(null, ist('11:00'))).toBe(false);
		expect(isQuietTime(null, ist('22:00'))).toBe(true);
	});
});

describe('detectSensitive', () => {
	it('finds a valid Aadhaar number but not any 12 digits', () => {
		// 2341 2341 2346 passes the Verhoeff check; changing the last digit fails it.
		expect(verhoeffValid('234123412346')).toBe(true);
		expect(detectSensitive('my aadhaar is 2341 2341 2346')).toEqual(['aadhaar']);
		expect(detectSensitive('ticket 2341 2341 2347')).toEqual([]);
	});

	it('finds a PAN and a bank account next to an IFSC', () => {
		expect(detectSensitive('PAN: ABCPE1234F')).toEqual(['pan']);
		expect(detectSensitive('a/c 123456789012, IFSC HDFC0001234')).toContain('bank');
		expect(detectSensitive('call me on 9876543210')).toEqual([]);
	});
});

describe('parseSlash', () => {
	it('parses commands and polls', () => {
		expect(parseSlash('/balance')).toEqual({ cmd: 'balance' });
		expect(parseSlash('/poll Lunch on Friday? | Yes | No')).toEqual({ cmd: 'poll', question: 'Lunch on Friday?', options: ['Yes', 'No'] });
		expect(parseSlash('/leave next Mon')).toEqual({ cmd: 'leave', arg: 'next Mon' });
		expect(parseSlash('hello')).toBeNull();
		expect(parseSlash('/dance')).toEqual({ cmd: 'unknown', name: 'dance' });
	});
});

describe('parseDay', () => {
	it('reads days relative to IST today, never in the past', () => {
		expect(parseDay('today', NOW)).toBe('2026-09-28');
		expect(parseDay('tomorrow', NOW)).toBe('2026-09-29');
		expect(parseDay('Fri', NOW)).toBe('2026-10-02');
		expect(parseDay('Mon', NOW)).toBe('2026-10-05'); // today is Monday, so the next one
		expect(parseDay('next Fri', NOW)).toBe('2026-10-09');
		expect(parseDay('12 Oct', NOW)).toBe('2026-10-12');
		expect(parseDay('Oct 12', NOW)).toBe('2026-10-12');
		expect(parseDay('1 Jan', NOW)).toBe('2027-01-01');
		expect(parseDay('2026-01-01', NOW)).toBeNull();
		expect(parseDay('31 Feb', NOW)).toBeNull();
	});
});

describe('parseReminder', () => {
	it('reads relative and clock times', () => {
		const inHalf = parseReminder('in 30m check the queue', NOW)!;
		expect(inHalf.at.toISOString()).toBe('2026-09-28T07:00:00.000Z');
		expect(inHalf.text).toBe('check the queue');
		const at4 = parseReminder('at 16:00 send report', NOW)!;
		expect(at4.at.toISOString()).toBe('2026-09-28T10:30:00.000Z');
		const morning = parseReminder('tomorrow 9am standup', NOW)!;
		expect(morning.at.toISOString()).toBe('2026-09-29T03:30:00.000Z');
		// 10 am has passed today, so it means tomorrow.
		expect(parseReminder('at 10am x', NOW)!.at.toISOString()).toBe('2026-09-29T04:30:00.000Z');
		expect(parseReminder('whenever', NOW)).toBeNull();
	});
});

describe('naming', () => {
	it('slugs channel names and keys DMs either way round', () => {
		expect(channelSlug('Data Ops & QA Team')).toBe('data-ops-and-qa-team');
		expect(dmKey('b', 'a')).toBe(dmKey('a', 'b'));
	});
});
