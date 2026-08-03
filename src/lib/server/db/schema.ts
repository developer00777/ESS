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
	pgEnum
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

export const calendarStatusEnum = pgEnum('calendar_status', ['draft', 'published', 'archived']);

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
	directReportingAuthority: text('direct_reporting_authority'),
	dottedLineReportingAuthority: text('dotted_line_reporting_authority'),
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
