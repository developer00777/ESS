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
	notes: text('notes'),
	sourceDocumentId: text('source_document_id'), // Mongo policy_documents._id this rule was extracted from
	policyVersion: integer('policy_version').default(1).notNull(),
	effectiveFrom: date('effective_from')
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
