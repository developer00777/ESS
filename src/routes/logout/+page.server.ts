import { redirect, type Actions } from '@sveltejs/kit';
import { clearAuthCookies, getRefreshTokenCookie, verifyAndRotateRefreshToken } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const refreshToken = getRefreshTokenCookie(cookies);
		if (refreshToken) {
			await verifyAndRotateRefreshToken(refreshToken);
		}
		clearAuthCookies(cookies);
		throw redirect(303, '/login');
	}
};
