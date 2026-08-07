import {
	pgTable,
	uuid,
	text,
	varchar,
	timestamp,
	integer,
	numeric,
	boolean,
	date,
	jsonb,
	pgEnum,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['super_admin', 'admin', 'team_lead', 'employee']);

export const leaveStatusEnum = pgEnum('leave_status', [
	'pending',
	'approved',
	'rejected',
	'escalated',
	'cancelled'
]);

export const attendanceSourceEnum = pgEnum('attendance_source', ['manual', 'biometric']);

// SOP §2/§4 — the fixed reason list an attendance correction can be raised under.
// Kept as an enum so the monthly cap can be scoped to biometric-only reasons.
export const deviationReasonEnum = pgEnum('deviation_reason', [
	'login_not_captured',
	'logout_not_captured',
	'missing_biometric_punch',
	'biometric_system_mismatch',
	'prohance_mismatch',
	'system_server_issue',
	'machine_malfunction',
	'technical_error',
	'wrong_half_day',
	'wrong_absent',
	'incorrect_working_hours'
]);

export const deviationStatusEnum = pgEnum('deviation_status', [
	'pending',
	'approved',
	'rejected',
	'needs_manager_approval', // SOP §2: 4th+ biometric request in a month
	// Manager has signed off; waiting on HR. Attendance corrections run
	// manager → HR → approved, so this is the middle of the chain rather than a
	// decision. Comp-off deliberately has no equivalent: it is one step.
	'manager_approved',
	'cancelled'
]);

export const compOffStatusEnum = pgEnum('comp_off_status', [
	'pending',
	'approved',
	'rejected',
	'used',
	'lapsed'
]);

export const calendarStatusEnum = pgEnum('calendar_status', ['draft', 'published', 'archived']);

// A week-off roster is either the same weekdays off every week, or an N-week
// rotation that repeats. Rotational is what makes a roster worth saving at all —
// a fixed pattern could be a column, but a rotation needs an anchor date and a
// per-week weekday set.
export const weekOffPatternEnum = pgEnum('week_off_pattern', ['fixed', 'rotational']);

// --- Org structure ---

// Shift group is the key that makes holiday calendars & leave policy rules render
// differently per employee (§ Leave Policy & Holiday Calendar design doc). An
// employee's shiftGroupId on employeeProfiles is set manually by HR/admin and is
// the join key the resolver uses — never hardcode calendar data per employee.
export const shiftGroups = pgTable('shift_groups', {
	id: uuid('id').primaryKey().defaultRandom(),
	key: varchar('key', { length: 64 }).notNull().unique(), // e.g. 'day_shift', 'night_shift', 'singapore'
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const departments = pgTable('departments', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const teams = pgTable('teams', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	departmentId: uuid('department_id').references(() => departments.id),
	teamLeadId: uuid('team_lead_id').references((): any => users.id),
	// Team Lead privilege template, set by Super Admin at team-creation time
	canApproveLeave: boolean('can_approve_leave').default(true).notNull(),
	maxLeaveDaysAutoApprove: integer('max_leave_days_auto_approve').default(2).notNull(),
	canEditTeamShiftWindow: boolean('can_edit_team_shift_window').default(true).notNull(),
	canViewTeamPayrollCost: boolean('can_view_team_payroll_cost').default(false).notNull(),
	canCreateEmployeeLogins: boolean('can_create_employee_logins').default(true).notNull(),
	canResolveGrievances: boolean('can_resolve_grievances').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Users / auth ---

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: roleEnum('role').notNull(),
	fullName: text('full_name').notNull(),
	teamId: uuid('team_id').references(() => teams.id),
	reportsTo: uuid('reports_to').references((): any => users.id),
	isActive: boolean('is_active').default(true).notNull(),
	mustChangePassword: boolean('must_change_password').default(true).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Employee profile (My Profile widget, §4.1) ---
// Field set expanded to match the company's "Personal Master Data" HR record format.

export const employeeProfiles = pgTable('employee_profiles', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull()
		.unique(),

	// HR override for gender/tenure-restricted leave (pink leave). null = follow
	// the automatic rule; true/false = HR has explicitly granted or withheld it.
	// Exists because gender and joining dates are missing for most employees, so
	// the automatic rule alone would silently exclude people.
	pinkLeaveEligibleOverride: boolean('pink_leave_eligible_override'),

	// HR-locked — the company employee code (e.g. "CIPL2666"). This is the single
	// source of truth for identifying a person across the portal, the HR master
	// spreadsheets, and EasyTime Pro (where it is the device-side {emp_code}).
	// Attendance ingestion joins on this value, so it must stay unique.
	employeeCode: varchar('employee_code', { length: 32 }).unique(),

	// self-editable — personal & contact
	phone: text('phone'),
	personalEmail: text('personal_email'),
	address: text('address'),
	permanentAddress: text('permanent_address'),
	facebookId: text('facebook_id'),
	linkedinUrl: text('linkedin_url'),
	instagramHandle: text('instagram_handle'),

	// self-editable — emergency contact
	emergencyContactName: text('emergency_contact_name'),
	emergencyContactRelationship: text('emergency_contact_relationship'),
	emergencyContactPhone: text('emergency_contact_phone'),

	// self-editable — family
	gender: text('gender'),
	bloodGroup: text('blood_group'),
	dobDocuments: date('dob_documents'),
	dobActual: date('dob_actual'),
	fatherName: text('father_name'),
	fatherDob: date('father_dob'),
	fatherContact: text('father_contact'),
	motherName: text('mother_name'),
	motherDob: date('mother_dob'),
	motherContact: text('mother_contact'),
	religion: text('religion'),
	motherTongue: text('mother_tongue'),
	maritalStatus: text('marital_status'),
	spouseName: text('spouse_name'),
	spouseDob: text('spouse_dob'),
	spouseContact: text('spouse_contact'),
	anniversaryDate: text('anniversary_date'),
	// The HR tracker carries three fixed "Kids Name #n / Date of Birth" column
	// pairs, but the real count varies per person. Stored as a list rather than
	// six rigid columns so the sheet's arbitrary cap isn't baked into the schema:
	// [{ name: 'Aarav', dob: '2019-04-02' }, …]
	children: jsonb('children').$type<{ name: string; dob: string | null }[]>(),

	// self-editable — education
	underGraduate: text('under_graduate'),
	graduate: text('graduate'),
	masters: text('masters'),
	diplomaOthers: text('diploma_others'),
	totalExperience: text('total_experience'),

	// self-editable — government IDs
	aadharNumber: text('aadhar_number'),
	panNumber: text('pan_number'),
	uanNumber: text('uan_number'),
	drivingLicenseNumber: text('driving_license_number'),
	votersIdNumber: text('voters_id_number'),
	passportNumber: text('passport_number'),

	// self-editable — bank details
	bankAccountNumber: text('bank_account_number'),
	bankAccountHolderName: text('bank_account_holder_name'),
	bankName: text('bank_name'),
	bankIfsc: text('bank_ifsc'),

	// HR-locked — job / org info
	designation: text('designation'),
	teamAndFloor: text('team_and_floor'),
	subProcessDepartment: text('sub_process_department'),
	floorDetails: text('floor_details'),
	dateOfJoining: date('date_of_joining'),
	dateOfConfirmation: date('date_of_confirmation'),
	officeTimings: text('office_timings'),
	shiftType: text('shift_type'),
	shiftGroupId: uuid('shift_group_id').references(() => shiftGroups.id),
	// The names exactly as written in the HR sheet. Kept verbatim even after a
	// match, so the source stays auditable and an unresolvable manager (senior
	// staff outside this roster, or a title like "Chief") still has something
	// to display.
	directReportingAuthority: text('direct_reporting_authority'),
	dottedLineReportingAuthority: text('dotted_line_reporting_authority'),
	// Resolved counterpart of dottedLineReportingAuthority. The direct manager's
	// resolved link lives on users.reportsTo; this one has no equivalent there
	// because a dotted line does not carry approval rights.
	dottedLineManagerId: uuid('dotted_line_manager_id').references(() => users.id),
	// The HR person who handles this employee's second-stage approvals. Set by a
	// Super Admin from the roster; when null, any admin picks the request up.
	// Assigning it puts the request in that person's queue first — it does not
	// lock others out, so nothing stalls when they are away.
	hrUserId: uuid('hr_user_id').references(() => users.id),
	sourceReferredBy: text('source_referred_by'),
	salaryBand: text('salary_band'),

	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Leave (§4.2) ---

export const leaveTypes = pgTable('leave_types', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 32 }), // e.g. 'EL', 'SL', 'MATERNITY' — stable key from the source policy doc
	name: text('name').notNull(),
	accrualPerMonth: numeric('accrual_per_month', { precision: 5, scale: 2 }).default('0').notNull(),
	carryForwardCap: integer('carry_forward_cap').default(0).notNull(),
	encashmentEligible: boolean('encashment_eligible').default(false).notNull(),
	// Fields populated when a leave type comes from a Super-Admin-published policy document
	eligibility: text('eligibility'), // 'post_probation' | 'pre_probation' | 'all'
	requiresDocumentation: boolean('requires_documentation').default(false).notNull(),
	documentationNote: text('documentation_note'),
	fixedDays: integer('fixed_days'), // for event-based leave (maternity/paternity/bereavement), null if accrual-based
	// Monthly-quota leave (pink/menstrual): the entitlement refreshes every month
	// and does NOT accumulate — unused days expire at month end rather than
	// building a balance the way accrual leave does.
	monthlyQuotaDays: numeric('monthly_quota_days', { precision: 5, scale: 2 }),
	// Restricts who may apply. 'female' is used by pink leave; null = everyone.
	genderEligibility: text('gender_eligibility'), // 'female' | 'male' | null
	notes: text('notes'),
	sourceDocumentId: text('source_document_id'), // Mongo policy_documents._id this rule was extracted from
	policyVersion: integer('policy_version').default(1).notNull(),
	effectiveFrom: date('effective_from'),
	isActive: boolean('is_active').default(true).notNull()
});

// --- Holiday Calendar (Super Admin publishes; resolved per employee's shift group) ---

export const holidayCalendars = pgTable('holiday_calendars', {
	id: uuid('id').primaryKey().defaultRandom(),
	shiftGroupId: uuid('shift_group_id')
		.references(() => shiftGroups.id)
		.notNull(),
	year: integer('year').notNull(),
	version: integer('version').default(1).notNull(),
	status: calendarStatusEnum('status').default('draft').notNull(),
	effectiveFrom: date('effective_from').notNull(),
	effectiveTo: date('effective_to'),
	sourceDocumentId: text('source_document_id'), // Mongo policy_documents._id (the uploaded jpeg/pdf)
	publishedBy: uuid('published_by').references(() => users.id),
	publishedAt: timestamp('published_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const holidays = pgTable('holidays', {
	id: uuid('id').primaryKey().defaultRandom(),
	calendarId: uuid('calendar_id')
		.references(() => holidayCalendars.id)
		.notNull(),
	date: date('date').notNull(),
	name: text('name').notNull(),
	type: text('type').default('PUBLIC').notNull() // 'PUBLIC' | 'RESTRICTED' | 'OPTIONAL'
});

export const leaveAllocations = pgTable('leave_allocations', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	leaveTypeId: uuid('leave_type_id')
		.references(() => leaveTypes.id)
		.notNull(),
	year: integer('year').notNull(),
	allocatedDays: numeric('allocated_days', { precision: 5, scale: 2 }).notNull(),
	usedDays: numeric('used_days', { precision: 5, scale: 2 }).default('0').notNull()
});

export const leaveApplications = pgTable('leave_applications', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	leaveTypeId: uuid('leave_type_id')
		.references(() => leaveTypes.id)
		.notNull(),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	days: numeric('days', { precision: 5, scale: 2 }).notNull(),
	reason: text('reason'),
	status: leaveStatusEnum('status').default('pending').notNull(),
	approverId: uuid('approver_id').references((): any => users.id),
	decidedAt: timestamp('decided_at', { withTimezone: true }),
	decisionNote: text('decision_note'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const leaveLedger = pgTable('leave_ledger', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	leaveTypeId: uuid('leave_type_id')
		.references(() => leaveTypes.id)
		.notNull(),
	delta: numeric('delta', { precision: 5, scale: 2 }).notNull(),
	reason: text('reason').notNull(),
	relatedApplicationId: uuid('related_application_id').references(() => leaveApplications.id),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Attendance (§4.3 — manual check-in only in Phase 1) ---

export const attendance = pgTable('attendance', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	date: date('date').notNull(),
	checkInAt: timestamp('check_in_at', { withTimezone: true }),
	checkOutAt: timestamp('check_out_at', { withTimezone: true }),
	source: attendanceSourceEnum('source').default('manual').notNull(),
	checkInLat: numeric('check_in_lat', { precision: 9, scale: 6 }),
	checkInLng: numeric('check_in_lng', { precision: 9, scale: 6 }),
	checkOutLat: numeric('check_out_lat', { precision: 9, scale: 6 }),
	checkOutLng: numeric('check_out_lng', { precision: 9, scale: 6 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
	team: one(teams, { fields: [users.teamId], references: [teams.id] }),
	manager: one(users, { fields: [users.reportsTo], references: [users.id] }),
	profile: one(employeeProfiles, {
		fields: [users.id],
		references: [employeeProfiles.userId]
	}),
	leaveApplications: many(leaveApplications),
	attendance: many(attendance)
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
	department: one(departments, { fields: [teams.departmentId], references: [departments.id] }),
	teamLead: one(users, { fields: [teams.teamLeadId], references: [users.id] }),
	members: many(users)
}));

export const leaveApplicationsRelations = relations(leaveApplications, ({ one }) => ({
	user: one(users, { fields: [leaveApplications.userId], references: [users.id] }),
	leaveType: one(leaveTypes, {
		fields: [leaveApplications.leaveTypeId],
		references: [leaveTypes.id]
	}),
	approver: one(users, { fields: [leaveApplications.approverId], references: [users.id] })
}));

export const employeeProfilesRelations = relations(employeeProfiles, ({ one }) => ({
	user: one(users, { fields: [employeeProfiles.userId], references: [users.id] }),
	shiftGroup: one(shiftGroups, {
		fields: [employeeProfiles.shiftGroupId],
		references: [shiftGroups.id]
	})
}));

export const shiftGroupsRelations = relations(shiftGroups, ({ many }) => ({
	holidayCalendars: many(holidayCalendars),
	employeeProfiles: many(employeeProfiles)
}));

export const holidayCalendarsRelations = relations(holidayCalendars, ({ one, many }) => ({
	shiftGroup: one(shiftGroups, {
		fields: [holidayCalendars.shiftGroupId],
		references: [shiftGroups.id]
	}),
	publisher: one(users, { fields: [holidayCalendars.publishedBy], references: [users.id] }),
	holidays: many(holidays)
}));

export const holidaysRelations = relations(holidays, ({ one }) => ({
	calendar: one(holidayCalendars, { fields: [holidays.calendarId], references: [holidayCalendars.id] })
}));

// --- EasyTime Pro attendance ingestion ---
// EasyTime Pro exports a scheduled tab-separated file (see its "Data Template"
// screen) and a scheduled job on that machine POSTs it to
// /api/attendance/easytime-import. Auth is a shared token; only the hash is
// stored, and the plaintext is shown once at generation time.
export const attendanceImportTokens = pgTable('attendance_import_tokens', {
	id: uuid('id').primaryKey().defaultRandom(),
	label: text('label').notNull(), // e.g. 'EasyTime Pro - Bangalore office'
	tokenHash: text('token_hash').notNull().unique(),
	createdBy: uuid('created_by').references(() => users.id),
	revokedAt: timestamp('revoked_at', { withTimezone: true }),
	lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// One row per uploaded export file — the audit trail of what was ingested when.
export const attendanceImports = pgTable('attendance_imports', {
	id: uuid('id').primaryKey().defaultRandom(),
	tokenId: uuid('token_id').references(() => attendanceImportTokens.id),
	uploadedBy: uuid('uploaded_by').references(() => users.id),
	filename: text('filename'),
	rowCount: integer('row_count').notNull(),
	matchedCount: integer('matched_count').notNull(),
	unmatchedCount: integer('unmatched_count').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Every raw punch line from the export, kept for audit/replay whether or not its
// emp_code resolved to an employee. Unmatched rows stay here so HR can fix the
// employee code and re-apply rather than losing the punch.
export const devicePunches = pgTable('device_punches', {
	id: uuid('id').primaryKey().defaultRandom(),
	importId: uuid('import_id').references(() => attendanceImports.id),
	// {emp_code} — the join key back to employee_profiles.employee_code
	empCode: text('emp_code').notNull(),
	firstName: text('first_name'),
	lastName: text('last_name'),
	deptCode: text('dept_code'),
	deptName: text('dept_name'),
	punchedAt: timestamp('punched_at', { withTimezone: true }).notNull(),
	verifyType: text('verify_type'),
	punchState: text('punch_state'), // raw {punch_state} from the device
	direction: text('direction'), // 'in' | 'out' | null once interpreted
	workCode: text('work_code'),
	cardNumber: text('card_number'),
	areaName: text('area_name'),
	terminalAlias: text('terminal_alias'),
	terminalSn: text('terminal_sn'),
	temperature: text('temperature'),
	maskFlag: text('mask_flag'),
	rawLine: text('raw_line').notNull(),
	matchedUserId: uuid('matched_user_id').references(() => users.id),
	attendanceId: uuid('attendance_id').references(() => attendance.id),
	receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull()
});

// --- ProHance activity ingestion (polled from the ProHance Web Services API) ---
// The portal POSTS to <PROHANCE_BASE_URL>/report/comprehensive/getdata
// (reportBy=User, viewBy=Day) on an interval and upserts one row per employee
// per day. "Employee ID" in ProHance is the same company employee code as
// employee_profiles.employee_code — that's the join key, exactly like EasyTime.

// One row per poll/manual run — the audit trail of what was pulled when.
export const prohanceSyncs = pgTable('prohance_syncs', {
	id: uuid('id').primaryKey().defaultRandom(),
	trigger: text('trigger').default('poll').notNull(), // 'poll' | 'manual'
	rangeFrom: date('range_from').notNull(),
	rangeTo: date('range_to').notNull(),
	status: text('status').default('ok').notNull(), // 'ok' | 'error'
	rowCount: integer('row_count').default(0).notNull(),
	matchedCount: integer('matched_count').default(0).notNull(),
	unmatchedCount: integer('unmatched_count').default(0).notNull(),
	error: text('error'),
	startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp('finished_at', { withTimezone: true })
});

// One employee-day of ProHance activity. Upserted on (emp_code, session_date):
// re-polling the same window refreshes rows in place, so the poller can safely
// re-cover "25th of last month → today" on every run. Rows whose employee code
// doesn't resolve to a user are kept unmatched, mirroring device_punches.
export const prohanceDays = pgTable(
	'prohance_days',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		syncId: uuid('sync_id').references(() => prohanceSyncs.id), // last sync that touched this row
		empCode: text('emp_code').notNull(),
		consoleLoginId: text('console_login_id'),
		userName: text('user_name'),
		sessionDate: date('session_date').notNull(),
		firstLogin: timestamp('first_login', { withTimezone: true }),
		lastLogout: timestamp('last_logout', { withTimezone: true }),
		loggedMinutes: integer('logged_minutes'),
		activeMinutes: integer('active_minutes'),
		idleMinutes: integer('idle_minutes'),
		timeOnSystemMinutes: integer('time_on_system_minutes'),
		timeAwayMinutes: integer('time_away_minutes'),
		dayType: text('day_type'), // ProHance DayTypeAlias: Work Day / Weekly Off / Planned Leave…
		raw: jsonb('raw'), // flattened source row, for audit & future columns
		matchedUserId: uuid('matched_user_id').references(() => users.id),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('prohance_days_emp_code_session_date').on(t.empCode, t.sessionDate)]
);

export const bulkImportStatusEnum = pgEnum('bulk_import_status', ['pending_review', 'applied']);

export const bulkImportRowStatusEnum = pgEnum('bulk_import_row_status', [
	'ready',
	'needs_review',
	'created',
	'skipped_existing'
]);

// A single spreadsheet upload (e.g. "HR Team Master data" sheet), reviewed by the
// Super Admin before any login is actually created — nothing here touches `users`
// until POST .../apply. Reusable for any future sheet with the same column shape.
export const bulkImports = pgTable('bulk_imports', {
	id: uuid('id').primaryKey().defaultRandom(),
	filename: text('filename').notNull(),
	uploadedBy: uuid('uploaded_by').references(() => users.id),
	status: bulkImportStatusEnum('status').default('pending_review').notNull(),
	rowCount: integer('row_count').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	appliedAt: timestamp('applied_at', { withTimezone: true })
});

// One row per person parsed from the sheet. reportsToRowId links to another row in the
// SAME import (reporting-line resolution happens within one batch); the Super Admin
// confirms/corrects this before applying. role/teamId are set by the Super Admin in the
// review step — this app has no automatic designation-to-role inference.
export const bulkImportRows = pgTable('bulk_import_rows', {
	id: uuid('id').primaryKey().defaultRandom(),
	importId: uuid('import_id')
		.references(() => bulkImports.id)
		.notNull(),
	employeeCode: text('employee_code'),
	fullName: text('full_name').notNull(),
	designation: text('designation'),
	officialEmail: text('official_email').notNull(),
	teamAndFloor: text('team_and_floor'),
	reportingAuthorityRaw: text('reporting_authority_raw'),
	dottedLineAuthorityRaw: text('dotted_line_authority_raw'),
	/**
	 * The rest of the parsed spreadsheet row, verbatim. The tracker carries ~50
	 * profile fields; mirroring each as a column here would duplicate
	 * employeeProfiles for data that is transient by design — these rows exist
	 * only between upload and the Super Admin's approval, then stop being read.
	 */
	profileData: jsonb('profile_data').$type<Record<string, unknown>>(),
	/** Data-quality notes from the parser, shown in the review screen. */
	repairNotes: jsonb('repair_notes').$type<string[]>(),
	reportsToRowId: uuid('reports_to_row_id').references((): any => bulkImportRows.id),
	role: roleEnum('role').default('employee').notNull(),
	status: bulkImportRowStatusEnum('status').default('ready').notNull(),
	existingUserId: uuid('existing_user_id').references(() => users.id),
	createdUserId: uuid('created_user_id').references(() => users.id)
});

export const bulkImportsRelations = relations(bulkImports, ({ one, many }) => ({
	uploader: one(users, { fields: [bulkImports.uploadedBy], references: [users.id] }),
	rows: many(bulkImportRows)
}));

export const bulkImportRowsRelations = relations(bulkImportRows, ({ one }) => ({
	import: one(bulkImports, { fields: [bulkImportRows.importId], references: [bulkImports.id] }),
	reportsToRow: one(bulkImportRows, {
		fields: [bulkImportRows.reportsToRowId],
		references: [bulkImportRows.id]
	}),
	existingUser: one(users, { fields: [bulkImportRows.existingUserId], references: [users.id] }),
	createdUser: one(users, { fields: [bulkImportRows.createdUserId], references: [users.id] })
}));

// --- SOP: Attendance Deviations & Comp-Off ---------------------------------
//
// Both tables are request-and-approve records rather than derived state: the
// SOP makes HR the arbiter, so nothing here mutates attendance or leave
// balances until a decision is recorded.

export const attendanceDeviations = pgTable('attendance_deviations', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	// The working day whose attendance is wrong.
	date: date('date').notNull(),
	reason: deviationReasonEnum('reason').notNull(),
	// Free-text account from the employee; this is what the LLM reads.
	description: text('description').notNull(),
	// What the employee says the record should be, when they know.
	claimedCheckIn: text('claimed_check_in'), // 'HH:MM'
	claimedCheckOut: text('claimed_check_out'), // 'HH:MM'
	status: deviationStatusEnum('status').default('pending').notNull(),

	// --- LLM triage (advisory only; HR still decides) ---
	// Populated at submit time by src/lib/server/ai/triage-deviation.ts. Stored
	// so a decision can always be audited against what the model actually saw
	// and said, rather than re-running a non-deterministic call later.
	aiSummary: text('ai_summary'),
	aiSuggestedReason: deviationReasonEnum('ai_suggested_reason'),
	aiConfidence: numeric('ai_confidence', { precision: 4, scale: 3 }),
	aiEvidenceNote: text('ai_evidence_note'),
	aiFlags: jsonb('ai_flags'), // string[] — e.g. ["no_prohance_activity","outside_shift"]
	aiModel: text('ai_model'),
	aiRanAt: timestamp('ai_ran_at', { withTimezone: true }),

	// Snapshot of the corroborating data at submit time, so a later ProHance
	// re-sync can't silently change the basis of an approved request.
	evidenceSnapshot: jsonb('evidence_snapshot'),

	// SOP §2: counts toward the 3/month biometric cap.
	countsTowardMonthlyCap: boolean('counts_toward_monthly_cap').default(true).notNull(),
	monthKey: varchar('month_key', { length: 7 }).notNull(), // 'YYYY-MM', for the cap query

	supportingDocumentId: text('supporting_document_id'), // Mongo policy_documents-style attachment
	reviewerId: uuid('reviewer_id').references((): any => users.id),
	reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
	reviewNote: text('review_note'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const compOffCredits = pgTable('comp_off_credits', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	// The holiday/weekend actually worked.
	workedDate: date('worked_date').notNull(),
	workedMinutes: integer('worked_minutes'), // from ProHance/biometric at claim time
	// SOP §1: 7+ hours on an eligible holiday or weekend earns one comp-off.
	status: compOffStatusEnum('status').default('pending').notNull(),
	// SOP §1: valid 3 months from the date earned, non-encashable.
	expiresOn: date('expires_on').notNull(),
	usedOn: date('used_on'),
	usedApplicationId: uuid('used_application_id').references(() => leaveApplications.id),
	evidenceSnapshot: jsonb('evidence_snapshot'),
	note: text('note'),
	approverId: uuid('approver_id').references((): any => users.id),
	decidedAt: timestamp('decided_at', { withTimezone: true }),
	decisionNote: text('decision_note'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// --- Week-off rosters ------------------------------------------------------
//
// Two tables, deliberately: the *roster* is a reusable pattern the Super Admin
// authors once ("All Sundays", "Sat + Sun", "4-week rotation"), and the
// *assignment* is what actually gives one employee their days off for a date
// range. Separating them is what lets one roster be published to a team lead
// and applied to many people without copying the pattern per employee.

export const weekOffRosters = pgTable('week_off_rosters', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	pattern: weekOffPatternEnum('pattern').notNull(),

	// 'fixed': the weekdays off every week, 0 = Sunday … 6 = Saturday.
	// [0] is "all Sundays"; [0,6] is "Saturday + Sunday".
	weekdays: jsonb('weekdays').$type<number[]>(),

	// 'rotational': one weekday set per week of the cycle, e.g.
	// [[0], [0,6], [0], [5,6]] is a 4-week rotation. cycleWeeks is
	// rotationWeeks.length, stored so the rotation can be queried without
	// unpacking the JSON.
	rotationWeeks: jsonb('rotation_weeks').$type<number[][]>(),
	cycleWeeks: integer('cycle_weeks'),
	// Week 1 of the rotation is the week containing this date. Every assignment
	// counts elapsed weeks from here, so two employees on the same roster stay
	// in phase with each other regardless of when they were assigned.
	rotationAnchorDate: date('rotation_anchor_date'),

	// Team-specific rosters only appear to that team's manager; a null teamId is
	// an org-wide template any manager may apply.
	teamId: uuid('team_id').references(() => teams.id),

	// Drafts are editable and invisible to team leads. Publishing is what makes a
	// roster assignable — same lifecycle as a holiday calendar.
	status: calendarStatusEnum('status').default('draft').notNull(),
	createdBy: uuid('created_by').references((): any => users.id),
	publishedBy: uuid('published_by').references((): any => users.id),
	publishedAt: timestamp('published_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const weekOffAssignments = pgTable('week_off_assignments', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.references(() => users.id)
		.notNull(),
	rosterId: uuid('roster_id')
		.references(() => weekOffRosters.id)
		.notNull(),
	// Open-ended by default: effectiveTo is set when a later assignment supersedes
	// this one, so an employee's history stays readable rather than being
	// overwritten each time their roster changes.
	effectiveFrom: date('effective_from').notNull(),
	effectiveTo: date('effective_to'),
	assignedBy: uuid('assigned_by').references((): any => users.id),
	note: text('note'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const weekOffRostersRelations = relations(weekOffRosters, ({ one, many }) => ({
	team: one(teams, { fields: [weekOffRosters.teamId], references: [teams.id] }),
	creator: one(users, { fields: [weekOffRosters.createdBy], references: [users.id] }),
	publisher: one(users, { fields: [weekOffRosters.publishedBy], references: [users.id] }),
	assignments: many(weekOffAssignments)
}));

export const weekOffAssignmentsRelations = relations(weekOffAssignments, ({ one }) => ({
	user: one(users, { fields: [weekOffAssignments.userId], references: [users.id] }),
	roster: one(weekOffRosters, {
		fields: [weekOffAssignments.rosterId],
		references: [weekOffRosters.id]
	}),
	assigner: one(users, { fields: [weekOffAssignments.assignedBy], references: [users.id] })
}));

export const attendanceDeviationsRelations = relations(attendanceDeviations, ({ one }) => ({
	user: one(users, { fields: [attendanceDeviations.userId], references: [users.id] }),
	reviewer: one(users, { fields: [attendanceDeviations.reviewerId], references: [users.id] })
}));

export const compOffCreditsRelations = relations(compOffCredits, ({ one }) => ({
	user: one(users, { fields: [compOffCredits.userId], references: [users.id] }),
	approver: one(users, { fields: [compOffCredits.approverId], references: [users.id] })
}));
