import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Announcements now live in Champ Chat's #announcements channel. */
export const load: PageServerLoad = () => {
	throw redirect(307, '/chat?c=announcements');
};
