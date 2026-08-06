import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { weekOffRosters } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq } from 'drizzle-orm';
import { assignRoster, clearRoster, canAssignTo } from '$lib/server/week-off';

/**
 * Assigns (or clears) an employee's week-off roster. Team managers may do this
 * for their own team only; Super Admin and Admin for anyone. The assignment is
 * what the leave and attendance calendars resolve against, so this single call
 * is what makes a published rotation show up on someone's calendar.
 *
 * Body: { rosterId: string | null, effectiveFrom?: 'YYYY-MM-DD', note?: string }
 */
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin', 'admin', 'team_lead']);
	const userId = event.params.id;
	const { rosterId, effectiveFrom, note } = await event.request.json();

	if (rosterId !== null && typeof rosterId !== 'string') {
		throw error(400, 'rosterId must be a roster id or null');
	}

	if (!(await canAssignTo(actor, userId))) {
		throw error(403, 'You can only set week-offs for your own team');
	}

	// Defaults to today, so the common case ("this is their roster from now on")
	// needs no date input at all.
	const from =
		typeof effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
			? effectiveFrom
			: new Date().toISOString().slice(0, 10);

	if (rosterId === null) {
		await clearRoster(userId, from);
		await logActivity({
			actorUserId: actor.id,
			action: 'week_off_assignment.clear',
			targetType: 'user',
			targetId: userId,
			details: { effectiveFrom: from }
		});
		return json({ assignment: null });
	}

	const [roster] = await db
		.select()
		.from(weekOffRosters)
		.where(eq(weekOffRosters.id, rosterId))
		.limit(1);
	if (!roster) throw error(404, 'Roster not found');

	// A draft is still being authored; only a Super Admin may apply one, and only
	// to preview it. Team leads are limited to published rosters.
	if (roster.status !== 'published' && actor.role !== 'super_admin') {
		throw error(400, 'That roster has not been published yet');
	}
	// A team-scoped roster must not leak onto another team's employees.
	if (roster.teamId && actor.role === 'team_lead' && roster.teamId !== actor.teamId) {
		throw error(403, 'That roster belongs to another team');
	}

	const assignment = await assignRoster({
		userId,
		rosterId,
		effectiveFrom: from,
		assignedBy: actor.id,
		note: typeof note === 'string' ? note : null
	});

	await logActivity({
		actorUserId: actor.id,
		action: 'week_off_assignment.set',
		targetType: 'user',
		targetId: userId,
		details: { rosterId, rosterName: roster.name, effectiveFrom: from }
	});

	return json({ assignment });
};
