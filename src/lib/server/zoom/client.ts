import { env } from '$env/dynamic/private';
import { kv } from '$lib/server/chat/bus';
import { db } from '$lib/server/db/postgres';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { encodeMeetingUuid } from './webhook';

/**
 * The Zoom API, through one internal Server-to-Server OAuth app on the
 * company account. One install covers every host in the account, and no lead
 * signs in to Zoom from ESS.
 *
 *   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET   the app's credentials
 *   ZOOM_WEBHOOK_SECRET                                    the app's secret token
 *
 * The app needs the meeting summary, past participants and user read scopes
 * (admin-level), and event subscriptions for meeting.summary_completed and
 * meeting.ended pointing at /api/zoom/webhook. Without the variables every
 * call here is a no-op and Meetings offers pasted notes instead.
 */

const API = 'https://api.zoom.us/v2';

export function zoomConfigured(): boolean {
	return !!(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);
}

export function webhookSecret(): string | null {
	return env.ZOOM_WEBHOOK_SECRET || null;
}

let memToken: { value: string; until: number } | null = null;

async function token(): Promise<string> {
	if (memToken && memToken.until > Date.now()) return memToken.value;
	try {
		const cached = await kv().get('zoom:token');
		if (cached) {
			memToken = { value: cached, until: Date.now() + 60_000 };
			return cached;
		}
	} catch {
		/* Redis down: fall through to a fresh token */
	}
	const basic = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64');
	const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID ?? '')}`, {
		method: 'POST',
		headers: { Authorization: `Basic ${basic}` }
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		await recordStatus({ lastError: `Zoom refused the app credentials (${res.status}). Check ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET. ${text.slice(0, 200)}` });
		throw new Error(`Zoom token request failed (${res.status})`);
	}
	const data = (await res.json()) as { access_token: string; expires_in: number };
	// Renew five minutes early so a call never starts with a token about to lapse.
	const ttl = Math.max(60, (data.expires_in ?? 3600) - 300);
	memToken = { value: data.access_token, until: Date.now() + ttl * 1000 };
	try {
		await kv().set('zoom:token', data.access_token, 'EX', ttl);
	} catch {
		/* kept in memory only */
	}
	return data.access_token;
}

export class ZoomError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

async function get<T>(path: string): Promise<T> {
	if (!zoomConfigured()) throw new ZoomError('Zoom is not connected', 503);
	let res = await fetch(API + path, { headers: { Authorization: `Bearer ${await token()}` } });
	if (res.status === 401) {
		// Token revoked or rotated early: one retry with a fresh one.
		memToken = null;
		await kv().del('zoom:token').catch(() => {});
		res = await fetch(API + path, { headers: { Authorization: `Bearer ${await token()}` } });
	}
	if (!res.ok) throw new ZoomError(`Zoom ${path.split('?')[0]} answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status);
	return (await res.json()) as T;
}

/* ---------- what ESS reads ---------- */

export type ZoomSummary = {
	meeting_uuid?: string;
	meeting_id?: number | string;
	meeting_host_id?: string;
	meeting_host_email?: string;
	meeting_topic?: string;
	meeting_start_time?: string;
	meeting_end_time?: string;
	summary_title?: string;
	summary_overview?: string;
	summary_details?: { label?: string; summary?: string }[];
	next_steps?: string[];
	/** Present when the host edited the summary in Zoom; it wins over the original. */
	edited_summary?: { summary_overview?: string; summary_details?: { label?: string; summary?: string }[]; next_steps?: string[] };
};

export function meetingSummary(uuid: string) {
	return get<ZoomSummary>(`/meetings/${encodeMeetingUuid(uuid)}/meeting_summary`);
}

export type ZoomParticipant = { id?: string; user_id?: string; name?: string; user_email?: string };

export async function pastParticipants(uuid: string): Promise<ZoomParticipant[]> {
	const out: ZoomParticipant[] = [];
	let next = '';
	for (let page = 0; page < 5; page++) {
		const r = await get<{ participants?: ZoomParticipant[]; next_page_token?: string }>(
			`/past_meetings/${encodeMeetingUuid(uuid)}/participants?page_size=300${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`
		);
		out.push(...(r.participants ?? []));
		if (!r.next_page_token) break;
		next = r.next_page_token;
	}
	return out;
}

export type ZoomSummaryListItem = { meeting_uuid: string; meeting_id?: number | string; meeting_host_email?: string; meeting_topic?: string; meeting_start_time?: string };

/** Summaries created in the account between two dates, to catch missed webhooks. */
export async function listSummaries(from: string, to: string): Promise<ZoomSummaryListItem[]> {
	const out: ZoomSummaryListItem[] = [];
	let next = '';
	for (let page = 0; page < 10; page++) {
		const r = await get<{ summaries?: ZoomSummaryListItem[]; next_page_token?: string }>(
			`/meetings/meeting_summaries?page_size=300&from=${from}&to=${to}${next ? `&next_page_token=${encodeURIComponent(next)}` : ''}`
		);
		out.push(...(r.summaries ?? []));
		if (!r.next_page_token) break;
		next = r.next_page_token;
	}
	return out;
}

export type ZoomUpcoming = { uuid?: string; id: number | string; topic: string; start_time: string; duration?: number; join_url?: string };

/** A host's meetings still to come, for the day strip. Empty when Zoom can't say. */
export async function upcomingFor(email: string): Promise<ZoomUpcoming[]> {
	if (!zoomConfigured()) return [];
	const key = `zoom:upcoming:${email.toLowerCase()}`;
	try {
		const hit = await kv().get(key);
		if (hit) return JSON.parse(hit);
	} catch {
		/* no cache */
	}
	try {
		const r = await get<{ meetings?: ZoomUpcoming[] }>(`/users/${encodeURIComponent(email)}/meetings?type=upcoming&page_size=30`);
		const list = r.meetings ?? [];
		await kv().set(key, JSON.stringify(list), 'EX', 600).catch(() => {});
		return list;
	} catch {
		return [];
	}
}

/* ---------- what Admin Controls shows ---------- */

export type ZoomStatus = { lastEvent?: string; lastEventAt?: string; lastError?: string | null; lastErrorAt?: string; lastReconcileAt?: string };

export async function readStatus(): Promise<ZoomStatus> {
	const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'zoom_status')).limit(1);
	return (row?.value as ZoomStatus) ?? {};
}

export async function recordStatus(patch: ZoomStatus) {
	const next = { ...(await readStatus()), ...patch, ...(patch.lastError ? { lastErrorAt: new Date().toISOString() } : {}) };
	await db
		.insert(appSettings)
		.values({ key: 'zoom_status', value: next })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } });
}
