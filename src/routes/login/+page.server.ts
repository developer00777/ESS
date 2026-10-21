import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}
	// Signed in to Clerk, but the email has no active portal login (never
	// created, deactivated, or deleted). Without this the sign-in box sees the
	// Clerk session, sends them to /dashboard, and they bounce straight back.
	return { noPortalAccount: Boolean(locals.auth?.().userId) };
};
