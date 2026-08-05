import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/postgres';
import {
	users,
	teams,
	attendance,
	leaveApplications,
	leaveAllocations,
	shiftGroups,
	holidayCalendars,
	employeeProfiles,
	bulkImports,
	bulkImportRows,
	prohanceDays
} from '$lib/server/db/schema';
import { eq, and, inArray, lte, gte, desc, isNotNull } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';
import { randomBytes } from 'node:crypto';
import { logActivity, getPasswordActivity, getUsersWithProfilePicture } from '$lib/server/db/mongo';
import { requireRole, canCreateRole } from '$lib/server/rbac';
import { type Role } from '$lib/server/auth';
import { parseHrTeamSheet, suggestReportsToIndex, suggestExistingUserMatch } from '$lib/server/bulk-import';
import { profileValuesFromImport } from '$lib/server/import-profile-fields';
import { matchName } from '$lib/server/name-match';
import { error } from '@sveltejs/kit';

const DEFAULT_BULK_PASSWORD = 'Champ@123';

const PASSWORD_ACTION_LABELS: Record<string, string> = {
	'password.change': 'Changed own password',
	'user.password_reset': "Reset another user's password",
	'user.bulk_create': 'Created via bulk import (default password)'
};

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	if (user.role === 'employee') {
		throw redirect(303, '/dashboard');
	}

	const roster =
		user.role === 'super_admin'
			? await db.select().from(users)
			: await db.select().from(users).where(eq(users.teamId, user.teamId ?? ''));

	const today = new Date().toISOString().slice(0, 10);
	const todaysAttendance = await db.select().from(attendance).where(eq(attendance.date, today));
	const attendanceByUser = new Map(todaysAttendance.map((a) => [a.userId, a]));

	// ProHance stands in for people with no attendance record today: a first
	// login with no logout reads as present right now, a logout as left. Same
	// fallback the attendance calendar uses — a real record always wins.
	const todaysProhance = await db
		.select({
			userId: prohanceDays.matchedUserId,
			firstLogin: prohanceDays.firstLogin,
			lastLogout: prohanceDays.lastLogout
		})
		.from(prohanceDays)
		.where(and(eq(prohanceDays.sessionDate, today), isNotNull(prohanceDays.matchedUserId)));
	const prohanceByUser = new Map(
		todaysProhance
			.filter((p): p is typeof p & { userId: string } => Boolean(p.userId))
			.map((p) => [p.userId, p])
	);

	const pendingApprovalRows = await db
		.select({ application: leaveApplications, applicant: users })
		.from(leaveApplications)
		.innerJoin(users, eq(leaveApplications.userId, users.id))
		.where(
			user.role === 'super_admin'
				? eq(leaveApplications.status, 'pending')
				: and(eq(leaveApplications.status, 'pending'), eq(users.teamId, user.teamId ?? ''))
		);

	const year = new Date().getFullYear();
	const rosterIds = roster.map((r) => r.id);
	const allocations =
		rosterIds.length > 0
			? await db
					.select()
					.from(leaveAllocations)
					.where(and(inArray(leaveAllocations.userId, rosterIds), eq(leaveAllocations.year, year)))
			: [];
	const balanceByUser = new Map<string, number>();
	for (const a of allocations) {
		const remaining = Number(a.allocatedDays) - Number(a.usedDays);
		balanceByUser.set(a.userId, (balanceByUser.get(a.userId) ?? 0) + remaining);
	}

	const onLeaveToday =
		rosterIds.length > 0
			? await db
					.select({ userId: leaveApplications.userId })
					.from(leaveApplications)
					.where(
						and(
							inArray(leaveApplications.userId, rosterIds),
							eq(leaveApplications.status, 'approved'),
							lte(leaveApplications.startDate, today),
							gte(leaveApplications.endDate, today)
						)
					)
			: [];

	const creatableRoles: Role[] =
		user.role === 'super_admin'
			? ['super_admin', 'admin', 'team_lead', 'employee']
			: user.role === 'admin'
				? ['team_lead', 'employee']
				: ['employee'];

	// Only shift groups with a currently-published holiday calendar are offered when
	// creating a login, so every new employee resolves to a real calendar immediately.
	const groupsWithPublishedCalendar = await db
		.selectDistinct({ id: shiftGroups.id, name: shiftGroups.name })
		.from(shiftGroups)
		.innerJoin(holidayCalendars, eq(holidayCalendars.shiftGroupId, shiftGroups.id))
		.where(eq(holidayCalendars.status, 'published'));

	// Employee code is the portal-wide identity key — every roster row carries it.
	const rosterIdsForCode = roster.map((r) => r.id);
	const codeRows =
		rosterIdsForCode.length > 0
			? await db
					.select({
						userId: employeeProfiles.userId,
						employeeCode: employeeProfiles.employeeCode
					})
					.from(employeeProfiles)
					.where(inArray(employeeProfiles.userId, rosterIdsForCode))
			: [];
	const codeByUser = new Map(codeRows.map((r) => [r.userId, r.employeeCode]));

	// One query for the whole roster — avoids an <img> request per row for
	// employees who have no picture.
	const withPictures = await getUsersWithProfilePicture(rosterIdsForCode);

	const rosterWithStatus = roster.map((r) => ({
		id: r.id,
		fullName: r.fullName,
		email: r.email,
		employeeCode: codeByUser.get(r.id) ?? null,
		hasPicture: withPictures.has(r.id),
		role: r.role,
		isActive: r.isActive,
		leaveLeft: balanceByUser.get(r.id) ?? 0,
		status: attendanceByUser.get(r.id)?.checkInAt
			? attendanceByUser.get(r.id)?.checkOutAt
				? 'left'
				: 'present'
			: prohanceByUser.get(r.id)?.firstLogin
				? prohanceByUser.get(r.id)?.lastLogout
					? 'left'
					: 'present'
				: 'absent'
	}));

	let bulkImportsList: Array<{
		id: string;
		filename: string;
		status: 'pending_review' | 'applied';
		rowCount: number;
		createdAt: Date;
	}> = [];
	let passwordActivity: Array<{
		label: string;
		actorName: string | null;
		targetName: string | null;
		targetEmail: string | null;
		createdAt: Date;
	}> = [];

	if (user.role === 'super_admin') {
		bulkImportsList = await db
			.select({
				id: bulkImports.id,
				filename: bulkImports.filename,
				status: bulkImports.status,
				rowCount: bulkImports.rowCount,
				createdAt: bulkImports.createdAt
			})
			.from(bulkImports)
			.orderBy(desc(bulkImports.createdAt));

		const entries = await getPasswordActivity();
		const involvedIds = [
			...new Set(entries.flatMap((e) => [e.actorUserId, e.targetId].filter((id): id is string => Boolean(id))))
		];
		const involvedUsers =
			involvedIds.length > 0
				? await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, involvedIds))
				: [];
		const byId = new Map(involvedUsers.map((u) => [u.id, u]));

		passwordActivity = entries.map((e) => ({
			label: PASSWORD_ACTION_LABELS[e.action] ?? e.action,
			actorName: byId.get(e.actorUserId)?.fullName ?? null,
			targetName: e.targetId ? byId.get(e.targetId)?.fullName ?? null : null,
			targetEmail: (e.details?.email as string | undefined) ?? null,
			createdAt: e.createdAt
		}));
	}

	return {
		roster: rosterWithStatus,
		teamSize: rosterWithStatus.length,
		presentNow: rosterWithStatus.filter((r) => r.status === 'present').length,
		onLeave: new Set(onLeaveToday.map((r) => r.userId)).size,
		pendingApprovals: pendingApprovalRows.length,
		creatableRoles,
		shiftGroups: groupsWithPublishedCalendar,
		isSuperAdmin: user.role === 'super_admin',
		// The roster hides the delete control on your own row; the API refuses it too.
		currentUserId: user.id,
		bulkImports: bulkImportsList,
		passwordActivity
	};
};

export const actions: Actions = {
	createEmployee: async (event) => {
		const actor = requireRole(event, ['super_admin', 'admin', 'team_lead']);
		const { request } = event;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').toLowerCase();
		const fullName = String(form.get('fullName') ?? '');
		const requestedRole = (String(form.get('role') ?? 'employee') || 'employee') as Role;
		const shiftGroupId = String(form.get('shiftGroupId') ?? '');

		if (!email || !fullName) {
			return { success: false, message: 'Email and name are required' };
		}

		if (!shiftGroupId) {
			return { success: false, message: 'Shift group is required' };
		}

		if (!canCreateRole(actor, requestedRole)) {
			return { success: false, message: `${actor.role} accounts may not create ${requestedRole} accounts` };
		}

		if (actor.role === 'team_lead') {
			const [team] = await db.select().from(teams).where(eq(teams.id, actor.teamId ?? '')).limit(1);
			if (!team?.canCreateEmployeeLogins) {
				return { success: false, message: 'This Team Lead does not have permission to create employee logins' };
			}
		}

		const [eligibleGroup] = await db
			.select({ id: shiftGroups.id })
			.from(shiftGroups)
			.innerJoin(holidayCalendars, eq(holidayCalendars.shiftGroupId, shiftGroups.id))
			.where(and(eq(shiftGroups.id, shiftGroupId), eq(holidayCalendars.status, 'published')))
			.limit(1);

		if (!eligibleGroup) {
			return { success: false, message: 'Selected shift group has no published holiday calendar' };
		}

		const tempPassword = randomBytes(9).toString('base64url');
		const passwordHash = await hashPassword(tempPassword);

		const [created] = await db
			.insert(users)
			.values({
				email,
				passwordHash,
				role: requestedRole,
				fullName,
				teamId: actor.teamId,
				reportsTo: actor.id,
				isActive: true,
				mustChangePassword: true
			})
			.returning();

		await db.insert(employeeProfiles).values({
			userId: created.id,
			shiftGroupId
		});

		await logActivity({
			actorUserId: actor.id,
			action: 'user.create',
			targetType: 'user',
			targetId: created.id,
			details: { role: requestedRole, shiftGroupId }
		});

		return { success: true, tempPassword, email };
	},

	// Super Admin uploads a spreadsheet with the "HR Team Master data" sheet shape.
	// Parsed immediately into bulk_import_rows for review — nothing touches `users`
	// yet (see applyBulkImport below).
	uploadBulkImport: async (event) => {
		const actor = requireRole(event, ['super_admin']);
		const form = await event.request.formData();
		const file = form.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return { bulkImportError: 'Choose an .xlsx file to upload' };
		}
		if (file.size > 5 * 1024 * 1024) {
			return { bulkImportError: 'File too large (max 5MB)' };
		}

		const buffer = Buffer.from(await file.arrayBuffer());

		let parseResult;
		try {
			parseResult = await parseHrTeamSheet(buffer);
		} catch (err) {
			return { bulkImportError: err instanceof Error ? err.message : 'Failed to parse workbook' };
		}
		const parsedRows = parseResult.rows;
		if (parsedRows.length === 0) {
			return {
				bulkImportError: `No employee rows found in "${parseResult.sheetName}" — every row needs at least a name and a work email.`
			};
		}

		const emails = parsedRows.map((r) => r.officialEmail);
		const existingByEmailRows = await db
			.select({ id: users.id, email: users.email })
			.from(users)
			.where(inArray(users.email, emails));
		const existingByEmail = new Map(existingByEmailRows.map((u) => [u.email, u.id]));

		// Full-name cross-check against ALL existing users, not just email matches — catches
		// the case where the sheet lists a different email for someone who already has a
		// real login (e.g. their actual account uses a different domain). Surfaced as a
		// review flag rather than silently creating a duplicate account for the same person.
		const allExistingUsers = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users);

		// The employee code is unique and is the attendance join key, so a code
		// already taken by someone else has to be caught before apply — otherwise
		// the insert fails mid-batch and leaves the import half-applied.
		const sheetCodes = parsedRows
			.map((r) => r.employeeCode?.trim().toUpperCase())
			.filter((c): c is string => Boolean(c));
		const takenCodeRows =
			sheetCodes.length > 0
				? await db
						.select({ userId: employeeProfiles.userId, code: employeeProfiles.employeeCode })
						.from(employeeProfiles)
						.where(inArray(employeeProfiles.employeeCode, sheetCodes))
				: [];
		const takenCodes = new Map(
			takenCodeRows
				.filter((r): r is { userId: string; code: string } => Boolean(r.code))
				.map((r) => [r.code, r.userId])
		);

		const [importRow] = await db
			.insert(bulkImports)
			.values({ filename: file.name, uploadedBy: actor.id, rowCount: parsedRows.length })
			.returning();

		const insertedRows = await db
			.insert(bulkImportRows)
			.values(
				parsedRows.map((r, rowIndex) => {
					const emailMatchId = existingByEmail.get(r.officialEmail) ?? null;
					const nameMatch = emailMatchId ? null : suggestExistingUserMatch(r.fullName, allExistingUsers);
					const code = r.employeeCode?.trim().toUpperCase() ?? null;
					const codeOwner = code ? takenCodes.get(code) : undefined;

					let status: 'ready' | 'needs_review' | 'skipped_existing' = 'ready';
					if (emailMatchId) status = 'skipped_existing';
					else if (nameMatch) status = 'needs_review';
					// A code already held by someone else can't be applied as-is.
					else if (codeOwner) status = 'needs_review';

					// Everything beyond the columns needed to create the login is
					// carried as-is and written to the profile on apply.
					const {
						fullName,
						officialEmail,
						designation,
						teamAndFloor,
						reportingAuthorityRaw,
						dottedLineAuthorityRaw,
						employeeCode: _code,
						salaryBankRaw: _salaryBankRaw,
						...profileData
					} = r;

					return {
						importId: importRow.id,
						employeeCode: code,
						fullName,
						designation,
						officialEmail,
						teamAndFloor,
						reportingAuthorityRaw,
						dottedLineAuthorityRaw,
						profileData,
						repairNotes: parseResult.repairs[rowIndex] ?? null,
						existingUserId: emailMatchId ?? nameMatch?.id ?? null,
						status
					};
				})
			)
			.returning();

		for (let i = 0; i < parsedRows.length; i++) {
			const suggestedIndex = suggestReportsToIndex(parsedRows[i].reportingAuthorityRaw, parsedRows, i);
			const hasRawAuthority = Boolean(parsedRows[i].reportingAuthorityRaw);
			const needsReviewForReportingLine = hasRawAuthority && suggestedIndex === null;
			const alreadyDecided = insertedRows[i].status !== 'ready';

			if (suggestedIndex !== null || (needsReviewForReportingLine && !alreadyDecided)) {
				await db
					.update(bulkImportRows)
					.set({
						reportsToRowId: suggestedIndex !== null ? insertedRows[suggestedIndex].id : null,
						status: needsReviewForReportingLine && !alreadyDecided ? 'needs_review' : insertedRows[i].status
					})
					.where(eq(bulkImportRows.id, insertedRows[i].id));
			}
		}

		await logActivity({
			actorUserId: actor.id,
			action: 'bulk_import.upload',
			targetType: 'bulk_import',
			targetId: importRow.id,
			details: {
				filename: file.name,
				rowCount: parsedRows.length,
				// How the columns were interpreted — worth auditing when the
				// mapping was decided by the model rather than known headers.
				sheetName: parseResult.sheetName,
				strategy: parseResult.strategy,
				note: parseResult.note
			}
		});

		return {
			bulkImportUploaded: importRow.id,
			bulkImportSheet: parseResult.sheetName,
			bulkImportStrategy: parseResult.strategy,
			bulkImportNote: parseResult.note
		};
	},

	// Creates one `users` row (+ employeeProfiles, + a team if the row is a team_lead)
	// per "ready" row in the given import. Refuses if any row still needs review.
	applyBulkImport: async (event) => {
		const actor = requireRole(event, ['super_admin']);
		const form = await event.request.formData();
		const importId = String(form.get('importId') ?? '');
		if (!importId) return { bulkImportError: 'Missing importId' };

		const [importRow] = await db.select().from(bulkImports).where(eq(bulkImports.id, importId)).limit(1);
		if (!importRow) throw error(404, 'Import not found');
		if (importRow.status === 'applied') {
			return { bulkImportError: 'This import has already been applied' };
		}

		const rows = await db.select().from(bulkImportRows).where(eq(bulkImportRows.importId, importId));
		const pending = rows.filter((r) => r.status === 'needs_review');
		if (pending.length > 0) {
			return { bulkImportError: `${pending.length} row(s) still need review before this import can be applied` };
		}

		const passwordHash = await hashPassword(DEFAULT_BULK_PASSWORD);
		const rowIdToUserId = new Map<string, string>();

		for (const row of rows) {
			if (row.status === 'skipped_existing') {
				if (row.existingUserId) rowIdToUserId.set(row.id, row.existingUserId);
				continue;
			}
			if (row.status !== 'ready') continue;

			const [createdUser] = await db
				.insert(users)
				.values({
					email: row.officialEmail,
					passwordHash,
					role: row.role,
					fullName: row.fullName,
					isActive: true,
					mustChangePassword: true
				})
				.returning();

			rowIdToUserId.set(row.id, createdUser.id);

			await db.insert(employeeProfiles).values({
				userId: createdUser.id,
				// The employee code is the portal-wide identity key and the join key
				// for EasyTime Pro attendance — persist it, don't just display it.
				employeeCode: row.employeeCode ? row.employeeCode.trim().toUpperCase() : null,
				designation: row.designation,
				teamAndFloor: row.teamAndFloor,
				directReportingAuthority: row.reportingAuthorityRaw,
				dottedLineReportingAuthority: row.dottedLineAuthorityRaw,
				// Everything else the spreadsheet carried.
				...profileValuesFromImport(row.profileData)
			});

			await db.update(bulkImportRows).set({ status: 'created', createdUserId: createdUser.id }).where(eq(bulkImportRows.id, row.id));

			await logActivity({
				actorUserId: actor.id,
				action: 'user.bulk_create',
				targetType: 'user',
				targetId: createdUser.id,
				details: { email: createdUser.email, importId, role: row.role }
			});
		}

		for (const row of rows) {
			if (row.status !== 'ready') continue;
			const userId = rowIdToUserId.get(row.id);
			if (!userId) continue;

			const managerUserId = row.reportsToRowId ? rowIdToUserId.get(row.reportsToRowId) ?? null : null;

			let teamId: string | null = null;
			if (row.role === 'team_lead') {
				const [team] = await db.insert(teams).values({ name: `${row.fullName}'s Team`, teamLeadId: userId }).returning();
				teamId = team.id;
			}

			await db.update(users).set({ reportsTo: managerUserId, teamId }).where(eq(users.id, userId));
		}

		for (const row of rows) {
			if (row.status !== 'ready' || row.role === 'team_lead') continue;
			const userId = rowIdToUserId.get(row.id);
			const managerUserId = row.reportsToRowId ? rowIdToUserId.get(row.reportsToRowId) ?? null : null;
			if (!userId || !managerUserId) continue;

			const [manager] = await db.select({ teamId: users.teamId }).from(users).where(eq(users.id, managerUserId)).limit(1);
			if (manager?.teamId) {
				await db.update(users).set({ teamId: manager.teamId }).where(eq(users.id, userId));
			}
		}

		// Resolve dotted-line managers against everyone now in the portal, not
		// just this batch — the dotted line often points at someone senior who was
		// already onboarded. Unresolvable names (people outside the roster, or a
		// title like "Chief") keep their raw text and simply carry no code.
		const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);
		const candidates = allUsers.map((u) => ({ key: u.id, fullName: u.fullName }));

		for (const row of rows) {
			if (row.status !== 'ready' || !row.dottedLineAuthorityRaw) continue;
			const userId = rowIdToUserId.get(row.id);
			if (!userId) continue;

			const result = matchName(row.dottedLineAuthorityRaw, candidates);
			if (result.status !== 'matched' || result.key === userId) continue;

			await db
				.update(employeeProfiles)
				.set({ dottedLineManagerId: result.key })
				.where(eq(employeeProfiles.userId, userId));
		}

		const createdCount = rows.filter((r) => r.status === 'ready').length;
		const skippedCount = rows.filter((r) => r.status === 'skipped_existing').length;

		await db.update(bulkImports).set({ status: 'applied', appliedAt: new Date() }).where(eq(bulkImports.id, importId));

		await logActivity({
			actorUserId: actor.id,
			action: 'bulk_import.apply',
			targetType: 'bulk_import',
			targetId: importId,
			details: { createdCount, skippedCount }
		});

		return { bulkImportApplied: { createdCount, skippedCount } };
	}
};
