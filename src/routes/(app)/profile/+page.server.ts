import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import { employeeProfiles, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	const [profile] = await db
		.select()
		.from(employeeProfiles)
		.where(eq(employeeProfiles.userId, user.id))
		.limit(1);

	const [userRow] = await db
		.select({
			id: users.id,
			email: users.email,
			fullName: users.fullName,
			role: users.role,
			teamId: users.teamId
		})
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	return { profile: profile ?? null, userRow };
};

export const actions: Actions = {
	updateSelfService: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();

		const field = (name: string) => String(form.get(name) ?? '') || null;

		const [existing] = await db
			.select()
			.from(employeeProfiles)
			.where(eq(employeeProfiles.userId, user.id))
			.limit(1);

		const values = {
			phone: field('phone'),
			personalEmail: field('personalEmail'),
			address: field('address'),
			permanentAddress: field('permanentAddress'),

			emergencyContactName: field('emergencyContactName'),
			emergencyContactRelationship: field('emergencyContactRelationship'),
			emergencyContactPhone: field('emergencyContactPhone'),

			fatherName: field('fatherName'),
			motherName: field('motherName'),
			maritalStatus: field('maritalStatus'),
			spouseName: field('spouseName'),

			bankAccountNumber: field('bankAccountNumber'),
			bankAccountHolderName: field('bankAccountHolderName'),
			bankName: field('bankName'),
			bankIfsc: field('bankIfsc'),

			aadharNumber: field('aadharNumber'),
			panNumber: field('panNumber'),
			uanNumber: field('uanNumber'),

			updatedAt: new Date()
		};

		if (existing) {
			await db.update(employeeProfiles).set(values).where(eq(employeeProfiles.userId, user.id));
		} else {
			await db.insert(employeeProfiles).values({ userId: user.id, ...values });
		}

		await logActivity({
			actorUserId: user.id,
			action: 'profile.self_update',
			targetType: 'employee_profile',
			targetId: user.id
		});

		return { success: true };
	}
};
