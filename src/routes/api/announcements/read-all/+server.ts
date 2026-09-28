import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/rbac';
import { recordReadMany, visibleIds } from '$lib/server/announcements';

/** "Mark all read" on the Updates list. Ids the person cannot see are ignored. */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const body = await event.request.json().catch(() => ({}));
	const ids: unknown = body?.ids;
	if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === 'string')) {
		throw error(400, 'ids must be a list of announcement ids');
	}
	const allowed = await visibleIds(user.id, ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)));
	await recordReadMany(allowed, user.id);
	return json({ ok: true, marked: allowed.length });
};
