import { randomBytes, createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

function hashDeviceToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

const connectionString =
	process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/champ_hr';

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function main() {
	const label = process.argv[2];
	if (!label) {
		console.error('Usage: tsx src/lib/server/db/generate-device-token.ts "<label>"');
		console.error('Example: tsx src/lib/server/db/generate-device-token.ts "EasyTime Pro - Main Office"');
		process.exit(1);
	}

	const token = randomBytes(32).toString('base64url'); // 43 chars, URL-safe
	const tokenHash = hashDeviceToken(token);

	const [row] = await db
		.insert(schema.devicePushTokens)
		.values({ label, tokenHash })
		.returning({ id: schema.devicePushTokens.id });

	console.log('\nDevice push token created. This plaintext value is shown ONCE — store it now.\n');
	console.log(`  Token ID: ${row.id}`);
	console.log(`  Label:    ${label}`);
	console.log(`  Token:    ${token}\n`);
	console.log('Configure EasyTime Pro / the device to push to:');
	console.log(
		`  <YOUR_APP_URL>/api/attendance/device-push/iclock/cdata?token=${token}\n`
	);

	await pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
