import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	verifyPassword,
	hashPassword,
	issueAccessToken,
	issueRefreshToken,
	setAuthCookies
} from '$lib/server/auth';
import { requireUser } from '$lib/server/rbac';
import { logActivity } from '$lib/server/db/mongo';

export const POST: RequestHandler = async (event) => {
	const actor = requireUser(event);
	const { currentPassword, newPassword } = await event.request.json();

	if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !newPassword) {
		throw error(400, 'currentPassword and newPassword are required');
	}
	if (newPassword.length < 8) {
		throw error(400, 'New password must be at least 8 characters');
	}

	const [dbUser] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
	if (!dbUser) {
		throw error(401, 'Authentication required');
	}

	const currentOk = await verifyPassword(dbUser.passwordHash, currentPassword);
	if (!currentOk) {
		throw error(401, 'Current password is incorrect');
	}

	const passwordHash = await hashPassword(newPassword);

	const [updated] = await db
		.update(users)
		.set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
		.where(eq(users.id, actor.id))
		.returning();

	const sessionUser = {
		id: updated.id,
		email: updated.email,
		role: updated.role,
		fullName: updated.fullName,
		teamId: updated.teamId,
		mustChangePassword: updated.mustChangePassword
	};

	const accessToken = await issueAccessToken(sessionUser);
	const refreshToken = await issueRefreshToken(updated.id);
	setAuthCookies(event.cookies, accessToken, refreshToken);

	await logActivity({
		actorUserId: actor.id,
		action: 'password.change',
		targetType: 'user',
		targetId: actor.id
	});

	return json({ user: sessionUser });
};
