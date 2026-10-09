import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireCap } from '$lib/server/capabilities';
import { approveLoginEmails, cancelLoginEmails, holdLoginEmails, listLoginEmails, setCadence } from '$lib/server/login-emails';

/**
 * The queue of login emails waiting for approval (src/lib/server/
 * login-emails.ts). Everything here needs "Approve login emails".
 */

const UUID = /^[0-9a-f-]{36}$/i;

export const GET: RequestHandler = async (event) => {
	requireCap(event, 'people.send_logins');
	return json(await listLoginEmails());
};

export const POST: RequestHandler = async (event) => {
	const actor = requireCap(event, 'people.send_logins');
	const data = (await event.request.json().catch(() => ({}))) as { action?: string; ids?: unknown; cadenceSeconds?: unknown };
	const ids = Array.isArray(data.ids) ? data.ids.map(String).filter((x) => UUID.test(x)).slice(0, 1000) : [];
	const r =
		data.action === 'approve'
			? await approveLoginEmails(actor, ids)
			: data.action === 'approve_all'
				? await approveLoginEmails(actor, [])
				: data.action === 'hold'
					? await holdLoginEmails(actor, ids)
					: data.action === 'cancel'
						? await cancelLoginEmails(actor, ids)
						: data.action === 'cadence'
							? await setCadence(actor, Number(data.cadenceSeconds))
							: null;
	if (!r) throw error(400, 'Unknown action');
	return r.ok ? json(r) : json({ message: r.message }, { status: 400 });
};
