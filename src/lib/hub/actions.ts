import { api, hub } from './client.svelte';
import { STATUS_LABEL, type TaskStatus } from '$lib/tasks/rules';
import type { TaskView } from '$lib/tasks/types';

/**
 * The task changes every Hub screen makes, with the toast and Undo they
 * share. Each returns the task as the server now has it, or null after
 * telling the person what went wrong.
 */

type Move = { status?: TaskStatus; assigneeId?: string | null; beforeId?: string | null; afterId?: string | null };

export async function moveTask(task: TaskView, to: Move, opts: { quiet?: boolean } = {}): Promise<TaskView | null> {
	const r = await api<{ task: TaskView }>(`/api/tasks/${task.id}/move`, 'POST', { ...to, version: task.version });
	if (!r.ok) {
		hub.say(r.message, { tone: 'bad' });
		hub.changed(0);
		return null;
	}
	if (!opts.quiet) {
		const back: Move = {};
		if (to.status && to.status !== task.status) back.status = task.status;
		if (to.assigneeId !== undefined && to.assigneeId !== (task.assignee?.id ?? null)) back.assigneeId = task.assignee?.id ?? null;
		const text =
			back.assigneeId !== undefined
				? `Moved "${short(task.title)}" to ${r.task.assignee?.fullName ?? 'Unassigned'}${r.task.requestState === 'pending' ? ' as a request' : ''}.`
				: to.status
					? `Moved to ${STATUS_LABEL[to.status]}.`
					: 'Moved.';
		hub.say(text, Object.keys(back).length ? { undo: async () => void (await moveTask(r.task, back, { quiet: true })) } : {});
	}
	hub.changed();
	return r.task;
}

export async function respond(task: TaskView, decision: 'accept' | 'decline', note = ''): Promise<boolean> {
	const r = await api(`/api/tasks/${task.id}/respond`, 'POST', { decision, note });
	if (!r.ok) {
		hub.say(r.message, { tone: 'bad' });
		return false;
	}
	hub.say(decision === 'accept' ? `Accepted. ${task.createdBy.fullName.split(' ')[0]} was told.` : `Handed back to ${task.createdBy.fullName.split(' ')[0]}.`);
	hub.changed(0);
	return true;
}

export async function createTask(input: { title: string; assigneeId?: string | null; dueDate?: string | null; priority?: string; status?: string; description?: string }): Promise<TaskView | null> {
	const r = await api<{ task: TaskView }>('/api/tasks', 'POST', input);
	if (!r.ok) {
		hub.say(r.message, { tone: 'bad' });
		return null;
	}
	const t = r.task;
	hub.say(t.assignee && t.requestState === 'pending' ? `Sent to ${t.assignee.fullName} as a request.` : t.assignee ? `Added for ${t.assignee.fullName}.` : 'Added, unassigned.');
	hub.changed(0);
	return t;
}

export const short = (s: string) => (s.length > 44 ? s.slice(0, 42) + '…' : s);
