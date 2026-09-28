import { describe, expect, it } from 'vitest';
import {
	badgeFor,
	buildFeed,
	buildIcs,
	daysUntil,
	relativeDay,
	summaryOf,
	weekGroup,
	type FeedHoliday,
	type FeedPost
} from './announcements';

// Monday 28 Sep 2026, 12:00 IST.
const NOW = new Date('2026-09-28T06:30:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function post(over: Partial<FeedPost>): FeedPost {
	return {
		id: Math.random().toString(36).slice(2),
		kind: 'update',
		title: 'A post',
		summary: null,
		body: 'First sentence. Second sentence.',
		eventDate: null,
		eventTime: null,
		requiresAck: false,
		urgentDays: 3,
		attachmentName: null,
		publishAt: hoursAgo(2),
		editedAt: null,
		authorName: 'Anita Kulkarni',
		read: false,
		acknowledged: false,
		dismissed: false,
		...over
	};
}

describe('buildFeed', () => {
	it('puts an undismissed urgent post under Needs you until its window closes', () => {
		const fresh = post({ kind: 'urgent', publishAt: hoursAgo(10) });
		const old = post({ kind: 'urgent', publishAt: hoursAgo(80) });
		const dismissed = post({ kind: 'urgent', publishAt: hoursAgo(1), dismissed: true });
		const feed = buildFeed([fresh, old, dismissed], [], NOW);
		expect(feed.needsYou).toEqual([fresh]);
		// No longer urgent, and under a week old: an ordinary update now.
		expect(feed.updates).toContain(old);
		expect(feed.updates).toContain(dismissed);
	});

	it('keeps a post asking for confirmation under Needs you until confirmed, however old', () => {
		const waiting = post({ requiresAck: true, publishAt: hoursAgo(24 * 30) });
		const done = post({ requiresAck: true, acknowledged: true });
		const feed = buildFeed([waiting, done], [], NOW);
		expect(feed.needsYou).toEqual([waiting]);
		expect(feed.updates).toEqual([done]);
	});

	it('lists events from today on by date, and moves past ones to Earlier', () => {
		const later = post({ kind: 'event', eventDate: '2026-10-08' });
		const today = post({ kind: 'event', eventDate: '2026-09-28' });
		const past = post({ kind: 'event', eventDate: '2026-09-22' });
		const feed = buildFeed([later, past, today], [], NOW);
		expect(feed.comingUp).toEqual([today, later]);
		expect(feed.earlier).toEqual([past]);
	});

	it('mixes in holidays and puts a holiday first on its day', () => {
		const event = post({ kind: 'event', eventDate: '2026-10-02' });
		const holiday: FeedHoliday = { id: 'h1', kind: 'holiday', title: 'Gandhi Jayanthi', eventDate: '2026-10-02' };
		const gone: FeedHoliday = { id: 'h0', kind: 'holiday', title: 'Ganesh Chaurthi', eventDate: '2026-09-14' };
		expect(buildFeed([event], [gone, holiday], NOW).comingUp).toEqual([holiday, event]);
	});

	it('moves updates older than a week to Earlier', () => {
		const recent = post({ publishAt: hoursAgo(24 * 6) });
		const old = post({ publishAt: hoursAgo(24 * 8) });
		const feed = buildFeed([old, recent], [], NOW);
		expect(feed.updates).toEqual([recent]);
		expect(feed.earlier).toEqual([old]);
	});
});

describe('badgeFor', () => {
	it('counts what needs you plus unread updates, and flags urgency', () => {
		const feed = buildFeed(
			[post({ kind: 'urgent' }), post({ requiresAck: true }), post({}), post({ read: true })],
			[],
			NOW
		);
		expect(badgeFor(feed, NOW)).toEqual({ count: 3, urgent: true });
	});
});

describe('dates', () => {
	it('uses the IST calendar day', () => {
		// 23:30 IST on the 28th is still the 28th, although UTC says the same day;
		// 00:30 IST on the 29th is the 29th although UTC is still the 28th.
		expect(daysUntil('2026-09-29', new Date('2026-09-28T18:00:00Z'))).toBe(1);
		expect(daysUntil('2026-09-29', new Date('2026-09-28T19:00:00Z'))).toBe(0);
	});

	it('names days the way people say them', () => {
		expect(relativeDay('2026-09-28', NOW)).toBe('Today');
		expect(relativeDay('2026-09-29', NOW)).toBe('Tomorrow');
		expect(relativeDay('2026-10-02', NOW)).toBe('Friday');
		expect(relativeDay('2026-10-08', NOW)).toBe('in 10 days');
		expect(relativeDay('2026-11-06', NOW)).toBe('in 6 weeks');
	});

	it('groups by Monday-to-Sunday weeks', () => {
		expect(weekGroup('2026-10-04', NOW)).toBe('This week');
		expect(weekGroup('2026-10-05', NOW)).toBe('Next week');
		expect(weekGroup('2026-10-12', NOW)).toBe('Later');
	});
});

describe('summaryOf', () => {
	it('prefers the written line, else the first sentence', () => {
		expect(summaryOf({ summary: 'Short line', body: 'Long. Body.' })).toBe('Short line');
		expect(summaryOf({ summary: null, body: 'Office closed on Friday. Night shift ends at 06:00.' })).toBe(
			'Office closed on Friday.'
		);
		expect(summaryOf({ summary: '  ', body: 'One line\nsecond line' })).toBe('One line');
	});
});

describe('buildIcs', () => {
	it('converts a timed IST event to UTC', () => {
		const ics = buildIcs(
			{ id: 'a1', title: 'Town hall, Q2', summary: 'Cafeteria', body: '', eventDate: '2026-10-08', eventTime: '16:00' },
			NOW
		);
		expect(ics).toContain('DTSTART:20261008T103000Z');
		expect(ics).toContain('DTEND:20261008T113000Z');
		expect(ics).toContain('SUMMARY:Town hall\\, Q2');
	});

	it('makes an untimed event an all-day entry', () => {
		const ics = buildIcs({ id: 'a2', title: 'Wi-Fi change', summary: null, body: 'New password.', eventDate: '2026-10-01', eventTime: null }, NOW);
		expect(ics).toContain('DTSTART;VALUE=DATE:20261001');
		expect(ics).toContain('DTEND;VALUE=DATE:20261002');
	});
});
