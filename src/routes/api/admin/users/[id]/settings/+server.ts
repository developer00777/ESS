import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/rbac';
import { db } from '$lib/server/db/postgres';
import { users, teams, employeeProfiles, shiftGroups, weekOffRosters } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/db/mongo';
import { eq, and, ne } from 'drizzle-orm';
import type { Role } from '$lib/server/auth';
import { assignRoster, clearRoster } from '$lib/server/week-off';

const ROLES: Role[] = ['super_admin', 'admin', 'team_lead', 'employee'];

/**
 * Saves every org setting for one employee in a single call: role, reporting
 * manager, assigned HR, shift group, office timings and week-off roster.
 *
 * One endpoint rather than six because the roster panel edits them together —
 * six separate PUTs would half-apply if one failed, leaving the person in a
 * state nobody chose. Only the fields present in the body are touched, so the
 * panel can send just what changed.
 *
 * Super Admin only: role and reporting line decide who approves what, which is
 * the sharpest privilege in the portal.
 */
export const PUT: RequestHandler = async (event) => {
	const actor = requireRole(event, ['super_admin']);
	const userId = event.params.id;
	const body = await event.request.json();

	const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) throw error(404, 'Employee not found');

	const [profile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, userId))
		.limit(1);
	if (!profile) throw error(404, 'Employee profile not found');

	const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
	const changes: Record<string, unknown> = {};

	// --- Role -----------------------------------------------------------------
	let teamCreated: string | null = null;
	if (has('role') && body.role !== target.role) {
		if (!ROLES.includes(body.role)) {
			throw error(400, `role must be one of: ${ROLES.join(', ')}`);
		}
		if (userId === actor.id) {
			throw error(400, 'You cannot change your own role');
		}
		// The portal must always retain someone who can administer it.
		if (target.role === 'super_admin' && body.role !== 'super_admin') {
			const remaining = await db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.role, 'super_admin'), ne(users.id, userId)));
			if (remaining.length === 0) {
				throw error(400, 'Cannot change the role of the only Super Admin account');
			}
		}
		changes.role = { from: target.role, to: body.role };
	}

	// --- Reporting manager ----------------------------------------------------
	// A cycle would make the approval chain unresolvable — managerFor() walks up
	// the line, so a loop would never terminate. But refusing the assignment is
	// the wrong answer: re-organisations legitimately invert a reporting line
	// ("Bhavana reports to Prasanna; now Prasanna reports to Deepak, who reports
	// to Bhavana"), and blocking that leaves the admin stuck with no way to
	// express what actually happened.
	//
	// So the assignment always wins. Anyone on the path who would close the loop
	// has their own line cleared, which is exactly what a promotion means: the
	// old chain no longer holds, and the freed person is re-pointed by the same
	// panel afterwards. Reported in the response so it is never silent.
	let loopBroken: { userId: string; fullName: string; previousManagerId: string }[] = [];
	if (has('reportsTo') && body.reportsTo !== target.reportsTo) {
		const managerId: string | null = body.reportsTo || null;
		if (managerId) {
			if (managerId === userId) {
				throw error(400, 'Someone cannot report to themselves');
			}
			const [manager] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, managerId))
				.limit(1);
			if (!manager) throw error(404, 'Reporting manager not found');

			// Walk up from the new manager. If we arrive back at this employee, the
			// step that points back at them is the one to cut.
			const path: { id: string; fullName: string; reportsTo: string | null }[] = [];
			let cursor: string | null = managerId;
			const seen = new Set<string>();
			while (cursor && !seen.has(cursor)) {
				seen.add(cursor);
				const [row] = await db
					.select({ id: users.id, fullName: users.fullName, reportsTo: users.reportsTo })
					.from(users)
					.where(eq(users.id, cursor))
					.limit(1);
				if (!row) break;
				path.push(row);
				if (row.reportsTo === userId) {
					// This person's line closes the loop; clear it.
					loopBroken.push({
						userId: row.id,
						fullName: row.fullName,
						previousManagerId: userId
					});
					break;
				}
				cursor = row.reportsTo;
			}
		}
		changes.reportsTo = { from: target.reportsTo, to: managerId };
	}

	// --- Assigned HR ----------------------------------------------------------
	if (has('hrUserId') && body.hrUserId !== profile.hrUserId) {
		const hrId: string | null = body.hrUserId || null;
		if (hrId) {
			if (hrId === userId) throw error(400, 'Someone cannot be their own HR contact');
			const [hr] = await db.select({ id: users.id }).from(users).where(eq(users.id, hrId)).limit(1);
			if (!hr) throw error(404, 'HR contact not found');
		}
		changes.hrUserId = { from: profile.hrUserId, to: hrId };
	}

	// --- Shift group ----------------------------------------------------------
	if (has('shiftGroupId') && body.shiftGroupId !== profile.shiftGroupId) {
		const groupId: string | null = body.shiftGroupId || null;
		if (groupId) {
			const [group] = await db
				.select({ id: shiftGroups.id })
				.from(shiftGroups)
				.where(eq(shiftGroups.id, groupId))
				.limit(1);
			if (!group) throw error(404, 'Shift group not found');
		}
		changes.shiftGroupId = { from: profile.shiftGroupId, to: groupId };
	}

	// --- Office timings -------------------------------------------------------
	// Free text ("9:00 AM - 6:00 PM"); it bounds how far a check-out may sit from
	// its check-in when pairing an overnight shift.
	if (has('officeTimings') && body.officeTimings !== profile.officeTimings) {
		const timings =
			typeof body.officeTimings === 'string' && body.officeTimings.trim()
				? body.officeTimings.trim().slice(0, 120)
				: null;
		changes.officeTimings = { from: profile.officeTimings, to: timings };
	}

	if (has('shiftType') && body.shiftType !== profile.shiftType) {
		const shiftType =
			typeof body.shiftType === 'string' && body.shiftType.trim()
				? body.shiftType.trim().slice(0, 60)
				: null;
		changes.shiftType = { from: profile.shiftType, to: shiftType };
	}

	// --- Week-off roster ------------------------------------------------------
	let rosterApplied: string | null | undefined;
	if (has('weekOffRosterId')) {
		const rosterId: string | null = body.weekOffRosterId || null;
		if (rosterId) {
			const [roster] = await db
				.select({ id: weekOffRosters.id })
				.from(weekOffRosters)
				.where(eq(weekOffRosters.id, rosterId))
				.limit(1);
			if (!roster) throw error(404, 'Week-off roster not found');
		}
		rosterApplied = rosterId;
	}

	// --- Apply ----------------------------------------------------------------
	const userPatch: Record<string, unknown> = {};
	if (changes.role) userPatch.role = (changes.role as { to: Role }).to;
	if (changes.reportsTo) userPatch.reportsTo = (changes.reportsTo as { to: string | null }).to;
	if (Object.keys(userPatch).length > 0 || loopBroken.length > 0) {
		// Cutting the old line and setting the new one are one change: leaving
		// either half applied would either strand a loop or drop a reporting line
		// for no reason.
		await db.transaction(async (tx) => {
			for (const broken of loopBroken) {
				await tx
					.update(users)
					.set({ reportsTo: null, updatedAt: new Date() })
					.where(eq(users.id, broken.userId));
			}
			if (Object.keys(userPatch).length > 0) {
				userPatch.updatedAt = new Date();
				await tx.update(users).set(userPatch).where(eq(users.id, userId));
			}
		});
	}

	const profilePatch: Record<string, unknown> = {};
	for (const key of ['hrUserId', 'shiftGroupId', 'officeTimings', 'shiftType'] as const) {
		if (changes[key]) profilePatch[key] = (changes[key] as { to: unknown }).to;
	}
	if (Object.keys(profilePatch).length > 0) {
		profilePatch.updatedAt = new Date();
		await db.update(employeeProfiles).set(profilePatch).where(eq(employeeProfiles.userId, userId));
	}

	if (rosterApplied !== undefined) {
		const today = new Date().toISOString().slice(0, 10);
		if (rosterApplied) {
			await assignRoster({
				userId,
				rosterId: rosterApplied,
				effectiveFrom: today,
				assignedBy: actor.id
			});
		} else {
			await clearRoster(userId, today);
		}
		changes.weekOffRosterId = { to: rosterApplied };
	}

	// A new Team Lead with no team has nothing to lead — the approval queues key
	// off team membership, so one is created rather than leaving them inert.
	if (changes.role && (changes.role as { to: Role }).to === 'team_lead' && !target.teamId) {
		const [team] = await db
			.insert(teams)
			.values({ name: `${target.fullName}'s Team`, teamLeadId: userId })
			.returning();
		await db.update(users).set({ teamId: team.id }).where(eq(users.id, userId));
		teamCreated = team.id;
	}

	if (Object.keys(changes).length === 0) {
		return json({ changed: false, changes: {} });
	}

	await logActivity({
		actorUserId: actor.id,
		action: 'user.settings_update',
		targetType: 'user',
		targetId: userId,
		details: { email: target.email, changes, teamCreated, loopBroken }
	});

	// loopBroken names whose reporting line was cleared to make room for this
	// one, so the panel can say so rather than leaving it to be discovered.
	return json({ changed: true, changes, teamCreated, loopBroken });
};
