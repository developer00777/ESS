import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { bulkImports, bulkImportRows, users } from '$lib/server/db/schema';
import { looksLikeEmail } from '$lib/server/bulk-import';
import { eq, and, ne } from 'drizzle-orm';
import { requireCap } from '$lib/server/capabilities';

const VALID_ROLES = ['super_admin', 'admin', 'team_lead', 'employee'] as const;

// Super Admin edits a single row during review — email, role, or which row is the
// manager (or clears it). Only allowed while the parent import is still pending_review;
// once applied, rows are historical record and shouldn't be mutated.
export const PATCH: RequestHandler = async (event) => {
	requireCap(event, 'people.bulk_import');
	const importId = event.params.id;
	const rowId = event.params.rowId;

	const [importRow] = await db.select().from(bulkImports).where(eq(bulkImports.id, importId)).limit(1);
	if (!importRow) throw error(404, 'Import not found');
	if (importRow.status !== 'pending_review') {
		throw error(400, 'This import has already been applied and can no longer be edited');
	}

	const [row] = await db
		.select()
		.from(bulkImportRows)
		.where(and(eq(bulkImportRows.id, rowId), eq(bulkImportRows.importId, importId)))
		.limit(1);
	if (!row) throw error(404, 'Row not found in this import');

	const body = await event.request.json();
	const patch: Partial<typeof bulkImportRows.$inferInsert> = {};

	if ('officialEmail' in body) {
		// Held to the same shape the parser requires, because this is the screen
		// where an unusable login id gets corrected — accepting anything containing
		// an "@" would let the bad value straight back through.
		if (typeof body.officialEmail !== 'string' || !looksLikeEmail(body.officialEmail)) {
			throw error(400, 'officialEmail must be a valid email address');
		}
		const officialEmail = body.officialEmail.trim().toLowerCase();

		// `users.email` is unique, and apply inserts row by row with no transaction
		// around the batch. A collision therefore doesn't fail the edit — it fails
		// halfway through creating accounts, after some have already been made and
		// mailed. Cheaper to refuse it here.
		const [clashingRow] = await db
			.select({ id: bulkImportRows.id, fullName: bulkImportRows.fullName })
			.from(bulkImportRows)
			.where(
				and(
					eq(bulkImportRows.importId, importId),
					eq(bulkImportRows.officialEmail, officialEmail),
					ne(bulkImportRows.id, rowId)
				)
			)
			.limit(1);
		if (clashingRow) {
			throw error(400, `"${officialEmail}" is already used by another row in this import (${clashingRow.fullName})`);
		}

		const [clashingUser] = await db
			.select({ fullName: users.fullName })
			.from(users)
			.where(eq(users.email, officialEmail))
			.limit(1);
		if (clashingUser) {
			throw error(400, `"${officialEmail}" already belongs to an existing account (${clashingUser.fullName})`);
		}

		patch.officialEmail = officialEmail;
	}

	if ('role' in body) {
		if (!VALID_ROLES.includes(body.role)) {
			throw error(400, `role must be one of: ${VALID_ROLES.join(', ')}`);
		}
		patch.role = body.role;
	}

	if ('reportsToRowId' in body) {
		if (body.reportsToRowId !== null) {
			if (typeof body.reportsToRowId !== 'string') {
				throw error(400, 'reportsToRowId must be a string row id or null');
			}
			const [targetRow] = await db
				.select({ id: bulkImportRows.id })
				.from(bulkImportRows)
				.where(and(eq(bulkImportRows.id, body.reportsToRowId), eq(bulkImportRows.importId, importId)))
				.limit(1);
			if (!targetRow) throw error(400, 'reportsToRowId must reference another row in this same import');
			if (body.reportsToRowId === rowId) throw error(400, 'A row cannot report to itself');
		}
		patch.reportsToRowId = body.reportsToRowId;
	}

	// Explicit resolution for a row flagged as a possible existing-person match
	// (needs_review + existingUserId set by a name match at upload time). The Super
	// Admin must say which it is — editing other fields does NOT implicitly decide this.
	if ('duplicateDecision' in body) {
		if (row.status !== 'needs_review' || !row.existingUserId) {
			throw error(400, 'This row has no pending duplicate-person decision');
		}
		if (body.duplicateDecision === 'link') {
			patch.status = 'skipped_existing';
		} else if (body.duplicateDecision === 'create_new') {
			patch.status = 'ready';
			patch.existingUserId = null;
		} else {
			throw error(400, 'duplicateDecision must be "link" or "create_new"');
		}
	}

	if (Object.keys(patch).length === 0) {
		throw error(400, 'No recognized fields to update (officialEmail, role, reportsToRowId, duplicateDecision)');
	}

	// Editing email/role/manager on a row that only needed review for its REPORTING
	// LINE (no duplicate-person flag) confirms it — but a duplicate-person flag can
	// only be cleared by an explicit duplicateDecision above, never implicitly.
	if (row.status === 'needs_review' && !row.existingUserId && !('duplicateDecision' in body)) {
		patch.status = 'ready';
	}

	const [updated] = await db.update(bulkImportRows).set(patch).where(eq(bulkImportRows.id, rowId)).returning();

	return json({ row: updated });
};
