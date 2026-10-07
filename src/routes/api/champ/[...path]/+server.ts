import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { askChamp, champConfigured } from '$lib/server/champ/chat';
import { applyCard, decideTask, listTasks } from '$lib/server/champ/apply';
import { runTool } from '$lib/server/champ/tools';
import { CHAMP_LIMITS, type ChampCardKind, type ChampMessage } from '$lib/champ';

/**
 * The ✨ panel's endpoints.
 *   POST /api/champ/ask      one question, with the recent conversation
 *   POST /api/champ/apply    a card's button
 *   GET  /api/champ/tasks    the Requests tab
 *   POST /api/champ/tasks/:id  Mark done · Can't do this · Withdraw
 */

const KINDS: ChampCardKind[] = ['leave_request', 'correction', 'comp_off', 'approve', 'task', 'settings_change', 'role_change', 'create_login', 'named_role', 'announcement_draft'];

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Sign in again to continue');
	if (params.path === 'tasks') return json(await listTasks(user.id));
	if (params.path === 'status') return json({ configured: champConfigured() });
	// The Requests tab lists approvals straight from the database — no model call.
	if (params.path === 'approvals') return json((await runTool('pending_approvals', {}, { user, mode: 'panel' })).cards ?? []);
	throw error(404, 'Not found');
};

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) throw error(401, 'Sign in again to continue');
	const [a, b] = event.params.path.split('/');
	const data = ((await event.request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

	if (a === 'ask') {
		const history = (Array.isArray(data.history) ? data.history : [])
			.filter((m): m is ChampMessage => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
			.slice(-CHAMP_LIMITS.history);
		return json(await askChamp(user, history, String(data.question ?? ''), 'panel'));
	}

	if (a === 'apply') {
		const kind = String(data.kind) as ChampCardKind;
		if (!KINDS.includes(kind)) throw error(400, 'Unknown card');
		const r = await applyCard(event, kind, String(data.action ?? ''), (data.payload ?? {}) as Record<string, unknown>, typeof data.note === 'string' ? data.note : undefined);
		return r.ok ? json(r) : json(r, { status: 400 });
	}

	if (a === 'tasks' && b) {
		const action = data.action === 'done' || data.action === 'decline' || data.action === 'withdraw' ? data.action : null;
		if (!action) throw error(400, 'Mark done, decline or withdraw');
		const r = await decideTask(user, b, action, String(data.note ?? ''));
		return r.ok ? json(r) : json(r, { status: 400 });
	}

	throw error(404, 'Not found');
};
