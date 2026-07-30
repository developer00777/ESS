import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { users, employeeProfiles } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	const [dbUser] = await db
		.select({ reportsTo: users.reportsTo })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const idsToShow = new Set<string>();
	if (dbUser?.reportsTo) idsToShow.add(dbUser.reportsTo);

	const superAdmins = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, 'super_admin'));
	superAdmins.forEach((a) => idsToShow.add(a.id));
	idsToShow.delete(user.id);

	if (idsToShow.size === 0) {
		return { contacts: [] };
	}

	const rows = await db
		.select({
			id: users.id,
			fullName: users.fullName,
			email: users.email,
			role: users.role,
			designation: employeeProfiles.designation,
			officeTimings: employeeProfiles.officeTimings
		})
		.from(users)
		.leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
		.where(inArray(users.id, [...idsToShow]));

	return { contacts: rows };
};
