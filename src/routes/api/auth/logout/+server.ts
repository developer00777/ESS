import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAuthCookies, getRefreshTokenCookie, verifyAndRotateRefreshToken } from '$lib/server/auth';
import { clerk, clerkAuthActive } from '$lib/server/clerk';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (clerkAuthActive() && locals.auth) {
		const { sessionId } = locals.auth();
		if (sessionId) await clerk().sessions.revokeSession(sessionId).catch(() => {});
		cookies.delete('__session', { path: '/' });
		return json({ ok: true });
	}
	const refreshToken = getRefreshTokenCookie(cookies);
	if (refreshToken) {
		// Rotating (and thus revoking) the refresh token invalidates it immediately.
		await verifyAndRotateRefreshToken(refreshToken);
	}
	clearAuthCookies(cookies);
	return json({ ok: true });
};
