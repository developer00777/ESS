/**
 * Where each announcement appears for one person, and when it goes away.
 *
 * The employee page is three groups rather than a feed:
 *
 *   Needs you  — an urgent post still inside its urgent window that the person
 *                hasn't dismissed, or any post asking for confirmation that the
 *                person hasn't confirmed.
 *   Coming up  — events from today onwards, plus the person's own shift's
 *                holidays, by date.
 *   Updates    — everything else posted in the last week, newest first.
 *   Earlier    — older updates and events whose day has passed.
 *
 * Nothing here touches the database, so the rules are tested directly
 * (announcements.test.ts) and the same code renders the HR preview.
 * Dates are IST calendar days, since that is the company's calendar.
 */

export type AnnouncementKind = 'urgent' | 'event' | 'update';

export type FeedPost = {
	id: string;
	kind: AnnouncementKind;
	title: string;
	summary: string | null;
	body: string;
	eventDate: string | null; // YYYY-MM-DD
	eventTime: string | null; // HH:MM
	requiresAck: boolean;
	urgentDays: number;
	attachmentName: string | null;
	publishAt: string; // ISO
	editedAt: string | null;
	authorName: string | null;
	read: boolean;
	acknowledged: boolean;
	dismissed: boolean;
};

export type FeedHoliday = { id: string; kind: 'holiday'; title: string; eventDate: string };

export type ComingUpItem = FeedPost | FeedHoliday;

export type Feed = {
	needsYou: FeedPost[];
	comingUp: ComingUpItem[];
	updates: FeedPost[];
	earlier: FeedPost[];
};

const DAY = 86_400_000;
const IST_OFFSET = 5.5 * 3_600_000;

/** Today's date in IST as YYYY-MM-DD. */
export function istDate(now: Date): string {
	return new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

/** Whole days from IST today to `date` (negative = past). */
export function daysUntil(date: string, now: Date): number {
	const today = Date.parse(istDate(now) + 'T00:00:00Z');
	return Math.round((Date.parse(date + 'T00:00:00Z') - today) / DAY);
}

/** The one line a post shows: its summary, or the first sentence of its body. */
export function summaryOf(post: Pick<FeedPost, 'summary' | 'body'>): string {
	if (post.summary?.trim()) return post.summary.trim();
	const body = post.body.trim();
	const first = body.split(/(?<=[.!?])\s+|\n/)[0] ?? '';
	return first.length > 140 ? first.slice(0, 137).trimEnd() + '…' : first;
}

export function isUrgentNow(post: FeedPost, now: Date): boolean {
	return post.kind === 'urgent' && now.getTime() - Date.parse(post.publishAt) < post.urgentDays * DAY;
}

export function needsYou(post: FeedPost, now: Date): boolean {
	if (isUrgentNow(post, now) && !post.dismissed) return true;
	return post.requiresAck && !post.acknowledged;
}

export function buildFeed(posts: FeedPost[], holidays: FeedHoliday[], now: Date): Feed {
	const need: FeedPost[] = [];
	const events: ComingUpItem[] = [];
	const updates: FeedPost[] = [];
	const earlier: FeedPost[] = [];

	for (const post of posts) {
		if (needsYou(post, now)) {
			need.push(post);
		} else if (post.kind === 'event' && post.eventDate) {
			(daysUntil(post.eventDate, now) >= 0 ? events : earlier).push(post);
		} else if (now.getTime() - Date.parse(post.publishAt) < 7 * DAY) {
			updates.push(post);
		} else {
			earlier.push(post);
		}
	}

	for (const h of holidays) if (daysUntil(h.eventDate, now) >= 0) events.push(h);

	const newestFirst = (a: FeedPost, b: FeedPost) => b.publishAt.localeCompare(a.publishAt);
	need.sort((a, b) => Number(isUrgentNow(b, now)) - Number(isUrgentNow(a, now)) || newestFirst(a, b));
	updates.sort(newestFirst);
	earlier.sort(newestFirst);
	events.sort(
		(a, b) =>
			a.eventDate!.localeCompare(b.eventDate!) ||
			// A holiday first on its day: it is usually the reason for the rest.
			Number(b.kind === 'holiday') - Number(a.kind === 'holiday') ||
			((a as FeedPost).eventTime ?? '').localeCompare((b as FeedPost).eventTime ?? '')
	);

	return { needsYou: need, comingUp: events, updates, earlier };
}

/** Unread-or-waiting count for the sidebar and Home badges. */
export function badgeFor(feed: Feed, now: Date): { count: number; urgent: boolean } {
	return {
		count: feed.needsYou.length + feed.updates.filter((p) => !p.read).length,
		urgent: feed.needsYou.some((p) => isUrgentNow(p, now))
	};
}

/** "This week" runs Monday to Sunday, IST. */
export function weekGroup(date: string, now: Date): 'This week' | 'Next week' | 'Later' {
	const n = daysUntil(date, now);
	const dow = (new Date(istDate(now) + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
	const daysLeftThisWeek = 6 - dow;
	if (n <= daysLeftThisWeek) return 'This week';
	if (n <= daysLeftThisWeek + 7) return 'Next week';
	return 'Later';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function relativeDay(date: string, now: Date): string {
	const n = daysUntil(date, now);
	if (n === 0) return 'Today';
	if (n === 1) return 'Tomorrow';
	if (n === -1) return 'Yesterday';
	if (n < 0) return `${-n} days ago`;
	if (n < 7) return WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
	if (n < 14) return `in ${n} days`;
	return `in ${Math.round(n / 7)} weeks`;
}

export function timeAgo(iso: string, now: Date): string {
	const hours = Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000);
	if (hours < 1) return 'Just now';
	if (hours < 24) return `${hours} h ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/* ---------- calendar file ---------- */

function icsEscape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function compact(d: Date): string {
	return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * An .ics for one event. A timed event is an hour long, converted from IST to
 * UTC so every calendar app places it correctly without a VTIMEZONE block; an
 * untimed one is an all-day entry.
 */
export function buildIcs(
	post: { id: string; title: string; summary: string | null; body: string; eventDate: string; eventTime: string | null },
	stamp: Date
): string {
	let when: string[];
	if (post.eventTime) {
		const start = new Date(`${post.eventDate}T${post.eventTime}:00+05:30`);
		when = [`DTSTART:${compact(start)}`, `DTEND:${compact(new Date(start.getTime() + 3_600_000))}`];
	} else {
		const next = new Date(Date.parse(post.eventDate + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
		when = [`DTSTART;VALUE=DATE:${post.eventDate.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`];
	}
	const description = [summaryOf(post), post.body.trim()].filter((x, i, a) => x && a.indexOf(x) === i).join('\n\n');
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Champ HR//ESS Portal//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${post.id}@champ-hr-ess`,
		`DTSTAMP:${compact(stamp)}`,
		...when,
		`SUMMARY:${icsEscape(post.title)}`,
		`DESCRIPTION:${icsEscape(description)}`,
		'END:VEVENT',
		'END:VCALENDAR',
		''
	].join('\r\n');
}
