import { migrate } from 'drizzle-orm/d1/migrator';
import { openScriptDb } from './script-db';

/**
 * Applies migrations/ to D1 on container start (start.sh). Already-applied
 * migrations are skipped (drizzle's __drizzle_migrations table), and all new
 * ones run in a single D1 batch, so a failure leaves the database unchanged.
 */
async function main() {
	const db = openScriptDb();
	await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? './migrations' });
	console.log('[migrate] D1 is up to date');
}

main().catch((err) => {
	console.error('[migrate] failed:', err instanceof Error ? err.message : err);
	process.exit(1);
});
