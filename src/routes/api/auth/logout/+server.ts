import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAuthCookies, getRefreshTokenCookie, verifyAndRotateRefreshToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	const refreshToken = getRefreshTokenCookie(cookies);
	if (refreshToken) {
		// Rotating (and thus revoking) the refresh token invalidates it immediately.
		await verifyAndRotateRefreshToken(refreshToken);
	}
	clearAuthCookies(cookies);
	return json({ ok: true });
};
