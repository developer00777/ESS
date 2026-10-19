/**
 * Command-line run of the Clerk account migration (src/lib/server/clerk-sync.ts).
 * The app already does this by itself after boot whenever Clerk keys are set;
 * this is for previews, forcing a run, or re-syncing everyone's password.
 *
 *   npm run clerk:migrate -- --dry-run   show what would happen, change nothing
 *   npm run clerk:migrate                create the missing accounts, link the rest
 *   npm run clerk:migrate -- --refresh   recreate every account from today's hashes
 *
 * Needs DATABASE_URL, CLERK_SECRET_KEY and PUBLIC_CLERK_PUBLISHABLE_KEY for the
 * instance you are migrating into (sk_live_… = Production, sk_test_… = Development).
 */
import { syncClerkAccounts } from '../src/lib/server/clerk-sync';

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');
const key = process.env.CLERK_SECRET_KEY ?? '';
if (!key || !process.env.PUBLIC_CLERK_PUBLISHABLE_KEY) {
	console.error('CLERK_SECRET_KEY and PUBLIC_CLERK_PUBLISHABLE_KEY must both be set');
	process.exit(1);
}

console.log(
	`Clerk ${key.startsWith('sk_live_') ? 'PRODUCTION' : 'development'} instance${dryRun ? ' · DRY RUN' : ''}${refresh ? ' · REFRESH' : ''}\n`
);
const r = await syncClerkAccounts({ dryRun, refresh, log: (line) => console.log(line) });
const { problems, ...counts } = r;
console.log('\n', counts);
if (problems.length) console.log('\nNeeds attention:\n- ' + problems.join('\n- '));
console.log(`\nActive logins still without a Clerk account: ${r.unmappedActive}`);
process.exit(r.failed ? 1 : 0);
