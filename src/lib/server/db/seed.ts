import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import * as schema from './schema';

const connectionString =
	process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/champ_hr';

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@champ-hr.local';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe!123';
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? 'employee@champ-hr.local';
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? 'ChangeMe!123';

async function seed() {
	console.log('Seeding Champ HR ESS Portal...');

	const [dept] = await db
		.insert(schema.departments)
		.values({ name: 'Sales Business HR' })
		.returning();

	const [team] = await db
		.insert(schema.teams)
		.values({ name: 'Champ HR Core Team', departmentId: dept.id })
		.returning();

	const superAdminPasswordHash = await hash(SUPER_ADMIN_PASSWORD, ARGON2_OPTS);
	const [superAdmin] = await db
		.insert(schema.users)
		.values({
			email: SUPER_ADMIN_EMAIL.toLowerCase(),
			passwordHash: superAdminPasswordHash,
			role: 'super_admin',
			fullName: 'Prasanna Kumar',
			isActive: true,
			mustChangePassword: false
		})
		.returning();

	const adminPasswordHash = await hash('ChangeMe!123', ARGON2_OPTS);
	const [admin] = await db
		.insert(schema.users)
		.values({
			email: 'hr-admin@champ-hr.local',
			passwordHash: adminPasswordHash,
			role: 'admin',
			fullName: 'Sanjay Mehta',
			reportsTo: superAdmin.id,
			isActive: true,
			mustChangePassword: true
		})
		.returning();

	const leadPasswordHash = await hash('ChangeMe!123', ARGON2_OPTS);
	const [lead] = await db
		.insert(schema.users)
		.values({
			email: 'lead@champ-hr.local',
			passwordHash: leadPasswordHash,
			role: 'team_lead',
			fullName: 'Aditi Sharma',
			teamId: team.id,
			reportsTo: superAdmin.id,
			isActive: true,
			mustChangePassword: false
		})
		.returning();

	await db.update(schema.teams).set({ teamLeadId: lead.id }).where(eq(schema.teams.id, team.id));

	const empPasswordHash = await hash(EMPLOYEE_PASSWORD, ARGON2_OPTS);
	const [employee] = await db
		.insert(schema.users)
		.values({
			email: EMPLOYEE_EMAIL.toLowerCase(),
			passwordHash: empPasswordHash,
			role: 'employee',
			fullName: 'Ravi Verma',
			teamId: team.id,
			reportsTo: lead.id,
			isActive: true,
			mustChangePassword: false
		})
		.returning();

	await db.insert(schema.employeeProfiles).values([
		{ userId: superAdmin.id, designation: 'HR Systems Lead', dateOfJoining: '2020-01-15' },
		{ userId: admin.id, designation: 'HR Administrator', dateOfJoining: '2021-02-01' },
		{ userId: lead.id, designation: 'Team Lead, Sales Business HR', dateOfJoining: '2021-03-01' },
		{ userId: employee.id, designation: 'HR Associate', dateOfJoining: '2023-06-10' }
	]);

	const leaveTypeRows = await db
		.insert(schema.leaveTypes)
		.values([
			{ name: 'Casual Leave', accrualPerMonth: '1', carryForwardCap: 6, encashmentEligible: false },
			{ name: 'Sick Leave', accrualPerMonth: '1', carryForwardCap: 0, encashmentEligible: false },
			{
				name: 'Earned Leave',
				accrualPerMonth: '1.5',
				carryForwardCap: 30,
				encashmentEligible: true
			}
		])
		.returning();

	const year = new Date().getFullYear();
	for (const lt of leaveTypeRows) {
		await db.insert(schema.leaveAllocations).values([
			{ userId: employee.id, leaveTypeId: lt.id, year, allocatedDays: '12', usedDays: '0' },
			{ userId: lead.id, leaveTypeId: lt.id, year, allocatedDays: '12', usedDays: '0' }
		]);
	}

	console.log('Seed complete:');
	console.log(`  Super Admin: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
	console.log('  Admin:       hr-admin@champ-hr.local / ChangeMe!123 (must change password on first login)');
	console.log('  Team Lead:   lead@champ-hr.local / ChangeMe!123');
	console.log(`  Employee:    ${EMPLOYEE_EMAIL} / ${EMPLOYEE_PASSWORD}`);

	await pool.end();
}

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});
