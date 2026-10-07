import { error, json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasCap } from '$lib/server/capabilities';
import { addItem, getMeeting, linkZoomUser, listMeetings, pasteNotes, publishMeeting, reconcileZoom, updateItem } from '$lib/server/meetings/service';
import { readStatus, zoomConfigured } from '$lib/server/zoom/client';
import type { Result } from '$lib/server/tasks/service';

/**
 * Champ Hub meetings and minutes. Rules live in
 * src/lib/server/meetings/service.ts; Zoom's own events arrive at
 * /api/zoom/webhook.
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

const send = (r: Result<Record<string, unknown>>) => (r.ok ? json(r) : json({ message: r.message }, { status: r.status ?? 400 }));
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export const GET: RequestHandler = async (event) => {
	const user = me(event);
	const [a] = event.params.path.split('/');
	if (!a) return json({ ok: true, meetings: await listMeetings(user), zoom: zoomConfigured() });
	if (a === 'zoom-status') {
		if (!hasCap(user, 'system.zoom')) throw error(403, 'Only a Super Admin can see this');
		return json({ configured: zoomConfigured(), ...(await readStatus()) });
	}
	return send(await getMeeting(user, id(a)));
};

export const POST: RequestHandler = async (event) => {
	const user = me(event);
	const [a, b] = event.params.path.split('/');
	const data = await body(event);
	if (a === 'notes') {
		return send(await pasteNotes(user, { meetingId: str(data.meetingId) && UUID.test(String(data.meetingId)) ? String(data.meetingId) : null, topic: str(data.topic), date: str(data.date), notes: String(data.notes ?? '') }));
	}
	if (a === 'zoom-links') return send(await linkZoomUser(user, String(data.zoomKey ?? ''), str(data.userId) ?? null));
	if (a === 'zoom-reconcile') {
		if (!hasCap(user, 'system.zoom')) throw error(403, 'Only a Super Admin can do this');
		await reconcileZoom();
		return json({ ok: true });
	}
	const mid = id(a);
	if (b === 'items') return send(await addItem(user, mid, String(data.title ?? '')));
	if (b === 'publish') return send(await publishMeeting(user, mid));
	throw error(404, 'Not found');
};

export const PATCH: RequestHandler = async (event) => {
	const user = me(event);
	const [a, b] = event.params.path.split('/');
	if (a !== 'items' || !b) throw error(404, 'Not found');
	const data = await body(event);
	return send(
		await updateItem(user, id(b), {
			title: str(data.title),
			ownerId: data.ownerId === null ? null : str(data.ownerId),
			dueDate: data.dueDate === null ? null : str(data.dueDate),
			priority: str(data.priority),
			included: typeof data.included === 'boolean' ? data.included : undefined
		})
	);
};
