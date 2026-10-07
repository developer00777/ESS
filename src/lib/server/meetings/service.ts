import { db } from '$lib/server/db/postgres';
import { chatChannels, meetingItems, meetings, tasks, users, zoomUserLinks } from '$lib/server/db/schema';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { SessionUser } from '$lib/server/auth';
import { hasCap, loadCapabilities } from '$lib/server/capabilities';
import { logActivity } from '$lib/server/db/mongo';
import { postToFeed } from '$lib/server/chat/cards';
import { postToChannel } from '$lib/server/chat/messages';
import { publish } from '$lib/server/chat/bus';
import { istDateKey } from '$lib/chat/rules';
import { actionLines, assignMode, TASK_PRIORITIES, type Reach, type TaskPriority } from '$lib/tasks/rules';
import type { MeetingItemView, MeetingRowView, MeetingSummary, MeetingView, PersonRef } from '$lib/tasks/types';
import { assignableFor, createTask, loadOrg, reachFor, treeOf, type Result } from '$lib/server/tasks/service';
import { extractItems, type Attendee } from './extract';
import { listSummaries, meetingSummary, pastParticipants, recordStatus, upcomingFor, zoomConfigured, ZoomError, type ZoomSummary } from '$lib/server/zoom/client';

/**
 * Meetings and their minutes.
 *
 *   Zoom ends a meeting      meeting.ended → a row in "waiting"
 *   Zoom writes the summary  meeting.summary_completed → fetch summary and
 *                            attendees, extract items, "ready", tell the host
 *   Host reviews             owners, dates, drop, add — nothing sent yet
 *   Host publishes           one task per kept item, owners told, one line in
 *                            the host's team channel listing owners only
 *
 * The full minutes are for the host, the people above the host, and the
 * Super Admin. Everyone else at the meeting sees only their own items.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = typeof meetings.$inferSelect;
type ItemRow = typeof meetingItems.$inferSelect;

/* ---------- who sees what ---------- */

async function canReview(viewer: SessionUser, m: Row, reach?: Reach): Promise<boolean> {
	if (!m.hostId) return viewer.role === 'super_admin' || hasCap(viewer, 'system.zoom');
	if (m.hostId === viewer.id || viewer.role === 'super_admin') return true;
	const r = reach ?? (await reachFor(viewer));
	return r.treeIds.includes(m.hostId);
}

const canSee = (viewer: SessionUser, m: Row) => m.hostId === viewer.id || m.attendeeIds.includes(viewer.id);

/* ---------- views ---------- */

async function rowsToViews(viewer: SessionUser, rows: Row[], reach?: Reach): Promise<MeetingRowView[]> {
	if (rows.length === 0) return [];
	const r = reach ?? (await reachFor(viewer));
	const org = await loadOrg();
	const ids = rows.map((m) => m.id);
	const items = await db.select().from(meetingItems).where(inArray(meetingItems.meetingId, ids));
	const taskIds = items.map((i) => i.taskId).filter(Boolean) as string[];
	const mineRows = taskIds.length ? await db.select({ id: tasks.id, title: tasks.title, meetingId: tasks.meetingId }).from(tasks).where(and(inArray(tasks.id, taskIds), eq(tasks.assigneeId, viewer.id))) : [];
	const person = (id: string): PersonRef => ({ id, fullName: org.byId.get(id)?.fullName ?? 'Former employee' });
	const out: MeetingRowView[] = [];
	for (const m of rows) {
		const its = items.filter((i) => i.meetingId === m.id);
		const kept = its.filter((i) => i.included);
		out.push({
			id: m.id,
			topic: m.topic,
			startedAt: m.startedAt.toISOString(),
			durationMin: m.durationMin,
			state: m.state,
			source: m.source === 'pasted' ? 'pasted' : 'zoom',
			host: m.hostId ? person(m.hostId) : null,
			attendees: m.attendeeIds.slice(0, 12).map(person),
			guestCount: m.guestNames.length,
			itemCount: kept.length,
			itemsNeedingOwner: kept.filter((i) => !i.ownerId && !i.taskId).length,
			publishedCount: its.filter((i) => i.taskId).length,
			isHost: await canReview(viewer, m, r),
			mine: mineRows.filter((t) => t.meetingId === m.id).map((t) => ({ taskId: t.id, title: t.title }))
		});
	}
	return out;
}

/** Hosted or attended, newest first: the last 45 days and anything to come. */
export async function listMeetings(viewer: SessionUser): Promise<MeetingRowView[]> {
	const since = new Date(Date.now() - 45 * 86_400_000);
	const rows = await db
		.select()
		.from(meetings)
		.where(and(gte(meetings.startedAt, since), or(eq(meetings.hostId, viewer.id), sql`${viewer.id}::uuid = any(${meetings.attendeeIds})`)))
		.orderBy(desc(meetings.startedAt))
		.limit(100);
	return rowsToViews(viewer, rows);
}

/** Today's meetings for the day strip: what ESS holds, plus Zoom's upcoming list. */
export async function meetingsToday(viewer: SessionUser): Promise<MeetingRowView[]> {
	const today = istDateKey(new Date());
	const start = new Date(Date.parse(today + 'T00:00:00+05:30'));
	const end = new Date(start.getTime() + 86_400_000);
	const rows = await db
		.select()
		.from(meetings)
		.where(and(gte(meetings.startedAt, start), lt(meetings.startedAt, end), or(eq(meetings.hostId, viewer.id), sql`${viewer.id}::uuid = any(${meetings.attendeeIds})`)))
		.orderBy(asc(meetings.startedAt));
	const views = await rowsToViews(viewer, rows);
	const upcoming = (await upcomingFor(viewer.email)).filter((u) => {
		const t = Date.parse(u.start_time);
		return t >= Date.now() - 30 * 60_000 && t < end.getTime();
	});
	for (const u of upcoming) {
		if (views.some((v) => Math.abs(Date.parse(v.startedAt) - Date.parse(u.start_time)) < 60_000 && v.topic === u.topic)) continue;
		views.push({
			id: `zoom-${u.id}`,
			topic: u.topic,
			startedAt: new Date(u.start_time).toISOString(),
			durationMin: u.duration ?? null,
			state: 'upcoming',
			source: 'zoom',
			host: { id: viewer.id, fullName: viewer.fullName },
			attendees: [],
			guestCount: 0,
			itemCount: 0,
			itemsNeedingOwner: 0,
			publishedCount: 0,
			isHost: true,
			mine: [],
			joinUrl: u.join_url ?? null
		});
	}
	return views.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function itemView(i: ItemRow, reach: Reach, names: Map<string, string>): MeetingItemView {
	return {
		id: i.id,
		title: i.title,
		ownerId: i.ownerId,
		ownerName: i.ownerId ? (names.get(i.ownerId) ?? 'Former employee') : null,
		ownerHeard: i.ownerHeard,
		dueDate: i.dueDate,
		priority: i.priority,
		stepIndex: i.stepIndex,
		confidence: i.confidence === null ? null : Number(i.confidence),
		included: i.included,
		taskId: i.taskId,
		mode: i.ownerId ? assignMode(reach, i.ownerId) : 'direct'
	};
}

export async function getMeeting(viewer: SessionUser, id: string): Promise<Result<{ meeting: MeetingView }>> {
	if (!UUID.test(id)) return { ok: false, message: 'That meeting is not available', status: 404 };
	const [m] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
	if (!m) return { ok: false, message: 'That meeting is not available', status: 404 };
	const viewerReach = await reachFor(viewer);
	const reviewer = await canReview(viewer, m, viewerReach);
	if (!reviewer && !canSee(viewer, m)) return { ok: false, message: 'That meeting is not available to you', status: 404 };
	const [row] = await rowsToViews(viewer, [m], viewerReach);
	const org = await loadOrg();
	const names = new Map([...org.byId.values()].map((p) => [p.id, p.fullName]));
	// Owners shown as "direct" or "request" from the host's position, since the
	// tasks are published in the host's name.
	const host = m.hostId ? org.byId.get(m.hostId) : null;
	const hostUser: SessionUser = host
		? { id: host.id, role: host.role as SessionUser['role'], fullName: host.fullName, email: host.email, teamId: host.teamId, mustChangePassword: false, capabilities: (await loadCapabilities({ id: host.id, role: host.role as SessionUser['role'] })).caps }
		: viewer;
	const hostReach = host ? await reachFor(hostUser) : viewerReach;
	const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, id)).orderBy(asc(meetingItems.position), asc(meetingItems.stepIndex));
	const visible = reviewer ? items : items.filter((i) => i.ownerId === viewer.id && i.taskId);
	return {
		ok: true,
		meeting: {
			...row,
			summary: reviewer ? ((m.summary as MeetingSummary | null) ?? null) : null,
			items: visible.map((i) => itemView(i, hostReach, names)),
			assignable: reviewer ? await assignableFor(hostUser, hostReach) : { direct: [], request: [] },
			publishedAt: m.publishedAt?.toISOString() ?? null
		}
	};
}

/* ---------- reviewing ---------- */

async function reviewable(viewer: SessionUser, meetingId: string): Promise<Row | null> {
	if (!UUID.test(meetingId)) return null;
	const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
	return m && (await canReview(viewer, m)) ? m : null;
}

async function touched(m: Row) {
	await db.update(meetings).set({ updatedAt: new Date() }).where(eq(meetings.id, m.id));
	if (m.hostId) await publish([m.hostId], { type: 'meetings.changed', meetingId: m.id });
}

export type ItemPatch = { title?: string; ownerId?: string | null; dueDate?: string | null; priority?: string; included?: boolean };

export async function updateItem(viewer: SessionUser, itemId: string, patch: ItemPatch): Promise<Result> {
	if (!UUID.test(itemId)) return { ok: false, message: 'That item no longer exists' };
	const [i] = await db.select().from(meetingItems).where(eq(meetingItems.id, itemId)).limit(1);
	if (!i) return { ok: false, message: 'That item no longer exists' };
	const m = await reviewable(viewer, i.meetingId);
	if (!m) return { ok: false, message: 'Only the host can change these minutes', status: 403 };
	if (i.taskId) return { ok: false, message: 'This item is already a task. Change the task instead.' };
	const set: Partial<typeof meetingItems.$inferInsert> = {};
	if (patch.title !== undefined) {
		const t = patch.title.trim().replace(/\s+/g, ' ');
		if (!t) return { ok: false, message: 'An item needs a title' };
		set.title = t.slice(0, 300);
	}
	if (patch.ownerId !== undefined) {
		if (patch.ownerId && !UUID.test(patch.ownerId)) return { ok: false, message: 'That person no longer exists' };
		set.ownerId = patch.ownerId;
	}
	if (patch.dueDate !== undefined) set.dueDate = patch.dueDate && DATE.test(patch.dueDate) ? patch.dueDate : null;
	if (patch.priority !== undefined && (TASK_PRIORITIES as readonly string[]).includes(patch.priority)) set.priority = patch.priority as TaskPriority;
	if (patch.included !== undefined) set.included = patch.included;
	if (Object.keys(set).length) await db.update(meetingItems).set(set).where(eq(meetingItems.id, itemId));
	await touched(m);
	return { ok: true };
}

export async function addItem(viewer: SessionUser, meetingId: string, title: string): Promise<Result<{ id: string }>> {
	const m = await reviewable(viewer, meetingId);
	if (!m) return { ok: false, message: 'Only the host can change these minutes', status: 403 };
	const t = title.trim().replace(/\s+/g, ' ').slice(0, 300) || 'New action item';
	const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${meetingItems.position}), 0)::int` }).from(meetingItems).where(eq(meetingItems.meetingId, meetingId));
	const [row] = await db.insert(meetingItems).values({ meetingId, title: t, position: n + 1, confidence: '1' }).returning();
	if (m.state === 'published') await db.update(meetings).set({ state: 'ready' }).where(eq(meetings.id, m.id));
	await touched(m);
	return { ok: true, id: row.id };
}

/**
 * One task per kept item not yet published. Every kept item needs an owner
 * first; the host's reporting line decides which become requests.
 */
export async function publishMeeting(viewer: SessionUser, meetingId: string): Promise<Result<{ published: number }>> {
	const m = await reviewable(viewer, meetingId);
	if (!m) return { ok: false, message: 'Only the host can publish these minutes', status: 403 };
	const items = await db.select().from(meetingItems).where(and(eq(meetingItems.meetingId, meetingId), eq(meetingItems.included, true), isNull(meetingItems.taskId))).orderBy(asc(meetingItems.position));
	if (items.length === 0) return { ok: false, message: 'There is nothing new to publish' };
	const missing = items.filter((i) => !i.ownerId);
	if (missing.length) return { ok: false, message: `${missing.length} kept ${missing.length === 1 ? 'item needs' : 'items need'} an owner. Pick one, or drop ${missing.length === 1 ? 'it' : 'them'}.` };
	const summary = m.summary as MeetingSummary | null;
	const org = await loadOrg();
	const owners = new Set<string>();
	let done = 0;
	const problems: string[] = [];
	for (const i of items) {
		const r = await createTask(viewer, {
			title: i.title,
			assigneeId: i.ownerId,
			dueDate: i.dueDate,
			priority: i.priority,
			meetingId: m.id,
			sourceQuote: i.stepIndex !== null && summary ? (summary.nextSteps[i.stepIndex] ?? null) : null
		});
		if (!r.ok) {
			problems.push(`${i.title}: ${r.message}`);
			continue;
		}
		await db.update(meetingItems).set({ taskId: r.task.id }).where(eq(meetingItems.id, i.id));
		owners.add(org.byId.get(i.ownerId!)?.fullName.split(' ')[0] ?? 'someone');
		done++;
	}
	if (done === 0) return { ok: false, message: problems[0] ?? 'Nothing could be published' };
	await db.update(meetings).set({ state: 'published', publishedAt: new Date(), publishedBy: viewer.id, updatedAt: new Date() }).where(eq(meetings.id, m.id));

	// One line in the host's team channel, owners only, never the minutes.
	const hostTeam = m.hostId ? org.byId.get(m.hostId)?.teamId : null;
	if (hostTeam) {
		const [ch] = await db.select({ id: chatChannels.id }).from(chatChannels).where(and(eq(chatChannels.source, 'team'), eq(chatChannels.sourceId, hostTeam), isNull(chatChannels.archivedAt))).limit(1);
		if (ch) {
			await postToChannel(ch.id, `${viewer.fullName} published ${done} ${done === 1 ? 'task' : 'tasks'} from ${m.topic}: ${[...owners].join(', ')}.`, {
				type: 'notice',
				tone: 'info',
				title: `Tasks from ${m.topic}`,
				text: `${done} ${done === 1 ? 'task' : 'tasks'} for ${[...owners].join(', ')}. Each person has theirs in Champ Hub.`,
				href: '/hub/tasks'
			}).catch(() => {});
		}
	}
	await logActivity({ actorUserId: viewer.id, action: 'meeting.publish', targetType: 'meeting', targetId: m.id, details: { published: done, problems } }).catch(() => {});
	await touched(m);
	return problems.length ? { ok: true, published: done, message: `Published ${done}. Not published: ${problems.join('; ')}` } as Result<{ published: number }> : { ok: true, published: done };
}

/* ---------- making minutes ---------- */

async function teamFor(hostId: string | null): Promise<{ id: string; fullName: string }[]> {
	if (!hostId) return [];
	const org = await loadOrg();
	const host = org.byId.get(hostId);
	const ids = new Set(treeOf(org, hostId));
	// Peers and the host's own lead are named in minutes too.
	if (host?.reportsTo) {
		ids.add(host.reportsTo);
		for (const p of org.children.get(host.reportsTo) ?? []) ids.add(p);
	}
	ids.add(hostId);
	return [...ids].map((id) => org.byId.get(id)).filter((p) => p?.isActive).map((p) => ({ id: p!.id, fullName: p!.fullName }));
}

async function writeItems(m: Row, summary: MeetingSummary, attendees: Attendee[]) {
	const { items, extraction } = await extractItems({ summary, meetingDay: istDateKey(m.startedAt), attendees, team: await teamFor(m.hostId) });
	await db.delete(meetingItems).where(and(eq(meetingItems.meetingId, m.id), isNull(meetingItems.taskId)));
	if (items.length) {
		await db.insert(meetingItems).values(
			items.map((it, n) => ({
				meetingId: m.id,
				title: it.title,
				ownerId: it.ownerId,
				ownerHeard: it.ownerHeard,
				dueDate: it.dueDate,
				priority: it.priority,
				stepIndex: it.stepIndex,
				confidence: String(it.confidence),
				position: n
			}))
		);
	}
	await db.update(meetings).set({ summary, extraction, state: 'ready', updatedAt: new Date() }).where(eq(meetings.id, m.id));
	return items.length;
}

async function tellHost(m: Row, count: number) {
	if (!m.hostId) return;
	await postToFeed(m.hostId, `${m.topic}: minutes are ready to review`, {
		type: 'notice',
		tone: 'info',
		title: `Minutes ready: ${m.topic}`,
		text: count ? `${count} action ${count === 1 ? 'item' : 'items'} to review. Nothing is sent until you publish.` : 'No action items were found. Add any that were missed.',
		href: `/hub/meetings/${m.id}`
	});
	await publish([m.hostId], { type: 'meetings.changed', meetingId: m.id });
}

/** Minutes from notes the host pastes, for a meeting Zoom wrote nothing for. */
export async function pasteNotes(viewer: SessionUser, input: { meetingId?: string | null; topic?: string; date?: string; notes: string }): Promise<Result<{ id: string; items: number }>> {
	const notes = input.notes.trim().slice(0, 20_000);
	if (!notes) return { ok: false, message: 'Paste the notes first' };
	let m: Row | null = null;
	if (input.meetingId) {
		m = await reviewable(viewer, input.meetingId);
		if (!m) return { ok: false, message: 'Only the host can add notes to this meeting', status: 403 };
		if (m.state === 'published') return { ok: false, message: 'These minutes are already published. Add items instead.' };
	} else {
		const topic = (input.topic ?? '').trim().slice(0, 200);
		if (!topic) return { ok: false, message: 'Name the meeting' };
		const day = input.date && DATE.test(input.date) ? input.date : istDateKey(new Date());
		[m] = await db.insert(meetings).values({ topic, hostId: viewer.id, hostEmail: viewer.email, startedAt: new Date(`${day}T10:00:00+05:30`), state: 'ready', source: 'pasted' }).returning();
	}
	const lines = actionLines(notes);
	const summary: MeetingSummary = {
		overview: `Notes pasted by ${viewer.fullName}.`,
		details: [],
		nextSteps: lines.length ? lines : notes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40)
	};
	await db.update(meetings).set({ source: 'pasted' }).where(eq(meetings.id, m!.id));
	const org = await loadOrg();
	const attendees: Attendee[] = m!.attendeeIds.map((id) => ({ userId: id, name: org.byId.get(id)?.fullName ?? '', email: null }));
	const count = await writeItems({ ...m!, source: 'pasted' }, summary, attendees);
	await touched(m!);
	return { ok: true, id: m!.id, items: count };
}

/* ---------- from Zoom ---------- */

async function userByZoom(email: string | null | undefined, name?: string | null): Promise<string | null> {
	const keys = [email?.toLowerCase(), name?.toLowerCase()].filter(Boolean) as string[];
	if (keys.length === 0) return null;
	const [link] = await db.select({ userId: zoomUserLinks.userId }).from(zoomUserLinks).where(inArray(zoomUserLinks.zoomKey, keys)).limit(1);
	if (link) return link.userId;
	if (!email) return null;
	const [u] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.isActive, true))).limit(1);
	return u?.id ?? null;
}

function summaryFrom(z: ZoomSummary): MeetingSummary {
	const src = z.edited_summary && (z.edited_summary.next_steps?.length || z.edited_summary.summary_overview) ? { ...z, ...z.edited_summary } : z;
	return {
		overview: String(src.summary_overview ?? '').trim(),
		details: (src.summary_details ?? []).map((d) => ({ label: String(d.label ?? '').trim(), text: String(d.summary ?? '').trim() })).filter((d) => d.label || d.text),
		nextSteps: (src.next_steps ?? []).map((s) => String(s).trim()).filter(Boolean)
	};
}

/** meeting.ended: show the meeting as waiting for its summary. */
export async function meetingEnded(obj: { uuid?: string; id?: number | string; topic?: string; start_time?: string; duration?: number; host_email?: string; host_id?: string }) {
	if (!obj.uuid) return;
	const hostId = await userByZoom(obj.host_email);
	await db
		.insert(meetings)
		.values({
			zoomUuid: obj.uuid,
			zoomMeetingId: obj.id != null ? String(obj.id) : null,
			hostId,
			hostEmail: obj.host_email ?? null,
			topic: obj.topic?.trim() || 'Zoom meeting',
			startedAt: obj.start_time ? new Date(obj.start_time) : new Date(),
			durationMin: obj.duration ?? null,
			state: 'waiting'
		})
		.onConflictDoNothing({ target: meetings.zoomUuid });
	if (hostId) await publish([hostId], { type: 'meetings.changed' });
}

/**
 * meeting.summary_completed (or the reconcile job): fetch the summary and the
 * attendees, extract items, mark it ready and tell the host. Safe to call
 * twice for one meeting: published minutes are never rewritten.
 */
export async function ingestSummary(uuid: string): Promise<{ ok: boolean; message: string; meetingId?: string }> {
	const [existing] = await db.select().from(meetings).where(eq(meetings.zoomUuid, uuid)).limit(1);
	if (existing && existing.state === 'published') return { ok: true, message: 'Already published', meetingId: existing.id };
	let z: ZoomSummary;
	try {
		z = await meetingSummary(uuid);
	} catch (err) {
		const status = err instanceof ZoomError ? err.status : 0;
		if (status === 404 && existing) await db.update(meetings).set({ state: 'no_summary', updatedAt: new Date() }).where(eq(meetings.id, existing.id));
		await recordStatus({ lastError: err instanceof Error ? err.message : String(err) });
		return { ok: false, message: err instanceof Error ? err.message : 'Zoom did not answer' };
	}
	const hostId = existing?.hostId ?? (await userByZoom(z.meeting_host_email));
	let participants: Awaited<ReturnType<typeof pastParticipants>> = [];
	try {
		participants = await pastParticipants(uuid);
	} catch (err) {
		console.warn('[zoom] participants unavailable:', err instanceof Error ? err.message : err);
	}
	const org = await loadOrg();
	const attendees: Attendee[] = [];
	const seen = new Set<string>();
	for (const p of participants) {
		const key = (p.user_email || p.name || '').toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const userId = await userByZoom(p.user_email, p.name);
		attendees.push({ userId, name: userId ? (org.byId.get(userId)?.fullName ?? p.name ?? '') : (p.name ?? p.user_email ?? 'Guest'), email: p.user_email ?? null });
	}
	const attendeeIds = [...new Set([...(hostId ? [hostId] : []), ...attendees.filter((a) => a.userId).map((a) => a.userId!)])];
	const guestNames = attendees.filter((a) => !a.userId).map((a) => a.name).slice(0, 50);
	const values = {
		zoomUuid: uuid,
		zoomMeetingId: z.meeting_id != null ? String(z.meeting_id) : (existing?.zoomMeetingId ?? null),
		hostId,
		hostEmail: z.meeting_host_email ?? existing?.hostEmail ?? null,
		topic: z.meeting_topic?.trim() || existing?.topic || 'Zoom meeting',
		startedAt: z.meeting_start_time ? new Date(z.meeting_start_time) : (existing?.startedAt ?? new Date()),
		durationMin: z.meeting_start_time && z.meeting_end_time ? Math.round((Date.parse(z.meeting_end_time) - Date.parse(z.meeting_start_time)) / 60_000) : (existing?.durationMin ?? null),
		attendeeIds,
		guestNames,
		source: 'zoom',
		updatedAt: new Date()
	};
	const [m] = existing
		? await db.update(meetings).set(values).where(eq(meetings.id, existing.id)).returning()
		: await db.insert(meetings).values({ ...values, state: 'waiting' }).returning();
	const count = await writeItems(m, summaryFrom(z), attendees);
	await recordStatus({ lastEvent: 'meeting.summary_completed', lastEventAt: new Date().toISOString(), lastError: null });
	await tellHost(m, count);
	return { ok: true, message: `${count} items`, meetingId: m.id };
}

/**
 * Every 30 minutes: pick up summaries whose webhook never arrived, and stop
 * showing "waiting" for meetings Zoom wrote nothing for after six hours.
 */
export async function reconcileZoom(now = new Date()) {
	if (!zoomConfigured()) return;
	const from = istDateKey(new Date(now.getTime() - 3 * 86_400_000));
	const to = istDateKey(now);
	const list = await listSummaries(from, to);
	if (list.length) {
		const done = await db.select({ uuid: meetings.zoomUuid }).from(meetings).where(and(inArray(meetings.zoomUuid, list.map((s) => s.meeting_uuid)), inArray(meetings.state, ['ready', 'published'])));
		const have = new Set(done.map((d) => d.uuid));
		for (const s of list) {
			if (have.has(s.meeting_uuid)) continue;
			// Only meetings hosted by someone with a login.
			if (!(await userByZoom(s.meeting_host_email))) continue;
			await ingestSummary(s.meeting_uuid).catch((err) => console.error('[zoom] reconcile ingest failed:', err));
		}
	}
	await db
		.update(meetings)
		.set({ state: 'no_summary', updatedAt: new Date() })
		.where(and(eq(meetings.state, 'waiting'), lt(meetings.startedAt, new Date(now.getTime() - 6 * 3_600_000))));
	await recordStatus({ lastReconcileAt: now.toISOString() });
}

/* ---------- Admin Controls › Zoom ---------- */

export async function zoomLinks() {
	const links = await db
		.select({ id: zoomUserLinks.id, zoomKey: zoomUserLinks.zoomKey, userId: zoomUserLinks.userId, fullName: users.fullName, createdAt: zoomUserLinks.createdAt })
		.from(zoomUserLinks)
		.innerJoin(users, eq(users.id, zoomUserLinks.userId))
		.orderBy(asc(zoomUserLinks.zoomKey));
	// Names Zoom used in recent meetings that matched nobody.
	const recent = await db
		.select({ guests: meetings.guestNames, hostEmail: meetings.hostEmail, hostId: meetings.hostId })
		.from(meetings)
		.where(gte(meetings.startedAt, new Date(Date.now() - 30 * 86_400_000)));
	const linked = new Set(links.map((l) => l.zoomKey));
	const unmatched = new Map<string, number>();
	for (const r of recent) {
		for (const g of r.guests) if (!linked.has(g.toLowerCase())) unmatched.set(g, (unmatched.get(g) ?? 0) + 1);
		if (!r.hostId && r.hostEmail && !linked.has(r.hostEmail.toLowerCase())) unmatched.set(r.hostEmail, (unmatched.get(r.hostEmail) ?? 0) + 1);
	}
	return { links, unmatched: [...unmatched.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 50) };
}

export async function linkZoomUser(viewer: SessionUser, zoomKey: string, userId: string | null): Promise<Result> {
	if (!hasCap(viewer, 'system.zoom')) return { ok: false, message: 'Only a Super Admin can link Zoom users', status: 403 };
	const key = zoomKey.trim().toLowerCase();
	if (!key) return { ok: false, message: 'Pick the Zoom name or email to link' };
	if (!userId) {
		await db.delete(zoomUserLinks).where(eq(zoomUserLinks.zoomKey, key));
		return { ok: true };
	}
	if (!UUID.test(userId)) return { ok: false, message: 'That person no longer exists' };
	await db.insert(zoomUserLinks).values({ zoomKey: key, userId, linkedBy: viewer.id }).onConflictDoUpdate({ target: zoomUserLinks.zoomKey, set: { userId, linkedBy: viewer.id } });
	await logActivity({ actorUserId: viewer.id, action: 'zoom.link', targetType: 'user', targetId: userId, details: { zoomKey: key } }).catch(() => {});
	return { ok: true };
}

/** Meetings waiting on the viewer as host, for Today and the tab badge. */
export async function minutesWaiting(viewer: SessionUser): Promise<{ id: string; topic: string; startedAt: Date; items: number; needOwner: number }[]> {
	const rows = await db
		.select({ id: meetings.id, topic: meetings.topic, startedAt: meetings.startedAt })
		.from(meetings)
		.where(and(eq(meetings.hostId, viewer.id), eq(meetings.state, 'ready')))
		.orderBy(desc(meetings.startedAt))
		.limit(20);
	if (rows.length === 0) return [];
	const counts = await db
		.select({
			meetingId: meetingItems.meetingId,
			items: sql<number>`count(*) filter (where ${meetingItems.included} and ${meetingItems.taskId} is null)::int`,
			needOwner: sql<number>`count(*) filter (where ${meetingItems.included} and ${meetingItems.taskId} is null and ${meetingItems.ownerId} is null)::int`
		})
		.from(meetingItems)
		.where(inArray(meetingItems.meetingId, rows.map((r) => r.id)))
		.groupBy(meetingItems.meetingId);
	const by = new Map(counts.map((c) => [c.meetingId, c]));
	return rows.map((r) => ({ ...r, items: by.get(r.id)?.items ?? 0, needOwner: by.get(r.id)?.needOwner ?? 0 }));
}
