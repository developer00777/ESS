import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { teams, users } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Access Control — what each role may do, and each team's privilege flags.
 *
 * Role is enforced by (app)/admin/+layout.server.ts.
 *
 * Read-only. The role rules are derived from code (src/lib/server/rbac.ts), not
 * from data, so there is nothing here to edit — making them editable would mean
 * building a permissions engine, which is a different job. The per-team flags
 * ARE data and are editable, but that needs its own endpoint; until it exists
 * this page states plainly that they are set at team creation.
 */
export const load: PageServerLoad = async () => {
	const lead = alias(users, 'lead');

	const teamRows = await db
		.select({
			id: teams.id,
			name: teams.name,
			teamLeadName: lead.fullName,
			canApproveLeave: teams.canApproveLeave,
			maxLeaveDaysAutoApprove: teams.maxLeaveDaysAutoApprove,
			canEditTeamShiftWindow: teams.canEditTeamShiftWindow,
			canViewTeamPayrollCost: teams.canViewTeamPayrollCost,
			canCreateEmployeeLogins: teams.canCreateEmployeeLogins,
			canResolveGrievances: teams.canResolveGrievances
		})
		.from(teams)
		.leftJoin(lead, eq(lead.id, teams.teamLeadId))
		.orderBy(asc(teams.name));

	const roleCounts = await db
		.select({ role: users.role, teamId: users.teamId })
		.from(users)
		.where(eq(users.isActive, true));

	const byRole: Record<string, number> = {};
	for (const r of roleCounts) byRole[r.role] = (byRole[r.role] ?? 0) + 1;

	return { teamRows, byRole };
};
