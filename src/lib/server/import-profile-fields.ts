import type { employeeProfiles } from '$lib/server/db/schema';

type ProfileInsert = typeof employeeProfiles.$inferInsert;

/**
 * Profile columns a spreadsheet import is allowed to populate.
 *
 * Deliberately an allow-list rather than a spread of whatever the parser
 * produced: the staged row is JSON built from an uploaded file, so an unexpected
 * key must never reach an UPDATE. Identity and org fields (employeeCode,
 * designation, reporting lines) are set explicitly by the caller and are not
 * listed here.
 */
const TEXT_FIELDS = [
	'phone',
	'personalEmail',
	'address',
	'permanentAddress',
	'facebookId',
	'linkedinUrl',
	'instagramHandle',
	'emergencyContactName',
	'emergencyContactRelationship',
	'emergencyContactPhone',
	'gender',
	'bloodGroup',
	'fatherName',
	'fatherContact',
	'motherName',
	'motherContact',
	'religion',
	'motherTongue',
	'maritalStatus',
	'spouseName',
	'spouseDob',
	'spouseContact',
	'anniversaryDate',
	'underGraduate',
	'graduate',
	'masters',
	'diplomaOthers',
	'totalExperience',
	'aadharNumber',
	'panNumber',
	'uanNumber',
	'drivingLicenseNumber',
	'votersIdNumber',
	'passportNumber',
	'bankAccountNumber',
	'bankAccountHolderName',
	'bankName',
	'bankIfsc',
	'subProcessDepartment',
	'floorDetails',
	'officeTimings',
	'shiftType',
	'sourceReferredBy'
] as const satisfies readonly (keyof ProfileInsert)[];

/**
 * Columns typed as `date` in Postgres. A malformed value here fails the whole
 * insert, and HR sheets routinely hold "Late", "-" or a stray label in a date
 * column — so these are validated rather than passed through.
 */
const DATE_FIELDS = [
	'dobDocuments',
	'dobActual',
	'motherDob',
	'fatherDob',
	'dateOfJoining',
	'dateOfConfirmation'
] as const satisfies readonly (keyof ProfileInsert)[];

/** Accepts only a real ISO calendar date; anything else becomes null. */
function isoDateOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
	const parsed = new Date(`${trimmed}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	// Rejects impossible dates that Date would roll over (2025-02-30 → Mar 2).
	return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

function textOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

/**
 * Maps a staged import row's extra data onto employee-profile columns.
 *
 * Only keys in the allow-lists above are read, so nothing unexpected in the
 * uploaded file can reach the database.
 */
export function profileValuesFromImport(
	profileData: Record<string, unknown> | null | undefined
): Partial<ProfileInsert> {
	if (!profileData) return {};
	const values: Record<string, unknown> = {};

	for (const field of TEXT_FIELDS) {
		const value = textOrNull(profileData[field]);
		if (value !== null) values[field] = value;
	}

	for (const field of DATE_FIELDS) {
		const value = isoDateOrNull(profileData[field]);
		if (value !== null) values[field] = value;
	}

	const children = profileData.children;
	if (Array.isArray(children) && children.length > 0) {
		const cleaned = children
			.filter(
				(child): child is { name: string; dob: unknown } =>
					typeof child === 'object' && child !== null && typeof (child as { name?: unknown }).name === 'string'
			)
			.map((child) => ({ name: child.name.trim(), dob: isoDateOrNull(child.dob) }))
			.filter((child) => child.name !== '');
		if (cleaned.length > 0) values.children = cleaned;
	}

	return values as Partial<ProfileInsert>;
}
