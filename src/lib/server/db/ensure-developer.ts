import { eq } from 'drizzle-orm';
import { hashPassword } from '../password-hash';
import * as schema from './schema';
import { openScriptDb } from './script-db';

/**
 * The developer's Super Admin login, run by start.sh on every boot.
 *
 * DEVELOPER_EMAIL       the login (nothing happens without it)
 * DEVELOPER_PASSWORD    optional; without it the developer signs in through
 *                       Clerk with an emailed code and chooses one then
 * DEVELOPER_FULL_NAME   optional, "Developer" by default
 *
 * It is a hidden login (users.hidden): a Super Admin that no list, count,
 * chart or picker shows, and that other Super Admins cannot open, edit or
 * delete. It is not a person in the organisation.
 *
 * Created once, when missing, and marked hidden on every boot. Its password
 * and active flag are otherwise left as they are.
 * Never stops the boot: a failure is logged and the portal starts anyway.
 */

// NO_PASSWORD_YET from ../password-state.ts. Repeated, not imported: the
// runtime image carries only this folder of src (see the Dockerfile).
const NO_PASSWORD_YET = '!no-password-yet';

async function main() {
	const email = process.env.DEVELOPER_EMAIL?.trim().toLowerCase();
	if (!email) return;
	const db = openScriptDb();
	{
		const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
		if (existing) {
			await db.update(schema.users).set({ hidden: true }).where(eq(schema.users.id, existing.id));
			console.log(`Developer login (${email}) already present, kept hidden.`);
			return;
		}
		const password = process.env.DEVELOPER_PASSWORD;
		const [created] = await db
			.insert(schema.users)
			.values({
				email,
				passwordHash: password ? await hashPassword(password) : NO_PASSWORD_YET,
				role: 'super_admin',
				fullName: process.env.DEVELOPER_FULL_NAME?.trim() || 'Developer',
				isActive: true,
				hidden: true,
				// Without a password they choose one right after the first sign-in.
				mustChangePassword: !password
			})
			.returning({ id: schema.users.id });
		await db.insert(schema.employeeProfiles).values({ userId: created.id });
		console.log(`Developer login (${email}) created as Super Admin.`);
	}
}

main().catch((err) => {
	console.error('Could not create the developer login:', err);
});
