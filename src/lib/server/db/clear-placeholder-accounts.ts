import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { inArray } from 'drizzle-orm';
import * as schema from './schema';

const connectionString =
	process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/champ_hr';

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

// Earlier deploys auto-seeded these placeholder demo accounts. Removing exactly this
// known set (never anything else) so the real seed (the SUPER_ADMIN_EMAIL account,
// configured via Railway env vars) can populate a clean users table. Safe to run
// repeatedly: a no-op once these emails no longer exist.
const PLACEHOLDER_EMAILS = [
	'admin@champ-hr.local',
	'hr-admin@champ-hr.local',
	'lead@champ-hr.local',
	'employee@champ-hr.local'
];

async function clearPlaceholderAccounts() {
	const targets = await db
		.select({ id: schema.users.id, email: schema.users.email })
		.from(schema.users)
		.where(inArray(schema.users.email, PLACEHOLDER_EMAILS));

	if (targets.length === 0) {
		console.log('No placeholder accounts found — nothing to clear.');
		await pool.end();
		return;
	}

	const ids = targets.map((u) => u.id);
	console.log(`Clearing ${ids.length} placeholder account(s): ${targets.map((u) => u.email).join(', ')}`);

	// Break the self-referential FK (users.reports_to) and team_lead_id before deleting.
	await db.update(schema.users).set({ reportsTo: null }).where(inArray(schema.users.reportsTo, ids));
	await db.update(schema.teams).set({ teamLeadId: null }).where(inArray(schema.teams.teamLeadId, ids));

	// Dependent rows, in FK-safe order.
	await db.delete(schema.leaveLedger).where(inArray(schema.leaveLedger.userId, ids));
	await db.delete(schema.leaveApplications).where(inArray(schema.leaveApplications.userId, ids));
	await db.delete(schema.leaveAllocations).where(inArray(schema.leaveAllocations.userId, ids));
	await db.delete(schema.attendance).where(inArray(schema.attendance.userId, ids));
	await db.delete(schema.devicePunches).where(inArray(schema.devicePunches.matchedUserId, ids));
	await db.delete(schema.devicePushTokens).where(inArray(schema.devicePushTokens.createdBy, ids));
	await db.delete(schema.holidayCalendars).where(inArray(schema.holidayCalendars.publishedBy, ids));
	await db.delete(schema.employeeProfiles).where(inArray(schema.employeeProfiles.userId, ids));

	await db.delete(schema.users).where(inArray(schema.users.id, ids));

	console.log('Placeholder accounts cleared.');
	await pool.end();
}

clearPlaceholderAccounts().catch((err) => {
	console.error(err);
	process.exit(1);
});
