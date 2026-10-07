import { db } from '$lib/server/db/postgres';
import { chatChannels, chatMessages, employeeProfiles, meetings, taskEvents, taskSubtasks, tasks, users } from '$lib/server/db/schema';
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SessionUser } from '$lib/server/auth';
import { hasCap } from '$lib/server/capabilities';
import { logActivity } from '$lib/server/db/mongo';
import { publish } from '$lib/server/chat/bus';
import { postToFeed } from '$lib/server/chat/cards';
import { membership } from '$lib/server/chat/access';
import { postToChannel } from '$lib/server/chat/messages';
import { istDateKey } from '$lib/chat/rules';
import { assignMode, rankBetween, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type Reach, type TaskPriority, type TaskStatus } from '$lib/tasks/rules';
import type { AssignableGroups, PersonRef, TaskDetail, TaskView } from '$lib/tasks/types';

/**
 * Champ Hub tasks: the one place that decides who may see, give, move and
 * change a task. Every endpoint, the minutes publisher, "/task" and Champ go
 * through here, so the rules in src/lib/tasks/rules.ts hold everywhere.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string; status?: number; task?: TaskView };

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 300;
const MAX_DESC = 4000;

/* ---------- the org, briefly cached ---------- */

type OrgPerson = { id: string; fullName: string; reportsTo: string | null; role: string; isActive: boolean; teamId: string | null; email: string; designation: string | null };
type Org = { byId: Map<string, OrgPerson>; children: Map<string, string[]>; at: number };

let orgCache: Org | null = null;

export async function loadOrg(): Promise<Org> {
	if (orgCache && Date.now() - orgCache.at < 30_000) return orgCache;
	const rows = await db
		.select({ id: users.id, fullName: users.fullName, reportsTo: users.reportsTo, role: users.role, isActive: users.isActive, teamId: users.teamId, email: users.email, designation: employeeProfiles.designation })
		.from(users)
		.leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id));
	const byId = new Map(rows.map((r) => [r.id, r]));
	const children = new Map<string, string[]>();
	for (const r of rows) {
		if (!r.reportsTo || !r.isActive) continue;
		const list = children.get(r.reportsTo) ?? [];
		list.push(r.id);
		children.set(r.reportsTo, list);
	}
	orgCache = { byId, children, at: Date.now() };
	return orgCache;
}

/** Forget the cached org, after someone's reporting line changes. */
export function invalidateOrg() {
	orgCache = null;
}

export function treeOf(org: Org, id: string): string[] {
	const out: string[] = [];
	const seen = new Set([id]);
	const walk = (x: string) => {
		for (const c of org.children.get(x) ?? []) {
			if (seen.has(c)) continue;
			seen.add(c);
			out.push(c);
			walk(c);
		}
	};
	walk(id);
	return out;
}

export async function reachFor(user: SessionUser): Promise<Reach> {
	const org = await loadOrg();
	const me = org.byId.get(user.id);
	const teammateIds = me?.reportsTo ? (org.children.get(me.reportsTo) ?? []).filter((id) => id !== user.id) : [];
	return {
		selfId: user.id,
		treeIds: treeOf(org, user.id),
		teammateIds,
		anyone: user.role === 'super_admin' || hasCap(user, 'tasks.assign_anyone'),
		canRequestAnyone: user.role !== 'employee'
	};
}

/** The people the picker offers, grouped as it shows them. */
export async function assignableFor(user: SessionUser, reach?: Reach): Promise<AssignableGroups> {
	const org = await loadOrg();
	const r = reach ?? (await reachFor(user));
	const direct: PersonRef[] = [];
	const request: PersonRef[] = [];
	const people = [...org.byId.values()].filter((p) => p.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName));
	for (const p of people) {
		const mode = assignMode(r, p.id);
		if (mode === 'direct') direct.push({ id: p.id, fullName: p.fullName });
		else if (mode === 'request') request.push({ id: p.id, fullName: p.fullName });
	}
	// You first, then your team, then everyone else alphabetically.
	direct.sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : a.fullName.localeCompare(b.fullName)));
	return { direct, request };
}

/* ---------- reading ---------- */

type Row = typeof tasks.$inferSelect;

function canSee(user: SessionUser, t: Row, reach: Reach): boolean {
	if (t.assigneeId === user.id || t.createdBy === user.id) return true;
	if (t.assigneeId && reach.treeIds.includes(t.assigneeId)) return true;
	if (!t.assigneeId && reach.treeIds.includes(t.createdBy)) return true;
	return user.role === 'super_admin' || hasCap(user, 'tasks.view_all');
}

function canEdit(user: SessionUser, t: Row, reach: Reach): boolean {
	if (t.assigneeId === user.id || t.createdBy === user.id) return true;
	if (t.assigneeId && reach.treeIds.includes(t.assigneeId)) return true;
	if (!t.assigneeId && reach.treeIds.includes(t.createdBy)) return true;
	return user.role === 'super_admin';
}

export async function serialize(viewer: SessionUser, rows: Row[], reach?: Reach): Promise<TaskView[]> {
	if (rows.length === 0) return [];
	const r = reach ?? (await reachFor(viewer));
	const org = await loadOrg();
	const ids = rows.map((x) => x.id);
	const meetingIds = [...new Set(rows.map((x) => x.meetingId).filter(Boolean) as string[])];
	const channelIds = [...new Set(rows.map((x) => x.sourceChannelId).filter(Boolean) as string[])];
	const [subs, mts, chans] = await Promise.all([
		db
			.select({ taskId: taskSubtasks.taskId, total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${taskSubtasks.done})::int` })
			.from(taskSubtasks)
			.where(inArray(taskSubtasks.taskId, ids))
			.groupBy(taskSubtasks.taskId),
		meetingIds.length ? db.select({ id: meetings.id, topic: meetings.topic, startedAt: meetings.startedAt, hostId: meetings.hostId }).from(meetings).where(inArray(meetings.id, meetingIds)) : [],
		channelIds.length ? db.select({ id: chatChannels.id, name: chatChannels.name, kind: chatChannels.kind }).from(chatChannels).where(inArray(chatChannels.id, channelIds)) : []
	]);
	const subBy = new Map(subs.map((s) => [s.taskId, s]));
	const mtBy = new Map(mts.map((m) => [m.id, m]));
	const chBy = new Map(chans.map((c) => [c.id, c]));
	const person = (id: string | null): PersonRef | null => {
		if (!id) return null;
		const p = org.byId.get(id);
		return { id, fullName: p?.fullName ?? 'Former employee' };
	};
	return rows.map((t) => {
		const m = t.meetingId ? mtBy.get(t.meetingId) : null;
		const ch = t.sourceChannelId ? chBy.get(t.sourceChannelId) : null;
		const s = subBy.get(t.id);
		const edit = canEdit(viewer, t, r);
		return {
			id: t.id,
			title: t.title,
			description: t.description,
			status: t.status,
			priority: t.priority,
			dueDate: t.dueDate,
			blocked: t.blocked,
			assignee: person(t.assigneeId),
			createdBy: person(t.createdBy)!,
			requestState: (t.requestState as TaskView['requestState']) ?? null,
			requestNote: t.requestNote,
			rank: t.rank,
			version: t.version,
			source: m
				? { kind: 'meeting', meetingId: m.id, topic: m.topic, date: istDateKey(m.startedAt), quote: t.sourceQuote, canOpen: m.hostId === viewer.id || viewer.role === 'super_admin' || (!!m.hostId && r.treeIds.includes(m.hostId)) }
				: t.sourceMessageId || t.sourceChannelId
					? { kind: 'message', channelId: t.sourceChannelId, messageId: t.sourceMessageId, quote: t.sourceQuote, channelName: ch ? (ch.kind === 'channel' ? `#${ch.name}` : ch.kind === 'dm' ? 'a direct message' : ch.name || 'a conversation') : null }
					: null,
			subtasks: { done: s?.done ?? 0, total: s?.total ?? 0 },
			completedAt: t.completedAt?.toISOString() ?? null,
			updatedAt: t.updatedAt.toISOString(),
			can: { edit, respond: t.assigneeId === viewer.id && t.requestState === 'pending' }
		};
	});
}

const ORDER = [asc(tasks.rank), desc(tasks.createdAt)];
/** Done tasks stay on boards for two weeks, then only show in search. */
const doneCutoff = () => new Date(Date.now() - 14 * 86_400_000);
const visibleDone = () => or(sql`${tasks.status} <> 'done'`, gte(tasks.completedAt, doneCutoff()));

/** The viewer's own board: everything assigned to them, requests included. */
export async function myTasks(viewer: SessionUser): Promise<TaskView[]> {
	const rows = await db.select().from(tasks).where(and(eq(tasks.assigneeId, viewer.id), visibleDone())).orderBy(...ORDER);
	return serialize(viewer, rows);
}

/**
 * A lead's team: one lane per direct report plus Unassigned (tasks the lead
 * created for nobody yet). `leadId` other than the viewer needs "See every
 * team's tasks".
 */
export async function teamTasks(viewer: SessionUser, leadId = viewer.id): Promise<Result<{ lanes: { person: PersonRef & { title: string | null }; tasks: TaskView[] }[]; unassigned: TaskView[] }>> {
	if (leadId !== viewer.id && !hasCap(viewer, 'tasks.view_all') && viewer.role !== 'super_admin') return { ok: false, message: 'You can only see your own team', status: 403 };
	const org = await loadOrg();
	const reports = (org.children.get(leadId) ?? []).map((id) => org.byId.get(id)!).filter((p) => p?.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName));
	const ids = reports.map((p) => p.id);
	const rows = ids.length ? await db.select().from(tasks).where(and(inArray(tasks.assigneeId, ids), visibleDone())).orderBy(...ORDER) : [];
	const loose = await db.select().from(tasks).where(and(isNull(tasks.assigneeId), eq(tasks.createdBy, leadId), sql`${tasks.status} <> 'done'`)).orderBy(...ORDER);
	const reach = await reachFor(viewer);
	const views = await serialize(viewer, [...rows, ...loose], reach);
	const byId = new Map(views.map((v) => [v.id, v]));
	return {
		ok: true,
		lanes: reports.map((p) => ({ person: { id: p.id, fullName: p.fullName, title: p.designation }, tasks: rows.filter((t) => t.assigneeId === p.id).map((t) => byId.get(t.id)!) })),
		unassigned: loose.map((t) => byId.get(t.id)!)
	};
}

async function load(id: string): Promise<Row | null> {
	if (!UUID.test(id)) return null;
	const [t] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	return t ?? null;
}

export async function getTask(viewer: SessionUser, id: string): Promise<Result<{ task: TaskDetail }>> {
	const t = await load(id);
	const reach = await reachFor(viewer);
	if (!t || !canSee(viewer, t, reach)) return { ok: false, message: 'That task is not available to you', status: 404 };
	const [view] = await serialize(viewer, [t], reach);
	const [subtaskList, events, assignable] = await Promise.all([
		db.select({ id: taskSubtasks.id, title: taskSubtasks.title, done: taskSubtasks.done }).from(taskSubtasks).where(eq(taskSubtasks.taskId, id)).orderBy(asc(taskSubtasks.createdAt)),
		db
			.select({ id: taskEvents.id, kind: taskEvents.kind, body: taskEvents.body, actorId: taskEvents.actorId, actorName: users.fullName, createdAt: taskEvents.createdAt })
			.from(taskEvents)
			.leftJoin(users, eq(users.id, taskEvents.actorId))
			.where(eq(taskEvents.taskId, id))
			.orderBy(desc(taskEvents.createdAt))
			.limit(100),
		assignableFor(viewer, reach)
	]);
	return {
		ok: true,
		task: {
			...view,
			subtaskList,
			events: events.map((e) => ({ id: e.id, kind: e.kind === 'comment' ? 'comment' : 'activity', body: e.body, actor: e.actorId ? { id: e.actorId, fullName: e.actorName ?? 'Former employee' } : null, createdAt: e.createdAt.toISOString() })),
			assignable
		}
	};
}

/* ---------- telling people ---------- */

async function audience(t: Pick<Row, 'assigneeId' | 'createdBy'>): Promise<string[]> {
	const org = await loadOrg();
	const ids = new Set<string>([t.createdBy]);
	if (t.assigneeId) {
		ids.add(t.assigneeId);
		// The assignee's lead has them on the team board.
		const lead = org.byId.get(t.assigneeId)?.reportsTo;
		if (lead) ids.add(lead);
	}
	return [...ids];
}

async function changed(t: Pick<Row, 'id' | 'assigneeId' | 'createdBy'>, extra: string[] = []) {
	await publish([...(await audience(t)), ...extra], { type: 'tasks.changed', taskId: t.id });
}

async function event(taskId: string, actorId: string | null, body: string, kind: 'activity' | 'comment' = 'activity') {
	await db.insert(taskEvents).values({ taskId, actorId, body, kind });
}

const taskHref = (id: string) => `/hub/tasks?task=${id}`;
const fmtDue = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null);

async function tellAssignee(t: Row, actor: SessionUser, how: 'assigned' | 'request' | 'moved') {
	if (!t.assigneeId || t.assigneeId === actor.id) return;
	const due = fmtDue(t.dueDate);
	const title = how === 'request' ? `${actor.fullName} asked you to take a task` : `New task from ${actor.fullName}`;
	await postToFeed(t.assigneeId, `${title}: ${t.title}`, {
		type: 'notice',
		tone: 'info',
		title,
		text: t.title + (due ? ` · due ${due}` : '') + (how === 'request' ? ' · Accept or decline it in Champ Hub' : ''),
		href: taskHref(t.id)
	});
}

/* ---------- writing ---------- */

export type CreateInput = {
	title: string;
	description?: string;
	assigneeId?: string | null;
	dueDate?: string | null;
	priority?: string;
	status?: string;
	meetingId?: string | null;
	sourceQuote?: string | null;
	sourceMessageId?: string | null;
	sourceChannelId?: string | null;
};

async function topRank(assigneeId: string | null, status: TaskStatus): Promise<string> {
	const [first] = await db
		.select({ rank: tasks.rank })
		.from(tasks)
		.where(and(assigneeId ? eq(tasks.assigneeId, assigneeId) : isNull(tasks.assigneeId), eq(tasks.status, status)))
		.orderBy(asc(tasks.rank))
		.limit(1);
	return rankBetween(null, first?.rank ?? null);
}

export async function createTask(viewer: SessionUser, input: CreateInput, opts: { quiet?: boolean; asCreator?: string } = {}): Promise<Result<{ task: TaskView }>> {
	const title = (input.title ?? '').trim().replace(/\s+/g, ' ');
	if (!title) return { ok: false, message: 'Give the task a title' };
	if (title.length > MAX_TITLE) return { ok: false, message: `Keep the title under ${MAX_TITLE} characters` };
	const description = (input.description ?? '').trim().slice(0, MAX_DESC);
	const dueDate = input.dueDate && DATE.test(input.dueDate) ? input.dueDate : null;
	const priority = (TASK_PRIORITIES as readonly string[]).includes(input.priority ?? '') ? (input.priority as TaskPriority) : 'medium';
	const status = (TASK_STATUSES as readonly string[]).includes(input.status ?? '') ? (input.status as TaskStatus) : 'todo';
	const assigneeId = input.assigneeId === undefined ? viewer.id : input.assigneeId;

	let mode: 'direct' | 'request' = 'direct';
	if (assigneeId) {
		if (!UUID.test(assigneeId)) return { ok: false, message: 'That person no longer exists' };
		const org = await loadOrg();
		const target = org.byId.get(assigneeId);
		if (!target?.isActive) return { ok: false, message: 'That person no longer exists' };
		const m = assignMode(await reachFor(viewer), assigneeId);
		if (m === 'forbidden') return { ok: false, message: `You can give tasks to yourself and your teammates. Ask your lead to give this one to ${target.fullName}.`, status: 403 };
		mode = m;
	}

	const [row] = await db
		.insert(tasks)
		.values({
			title,
			description,
			assigneeId,
			createdBy: opts.asCreator ?? viewer.id,
			status: mode === 'request' ? 'todo' : status,
			priority,
			dueDate,
			requestState: mode === 'request' ? 'pending' : null,
			rank: await topRank(assigneeId, mode === 'request' ? 'todo' : status),
			meetingId: input.meetingId ?? null,
			sourceQuote: input.sourceQuote?.slice(0, 1000) ?? null,
			sourceMessageId: input.sourceMessageId ?? null,
			sourceChannelId: input.sourceChannelId ?? null,
			completedAt: status === 'done' ? new Date() : null
		})
		.returning();

	const org = await loadOrg();
	const whoName = assigneeId ? (org.byId.get(assigneeId)?.fullName ?? 'someone') : null;
	await event(row.id, viewer.id, !assigneeId ? 'created this, unassigned' : assigneeId === viewer.id ? 'created this' : mode === 'request' ? `asked ${whoName} to take this` : `gave this to ${whoName}`);
	if (!opts.quiet) await tellAssignee(row, viewer, mode === 'request' ? 'request' : 'assigned');
	await changed(row);
	const [view] = await serialize(viewer, [row]);
	return { ok: true, task: view };
}

export type PatchInput = { title?: string; description?: string; dueDate?: string | null; priority?: string; blocked?: boolean; version?: number };

async function stale(viewer: SessionUser, t: Row, version: number | undefined): Promise<Result | null> {
	if (version === undefined || version === t.version) return null;
	const [view] = await serialize(viewer, [t]);
	return { ok: false, status: 409, message: 'Someone changed this task a moment ago. It now shows their change.', task: view };
}

export async function updateTask(viewer: SessionUser, id: string, patch: PatchInput): Promise<Result<{ task: TaskView }>> {
	const t = await load(id);
	const reach = await reachFor(viewer);
	if (!t || !canSee(viewer, t, reach)) return { ok: false, message: 'That task is not available to you', status: 404 };
	if (!canEdit(viewer, t, reach)) return { ok: false, message: 'Only the owner, the person who made it and their leads can change it', status: 403 };
	const s = await stale(viewer, t, patch.version);
	if (s) return s as Result<{ task: TaskView }>;

	const set: Partial<typeof tasks.$inferInsert> = {};
	const notes: string[] = [];
	if (patch.title !== undefined) {
		const title = patch.title.trim().replace(/\s+/g, ' ');
		if (!title) return { ok: false, message: 'A task needs a title' };
		if (title.length > MAX_TITLE) return { ok: false, message: `Keep the title under ${MAX_TITLE} characters` };
		if (title !== t.title) {
			set.title = title;
			notes.push('renamed this');
		}
	}
	if (patch.description !== undefined && patch.description !== t.description) {
		set.description = patch.description.trim().slice(0, MAX_DESC);
		notes.push('changed the description');
	}
	if (patch.dueDate !== undefined) {
		const d = patch.dueDate && DATE.test(patch.dueDate) ? patch.dueDate : null;
		if (d !== t.dueDate) {
			set.dueDate = d;
			notes.push(d ? `set the due date to ${fmtDue(d)}` : 'cleared the due date');
		}
	}
	if (patch.priority !== undefined && (TASK_PRIORITIES as readonly string[]).includes(patch.priority) && patch.priority !== t.priority) {
		set.priority = patch.priority as TaskPriority;
		notes.push(`changed priority to ${patch.priority}`);
	}
	if (patch.blocked !== undefined && patch.blocked !== t.blocked) {
		set.blocked = patch.blocked;
		notes.push(patch.blocked ? 'flagged this as Blocked' : 'cleared the Blocked flag');
	}
	if (notes.length === 0) {
		const [view] = await serialize(viewer, [t], reach);
		return { ok: true, task: view };
	}
	const [row] = await db
		.update(tasks)
		.set({ ...set, version: t.version + 1, updatedAt: new Date() })
		.where(and(eq(tasks.id, id), eq(tasks.version, t.version)))
		.returning();
	if (!row) return (await stale(viewer, (await load(id))!, -1)) as Result<{ task: TaskView }>;
	for (const n of notes) await event(id, viewer.id, n);
	// A lead hearing "blocked" is the point of the flag.
	if (set.blocked && row.assigneeId) {
		const lead = (await loadOrg()).byId.get(row.assigneeId)?.reportsTo;
		if (lead && lead !== viewer.id) {
			await postToFeed(lead, `${viewer.fullName} is blocked: ${row.title}`, { type: 'notice', tone: 'warn', title: `${viewer.fullName} is blocked`, text: row.title, href: taskHref(row.id) });
		}
	}
	await changed(row);
	const [view] = await serialize(viewer, [row], reach);
	return { ok: true, task: view };
}

export type MoveInput = { status?: string; assigneeId?: string | null; beforeId?: string | null; afterId?: string | null; version?: number };

/**
 * Move a card: to another column, to another person, or within its column.
 * `beforeId` is the card that ends up directly above it, `afterId` the one
 * directly below; either may be missing at the ends of a column.
 */
export async function moveTask(viewer: SessionUser, id: string, input: MoveInput): Promise<Result<{ task: TaskView }>> {
	const t = await load(id);
	const reach = await reachFor(viewer);
	if (!t || !canSee(viewer, t, reach)) return { ok: false, message: 'That task is not available to you', status: 404 };
	if (!canEdit(viewer, t, reach)) return { ok: false, message: 'Only the owner, the person who made it and their leads can move it', status: 403 };
	const s = await stale(viewer, t, input.version);
	if (s) return s as Result<{ task: TaskView }>;

	const status = input.status && (TASK_STATUSES as readonly string[]).includes(input.status) ? (input.status as TaskStatus) : t.status;
	let assigneeId = t.assigneeId;
	let requestState = t.requestState;
	let mode: 'direct' | 'request' = 'direct';
	const notes: string[] = [];
	const org = await loadOrg();

	if (input.assigneeId !== undefined && input.assigneeId !== t.assigneeId) {
		const target = input.assigneeId;
		if (target) {
			if (!UUID.test(target) || !org.byId.get(target)?.isActive) return { ok: false, message: 'That person no longer exists' };
			const m = assignMode(reach, target);
			if (m === 'forbidden') return { ok: false, message: `You can give tasks to yourself and your teammates only`, status: 403 };
			mode = m;
		}
		assigneeId = target;
		requestState = mode === 'request' ? 'pending' : null;
		const from = t.assigneeId ? org.byId.get(t.assigneeId)?.fullName : 'Unassigned';
		const to = target ? org.byId.get(target)?.fullName : 'Unassigned';
		notes.push(target ? `moved this from ${from} to ${to}${mode === 'request' ? ' as a request' : ''}` : `took this off ${from}`);
	}
	// A finished task given to someone new starts again.
	const finalStatus: TaskStatus = assigneeId !== t.assigneeId && status === 'done' ? 'todo' : status;
	if (finalStatus !== t.status) notes.push(`moved this to ${STATUS_LABEL[finalStatus]}`);
	// Starting work on a request accepts it.
	if (requestState === 'pending' && assigneeId === viewer.id && finalStatus !== 'todo') {
		requestState = null;
		notes.push('accepted this');
	}

	let rank = t.rank;
	const neighbours = [input.beforeId, input.afterId].filter((x): x is string => !!x && UUID.test(x));
	if (neighbours.length || finalStatus !== t.status || assigneeId !== t.assigneeId) {
		const ns = neighbours.length ? await db.select({ id: tasks.id, rank: tasks.rank }).from(tasks).where(inArray(tasks.id, neighbours)) : [];
		const above = ns.find((n) => n.id === input.beforeId)?.rank ?? null;
		const below = ns.find((n) => n.id === input.afterId)?.rank ?? null;
		try {
			rank = above !== null || below !== null ? rankBetween(above, below) : await topRank(assigneeId, finalStatus);
		} catch {
			// The neighbours moved meanwhile; the top of the column is a safe place.
			rank = await topRank(assigneeId, finalStatus);
		}
	}

	const [row] = await db
		.update(tasks)
		.set({
			status: finalStatus,
			assigneeId,
			requestState,
			rank,
			completedAt: finalStatus === 'done' ? (t.completedAt ?? new Date()) : null,
			version: t.version + 1,
			updatedAt: new Date()
		})
		.where(and(eq(tasks.id, id), eq(tasks.version, t.version)))
		.returning();
	if (!row) return (await stale(viewer, (await load(id))!, -1)) as Result<{ task: TaskView }>;
	for (const n of notes) await event(id, viewer.id, n);

	if (assigneeId !== t.assigneeId) {
		await tellAssignee(row, viewer, mode === 'request' ? 'request' : 'moved');
	} else if (finalStatus === 'in_review' && t.status !== 'in_review' && row.createdBy !== viewer.id) {
		await postToFeed(row.createdBy, `${viewer.fullName} moved "${row.title}" to In review`, { type: 'notice', tone: 'info', title: 'Ready for your review', text: row.title, href: taskHref(row.id) });
	} else if (finalStatus === 'done' && t.status !== 'done' && row.createdBy !== viewer.id) {
		await postToFeed(row.createdBy, `${viewer.fullName} finished: ${row.title}`, { type: 'notice', tone: 'ok', title: 'Task done', text: row.title, href: taskHref(row.id) }, { notify: false });
	}
	await changed(row, t.assigneeId && t.assigneeId !== row.assigneeId ? [t.assigneeId] : []);
	const [view] = await serialize(viewer, [row], reach);
	return { ok: true, task: view };
}

/** Accept or decline a task someone asked you to take. */
export async function respondToTask(viewer: SessionUser, id: string, decision: 'accept' | 'decline', note = ''): Promise<Result<{ task: TaskView | null }>> {
	const t = await load(id);
	// A request can be accepted or declined; a task given directly can still be
	// handed back with a reason.
	if (!t || t.assigneeId !== viewer.id || (decision === 'accept' && t.requestState !== 'pending')) return { ok: false, message: 'That task is no longer waiting for you', status: 409 };
	const why = note.trim().slice(0, 300);
	if (decision === 'decline' && !why) return { ok: false, message: "Say briefly why you can't take it" };
	const org = await loadOrg();
	// Declined: it goes back to whoever asked, unless they lead the team, in
	// which case it waits Unassigned on their board for someone else.
	const backTo = decision === 'decline' ? ((org.children.get(t.createdBy)?.length ?? 0) > 0 ? null : t.createdBy) : viewer.id;
	const [row] = await db
		.update(tasks)
		.set({
			requestState: decision === 'accept' ? null : 'declined',
			requestNote: decision === 'decline' ? why : null,
			assigneeId: backTo,
			version: t.version + 1,
			updatedAt: new Date()
		})
		.where(eq(tasks.id, id))
		.returning();
	await event(id, viewer.id, decision === 'accept' ? 'accepted this' : `declined this: "${why}"`);
	if (t.createdBy !== viewer.id) {
		await postToFeed(
			t.createdBy,
			decision === 'accept' ? `${viewer.fullName} accepted: ${t.title}` : `${viewer.fullName} can't take "${t.title}": ${why}`,
			{ type: 'notice', tone: decision === 'accept' ? 'ok' : 'warn', title: decision === 'accept' ? 'Request accepted' : 'Request declined', text: t.title, href: taskHref(t.id) }
		);
	}
	await changed(row, [viewer.id]);
	const [view] = backTo === viewer.id || t.createdBy === viewer.id ? await serialize(viewer, [row]) : [null];
	return { ok: true, task: view };
}

export async function deleteTask(viewer: SessionUser, id: string): Promise<Result> {
	const t = await load(id);
	const reach = await reachFor(viewer);
	if (!t || !canSee(viewer, t, reach)) return { ok: false, message: 'That task is not available to you', status: 404 };
	const mayDelete = t.createdBy === viewer.id || reach.treeIds.includes(t.createdBy) || viewer.role === 'super_admin';
	if (!mayDelete) return { ok: false, message: 'Only the person who made it, or their lead, can delete a task', status: 403 };
	await db.delete(tasks).where(eq(tasks.id, id));
	await logActivity({ actorUserId: viewer.id, action: 'task.delete', targetType: 'task', targetId: id, details: { title: t.title, assigneeId: t.assigneeId } }).catch(() => {});
	await changed(t);
	return { ok: true };
}

/* ---------- subtasks and comments ---------- */

async function editable(viewer: SessionUser, taskId: string): Promise<Row | null> {
	const t = await load(taskId);
	if (!t) return null;
	const reach = await reachFor(viewer);
	return canEdit(viewer, t, reach) ? t : null;
}

export async function addSubtask(viewer: SessionUser, taskId: string, title: string): Promise<Result<{ id: string }>> {
	const t = await editable(viewer, taskId);
	if (!t) return { ok: false, message: 'You cannot change this task', status: 403 };
	const text = title.trim().slice(0, 200);
	if (!text) return { ok: false, message: 'Write the subtask first' };
	const [s] = await db.insert(taskSubtasks).values({ taskId, title: text }).returning();
	await db.update(tasks).set({ updatedAt: new Date(), version: t.version + 1 }).where(eq(tasks.id, taskId));
	await changed(t);
	return { ok: true, id: s.id };
}

export async function toggleSubtask(viewer: SessionUser, taskId: string, subtaskId: string): Promise<Result> {
	const t = await editable(viewer, taskId);
	if (!t || !UUID.test(subtaskId)) return { ok: false, message: 'You cannot change this task', status: 403 };
	const [s] = await db.select().from(taskSubtasks).where(and(eq(taskSubtasks.id, subtaskId), eq(taskSubtasks.taskId, taskId))).limit(1);
	if (!s) return { ok: false, message: 'That subtask no longer exists' };
	await db.update(taskSubtasks).set({ done: !s.done }).where(eq(taskSubtasks.id, subtaskId));
	await db.update(tasks).set({ updatedAt: new Date(), version: t.version + 1 }).where(eq(tasks.id, taskId));
	await changed(t);
	return { ok: true };
}

export async function deleteSubtask(viewer: SessionUser, taskId: string, subtaskId: string): Promise<Result> {
	const t = await editable(viewer, taskId);
	if (!t || !UUID.test(subtaskId)) return { ok: false, message: 'You cannot change this task', status: 403 };
	await db.delete(taskSubtasks).where(and(eq(taskSubtasks.id, subtaskId), eq(taskSubtasks.taskId, taskId)));
	await db.update(tasks).set({ updatedAt: new Date(), version: t.version + 1 }).where(eq(tasks.id, taskId));
	await changed(t);
	return { ok: true };
}

export async function addComment(viewer: SessionUser, taskId: string, body: string): Promise<Result> {
	const t = await load(taskId);
	const reach = await reachFor(viewer);
	if (!t || !canSee(viewer, t, reach)) return { ok: false, message: 'That task is not available to you', status: 404 };
	const text = body.trim().slice(0, 2000);
	if (!text) return { ok: false, message: 'Write a comment first' };
	await event(taskId, viewer.id, text, 'comment');
	await db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
	// Everyone else on the task hears about a comment.
	for (const id of await audience(t)) {
		if (id === viewer.id) continue;
		await postToFeed(id, `${viewer.fullName} commented on "${t.title}": ${text.slice(0, 140)}`, { type: 'notice', tone: 'info', title: `Comment from ${viewer.fullName}`, text: `${t.title}: ${text.slice(0, 200)}`, href: taskHref(t.id) }, { notify: id === t.assigneeId || id === t.createdBy });
	}
	await changed(t);
	return { ok: true };
}

/* ---------- from chat ---------- */

/**
 * "Make task" on a message, or a message dropped on a board column. The task
 * keeps the message's words, and a line in the conversation says it exists.
 */
export async function taskFromMessage(
	viewer: SessionUser,
	input: { messageId: string; title?: string; assigneeId?: string | null; dueDate?: string | null; status?: string }
): Promise<Result<{ task: TaskView }>> {
	if (!UUID.test(input.messageId)) return { ok: false, message: 'That message is not available' };
	const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1);
	if (!m || m.deletedAt || m.hiddenAt || !(await membership(m.channelId, viewer.id)) || (m.visibleTo && m.visibleTo !== viewer.id)) {
		return { ok: false, message: 'That message is not available to you' };
	}
	const title = (input.title ?? '').trim() || m.body.replace(/^(@\S+\s*)+/, '').replace(/[?.!]+$/, '').slice(0, 120) || 'Follow up on a message';
	const r = await createTask(viewer, {
		title,
		assigneeId: input.assigneeId === undefined ? viewer.id : input.assigneeId,
		dueDate: input.dueDate ?? null,
		status: input.status,
		sourceMessageId: m.id,
		sourceChannelId: m.channelId,
		sourceQuote: m.body.slice(0, 1000)
	});
	if (!r.ok) return r;
	const [c] = await db.select({ kind: chatChannels.kind }).from(chatChannels).where(eq(chatChannels.id, m.channelId)).limit(1);
	if (c && c.kind !== 'system' && c.kind !== 'announcements') {
		const owner = r.task.assignee?.fullName ?? 'nobody yet';
		await postToChannel(m.channelId, `${viewer.fullName} made a task from this conversation: "${r.task.title}" for ${owner}`, {
			type: 'notice',
			tone: 'info',
			title: 'Task created',
			text: `${r.task.title} · ${owner}${r.task.requestState === 'pending' ? ' (as a request)' : ''}${r.task.dueDate ? ` · due ${fmtDue(r.task.dueDate)}` : ''}`,
			href: taskHref(r.task.id)
		});
	}
	return r;
}

/** Search for Ctrl K: tasks the viewer can see whose title matches. */
export async function searchTasks(viewer: SessionUser, q: string, limit = 8): Promise<TaskView[]> {
	const text = q.trim().slice(0, 80);
	if (text.length < 2) return [];
	const reach = await reachFor(viewer);
	const seeAll = viewer.role === 'super_admin' || hasCap(viewer, 'tasks.view_all');
	const scope = seeAll ? undefined : or(eq(tasks.assigneeId, viewer.id), eq(tasks.createdBy, viewer.id), reach.treeIds.length ? inArray(tasks.assigneeId, reach.treeIds) : undefined);
	const rows = await db
		.select()
		.from(tasks)
		.where(and(sql`${tasks.title} ilike ${'%' + text.replace(/[%_]/g, '') + '%'}`, scope))
		.orderBy(desc(tasks.updatedAt))
		.limit(limit);
	return serialize(viewer, rows, reach);
}
