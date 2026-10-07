/**
 * Champ Chat rules that need no database: office hours and quiet hours, the
 * sensitive-number check, slash commands, reminder times and naming.
 * Shared by the server and the browser, and unit-tested (rules.test.ts).
 */

const IST_OFFSET_MIN = 330;

/** Minutes since IST midnight for `now`. */
export function istMinutes(now: Date): number {
	const m = Math.floor(now.getTime() / 60_000) + IST_OFFSET_MIN;
	return ((m % 1440) + 1440) % 1440;
}

/** IST calendar date (YYYY-MM-DD) for `now`. */
export function istDateKey(now: Date): string {
	return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

function toMinutes(h: number, m: number, ampm: string | undefined): number | null {
	if (m > 59) return null;
	if (ampm) {
		if (h < 1 || h > 12) return null;
		const pm = /p/i.test(ampm);
		h = (h % 12) + (pm ? 12 : 0);
	} else if (h > 23) return null;
	return h * 60 + m;
}

/**
 * Office timings as HR types them — "9:00 AM - 6:00 PM", "21:00-06:00",
 * "9 am to 6 pm", "10:30AM–7:30PM" — as start and end minutes. An end before
 * the start is an overnight shift. Null when it cannot be read.
 */
export function parseOfficeHours(text: string | null | undefined): { start: number; end: number } | null {
	if (!text) return null;
	const t = text.replace(/[–—]/g, '-').replace(/\./g, ':');
	const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m)?/gi;
	const parts: { h: number; m: number; ap?: string }[] = [];
	let match: RegExpExecArray | null;
	while ((match = re.exec(t)) && parts.length < 2) {
		parts.push({ h: Number(match[1]), m: Number(match[2] ?? 0), ap: match[3] });
	}
	if (parts.length < 2) return null;
	// "9 - 6 PM": the first time borrows the second's AM/PM when it has none and
	// that reading makes a shorter same-day span; "9 AM - 6" reads 6 as PM.
	let [a, b] = parts;
	if (!a.ap && b.ap) a = { ...a, ap: a.h > b.h && a.h !== 12 ? (/p/i.test(b.ap) ? 'am' : 'pm') : b.ap };
	if (a.ap && !b.ap) b = { ...b, ap: b.h <= a.h ? (/a/i.test(a.ap) ? 'pm' : 'am') : a.ap };
	const start = toMinutes(a.h, a.m, a.ap);
	const end = toMinutes(b.h, b.m, b.ap);
	if (start === null || end === null || start === end) return null;
	return { start, end };
}

/** True when `minute` (IST minutes since midnight) falls inside the window. */
export function withinWindow(minute: number, start: number, end: number): boolean {
	return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** A shift that starts in the evening. */
export function isNightShift(hours: { start: number; end: number } | null): boolean {
	return !!hours && (hours.start >= 18 * 60 || hours.end < hours.start);
}

export const DEFAULT_HOURS = { start: 9 * 60, end: 18 * 60 };

/**
 * Quiet hours: pings wait outside the person's shift, with an hour of slack
 * either side for people who start early or finish late. No timings on file
 * means a 9-to-6 day.
 */
export function isQuietTime(officeTimings: string | null | undefined, now: Date): boolean {
	const h = parseOfficeHours(officeTimings) ?? DEFAULT_HOURS;
	return !withinWindow(istMinutes(now), (h.start - 60 + 1440) % 1440, (h.end + 60) % 1440);
}

export function formatMinutes(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ---------- sensitive numbers ---------- */

// Verhoeff tables, the checksum on the last digit of every Aadhaar number.
const D = [
	[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
	[3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
	[6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
	[9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const P = [
	[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
	[8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
	[2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export function verhoeffValid(digits: string): boolean {
	let c = 0;
	const rev = digits.split('').reverse();
	for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]];
	return c === 0;
}

export type SensitiveKind = 'aadhaar' | 'pan' | 'bank';

/**
 * What in a message looks like an identity or bank number. The sender is
 * asked to confirm before it is posted; nothing is blocked outright, since HR
 * sometimes legitimately needs a colleague's PAN.
 */
export function detectSensitive(text: string): SensitiveKind[] {
	const found = new Set<SensitiveKind>();
	for (const m of text.matchAll(/(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g)) {
		if (verhoeffValid(m[1] + m[2] + m[3])) found.add('aadhaar');
	}
	if (/\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/.test(text.toUpperCase())) found.add('pan');
	const hasIfsc = /\b[A-Z]{4}0[A-Z0-9]{6}\b/.test(text.toUpperCase());
	const hasAcWord = /\b(a\/c|acc(?:ount)?|acct)\b/i.test(text);
	if ((hasIfsc || hasAcWord) && /(?<!\d)\d{9,18}(?!\d)/.test(text.replace(/[\s-]/g, ''))) found.add('bank');
	return [...found];
}

export const SENSITIVE_LABEL: Record<SensitiveKind, string> = {
	aadhaar: 'an Aadhaar number',
	pan: 'a PAN',
	bank: 'a bank account number'
};

/* ---------- slash commands ---------- */

export type SlashCommand =
	| { cmd: 'balance' }
	| { cmd: 'whoisout' }
	| { cmd: 'leave'; arg: string }
	| { cmd: 'remind'; arg: string }
	| { cmd: 'poll'; question: string; options: string[] }
	| { cmd: 'todo'; text: string }
	| { cmd: 'champ'; question: string }
	| { cmd: 'task'; text: string }
	| { cmd: 'unknown'; name: string };

export const SLASH_COMMANDS = [
	{ c: '/balance', d: 'Your leave balances, only you see it' },
	{ c: '/whoisout', d: 'Who in your team is off today' },
	{ c: '/leave', d: 'Apply for leave, e.g. /leave Fri or /leave 12 Oct' },
	{ c: '/remind', d: 'e.g. /remind in 30m check the queue' },
	{ c: '/poll', d: 'e.g. /poll Lunch on Friday? | Yes | No' },
	{ c: '/task', d: 'Give a task, e.g. /task @Sneha check the list by Fri' },
	{ c: '/todo', d: 'Add a to-do for this channel' },
	{ c: '/champ', d: 'Ask Champ, e.g. /champ next holiday' }
];

export function parseSlash(text: string): SlashCommand | null {
	const m = text.trim().match(/^\/(\w+)\s*([\s\S]*)$/);
	if (!m) return null;
	const [, name, rest] = m;
	switch (name.toLowerCase()) {
		case 'balance':
			return { cmd: 'balance' };
		case 'whoisout':
			return { cmd: 'whoisout' };
		case 'leave':
			return { cmd: 'leave', arg: rest.trim() };
		case 'remind':
			return { cmd: 'remind', arg: rest.trim() };
		case 'todo':
			return { cmd: 'todo', text: rest.trim() };
		case 'champ':
			return { cmd: 'champ', question: rest.trim() };
		case 'task':
			return { cmd: 'task', text: text.trim() };
		case 'poll': {
			const parts = rest.split('|').map((s) => s.trim()).filter(Boolean);
			return { cmd: 'poll', question: parts[0] ?? '', options: parts.slice(1, 11) };
		}
		default:
			return { cmd: 'unknown', name };
	}
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A day as people type it — "today", "tomorrow", "Fri", "next Mon",
 * "12 Oct", "2026-10-12" — as an IST date, never in the past. Null if unread.
 */
export function parseDay(text: string, now: Date): string | null {
	const t = text.trim().toLowerCase();
	const today = istDateKey(now);
	const base = Date.parse(today + 'T00:00:00Z');
	const add = (d: number) => new Date(base + d * 86_400_000).toISOString().slice(0, 10);
	if (!t || t === 'today') return today;
	if (t === 'tomorrow' || t === 'tmrw') return add(1);
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t >= today ? t : null;
	const wd = t.match(/^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
	if (wd) {
		const dow = new Date(base).getUTCDay();
		let diff = (WEEKDAYS.indexOf(wd[2]) - dow + 7) % 7;
		if (diff === 0) diff = 7;
		if (wd[1] && diff < 7) diff += 7;
		return add(diff);
	}
	const dm = t.match(/^(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/) ?? t.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})$/);
	if (dm) {
		const day = Number(/\d/.test(dm[1]) ? dm[1] : dm[2]);
		const mon = MONTHS.indexOf((/\d/.test(dm[1]) ? dm[2] : dm[1]).slice(0, 3));
		const year = Number(today.slice(0, 4));
		for (const y of [year, year + 1]) {
			const d = new Date(Date.UTC(y, mon, day));
			if (d.getUTCMonth() !== mon) return null;
			const key = d.toISOString().slice(0, 10);
			if (key >= today) return key;
		}
	}
	return null;
}

/**
 * "/remind" timing: "in 30m", "in 2 hours", "at 16:00", "tomorrow 9am",
 * "Fri 10:30". Returns the moment and the text after the timing.
 */
export function parseReminder(arg: string, now: Date): { at: Date; text: string } | null {
	const s = arg.trim();
	const rel = s.match(/^in\s+(\d{1,4})\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)\b\s*([\s\S]*)$/i);
	if (rel) {
		const n = Number(rel[1]);
		const unit = rel[2].toLowerCase()[0];
		const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
		if (ms <= 0 || ms > 90 * 86_400_000) return null;
		return { at: new Date(now.getTime() + ms), text: rel[3].trim() };
	}
	const abs = s.match(/^(?:(today|tomorrow|tmrw|(?:next\s+)?(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*)\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b\s*([\s\S]*)$/i);
	if (abs && (abs[1] || abs[3] || abs[4] || /^at\s/i.test(s))) {
		const minute = toMinutes(Number(abs[2]), Number(abs[3] ?? 0), abs[4]);
		if (minute === null) return null;
		let day = parseDay(abs[1] ?? 'today', now);
		if (!day) return null;
		let at = new Date(Date.parse(day + 'T00:00:00Z') + (minute - IST_OFFSET_MIN) * 60_000);
		if (!abs[1] && at <= now) {
			day = parseDay('tomorrow', now)!;
			at = new Date(Date.parse(day + 'T00:00:00Z') + (minute - IST_OFFSET_MIN) * 60_000);
		}
		if (at <= now) return null;
		return { at, text: abs[5].trim() };
	}
	return null;
}

/* ---------- naming ---------- */

/** "Data Ops Team" → "data-ops-team". */
export function channelSlug(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/&/g, ' and ')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'channel'
	);
}

/** One key per pair, whoever starts the conversation. */
export function dmKey(a: string, b: string): string {
	return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

/** The "@Name" tokens in a message, for highlighting. */
export function mentionTokens(text: string): string[] {
	return [...text.matchAll(/@([A-Za-z][\w.'-]*(?: [A-Z][\w.'-]*)?)/g)].map((m) => m[1]);
}

export const CHAMP_MENTION = '@Champ';
