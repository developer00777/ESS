import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { leaveTypes, employeeProfiles } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { checkPinkLeaveEligibility } from '$lib/server/leave-eligibility';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	const allTypes = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));

	const [profile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, user.id))
		.limit(1);

	const verdict = checkPinkLeaveEligibility(
		profile
			? {
					gender: profile.gender,
					dateOfJoining: profile.dateOfJoining,
					dateOfConfirmation: profile.dateOfConfirmation,
					pinkLeaveEligibleOverride: profile.pinkLeaveEligibleOverride
				}
			: null
	);

	// Restricted types are omitted entirely rather than shown disabled — nobody is
	// presented with a leave type they cannot use, or told on the employee-facing
	// screen that they don't qualify. The API enforces the same rule.
	const types = allTypes.filter((t) =>
		t.genderEligibility || t.monthlyQuotaDays ? verdict.eligible : true
	);

	return { types };
};
