import { randomBytes, createHash } from 'node:crypto';
import * as schema from './schema';
import { openScriptDb } from './script-db';

function hashImportToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

const db = openScriptDb();

async function main() {
	const label = process.argv[2];
	if (!label) {
		console.error('Usage: tsx src/lib/server/db/generate-import-token.ts "<label>"');
		console.error(
			'Example: tsx src/lib/server/db/generate-import-token.ts "EasyTime Pro - Bangalore office"'
		);
		process.exit(1);
	}

	const token = randomBytes(32).toString('base64url'); // 43 chars, URL-safe
	const tokenHash = hashImportToken(token);

	const [row] = await db
		.insert(schema.attendanceImportTokens)
		.values({ label, tokenHash })
		.returning({ id: schema.attendanceImportTokens.id });

	console.log('\nAttendance import token created. This value is shown ONCE — store it now.\n');
	console.log(`  Token ID: ${row.id}`);
	console.log(`  Label:    ${label}`);
	console.log(`  Token:    ${token}\n`);
	console.log('Configure the EasyTime Pro upload job to POST the exported file to:');
	console.log('  <YOUR_APP_URL>/api/attendance/easytime-import');
	console.log(`  Header: Authorization: Bearer ${token}\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
