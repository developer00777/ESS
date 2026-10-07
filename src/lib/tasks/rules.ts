/**
 * Champ Hub task rules that need no database: who may give whom a task, the
 * order of cards in a column, and reading "/task" and meeting next steps.
 * Shared by the server (which enforces) and the browser (which only uses
 * them to group pickers), and unit-tested in rules.test.ts.
 */

import { parseDay } from '$lib/chat/rules';

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
	todo: 'To do',
	in_progress: 'In progress',
	in_review: 'In review',
	done: 'Done'
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 };

/** Open tasks a person can carry before the team board calls them overloaded. */
export const TEAM_CAPACITY = 6;

/* ---------- who may give whom a task ---------- */

/**
 * What a person's position lets them do with tasks. Built on the server from
 * the reporting line (users.reportsTo), the same link leave approval follows.
 */
export type Reach = {
	selfId: string;
	/** Everyone below them in the reporting line, at any depth. */
	treeIds: string[];
	/** People who share their manager. */
	teammateIds: string[];
	/** Super Admin, or the "Assign tasks to anyone" privilege. */
	anyone: boolean;
	/** Team Leads and HR can ask anyone; employees only their teammates. */
	canRequestAnyone: boolean;
};

export type AssignMode = 'direct' | 'request' | 'forbidden';

/**
 * - Anyone may give themselves a task.
 * - A lead gives one straight to anyone in their reporting tree.
 * - Anyone else receives it as a request they accept or decline. Employees may
 *   only ask their teammates; leads and HR may ask anyone.
 * - Super Admin and "Assign tasks to anyone" skip the request.
 */
export function assignMode(reach: Reach, targetId: string | null): AssignMode {
	if (!targetId || targetId === reach.selfId) return 'direct';
	if (reach.anyone || reach.treeIds.includes(targetId)) return 'direct';
	if (reach.canRequestAnyone || reach.teammateIds.includes(targetId)) return 'request';
	return 'forbidden';
}

/* ---------- order within a column ---------- */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * A key that sorts strictly between `a` and `b` (null = open end), so a card
 * can move between two others without renumbering the column. Keys never end
 * in '0', which is what guarantees there is always room below any key.
 */
export function rankBetween(a: string | null, b: string | null): string {
	if (a !== null && b !== null && a >= b) throw new Error(`rankBetween: ${a} is not before ${b}`);
	const lo = a ?? '';
	let hi: string | null = b;
	let out = '';
	for (let i = 0; ; i++) {
		const dl = i < lo.length ? DIGITS.indexOf(lo[i]) : 0;
		const dh = hi !== null ? (i < hi.length ? DIGITS.indexOf(hi[i]) : 0) : DIGITS.length;
		if (dh - dl > 1) return out + DIGITS[Math.floor((dl + dh) / 2)];
		out += DIGITS[dl];
		// Once this digit is below hi's, anything longer still sorts below hi.
		if (dh - dl === 1) hi = null;
	}
}

/* ---------- dates ---------- */

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export function dueBucket(due: string | null, today: string): DueBucket {
	if (!due) return 'none';
	if (due < today) return 'overdue';
	if (due === today) return 'today';
	const days = (Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000;
	return days <= 7 ? 'week' : 'later';
}

/* ---------- "/task" ---------- */

/** Trailing "by Fri", "tomorrow", "12 Oct", "next Mon" at the end of a /task. */
/** Weekdays as people write them, and nothing longer: "mon" must not swallow "monitoring". */
const WEEKDAY = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DAY_PHRASE = String.raw`(?:next\s+)?(?:today|tomorrow|tmrw|${WEEKDAY})|\d{1,2}\s*${MONTH}|${MONTH}\s*\d{1,2}|\d{4}-\d{2}-\d{2}`;
const DUE_TAIL = new RegExp(String.raw`\s+(?:by\s+|on\s+|due\s+)?(${DAY_PHRASE})\s*$`, 'i');
const DUE_IN_STEP = new RegExp(String.raw`\s+(?:by|before|on)\s+(${DAY_PHRASE})\b.*$`, 'i');

export type TaskCommand = { title: string; ownerName: string | null; due: string | null };

/**
 * "/task @Sneha Kulkarni check catch-all rules by Fri" → owner "Sneha
 * Kulkarni", title "Check catch-all rules", due the coming Friday (IST).
 * Null when there is nothing to do after the command.
 */
export function parseTaskCommand(text: string, now: Date): TaskCommand | null {
	let body = text.trim().replace(/^\/task\b/i, '').trim();
	let ownerName: string | null = null;
	const at = body.match(/^@([A-Za-z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)\s*/);
	if (at) {
		ownerName = at[1];
		body = body.slice(at[0].length);
	}
	let due: string | null = null;
	const tail = (' ' + body).match(DUE_TAIL);
	if (tail) {
		const d = parseDay(tail[1], now);
		if (d) {
			due = d;
			body = (' ' + body).slice(0, tail.index).trim();
		}
	}
	body = body.replace(/\s+/g, ' ').trim();
	if (!body) return null;
	return { title: capitalise(body).slice(0, 300), ownerName, due };
}

export function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- meeting next steps ---------- */

export type HeardStep = { ownerHeard: string | null; title: string; dueText: string | null };

const NOBODY = /^(someone|somebody|everyone|we|the team|team|all|they)$/i;

/**
 * The plain reading of one next step, used when the model is unavailable and
 * to check what it returns. "Arjun will dedupe the list by Thursday." →
 * owner "Arjun", title "Dedupe the list", due text "Thursday".
 */
export function readNextStep(step: string): HeardStep {
	let s = step.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
	let dueText: string | null = null;
	const by = s.match(/\s+(?:by|before|on)\s+((?:next\s+)?(?:today|tomorrow|(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*|\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2}))\b.*$/i);
	if (by) {
		dueText = by[1];
		s = s.slice(0, by.index);
	}
	const m = s.match(/^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?(?:\s*\([^)]*\))?)\s+(?:will|to|should|needs to|is going to|has to|agreed to)\s+(.+)$/);
	if (m && !NOBODY.test(m[1])) return { ownerHeard: m[1].trim(), title: capitalise(m[2].trim()).slice(0, 300), dueText };
	const nobody = s.match(/^(?:someone|somebody|we|the team)\s+(?:needs to|should|will|to|must)\s+(.+)$/i);
	if (nobody) return { ownerHeard: null, title: capitalise(nobody[1].trim()).slice(0, 300), dueText };
	return { ownerHeard: null, title: capitalise(s).slice(0, 300), dueText };
}

/**
 * A due phrase from the minutes as a date, counted from the meeting day
 * rather than from today, since "by Thursday" meant the Thursday after the
 * meeting even when it is reviewed a day later.
 */
export function dueFromMeeting(dueText: string | null, meetingDay: string): string | null {
	if (!dueText) return null;
	return parseDay(dueText, new Date(meetingDay + 'T06:30:00Z'));
}

/* ---------- pasted notes ---------- */

/** Lines that read as an action ("X will …", "Someone needs to …"). */
export function actionLines(notes: string): string[] {
	return notes
		.split(/\r?\n/)
		.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
		.filter((l) => l.length > 3 && /\b(will|to|should|needs to|must|agreed to)\b/i.test(l));
}
