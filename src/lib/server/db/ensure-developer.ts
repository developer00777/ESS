import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import * as schema from './schema';

/**
 * The developer's Super Admin login, run by start.sh on every boot.
 *
 * DEVELOPER_EMAIL       the login (nothing happens without it)
 * DEVELOPER_PASSWORD    optional; without it the developer signs in through
 *                       Clerk with an emailed code and chooses one then
 * DEVELOPER_FULL_NAME   optional, "Developer" by default
 *
 * Created once, when missing. An existing login with that email is left as it
 * is — its role, password and active flag are managed in the portal like
 * anyone else's — so removing the variable or demoting the account sticks.
 * Never stops the boot: a failure is logged and the portal starts anyway.
 */

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
// NO_PASSWORD_YET from ../password-state.ts. Repeated, not imported: the
// runtime image carries only this folder of src (see the Dockerfile).
const NO_PASSWORD_YET = '!no-password-yet';

async function main() {
	const email = process.env.DEVELOPER_EMAIL?.trim().toLowerCase();
	if (!email) return;
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const db = drizzle(pool, { schema });
	try {
		const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
		if (existing) {
			console.log(`Developer login (${email}) already present, leaving it as it is.`);
			return;
		}
		const password = process.env.DEVELOPER_PASSWORD;
		const [created] = await db
			.insert(schema.users)
			.values({
				email,
				passwordHash: password ? await hash(password, ARGON2_OPTS) : NO_PASSWORD_YET,
				role: 'super_admin',
				fullName: process.env.DEVELOPER_FULL_NAME?.trim() || 'Developer',
				isActive: true,
				// Without a password they choose one right after the first sign-in.
				mustChangePassword: !password
			})
			.returning({ id: schema.users.id });
		await db.insert(schema.employeeProfiles).values({ userId: created.id });
		console.log(`Developer login (${email}) created as Super Admin.`);
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error('Could not create the developer login:', err);
});
