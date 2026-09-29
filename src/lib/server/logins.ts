import { randomBytes } from 'node:crypto';
import { db } from '$lib/server/db/postgres';
import { customRoles, employeeProfiles, holidayCalendars, shiftGroups, teams, users } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { hashPassword, type Role, type SessionUser } from '$lib/server/auth';
import { logActivity } from '$lib/server/db/mongo';
import { sendWelcomeEmail } from '$lib/server/mailer';
import { hasCap, invalidateCapabilities } from '$lib/server/capabilities';
import { CHIEF_PICK } from '$lib/chief';

/**
 * Creating one login. Shared by the People form and Champ's "create a login"
 * card, so both apply exactly the same rules.
 *
 * The access a new login gets is chosen as one value:
 *   "base:<role>"  a base role — Employee, Team Lead, HR Admin, Super Admin
 *   "named:<id>"   a named role a Super Admin created (IT Support, …), which
 *                  also fixes the base role to the one it starts from
 */

/** The base roles `actor` may create. */
export function creatableBaseRoles(actor: SessionUser): Role[] {
	if (actor.role === 'super_admin') return ['super_admin', 'admin', 'team_lead', 'employee'];
	if (actor.role === 'admin') return ['team_lead', 'employee'];
	if (actor.role === 'team_lead') return ['employee'];
	// A named role with the create privilege (IT Support) makes Employees only:
	// anything more would let it hand out powers it does not hold.
	return hasCap(actor, 'people.create_login') ? ['employee'] : [];
}

export function canCreateLogins(actor: SessionUser): boolean {
	return actor.role === 'team_lead' || hasCap(actor, 'people.create_login');
}

export type NewLogin = {
	email: string;
	fullName: string;
	access: string;
	shiftGroupId: string;
	teamId?: string | null;
	/** A user id, CHIEF_PICK, or empty for none. */
	reportsTo?: string | null;
	hrUserId?: string | null;
};

export type CreateResult =
	| { success: false; message: string }
	| {
			success: true;
			userId: string;
			email: string;
			tempPassword: string;
			emailSent: boolean;
			emailError: string | null;
	  };

const UUID = /^[0-9a-f-]{36}$/i;

export function generateTemporaryPassword(): string {
	return randomBytes(9).toString('base64url');
}

export async function createLogin(actor: SessionUser, input: NewLogin): Promise<CreateResult> {
	const fail = (message: string) => ({ success: false as const, message });
	const email = input.email.trim().toLowerCase();
	const fullName = input.fullName.trim();

	if (!canCreateLogins(actor)) return fail('You do not have the privilege to create logins');
	if (!email || !fullName) return fail('Email and name are required');
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That email address does not look right');
	if (!input.shiftGroupId) return fail('Shift group is required');

	// --- Access
	let role: Role = 'employee';
	let customRoleId: string | null = null;
	let accessLabel = 'Employee';
	const access = input.access || 'base:employee';
	if (access.startsWith('named:')) {
		if (!hasCap(actor, 'people.assign_roles')) return fail('Only a Super Admin can give a named role');
		const id = access.slice(6);
		const [named] = UUID.test(id) ? await db.select().from(customRoles).where(eq(customRoles.id, id)).limit(1) : [];
		if (!named) return fail('That named role no longer exists');
		role = named.baseRole;
		customRoleId = named.id;
		accessLabel = named.name;
	} else {
		role = access.slice(5) as Role;
		if (!creatableBaseRoles(actor).includes(role)) {
			return fail(`You may not create ${role.replace('_', ' ')} logins`);
		}
		accessLabel = role;
	}

	// --- Team
	let teamId: string | null = null;
	if (actor.role === 'team_lead') {
		const [team] = await db.select().from(teams).where(eq(teams.id, actor.teamId ?? '')).limit(1);
		if (!team?.canCreateEmployeeLogins) {
			return fail('This Team Lead does not have permission to create employee logins');
		}
		teamId = actor.teamId;
	} else if (input.teamId) {
		if (!UUID.test(input.teamId)) return fail('Pick a team from the list');
		const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, input.teamId)).limit(1);
		if (!team) return fail('That team no longer exists');
		teamId = team.id;
	}

	// --- Reporting line. A Team Lead's new joiner reports to them, as before.
	let reportsTo: string | null = actor.role === 'team_lead' ? actor.id : null;
	let reportsToChief = false;
	if (actor.role !== 'team_lead' && input.reportsTo) {
		if (input.reportsTo === CHIEF_PICK) {
			reportsToChief = true;
		} else {
			if (!UUID.test(input.reportsTo)) return fail('Pick a reporting manager from the list');
			const [m] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.reportsTo)).limit(1);
			if (!m) return fail('That reporting manager no longer exists');
			reportsTo = m.id;
		}
	}

	let hrUserId: string | null = null;
	if (input.hrUserId) {
		if (!UUID.test(input.hrUserId)) return fail('Pick a concerned HR from the list');
		const [hr] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.hrUserId)).limit(1);
		if (!hr) return fail('That HR person no longer exists');
		hrUserId = hr.id;
	}

	const [eligibleGroup] = await db
		.select({ id: shiftGroups.id })
		.from(shiftGroups)
		.innerJoin(holidayCalendars, eq(holidayCalendars.shiftGroupId, shiftGroups.id))
		.where(and(eq(shiftGroups.id, input.shiftGroupId), eq(holidayCalendars.status, 'published')))
		.limit(1);
	if (!eligibleGroup) return fail('Selected shift group has no published holiday calendar');

	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (existing) return fail('A login with that email already exists');

	const tempPassword = generateTemporaryPassword();
	const passwordHash = await hashPassword(tempPassword);

	const [created] = await db
		.insert(users)
		.values({
			email,
			passwordHash,
			role,
			customRoleId,
			fullName,
			teamId,
			reportsTo,
			isActive: true,
			mustChangePassword: true,
			// Readable on the roster until this person sets their own password,
			// so a mail that never arrives doesn't strand the account.
			temporaryPassword: tempPassword
		})
		.returning();

	await db.insert(employeeProfiles).values({
		userId: created.id,
		shiftGroupId: input.shiftGroupId,
		hrUserId,
		reportsToChief,
		directReportingAuthority: reportsToChief ? 'Chief' : null
	});
	invalidateCapabilities(created.id);

	// The password stays in the response too: whoever adds a single joiner is
	// often sitting with them, and mail can be slow or misconfigured.
	const mail = await sendWelcomeEmail({
		fullName: created.fullName,
		username: created.email,
		temporaryPassword: tempPassword
	});

	await logActivity({
		actorUserId: actor.id,
		action: 'user.create',
		targetType: 'user',
		targetId: created.id,
		details: {
			role,
			namedRole: customRoleId ? accessLabel : null,
			teamId,
			shiftGroupId: input.shiftGroupId,
			welcomeEmail: mail.ok ? 'sent' : 'failed',
			welcomeEmailId: mail.id ?? null,
			welcomeEmailError: mail.ok ? null : (mail.error ?? null)
		}
	});

	return {
		success: true,
		userId: created.id,
		tempPassword,
		email,
		emailSent: mail.ok,
		emailError: mail.ok ? null : (mail.error ?? null)
	};
}
