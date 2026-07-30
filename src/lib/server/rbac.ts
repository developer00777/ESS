import { error, type RequestEvent } from '@sveltejs/kit';
import type { Role, SessionUser } from './auth';

/** Server-side role guard. Throws 401/403 — never trust client-side role checks alone (PRD §5). */
export function requireUser(event: RequestEvent): SessionUser {
	if (!event.locals.user) {
		throw error(401, 'Authentication required');
	}
	return event.locals.user;
}

export function requireRole(event: RequestEvent, allowed: Role[]): SessionUser {
	const user = requireUser(event);
	if (!allowed.includes(user.role)) {
		throw error(403, 'Insufficient privileges');
	}
	return user;
}

export function isSuperAdmin(user: SessionUser): boolean {
	return user.role === 'super_admin';
}

export function isAdmin(user: SessionUser): boolean {
	return user.role === 'admin';
}

export function isTeamLead(user: SessionUser): boolean {
	return user.role === 'team_lead';
}

/** True if `user` may act on behalf of `targetUserId` (self, or their team lead / admin / super admin). */
export function canActOnUser(
	user: SessionUser,
	targetUserId: string,
	targetTeamId: string | null
): boolean {
	if (user.id === targetUserId) return true;
	if (isSuperAdmin(user)) return true;
	if (isAdmin(user)) return true;
	if (isTeamLead(user) && targetTeamId && user.teamId === targetTeamId) return true;
	return false;
}

/**
 * Role-creation hierarchy (PRD §3): Super Admin creates anyone; Admin creates Team Leads
 * and Employees only; Team Lead creates Employees only, scoped to their own team
 * (team-id/flag check happens separately in the route handler).
 */
export function canCreateRole(actor: SessionUser, targetRole: Role): boolean {
	switch (actor.role) {
		case 'super_admin':
			return true;
		case 'admin':
			return targetRole === 'team_lead' || targetRole === 'employee';
		case 'team_lead':
			return targetRole === 'employee';
		default:
			return false;
	}
}
