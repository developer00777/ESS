/**
 * Gives every active portal login a Clerk account with the SAME password, and
 * links the two (Clerk externalId = users.id, users.clerk_user_id = Clerk id).
 *
 * Passwords move as their Argon2id hashes: Clerk accepts `$argon2id$v=19$…`
 * digests as they are, so nobody's password is reset or ever seen.
 *
 *   npm run clerk:migrate -- --dry-run   show what would happen, change nothing
 *   npm run clerk:migrate                create the missing accounts, link the rest
 *   npm run clerk:migrate -- --refresh   recreate every account from today's hashes
 *
 * Safe to run again: linked people are skipped. Run it with --refresh right
 * before switching AUTH_PROVIDER to clerk, so anyone whose password changed
 * while Clerk sync was off gets their current one. Inactive logins, and logins
 * whose id is not an email address, are skipped and listed.
 *
 * Needs DATABASE_URL and CLERK_SECRET_KEY (the instance you are migrating
 * into: sk_test_… for Development, sk_live_… for Production).
 */
import { createClerkClient } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/server/db/postgres';
import { users } from '../src/lib/server/db/schema';

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
	console.error('CLERK_SECRET_KEY is not set');
	process.exit(1);
}
const clerk = createClerkClient({ secretKey });
const instance = secretKey.startsWith('sk_live_') ? 'PRODUCTION' : 'development';

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const splitName = (fullName: string) => {
	const [first, ...rest] = fullName.trim().split(/\s+/);
	return { firstName: first || undefined, lastName: rest.join(' ') || undefined };
};

async function clerkIdForEmail(email: string): Promise<string | null> {
	const { data } = await clerk.users.getUserList({ emailAddress: [email] });
	return data[0]?.id ?? null;
}

const all = await db.select().from(users);
const counts = { created: 0, recreated: 0, linked: 0, alreadyLinked: 0, skippedInactive: 0, skippedNotEmail: 0, failed: 0 };
const problems: string[] = [];

console.log(`Clerk ${instance} instance · ${all.length} portal logins${dryRun ? ' · DRY RUN' : ''}${refresh ? ' · REFRESH' : ''}\n`);

for (const u of all) {
	if (!u.isActive) {
		counts.skippedInactive++;
		continue;
	}
	if (!looksLikeEmail(u.email)) {
		counts.skippedNotEmail++;
		problems.push(`${u.email} (${u.fullName}): login id is not an email address, fix it on the roster first`);
		continue;
	}
	try {
		const existing = u.clerkUserId ?? (await clerkIdForEmail(u.email));

		if (existing && !refresh) {
			if (u.clerkUserId === existing) {
				counts.alreadyLinked++;
			} else {
				if (!dryRun) {
					await db.update(users).set({ clerkUserId: existing }).where(eq(users.id, u.id));
					await clerk.users.updateUser(existing, { externalId: u.id });
				}
				counts.linked++;
				console.log('linked   ', u.email, '→', existing);
			}
			continue;
		}

		if (dryRun) {
			console.log(existing ? 'recreate ' : 'create   ', u.email);
			existing ? counts.recreated++ : counts.created++;
			continue;
		}

		if (existing) await clerk.users.deleteUser(existing);
		const created = await clerk.users.createUser({
			externalId: u.id,
			emailAddress: [u.email],
			...splitName(u.fullName),
			passwordDigest: u.passwordHash,
			passwordHasher: 'argon2id',
			skipPasswordChecks: true
		});
		await db.update(users).set({ clerkUserId: created.id }).where(eq(users.id, u.id));
		existing ? counts.recreated++ : counts.created++;
		console.log(existing ? 'recreated' : 'created  ', u.email, '→', created.id);
	} catch (err) {
		counts.failed++;
		const detail = (err as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
		problems.push(`${u.email}: ${detail?.longMessage ?? detail?.message ?? String(err)}`);
	}
}

console.log('\n', counts);
if (problems.length) console.log('\nNeeds attention:\n- ' + problems.join('\n- '));

const unmapped = (await db.select({ id: users.id, isActive: users.isActive, clerkUserId: users.clerkUserId }).from(users)).filter(
	(r) => r.isActive && !r.clerkUserId
).length;
console.log(`\nActive logins still without a Clerk account: ${unmapped}`);
process.exit(counts.failed ? 1 : 0);
