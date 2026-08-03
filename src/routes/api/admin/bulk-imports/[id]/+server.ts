import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { bulkImports, bulkImportRows, users } from '$lib/server/db/schema';
import { requireRole } from '$lib/server/rbac';
import { eq, inArray } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
	requireRole(event, ['super_admin']);
	const importId = event.params.id;

	const [importRow] = await db.select().from(bulkImports).where(eq(bulkImports.id, importId)).limit(1);
	if (!importRow) throw error(404, 'Import not found');

	const rows = await db.select().from(bulkImportRows).where(eq(bulkImportRows.importId, importId));

	const existingUserIds = [...new Set(rows.map((r) => r.existingUserId).filter((id): id is string => Boolean(id)))];
	const existingUsers =
		existingUserIds.length > 0
			? await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, existingUserIds))
			: [];
	const existingUserById = new Map(existingUsers.map((u) => [u.id, u]));

	// Resolve each row's suggested/confirmed manager and possible-duplicate match to a
	// display name for the review UI.
	const byId = new Map(rows.map((r) => [r.id, r]));
	const withManagerName = rows.map((r) => ({
		...r,
		reportsToName: r.reportsToRowId ? byId.get(r.reportsToRowId)?.fullName ?? null : null,
		existingUser: r.existingUserId ? existingUserById.get(r.existingUserId) ?? null : null
	}));

	return json({ import: importRow, rows: withManagerName });
};
