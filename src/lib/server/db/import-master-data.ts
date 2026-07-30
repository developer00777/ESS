import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const connectionString =
	process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/champ_hr';

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

// Sourced from "personal master data.xlsx" for Prasanna Kumar M G (CIPL2666),
// already seeded as the Super Admin (admin@champ-hr.local). Several source columns
// were shifted one cell right of their header from "Contact Number" (emergency)
// through "UAN Number" — values below are corrected back to their real header.
const MASTER_DATA = {
	email: 'admin@champ-hr.local',
	profile: {
		phone: '8660260637',
		personalEmail: 'Prasannakumarmg1789@gmail.com',
		address: '#1040, 6th Cross, 7th Main , Ashoka Nagar Near Kempagowda Playground Bangalore,Karnataka - 560085',
		permanentAddress:
			'#1040, 6th Cross, 7th Main , Ashoka Nagar Near Kempagowda Playground Bangalore,Karnataka - 560085',
		facebookId: null,
		linkedinUrl: null,
		instagramHandle: null,

		emergencyContactName: 'Kalyan Kumar M G',
		emergencyContactRelationship: 'Guardian',
		emergencyContactPhone: '8431634630',

		gender: 'Male',
		bloodGroup: 'O+ve',
		dobDocuments: '2001-04-15',
		dobActual: '2001-04-15',
		fatherName: 'Gajendra M',
		fatherContact: 'Late',
		motherName: 'Sujatha M',
		motherDob: '1981-08-10',
		motherContact: '7338020223',
		religion: 'Hindu',
		motherTongue: 'Telugu',
		maritalStatus: 'Unmarried',
		spouseName: null,
		spouseDob: null,
		spouseContact: null,
		anniversaryDate: null,

		underGraduate: null,
		graduate: 'BBA',
		masters: null,
		diplomaOthers: 'Diploma in Hotel Management',
		totalExperience: '2.8 yrs',

		aadharNumber: '249293242615',
		panNumber: 'FKJPP9632R',
		uanNumber: '101558316456',
		drivingLicenseNumber: null,
		votersIdNumber: null,
		passportNumber: null,

		bankAccountNumber: '50100509155982',
		bankAccountHolderName: 'Prasanna kumar M G',
		bankName: 'HDFC Bank',
		bankIfsc: 'HDFC0004274',

		designation: 'Sr.HRBP',
		teamAndFloor: 'HR Team',
		subProcessDepartment: 'HR Team',
		floorDetails: 'BCS - 12th Floor',
		dateOfJoining: '2023-06-21',
		dateOfConfirmation: '2023-12-18',
		officeTimings: '06:00 PM to 03:30 PM',
		shiftType: 'Night Shift',
		directReportingAuthority: 'Deepak Gudur',
		dottedLineReportingAuthority: 'Deepak Gudur',
		sourceReferredBy: null
	}
};

async function importMasterData() {
	console.log('Importing personal master data...');

	const [user] = await db.select().from(schema.users).where(eq(schema.users.email, MASTER_DATA.email)).limit(1);
	if (!user) {
		throw new Error(`No user found with email ${MASTER_DATA.email} — run the seed script first`);
	}

	const [existing] = await db
		.select()
		.from(schema.employeeProfiles)
		.where(eq(schema.employeeProfiles.userId, user.id))
		.limit(1);

	const values = { ...MASTER_DATA.profile, updatedAt: new Date() };

	if (existing) {
		await db
			.update(schema.employeeProfiles)
			.set(values)
			.where(eq(schema.employeeProfiles.userId, user.id));
		console.log(`Updated employee_profiles for ${user.fullName} (${user.email})`);
	} else {
		await db.insert(schema.employeeProfiles).values({ userId: user.id, ...values });
		console.log(`Inserted employee_profiles for ${user.fullName} (${user.email})`);
	}

	await pool.end();
}

importMasterData().catch((err) => {
	console.error(err);
	process.exit(1);
});
