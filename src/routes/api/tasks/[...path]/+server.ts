import { error, json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	addComment,
	addSubtask,
	approvalsFor,
	approveTask,
	assignableFor,
	createTask,
	deleteSubtask,
	deleteTask,
	getTask,
	moveTask,
	myTasks,
	respondToTask,
	searchTasks,
	taskFromMessage,
	teamTasks,
	toggleSubtask,
	updateTask,
	type Result
} from '$lib/server/tasks/service';

/**
 * Champ Hub tasks, one route dispatched on the path like /api/chat. Every rule
 * lives in src/lib/server/tasks/service.ts; this file only reads requests and
 * shapes answers. Failures carry { message } in plain words, and a 409 also
 * carries the task as it now is, so the board can show the newer state.
 */

const UUID = /^[0-9a-f-]{36}$/i;

function me(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) throw error(401, 'Sign in again to continue');
	return user;
}

const id = (v: string | undefined) => {
	if (!v || !UUID.test(v)) throw error(400, 'That is not a valid id');
	return v;
};

async function body(event: RequestEvent): Promise<Record<string, unknown>> {
	return ((await event.request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

function send(r: Result<Record<string, unknown>>) {
	if (r.ok) return json(r);
	return json({ message: r.message, ...(r.task ? { task: r.task } : {}) }, { status: r.status ?? 400 });
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const optId = (v: unknown) => (v === null ? null : typeof v === 'string' && UUID.test(v) ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

export const GET: RequestHandler = async (event) => {
	const user = me(event);
	const [a, b] = event.params.path.split('/');
	const q = event.url.searchParams;
	if (!a) {
		if (q.get('scope') === 'team') {
			const lead = q.get('lead');
			return send(await teamTasks(user, lead && UUID.test(lead) ? lead : user.id));
		}
		return json({ ok: true, tasks: await myTasks(user) });
	}
	if (a === 'search') return json(await searchTasks(user, q.get('q') ?? ''));
	if (a === 'assignable') return json(await assignableFor(user));
	if (a === 'approvals') return json(await approvalsFor(user));
	if (UUID.test(a) && !b) return send(await getTask(user, a));
	throw error(404, 'Not found');
};

export const POST: RequestHandler = async (event) => {
	const user = me(event);
	const [a, b, c, d] = event.params.path.split('/');
	const data = await body(event);

	if (!a) {
		return send(
			await createTask(user, {
				title: String(data.title ?? ''),
				description: str(data.description),
				assigneeId: optId(data.assigneeId),
				dueDate: str(data.dueDate) ?? null,
				priority: str(data.priority),
				status: str(data.status)
			})
		);
	}
	if (a === 'from-message') {
		return send(
			await taskFromMessage(user, {
				messageId: id(str(data.messageId)),
				title: str(data.title),
				assigneeId: optId(data.assigneeId),
				dueDate: str(data.dueDate) ?? null,
				status: str(data.status)
			})
		);
	}
	const tid = id(a);
	if (b === 'move') {
		return send(await moveTask(user, tid, { status: str(data.status), assigneeId: optId(data.assigneeId), beforeId: optId(data.beforeId), afterId: optId(data.afterId), version: num(data.version) }));
	}
	if (b === 'approve') return send(await approveTask(user, tid, data.decision === 'reject' ? 'reject' : 'approve', String(data.note ?? '')));
	if (b === 'respond') return send(await respondToTask(user, tid, data.decision === 'decline' ? 'decline' : 'accept', String(data.note ?? '')));
	if (b === 'comments') return send(await addComment(user, tid, String(data.body ?? '')));
	if (b === 'subtasks' && !c) return send(await addSubtask(user, tid, String(data.title ?? '')));
	if (b === 'subtasks' && c && d === 'toggle') return send(await toggleSubtask(user, tid, id(c)));
	throw error(404, 'Not found');
};

export const PATCH: RequestHandler = async (event) => {
	const user = me(event);
	const [a] = event.params.path.split('/');
	const data = await body(event);
	return send(
		await updateTask(user, id(a), {
			title: str(data.title),
			description: str(data.description),
			dueDate: data.dueDate === null ? null : str(data.dueDate),
			priority: str(data.priority),
			blocked: typeof data.blocked === 'boolean' ? data.blocked : undefined,
			version: num(data.version)
		})
	);
};

export const DELETE: RequestHandler = async (event) => {
	const user = me(event);
	const [a, b, c] = event.params.path.split('/');
	if (b === 'subtasks' && c) return send(await deleteSubtask(user, id(a), id(c)));
	if (!b) return send(await deleteTask(user, id(a)));
	throw error(404, 'Not found');
};
