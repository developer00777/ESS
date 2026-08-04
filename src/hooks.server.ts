import type { Handle } from '@sveltejs/kit';
import {
	getAccessTokenCookie,
	getRefreshTokenCookie,
	verifyAccessToken,
	verifyAndRotateRefreshToken,
	issueAccessToken,
	issueRefreshToken,
	setAuthCookies,
	clearAuthCookies
} from '$lib/server/auth';
import { db } from '$lib/server/db/postgres';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { startProhancePoller } from '$lib/server/prohance';

// Kicks off the ProHance attendance poller with the server process. No-op
// unless PROHANCE_BASE_URL + Prohance_API_KEY are set; guarded internally
// against dev-HMR double starts.
startProhancePoller();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const accessToken = getAccessTokenCookie(event.cookies);
	if (accessToken) {
		const user = await verifyAccessToken(accessToken);
		if (user) {
			event.locals.user = user;
			return resolve(event);
		}
	}

	// Access token missing/expired — try to rotate via refresh token.
	const refreshToken = getRefreshTokenCookie(event.cookies);
	if (refreshToken) {
		const rotated = await verifyAndRotateRefreshToken(refreshToken);
		if (rotated) {
			const [dbUser] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
			if (dbUser && dbUser.isActive) {
				const sessionUser = {
					id: dbUser.id,
					email: dbUser.email,
					role: dbUser.role,
					fullName: dbUser.fullName,
					teamId: dbUser.teamId,
					mustChangePassword: dbUser.mustChangePassword
				};
				const newAccessToken = await issueAccessToken(sessionUser);
				const newRefreshToken = await issueRefreshToken(dbUser.id);
				setAuthCookies(event.cookies, newAccessToken, newRefreshToken);
				event.locals.user = sessionUser;
				return resolve(event);
			}
		}
		clearAuthCookies(event.cookies);
	}

	return resolve(event);
};
