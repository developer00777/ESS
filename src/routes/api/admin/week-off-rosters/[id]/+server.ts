import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { weekOffRosters, weekOffAssignments, teams } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq } from 'drizzle-orm';
import { validateRosterInput } from '$lib/week-off';

/** Edits a saved roster. Super Admin only, matching creation. */
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin']);
	const id = event.params.id;
	const body = await event.request.json();

	const [existing] = await db.select().from(weekOffRosters).where(eq(weekOffRosters.id, id)).limit(1);
	if (!existing) throw error(404, 'Roster not found');

	const invalid = validateRosterInput(body);
	if (invalid) throw error(400, invalid);

	const teamId = typeof body.teamId === 'string' && body.teamId ? body.teamId : null;
	if (teamId) {
		const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
		if (!team) throw error(404, 'Team not found');
	}

	const isFixed = body.pattern === 'fixed';
	const rotationWeeks: number[][] | null = isFixed ? null : body.rotationWeeks;

	const [updated] = await db
		.update(weekOffRosters)
		.set({
			name: String(body.name).trim(),
			description: typeof body.description === 'string' ? body.description.trim() || null : null,
			pattern: body.pattern,
			weekdays: isFixed ? [...new Set(body.weekdays as number[])].sort() : null,
			rotationWeeks,
			cycleWeeks: rotationWeeks?.length ?? null,
			rotationAnchorDate: isFixed ? null : body.rotationAnchorDate,
			teamId,
			updatedAt: new Date()
		})
		.where(eq(weekOffRosters.id, id))
		.returning();

	await logActivity({
		actorUserId: actor.id,
		action: 'week_off_roster.update',
		targetType: 'week_off_roster',
		targetId: id,
		details: { name: updated.name, pattern: updated.pattern }
	});

	return json({ roster: updated });
};

/**
 * Deletes a roster. Refused while anyone is still assigned to it — the
 * assignment is what a calendar reads, so removing the pattern underneath it
 * would silently return those employees to Sat/Sun.
 */
export const DELETE: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin']);
	const id = event.params.id;

	const [existing] = await db.select().from(weekOffRosters).where(eq(weekOffRosters.id, id)).limit(1);
	if (!existing) throw error(404, 'Roster not found');

	const assigned = await db
		.select({ id: weekOffAssignments.id })
		.from(weekOffAssignments)
		.where(eq(weekOffAssignments.rosterId, id));
	if (assigned.length > 0) {
		throw error(
			409,
			`${assigned.length} employee(s) are still on this roster — move them to another one first`
		);
	}

	await db.delete(weekOffRosters).where(eq(weekOffRosters.id, id));

	await logActivity({
		actorUserId: actor.id,
		action: 'week_off_roster.delete',
		targetType: 'week_off_roster',
		targetId: id,
		details: { name: existing.name }
	});

	return json({ ok: true });
};
