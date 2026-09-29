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
import { startAnnouncementScheduler } from '$lib/server/announcements';
import { loadCapabilities } from '$lib/server/capabilities';
import { startChatScheduler } from '$lib/server/chat/scheduler';
import type { SessionUser } from '$lib/server/auth';

// Kicks off the ProHance attendance poller with the server process. No-op
// unless PROHANCE_BASE_URL + Prohance_API_KEY are set; guarded internally
// against dev-HMR double starts.
startProhancePoller();

// Sends the email copy of scheduled announcements once they go live.
startAnnouncementScheduler();

// Champ Chat: roster sync, reminders, digests, celebrations, retention.
startChatScheduler();

/** Privileges ride along on the request user (src/lib/capabilities.ts). */
async function withCapabilities(user: SessionUser): Promise<SessionUser> {
	const loaded = await loadCapabilities(user);
	return { ...user, capabilities: loaded.caps, customRoleName: loaded.customRoleName };
}

// Background work (chat notifications, cards, Champ in chat) is started with
// `void promise.catch(...)`; this is the net under anything that slips
// through, so one failed notification can never take the whole portal down.
const g = globalThis as { __essRejectionNet?: boolean };
if (!g.__essRejectionNet) {
	g.__essRejectionNet = true;
	process.on('unhandledRejection', (reason) => {
		console.error('[ess] unhandled rejection:', reason instanceof Error ? (reason.stack ?? reason.message) : reason);
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const accessToken = getAccessTokenCookie(event.cookies);
	if (accessToken) {
		const user = await verifyAccessToken(accessToken);
		if (user) {
			event.locals.user = await withCapabilities(user);
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
				event.locals.user = await withCapabilities(sessionUser);
				return resolve(event);
			}
		}
		clearAuthCookies(event.cookies);
	}

	return resolve(event);
};
