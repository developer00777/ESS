import { env as publicEnv } from '$env/dynamic/public';
import { buildClerkProps } from 'svelte-clerk/server';
import type { LayoutServerLoad } from './$types';
import { clerkAuthActive } from '$lib/server/clerk';

/**
 * While Clerk is the sign-in, every page loads Clerk's browser script (it keeps
 * the short-lived session cookie fresh for the portal's fetch calls) with the
 * server's view of the session, so the first paint already knows who is in.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	if (!clerkAuthActive() || !locals.auth) return { clerk: null };
	return {
		clerk: {
			publishableKey: publicEnv.PUBLIC_CLERK_PUBLISHABLE_KEY,
			...buildClerkProps(locals.auth())
		}
	};
};
