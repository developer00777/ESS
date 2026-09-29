import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/postgres';
import { champTasks, users } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { hasCap } from '$lib/server/capabilities';
import { logActivity } from '$lib/server/db/mongo';
import { createLogin } from '$lib/server/logins';
import { saveNamedRole } from '$lib/server/roles';
import { syncMembershipFor } from '$lib/server/chat/sync';
import { postToFeed, decisionEndpoint, type RequestKind } from '$lib/server/chat/cards';
import { publish } from '$lib/server/chat/bus';
import type { Role } from '$lib/server/auth';
import type { ChampCardKind } from '$lib/champ';

/**
 * What a Champ card's button does. Wherever the portal already has an
 * endpoint for the job, the card calls that endpoint (event.fetch carries the
 * person's session), so a card can never do more than the same person could
 * do on the page itself — the same checks run either way.
 */

export type ApplyResult = { ok: true; message: string } | { ok: false; message: string };

async function viaEndpoint(event: RequestEvent, url: string, method: string, body: unknown): Promise<ApplyResult> {
	const res = await event.fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
	if (res.ok) return { ok: true, message: 'Done' };
	const err = await res.json().catch(() => ({}));
	return { ok: false, message: err.message ?? `That did not work (${res.status})` };
}

export async function applyCard(event: RequestEvent, kind: ChampCardKind, action: string, payload: Record<string, unknown>, note?: string): Promise<ApplyResult> {
	const user = event.locals.user!;
	let result: ApplyResult;

	switch (kind) {
		case 'leave_request':
			result = await viaEndpoint(event, '/api/leave', 'POST', payload);
			break;
		case 'correction':
			result = await viaEndpoint(event, '/api/attendance/deviations', 'POST', payload);
			break;
		case 'comp_off':
			result = await viaEndpoint(event, '/api/attendance/comp-off', 'POST', payload);
			break;
		case 'approve': {
			if (action !== 'approve' && action !== 'reject') return { ok: false, message: 'Approve or reject' };
			const reqKind = String(payload.requestKind) as RequestKind;
			result = await viaEndpoint(event, decisionEndpoint(reqKind, String(payload.id)), 'POST', { decision: action, note: note ?? undefined, via: 'champ' });
			break;
		}
		case 'settings_change':
		case 'role_change':
			result = await viaEndpoint(event, `/api/admin/users/${String(payload.userId)}/settings`, 'PUT', payload.body);
			break;
		case 'create_login': {
			const r = await createLogin(user, payload as never);
			if (!r.success) return { ok: false, message: r.message };
			void syncMembershipFor(r.userId).catch(() => {});
			result = {
				ok: true,
				message: r.emailSent ? `Created. Welcome email sent to ${r.email}.` : `Created. Email did not send, so pass on the temporary password: ${r.tempPassword}`
			};
			break;
		}
		case 'named_role': {
			const r = await saveNamedRole(user, payload as { name: string; baseRole: Role; capabilities: string[] });
			result = r.ok ? { ok: true, message: 'Role saved' } : r;
			break;
		}
		case 'task': {
			const toUserId = String(payload.toUserId);
			if (!/^[0-9a-f-]{36}$/i.test(toUserId)) return { ok: false, message: 'That person no longer exists' };
			const [to] = await db.select({ id: users.id, teamId: users.teamId, fullName: users.fullName }).from(users).where(and(eq(users.id, toUserId), eq(users.isActive, true))).limit(1);
			if (!to) return { ok: false, message: 'That person no longer exists' };
			const may = hasCap(user, 'champ.reports') || (user.role === 'team_lead' && !!user.teamId && to.teamId === user.teamId);
			if (!may) return { ok: false, message: 'Team Leads can give tasks to their own team; HR to anyone' };
			const due = typeof payload.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.due) ? new Date(`${payload.due}T18:00:00+05:30`) : null;
			const [task] = await db.insert(champTasks).values({ fromUser: user.id, toUser: to.id, title: String(payload.title).slice(0, 300), dueAt: due }).returning();
			await postToFeed(to.id, `New task from ${user.fullName}: ${task.title}`, {
				type: 'notice',
				tone: 'info',
				title: `Task from ${user.fullName}`,
				text: task.title + (due ? ` · due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''),
				href: '/chat?c=champ&tab=requests'
			});
			await publish([to.id, user.id], { type: 'tasks.changed' });
			result = { ok: true, message: `Assigned to ${to.fullName}` };
			break;
		}
		default:
			return { ok: false, message: 'Nothing to apply for this card' };
	}

	await logActivity({
		actorUserId: user.id,
		action: 'champ.apply',
		targetType: 'champ_card',
		details: { kind, action, ok: result.ok, message: result.ok ? null : result.message }
	}).catch(() => {});
	return result;
}

/** Tasks in the Requests tab: yours to do, and ones you handed out. */
export async function listTasks(userId: string) {
	const rows = await db.execute(
		// A small union reads more plainly than two builder queries here.
		sql`
			select t.id, t.title, t.status, t.note, t.due_at as "dueAt", t.created_at as "createdAt", t.decided_at as "decidedAt",
				t.to_user = ${userId} as "mine", f.full_name as "fromName", tu.full_name as "toName"
			from champ_tasks t
			join users f on f.id = t.from_user
			join users tu on tu.id = t.to_user
			where (t.to_user = ${userId} or t.from_user = ${userId})
				and (t.status = 'open' or t.decided_at > now() - interval '14 days')
			order by t.created_at desc
			limit 60
		`
	);
	return rows.rows;
}

export async function decideTask(userId: string, userName: string, taskId: string, action: 'done' | 'decline' | 'withdraw', note: string): Promise<ApplyResult> {
	const [t] = await db.select().from(champTasks).where(eq(champTasks.id, taskId)).limit(1);
	if (!t || t.status !== 'open') return { ok: false, message: 'That task is no longer open' };
	if (action === 'withdraw' ? t.fromUser !== userId : t.toUser !== userId) return { ok: false, message: 'That is not your task to change' };
	if (action === 'decline' && !note.trim()) return { ok: false, message: "Say briefly what's stopping it" };
	const status = action === 'done' ? 'done' : action === 'decline' ? 'declined' : 'withdrawn';
	await db.update(champTasks).set({ status, note: note.trim().slice(0, 300) || null, decidedAt: new Date() }).where(eq(champTasks.id, taskId));
	const other = action === 'withdraw' ? t.toUser : t.fromUser;
	await postToFeed(other, action === 'done' ? `${userName} finished: ${t.title}` : action === 'decline' ? `${userName} can't do "${t.title}": ${note.trim()}` : `${userName} withdrew the task "${t.title}"`, {
		type: 'notice',
		tone: action === 'done' ? 'ok' : action === 'decline' ? 'warn' : 'info',
		title: action === 'done' ? 'Task done' : action === 'decline' ? 'Task declined' : 'Task withdrawn',
		text: t.title,
		href: '/chat?c=champ&tab=requests'
	});
	await publish([t.toUser, t.fromUser], { type: 'tasks.changed' });
	await logActivity({ actorUserId: userId, action: `task.${status}`, targetType: 'champ_task', targetId: taskId, details: { note } }).catch(() => {});
	return { ok: true, message: status === 'done' ? 'Marked done' : status === 'declined' ? 'Declined' : 'Withdrawn' };
}
