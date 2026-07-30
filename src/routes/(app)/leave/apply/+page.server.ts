import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { leaveTypes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const types = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));
	return { types };
};
