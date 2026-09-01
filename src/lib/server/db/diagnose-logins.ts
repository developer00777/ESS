import { Pool } from 'pg';

/**
 * Answers "why can't this person sign in?" against a live database.
 *
 * The login endpoint returns the same 401 for an unknown email and a wrong
 * password — correct, since telling an attacker which of the two it was hands
 * them a way to enumerate accounts, but it also means an operator watching the
 * network tab cannot tell a mistyped password from an account whose login id is
 * not what anybody thinks it is. This reads the row directly and says which.
 *
 * Read-only. It never prints a password, only whether one is on record.
 *
 *   DATABASE_URL="<railway-url>" npm run diagnose:logins
 *   DATABASE_URL="<railway-url>" npm run diagnose:logins -- someone@example.com
 */

const connectionString =
	process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/champ_hr';

const pool = new Pool({ connectionString });

/** Same shape the importer and the login form require. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function columnExists(table: string, column: string): Promise<boolean> {
	const { rows } = await pool.query(
		`select 1 from information_schema.columns where table_name = $1 and column_name = $2`,
		[table, column]
	);
	return rows.length > 0;
}

async function main() {
	const target = process.argv[2]?.trim().toLowerCase();

	// Whether migration 0017 has been applied. Also the answer to "did the deploy
	// actually pick up the new code?", since the two ship together.
	const hasTempColumn = await columnExists('users', 'temporary_password');
	console.log(`temporary_password column present: ${hasTempColumn ? 'yes' : 'NO — migration 0017 has not run'}`);

	const { rows: all } = await pool.query<{
		id: string;
		email: string;
		full_name: string;
		is_active: boolean;
		must_change_password: boolean;
		created_at: Date;
	}>(
		`select id, email, full_name, is_active, must_change_password, created_at
		 from users order by created_at`
	);
	console.log(`users: ${all.length} total, ${all.filter((u) => u.must_change_password).length} yet to set their own password\n`);

	// The accounts the parser bug produced. Their login id is not an address, so
	// no password of any kind gets their owner in — re-issuing one does not help.
	const unusable = all.filter((u) => !EMAIL.test(u.email));
	if (unusable.length > 0) {
		console.log(`${unusable.length} account(s) whose login id is NOT an email address — these can never be signed in to:`);
		for (const u of unusable) {
			console.log(`  ${u.full_name}  <${u.email}>  id=${u.id}  created=${u.created_at.toISOString().slice(0, 10)}`);
		}
		console.log('  Fix: correct each address, or delete the account and re-import the row.\n');
	} else {
		console.log('No accounts with an unusable login id.\n');
	}

	if (!target) {
		console.log('Pass an email address to diagnose one sign-in, e.g.');
		console.log('  npm run diagnose:logins -- someone@example.com');
		await pool.end();
		return;
	}

	console.log(`--- ${target} ---`);
	const match = all.find((u) => u.email === target);
	if (!match) {
		console.log('No account has this email. Login returns 401 "Invalid email or password".');
		// Almost always a near miss rather than a missing person: a typo, a
		// different domain, or the address the sheet carried.
		const [local] = target.split('@');
		const near = all.filter((u) => u.email.startsWith(`${local}@`) || u.full_name.toLowerCase().includes(local.replace(/[._-]/g, ' ')));
		if (near.length > 0) {
			console.log('Closest accounts on record:');
			for (const u of near.slice(0, 5)) console.log(`  ${u.full_name}  <${u.email}>`);
		}
		await pool.end();
		return;
	}

	console.log(`found: ${match.full_name}  id=${match.id}`);
	console.log(`active: ${match.is_active ? 'yes' : 'NO — login returns 401 regardless of password'}`);
	console.log(`must change password on next sign-in: ${match.must_change_password ? 'yes (never signed in)' : 'no (has set their own)'}`);

	if (hasTempColumn) {
		const { rows } = await pool.query<{ temporary_password: string | null }>(
			'select temporary_password from users where id = $1',
			[match.id]
		);
		const held = rows[0]?.temporary_password;
		console.log(`temporary password on record: ${held ? 'yes — visible on the Team roster' : 'no'}`);
		if (!held && match.must_change_password) {
			console.log('  This account was created before the password was kept, and its');
			console.log('  credentials mail is the only place the value ever existed. Use');
			console.log('  "Re-issue & email" on its import, or reset it from the roster.');
		}
	}

	if (match.is_active && EMAIL.test(match.email)) {
		console.log('\nThe account is reachable, so a 401 here means the password did not match.');
	}

	await pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
