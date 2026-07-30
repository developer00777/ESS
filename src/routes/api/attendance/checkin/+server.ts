import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { attendance } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/rbac';
import { and, eq } from 'drizzle-orm';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const { lat, lng } = await event.request.json().catch(() => ({ lat: null, lng: null }));

	const today = new Date().toISOString().slice(0, 10);

	const [existing] = await db
		.select()
		.from(attendance)
		.where(and(eq(attendance.userId, user.id), eq(attendance.date, today)))
		.limit(1);

	if (existing?.checkInAt) {
		throw error(400, 'Already checked in today');
	}

	if (existing) {
		const [updated] = await db
			.update(attendance)
			.set({ checkInAt: new Date(), checkInLat: lat, checkInLng: lng })
			.where(eq(attendance.id, existing.id))
			.returning();
		return json({ attendance: updated });
	}

	const [created] = await db
		.insert(attendance)
		.values({
			userId: user.id,
			date: today,
			checkInAt: new Date(),
			checkInLat: lat,
			checkInLng: lng,
			source: 'manual'
		})
		.returning();

	return json({ attendance: created }, { status: 201 });
};
