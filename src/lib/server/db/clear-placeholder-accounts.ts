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

	// Holiday calendars published by a placeholder are that placeholder's own demo
	// data (not a real employee's record) — captured now, deleted in step 2 below,
	// child-before-parent (holidays -> holiday_calendars).
	const ownCalendars = await db
		.select({ id: schema.holidayCalendars.id })
		.from(schema.holidayCalendars)
		.where(inArray(schema.holidayCalendars.publishedBy, ids));
	const ownCalendarIds = ownCalendars.map((c) => c.id);

	// leave_applications rows owned by a placeholder are about to be deleted (step 2).
	// Any OTHER (real) user's leave_ledger entry that references one of those
	// applications must have that link cleared first — the ledger entry itself
	// (their balance adjustment) survives, it just loses the cross-reference.
	const ownApplications = await db
		.select({ id: schema.leaveApplications.id })
		.from(schema.leaveApplications)
		.where(inArray(schema.leaveApplications.userId, ids));
	const ownApplicationIds = ownApplications.map((a) => a.id);
	if (ownApplicationIds.length > 0) {
		await db
			.update(schema.leaveLedger)
			.set({ relatedApplicationId: null })
			.where(inArray(schema.leaveLedger.relatedApplicationId, ownApplicationIds));
	}

	// Step 1: null out every FK to a placeholder user on rows that must survive
	// regardless (they may belong to real, non-placeholder people/records).
	await db.update(schema.users).set({ reportsTo: null }).where(inArray(schema.users.reportsTo, ids));
	await db.update(schema.teams).set({ teamLeadId: null }).where(inArray(schema.teams.teamLeadId, ids));
	await db
		.update(schema.leaveApplications)
		.set({ approverId: null })
		.where(inArray(schema.leaveApplications.approverId, ids));
	await db
		.update(schema.devicePunches)
		.set({ matchedUserId: null })
		.where(inArray(schema.devicePunches.matchedUserId, ids));

	// attendance rows owned by a placeholder are deleted in step 2 below. Any
	// device_punches row that was matched/applied against one of those attendance
	// rows must have that link cleared first (the punch audit record itself survives).
	const ownAttendance = await db
		.select({ id: schema.attendance.id })
		.from(schema.attendance)
		.where(inArray(schema.attendance.userId, ids));
	const ownAttendanceIds = ownAttendance.map((a) => a.id);
	if (ownAttendanceIds.length > 0) {
		await db
			.update(schema.devicePunches)
			.set({ attendanceId: null })
			.where(inArray(schema.devicePunches.attendanceId, ownAttendanceIds));
	}

	// device_push_tokens created by a placeholder: any punches referencing that token
	// must have their token_id cleared before the token row itself can be deleted —
	// the punch record (audit trail) survives, just loses the link to the deleted token.
	const orphanTokens = await db
		.select({ id: schema.devicePushTokens.id })
		.from(schema.devicePushTokens)
		.where(inArray(schema.devicePushTokens.createdBy, ids));
	if (orphanTokens.length > 0) {
		const tokenIds = orphanTokens.map((t) => t.id);
		await db
			.update(schema.devicePunches)
			.set({ tokenId: null })
			.where(inArray(schema.devicePunches.tokenId, tokenIds));
		await db.delete(schema.devicePushTokens).where(inArray(schema.devicePushTokens.id, tokenIds));
	}

	// Step 2: delete rows that genuinely belong to the placeholder users themselves,
	// in FK-safe (child-before-parent) order.
	await db.delete(schema.leaveLedger).where(inArray(schema.leaveLedger.userId, ids));
	await db.delete(schema.leaveApplications).where(inArray(schema.leaveApplications.userId, ids));
	await db.delete(schema.leaveAllocations).where(inArray(schema.leaveAllocations.userId, ids));
	await db.delete(schema.attendance).where(inArray(schema.attendance.userId, ids));

	if (ownCalendarIds.length > 0) {
		await db.delete(schema.holidays).where(inArray(schema.holidays.calendarId, ownCalendarIds));
		await db.delete(schema.holidayCalendars).where(inArray(schema.holidayCalendars.id, ownCalendarIds));
	}

	await db.delete(schema.employeeProfiles).where(inArray(schema.employeeProfiles.userId, ids));

	await db.delete(schema.users).where(inArray(schema.users.id, ids));

	console.log('Placeholder accounts cleared.');
	await pool.end();
}

clearPlaceholderAccounts().catch((err) => {
	console.error(err);
	process.exit(1);
});
