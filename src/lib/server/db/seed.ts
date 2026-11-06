import { eq } from 'drizzle-orm';
import { hashPassword } from '../password-hash';
import * as schema from './schema';
import { openScriptDb } from './script-db';

const db = openScriptDb();


// Set these in Railway (or .env locally) before seeding — no default credential or PII
// ships in the repo. Whoever sets SUPER_ADMIN_EMAIL/PASSWORD owns first login; they fill
// in the rest of their own profile (designation, bank details, DOB, etc.) via the app's
// Profile page afterward, same as any other employee would.
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SUPER_ADMIN_FULL_NAME = process.env.SUPER_ADMIN_FULL_NAME ?? 'Super Admin';

async function seed() {
	if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
		throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set to run the seed script');
	}

	// Seed exactly when the designated super admin is missing. Counting all users
	// would wrongly skip seeding once any other real employee is added.
	const [existing] = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, SUPER_ADMIN_EMAIL.toLowerCase()))
		.limit(1);
	if (existing) {
		console.log(`Super admin (${SUPER_ADMIN_EMAIL}) already present, skipping seed.`);
		return;
	}

	console.log('Seeding Champ HR ESS Portal...');

	const [dept] = await db
		.insert(schema.departments)
		.values({ name: 'HR Team' })
		.returning();

	const [team] = await db
		.insert(schema.teams)
		.values({ name: 'HR Team', departmentId: dept.id })
		.returning();

	const superAdminPasswordHash = await hashPassword(SUPER_ADMIN_PASSWORD);
	const [superAdmin] = await db
		.insert(schema.users)
		.values({
			email: SUPER_ADMIN_EMAIL.toLowerCase(),
			passwordHash: superAdminPasswordHash,
			role: 'super_admin',
			fullName: SUPER_ADMIN_FULL_NAME,
			teamId: team.id,
			isActive: true,
			mustChangePassword: false
		})
		.returning();

	await db.update(schema.teams).set({ teamLeadId: superAdmin.id }).where(eq(schema.teams.id, team.id));

	await db.insert(schema.employeeProfiles).values({ userId: superAdmin.id });

	// No leave types or allocations are seeded. The real types come from the
	// leave policy document published via Admin → Publish Policies, and
	// balances accrue from those types automatically (see
	// $lib/server/leave-accrual). Seeding placeholders here once produced
	// fictional Casual/Sick/Earned 12-day balances that shadowed the policy.

	console.log('Seed complete:');
	// Never the password: container logs are kept by Cloudflare.
	console.log(`  Super Admin: ${SUPER_ADMIN_EMAIL}`);
}

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});
