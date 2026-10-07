import { error, json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dismissNeed, needsFor, todayFor } from '$lib/server/hub/needs';
import { searchTasks } from '$lib/server/tasks/service';
import { listMeetings } from '$lib/server/meetings/service';
import { dmCandidates } from '$lib/server/chat/access';

/**
 * Champ Hub's own reads: Today, the counts on its tabs, and Ctrl K search.
 * Conversations are searched in the browser from the live chat sidebar, and
 * messages through /api/chat/search.
 */

function me(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) throw error(401, 'Sign in again to continue');
	return user;
}

export const GET: RequestHandler = async (event) => {
	const user = me(event);
	const [a] = event.params.path.split('/');
	if (a === 'today') return json(await todayFor(user));
	if (a === 'counts') {
		const needs = await needsFor(user);
		return json({
			needs: needs.length,
			// What the chat badge does not already count: approvals and mentions
			// arrive as ESS notices and messages, so the sidebar adds only these.
			work: needs.filter((n) => n.kind !== 'approval' && n.kind !== 'mention').length,
			urgent: needs.some((n) => n.kind === 'approval' || (n.kind === 'due' && n.detail === 'Overdue')),
			minutes: needs.filter((n) => n.kind === 'minutes').length
		});
	}
	if (a === 'search') {
		const q = (event.url.searchParams.get('q') ?? '').trim();
		if (q.length < 2) return json({ tasks: [], meetings: [], people: [] });
		const ql = q.toLowerCase();
		const [tasks, meetings, people] = await Promise.all([searchTasks(user, q, 6), listMeetings(user), dmCandidates(user)]);
		return json({
			tasks,
			meetings: meetings.filter((m) => m.topic.toLowerCase().includes(ql)).slice(0, 5),
			people: people
				.filter((p) => p.isActive && p.fullName.toLowerCase().includes(ql))
				.slice(0, 6)
				.map((p) => ({ id: p.id, fullName: p.fullName }))
		});
	}
	throw error(404, 'Not found');
};

export const POST: RequestHandler = async (event) => {
	const user = me(event);
	const [a] = event.params.path.split('/');
	if (a === 'later') {
		const { key } = (await event.request.json().catch(() => ({}))) as { key?: string };
		if (!key) throw error(400, 'Which item?');
		await dismissNeed(user, key);
		return json({ ok: true });
	}
	throw error(404, 'Not found');
};
