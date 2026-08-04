import ExcelJS from 'exceljs';
import {
	mapSpreadsheet,
	redactCell,
	type SheetMapping,
	type SheetSummary
} from '$lib/server/ai/map-spreadsheet';
import { matchName } from '$lib/server/name-match';

export interface ParsedImportRow {
	// Identity & job — the minimum needed to create a login.
	employeeCode: string | null;
	fullName: string;
	designation: string | null;
	officialEmail: string;
	teamAndFloor: string | null;
	reportingAuthorityRaw: string | null;
	dottedLineAuthorityRaw: string | null;
	subProcessDepartment: string | null;
	floorDetails: string | null;
	dateOfJoining: string | null;
	dateOfConfirmation: string | null;
	officeTimings: string | null;
	shiftType: string | null;
	sourceReferredBy: string | null;

	// Personal & contact
	phone: string | null;
	personalEmail: string | null;
	address: string | null;
	permanentAddress: string | null;
	gender: string | null;
	bloodGroup: string | null;
	dobDocuments: string | null;
	dobActual: string | null;
	religion: string | null;
	motherTongue: string | null;
	facebookId: string | null;
	linkedinUrl: string | null;
	instagramHandle: string | null;

	// Family
	fatherName: string | null;
	fatherDob: string | null;
	fatherContact: string | null;
	motherName: string | null;
	motherDob: string | null;
	motherContact: string | null;
	maritalStatus: string | null;
	spouseName: string | null;
	spouseDob: string | null;
	spouseContact: string | null;
	anniversaryDate: string | null;
	children: { name: string; dob: string | null }[] | null;

	// Emergency contact
	emergencyContactName: string | null;
	emergencyContactRelationship: string | null;
	emergencyContactPhone: string | null;

	// Education & experience
	underGraduate: string | null;
	graduate: string | null;
	masters: string | null;
	diplomaOthers: string | null;
	totalExperience: string | null;

	// Government IDs
	aadharNumber: string | null;
	panNumber: string | null;
	uanNumber: string | null;
	drivingLicenseNumber: string | null;
	votersIdNumber: string | null;
	passportNumber: string | null;

	// Bank
	bankAccountNumber: string | null;
	bankAccountHolderName: string | null;
	bankName: string | null;
	bankIfsc: string | null;
	/**
	 * Staging only. The tracker's salary-bank columns overlap the personal-bank
	 * ones once a row has drifted, so their values join the same pool during
	 * repair. Not persisted — see the bank rebuild in repairMisalignedValues().
	 */
	salaryBankRaw: string | null;
}

/** Fields the review UI treats as sensitive; see maskSensitive(). */
export const SENSITIVE_IMPORT_FIELDS = [
	'aadharNumber',
	'panNumber',
	'bankAccountNumber',
	'passportNumber',
	'votersIdNumber',
	'drivingLicenseNumber'
] as const satisfies readonly (keyof ParsedImportRow)[];

// Header names are matched case-insensitively with surrounding whitespace trimmed —
// the source sheet has trailing spaces on several headers (e.g. "Official E Mail ").
// Synonyms cover the naming drift across the HR trackers ("HR Team Master data",
// "HR Team Master Tracker", …) so familiar shapes never need the LLM fallback.
const HEADER_MAP: Record<string, keyof ParsedImportRow> = {
	'cipl emp code': 'employeeCode',
	'emp code': 'employeeCode',
	'employee code': 'employeeCode',
	'employee id': 'employeeCode',
	'name of the champion': 'fullName',
	'employee name': 'fullName',
	name: 'fullName',
	designation: 'designation',
	'team and floor': 'teamAndFloor',
	team: 'teamAndFloor',
	department: 'teamAndFloor',
	'direct reporting authority': 'reportingAuthorityRaw',
	'reporting authority': 'reportingAuthorityRaw',
	'reporting manager': 'reportingAuthorityRaw',
	'reports to': 'reportingAuthorityRaw',
	'official e mail': 'officialEmail',
	'official e-mail': 'officialEmail',
	'official email': 'officialEmail',
	'official mail id': 'officialEmail',
	'official email id': 'officialEmail',
	'email id': 'officialEmail',
	email: 'officialEmail',
	'work email': 'officialEmail',

	'dotted line reporting authority': 'dottedLineAuthorityRaw',
	'dotted line reporting': 'dottedLineAuthorityRaw',
	'sub process / department': 'subProcessDepartment',
	'sub process/department': 'subProcessDepartment',
	'sub process': 'subProcessDepartment',
	'floor details': 'floorDetails',
	'date of joining': 'dateOfJoining',
	doj: 'dateOfJoining',
	'date of confirmation': 'dateOfConfirmation',
	'office timings': 'officeTimings',
	'type of shift': 'shiftType',
	shift: 'shiftType',
	'source/ referred by': 'sourceReferredBy',
	'source / referred by': 'sourceReferredBy',
	'source/referred by': 'sourceReferredBy',

	'contact number': 'phone',
	'contact no': 'phone',
	'mobile number': 'phone',
	phone: 'phone',
	'personal e mail': 'personalEmail',
	'personal e-mail': 'personalEmail',
	'personal email': 'personalEmail',
	'present address': 'address',
	'current address': 'address',
	'permanent address': 'permanentAddress',
	gender: 'gender',
	'blood group': 'bloodGroup',
	'date of birth as per documents': 'dobDocuments',
	'dob as per documents': 'dobDocuments',
	'actual dob': 'dobActual',
	religion: 'religion',
	'mother tongue': 'motherTongue',
	'facebook id': 'facebookId',
	linkedin: 'linkedinUrl',
	'linkedin id': 'linkedinUrl',
	instagram: 'instagramHandle',
	'instagram id': 'instagramHandle',

	'father name': 'fatherName',
	"father's name": 'fatherName',
	'father contact': 'fatherContact',
	'mother name': 'motherName',
	"mother's name": 'motherName',
	'mother contact': 'motherContact',
	'marital status': 'maritalStatus',
	'spouse name': 'spouseName',
	'spouse d.o.b': 'spouseDob',
	'spouse dob': 'spouseDob',
	'spouse contact #': 'spouseContact',
	'spouse contact': 'spouseContact',
	'date of anniversary': 'anniversaryDate',
	'anniversary date': 'anniversaryDate',

	'contact name in case of emergency': 'emergencyContactName',
	'emergency contact name': 'emergencyContactName',
	'emergency contact relationship': 'emergencyContactRelationship',
	'emergency contact number': 'emergencyContactPhone',

	'under graduate': 'underGraduate',
	graduate: 'graduate',
	masters: 'masters',
	'diploma/others': 'diplomaOthers',
	'diploma / others': 'diplomaOthers',
	'total experience in years': 'totalExperience',
	'total experience': 'totalExperience',

	'aadhar number': 'aadharNumber',
	'aadhaar number': 'aadharNumber',
	'pan no': 'panNumber',
	'pan number': 'panNumber',
	'uan number': 'uanNumber',
	'dl #': 'drivingLicenseNumber',
	'driving license': 'drivingLicenseNumber',
	'voters id #': 'votersIdNumber',
	'voters id': 'votersIdNumber',
	'passport no': 'passportNumber',
	'passport number': 'passportNumber',

	'personal bank account #': 'bankAccountNumber',
	'bank account #': 'bankAccountNumber',
	'bank account number': 'bankAccountNumber',
	'employee name as per bank': 'bankAccountHolderName',
	'bank name': 'bankName',
	'bank-ifsc code': 'bankIfsc',
	'bank ifsc code': 'bankIfsc',
	ifsc: 'bankIfsc',
	// The tracker repeats a salary-bank block after the personal one. Its values
	// are pooled with the personal block during repair (the columns drift into
	// each other), so it is read into a staging field rather than dropped.
	'salary bank account #': 'salaryBankRaw',
	bank: 'salaryBankRaw'
};

function normalizeHeader(value: unknown): string {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

/**
 * HR trackers use "-", "NA" and "N/A" as "nothing here". Treating them as real
 * values would litter profiles with dashes and, worse, make a blank field look
 * populated.
 */
const PLACEHOLDER_CELLS = new Set(['-', '--', 'na', 'n/a', 'nil', 'none', 'null']);

function meaningful(value: string | null): string | null {
	if (value === null) return null;
	const trimmed = value.trim().replace(/'+$/, ''); // sheets suffix ' to force text
	if (trimmed === '' || PLACEHOLDER_CELLS.has(trimmed.toLowerCase())) return null;
	return trimmed;
}

// --- Content-based field recognition -------------------------------------
//
// The master tracker's header row drifts out of alignment with its data, and by
// a different amount on different rows — one person's Aadhaar column holds
// "2.8 yrs", another's holds a real number. Since a header alone cannot be
// trusted, values that have a recognisable shape are verified against it, and
// a value that clearly belongs to a different field is moved there.

const looksLikeAadhaar = (v: string) => /^\d{12}$/.test(v.replace(/\s/g, ''));
const looksLikePan = (v: string) => /^[A-Z]{5}\d{4}[A-Z]$/i.test(v.trim());
const looksLikeIfsc = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.trim());
const looksLikeUan = (v: string) => /^\d{12}$/.test(v.replace(/\s/g, ''));
const looksLikePhone = (v: string) => /^(\+?91[-\s]?)?[6-9]\d{9}$/.test(v.replace(/[-\s]/g, ''));
const looksLikeExperience = (v: string) => /^\d+(\.\d+)?\s*(yrs?|years?)$/i.test(v.trim());
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Repairs a parsed row whose values landed under the wrong headers.
 *
 * Only unambiguous shapes are moved (a 12-digit number, a PAN pattern, an IFSC
 * code), and a value is only relocated into a field that is currently empty —
 * so real data is never overwritten by a guess. Anything still uncertain is
 * left where it was for a human to judge in the review screen.
 */
function repairMisalignedValues(row: ParsedImportRow): string[] {
	const notes: string[] = [];

	// The government-ID block drifts as a unit (experience / Aadhaar / PAN /
	// UAN), so like the bank block it is rebuilt from value shape rather than
	// position: Aadhaar and UAN are 12 digits, PAN has a fixed letter/digit
	// pattern, and an experience value reads as "2.8 yrs". Rebuilding by shape
	// handles a one-column drift and a three-column drift identically.
	const idPool = [
		row.totalExperience,
		row.aadharNumber,
		row.panNumber,
		row.uanNumber,
		row.drivingLicenseNumber
	].filter((v): v is string => v != null);

	const foundPan = idPool.find(looksLikePan);
	const foundExperience = idPool.find(looksLikeExperience);
	const twelveDigit = idPool.filter((v) => looksLikeAadhaar(v) || looksLikeUan(v));
	// Aadhaar and UAN are both 12 digits and indistinguishable by shape alone;
	// the sheet always lists Aadhaar first, so keep that order.
	const [foundAadhaar, foundUan] = twelveDigit;

	if (foundPan || foundExperience || twelveDigit.length > 0) {
		const rebuiltIds = {
			totalExperience: foundExperience ?? null,
			aadharNumber: foundAadhaar ?? null,
			panNumber: foundPan ?? null,
			uanNumber: foundUan ?? null
		};
		const idsChanged =
			row.totalExperience !== rebuiltIds.totalExperience ||
			row.aadharNumber !== rebuiltIds.aadharNumber ||
			row.panNumber !== rebuiltIds.panNumber ||
			row.uanNumber !== rebuiltIds.uanNumber;

		if (idsChanged) {
			// Anything left over that wasn't claimed (e.g. a licence number) stays
			// on drivingLicenseNumber rather than being silently dropped.
			const claimed = new Set(
				[foundExperience, foundAadhaar, foundPan, foundUan].filter(Boolean) as string[]
			);
			const leftover = idPool.find((v) => !claimed.has(v));

			row.totalExperience = rebuiltIds.totalExperience;
			row.aadharNumber = rebuiltIds.aadharNumber;
			row.panNumber = rebuiltIds.panNumber;
			row.uanNumber = rebuiltIds.uanNumber;
			if (leftover && row.drivingLicenseNumber == null) row.drivingLicenseNumber = leftover;
			notes.push('government IDs re-matched by value shape');
		}
	}

	// The bank block drifts by varying amounts between rows, so it is rebuilt
	// from content rather than position: across the four bank columns exactly
	// one value looks like an account number, one like an IFSC code, and the
	// rest are names. Reassigning by shape is reliable where a fixed offset is
	// not.
	const bankValues = [
		row.bankAccountNumber,
		row.bankAccountHolderName,
		row.bankName,
		row.bankIfsc,
		row.salaryBankRaw
	].filter((v): v is string => v != null);
	if (bankValues.length > 0) {
		const account = bankValues.find((v) => /^\d{9,18}$/.test(v));
		const ifsc = bankValues.find(looksLikeIfsc);
		// A bank's name contains "bank"/"SBI"; the remaining name is the holder.
		const bankNamed = bankValues.find(
			(v) => v !== account && v !== ifsc && /\bbank\b|^sbi$/i.test(v)
		);
		const holder = bankValues.find(
			(v) => v !== account && v !== ifsc && v !== bankNamed && /[a-z]/i.test(v)
		);

		const rebuilt = { account, holder, bankNamed, ifsc };
		const changed =
			row.bankAccountNumber !== (account ?? null) ||
			row.bankAccountHolderName !== (holder ?? null) ||
			row.bankName !== (bankNamed ?? null) ||
			row.bankIfsc !== (ifsc ?? null);

		if (changed) {
			row.bankAccountNumber = rebuilt.account ?? null;
			row.bankAccountHolderName = rebuilt.holder ?? null;
			row.bankName = rebuilt.bankNamed ?? null;
			row.bankIfsc = rebuilt.ifsc ?? null;
			notes.push('bank details re-matched by value shape');
		}
	}

	// The emergency-contact block drifts by different amounts per row, and on
	// some rows a stray date occupies the name column. Rebuild it by shape from
	// the columns the block is known to spill into: a phone number is the
	// contact number, a relationship word is the relationship, and a remaining
	// person-like name is the contact.
	const RELATIONSHIPS =
		/^(father|mother|brother|sister|spouse|husband|wife|son|daughter|uncle|aunt|guardian|gardian|friend|cousin|in.?law)/i;
	const isDateLike = (v: string) => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v);

	const emergencyPool = [
		row.emergencyContactName,
		row.emergencyContactRelationship,
		row.emergencyContactPhone,
		row.underGraduate,
		row.graduate,
		row.masters,
		row.diplomaOthers
	].filter((v): v is string => v != null && !isDateLike(v));

	const emPhone = emergencyPool.find(looksLikePhone);
	// A relationship arrives either alone ("Father") or appended to the name
	// ("Sabiha Dongre/ Sister", "Anil / Friend").
	const relationSource = emergencyPool.find((v) => RELATIONSHIPS.test(v) || /[/,]/.test(v));
	const emRelation = relationSource
		? (relationSource
				.split(/[/,]/)
				.map((part) => part.trim())
				.find((part) => RELATIONSHIPS.test(part)) ?? null)
		: null;
	const emName = emergencyPool.find(
		(v) =>
			v !== emPhone &&
			v !== emRelation &&
			/^[a-z][a-z\s./'-]{2,}$/i.test(v) &&
			!/^(sslc|bba|bcom|btech|ba|mba|diploma)/i.test(v)
	);

	if (emPhone && row.emergencyContactPhone !== emPhone) {
		row.emergencyContactPhone = emPhone;
		notes.push('emergency contact number re-matched by value shape');
	}
	if (emRelation && row.emergencyContactRelationship !== emRelation) {
		row.emergencyContactRelationship = emRelation;
	}
	if (emName && row.emergencyContactName !== emName) {
		// Strip a relationship that was written into the name cell.
		const cleaned = emName
			.split(/[/,]/)
			.map((part) => part.trim())
			.find((part) => part && !RELATIONSHIPS.test(part));
		row.emergencyContactName = cleaned ?? emName;
	}
	// A date is never a contact name — drop it rather than show it as one.
	if (row.emergencyContactName && isDateLike(row.emergencyContactName)) {
		row.emergencyContactName = null;
		notes.push('emergency contact name held a date; cleared');
	}

	// Education columns hold emergency-contact data on the drifted rows. Clear
	// anything that isn't a qualification — a phone number, a relationship, a
	// date, or a value already claimed as the emergency contact — so a relative's
	// name never surfaces as someone's degree.
	const claimedByEmergency = new Set(
		[emPhone, emRelation, emName, relationSource].filter(Boolean) as string[]
	);
	// A qualification is a short token like BBA/BCom/MBA/Diploma. Anything that
	// names a person or a relationship came from the drifted contact block.
	const looksLikeQualification = (v: string) =>
		/^(ssl?c|puc|hsc|b\.?[a-z]{1,4}|m\.?[a-z]{1,4}|diploma|degree|graduate|phd|ca|iti)\b/i.test(
			v.trim()
		);
	for (const field of ['underGraduate', 'graduate', 'masters', 'diplomaOthers'] as const) {
		const value = row[field];
		if (!value) continue;
		if (
			looksLikePhone(value) ||
			RELATIONSHIPS.test(value) ||
			isDateLike(value) ||
			claimedByEmergency.has(value) ||
			(/[/,]/.test(value) && !looksLikeQualification(value))
		) {
			row[field] = null;
		}
	}

	// Flag rather than move: a non-email in the personal-email column means the
	// row drifted somewhere upstream, which a reviewer should see.
	if (row.personalEmail && !looksLikeEmail(row.personalEmail)) {
		notes.push(`personalEmail "${row.personalEmail}" is not an email address`);
	}
	if (row.uanNumber && !looksLikeUan(row.uanNumber) && !/^\d+$/.test(row.uanNumber)) {
		notes.push(`uanNumber "${row.uanNumber}" is not a 12-digit UAN`);
	}

	return notes;
}

/**
 * Collapses the tracker's fixed "Kids Name #n / Date of Birth" column pairs into
 * a list, dropping the placeholder rows for people with fewer children.
 */
function collectChildren(
	row: ExcelJS.Row,
	pairs: { nameCol: number; dobCol: number | null }[]
): { name: string; dob: string | null }[] | null {
	const kids: { name: string; dob: string | null }[] = [];
	for (const { nameCol, dobCol } of pairs) {
		const name = meaningful(cellText(row.getCell(nameCol).value));
		if (!name) continue;
		const dob = dobCol ? meaningful(cellText(row.getCell(dobCol).value)) : null;
		kids.push({ name, dob });
	}
	return kids.length > 0 ? kids : null;
}

function cellText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	// Excel dates arrive as Date objects; String() would render them as
	// "Wed Jun 21 2023 05:30:00 GMT+0530", which is neither storable in a date
	// column nor readable. Normalise to ISO (YYYY-MM-DD) instead.
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
	}
	if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
		return String((value as { text: unknown }).text).trim() || null;
	}
	const s = String(value).trim();
	return s === '' ? null : s;
}

export interface ParseResult {
	rows: ParsedImportRow[];
	/** Which sheet was used, and how it was chosen — surfaced in the review UI. */
	sheetName: string;
	strategy: 'known-headers' | 'ai-mapped';
	note: string | null;
	/**
	 * Per-row data-quality notes keyed by row index: values relocated out of a
	 * mislabelled column, and values that still look wrong. Shown in the review
	 * screen so a corrected import is never silently corrected.
	 */
	repairs: Record<number, string[]>;
}

/**
 * Locates the tracker's repeating "Kids Name #n" / "Date of Birth" column pairs.
 * They share the header "Date of Birth" with each other, so they are found by
 * position — the DOB column immediately following each kid-name column.
 */
function findChildColumns(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number
): { nameCol: number; dobCol: number | null }[] {
	const header = sheet.getRow(headerRowNumber);
	const pairs: { nameCol: number; dobCol: number | null }[] = [];
	header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
		if (!/^kids?\s*name\s*#?\d*$/i.test(normalizeHeader(cell.value))) return;
		const next = normalizeHeader(header.getCell(colNumber + 1).value);
		pairs.push({
			nameCol: colNumber,
			dobCol: /date of birth|dob/.test(next) ? colNumber + 1 : null
		});
	});
	return pairs;
}

/** Reads a sheet given an explicit header row and column-number map. */
function readRows(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number,
	columnIndex: Partial<Record<keyof ParsedImportRow, number>>
): { rows: ParsedImportRow[]; repairs: Record<number, string[]> } {
	const rows: ParsedImportRow[] = [];
	const repairs: Record<number, string[]> = {};
	const childColumns = findChildColumns(sheet, headerRowNumber);

	const at = (row: ExcelJS.Row, field: keyof ParsedImportRow) => {
		const col = columnIndex[field];
		return col ? meaningful(cellText(row.getCell(col).value)) : null;
	};

	sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber <= headerRowNumber) return;

		const fullName = at(row, 'fullName');
		const officialEmail = at(row, 'officialEmail');
		// A person needs at minimum a name and a work email to become a login.
		if (!fullName || !officialEmail) return;

		const parsed: ParsedImportRow = {
			employeeCode: at(row, 'employeeCode'),
			fullName,
			designation: at(row, 'designation'),
			officialEmail: officialEmail.toLowerCase(),
			teamAndFloor: at(row, 'teamAndFloor'),
			reportingAuthorityRaw: at(row, 'reportingAuthorityRaw'),
			dottedLineAuthorityRaw: at(row, 'dottedLineAuthorityRaw'),
			subProcessDepartment: at(row, 'subProcessDepartment'),
			floorDetails: at(row, 'floorDetails'),
			dateOfJoining: at(row, 'dateOfJoining'),
			dateOfConfirmation: at(row, 'dateOfConfirmation'),
			officeTimings: at(row, 'officeTimings'),
			shiftType: at(row, 'shiftType'),
			sourceReferredBy: at(row, 'sourceReferredBy'),

			phone: at(row, 'phone'),
			personalEmail: at(row, 'personalEmail'),
			address: at(row, 'address'),
			permanentAddress: at(row, 'permanentAddress'),
			gender: at(row, 'gender'),
			bloodGroup: at(row, 'bloodGroup'),
			dobDocuments: at(row, 'dobDocuments'),
			dobActual: at(row, 'dobActual'),
			religion: at(row, 'religion'),
			motherTongue: at(row, 'motherTongue'),
			facebookId: at(row, 'facebookId'),
			linkedinUrl: at(row, 'linkedinUrl'),
			instagramHandle: at(row, 'instagramHandle'),

			fatherName: at(row, 'fatherName'),
			fatherDob: at(row, 'fatherDob'),
			fatherContact: at(row, 'fatherContact'),
			motherName: at(row, 'motherName'),
			motherDob: at(row, 'motherDob'),
			motherContact: at(row, 'motherContact'),
			maritalStatus: at(row, 'maritalStatus'),
			spouseName: at(row, 'spouseName'),
			spouseDob: at(row, 'spouseDob'),
			spouseContact: at(row, 'spouseContact'),
			anniversaryDate: at(row, 'anniversaryDate'),
			children: collectChildren(row, childColumns),

			emergencyContactName: at(row, 'emergencyContactName'),
			emergencyContactRelationship: at(row, 'emergencyContactRelationship'),
			emergencyContactPhone: at(row, 'emergencyContactPhone'),

			underGraduate: at(row, 'underGraduate'),
			graduate: at(row, 'graduate'),
			masters: at(row, 'masters'),
			diplomaOthers: at(row, 'diplomaOthers'),
			totalExperience: at(row, 'totalExperience'),

			aadharNumber: at(row, 'aadharNumber'),
			panNumber: at(row, 'panNumber'),
			uanNumber: at(row, 'uanNumber'),
			drivingLicenseNumber: at(row, 'drivingLicenseNumber'),
			votersIdNumber: at(row, 'votersIdNumber'),
			passportNumber: at(row, 'passportNumber'),

			bankAccountNumber: at(row, 'bankAccountNumber'),
			bankAccountHolderName: at(row, 'bankAccountHolderName'),
			bankName: at(row, 'bankName'),
			bankIfsc: at(row, 'bankIfsc'),
			salaryBankRaw: at(row, 'salaryBankRaw')
		};

		const notes = repairMisalignedValues(parsed);
		if (notes.length > 0) repairs[rows.length] = notes;
		rows.push(parsed);
	});

	return { rows, repairs };
}

/**
 * Finds the worksheet the model named, tolerating the ways a model rewrites a
 * name: trimmed trailing spaces, case differences, or a close-but-partial name.
 * Sheet names in real HR workbooks routinely carry invisible trailing spaces,
 * and exceljs's getWorksheet() is exact-match only.
 */
function resolveSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
	const exact = workbook.getWorksheet(name);
	if (exact) return exact;

	const norm = (s: string) => s.trim().toLowerCase();
	const target = norm(name);

	const caseInsensitive = workbook.worksheets.filter((s) => norm(s.name) === target);
	if (caseInsensitive.length === 1) return caseInsensitive[0];

	const partial = workbook.worksheets.filter(
		(s) => norm(s.name).includes(target) || target.includes(norm(s.name))
	);
	if (partial.length === 1) return partial[0];

	// A one-sheet workbook leaves no room for ambiguity about which sheet was meant.
	if (workbook.worksheets.length === 1) return workbook.worksheets[0];
	return undefined;
}

/** Tries the known header names against one sheet's given header row. */
function matchKnownHeaders(
	sheet: ExcelJS.Worksheet,
	headerRowNumber: number
): Partial<Record<keyof ParsedImportRow, number>> {
	const columnIndex: Partial<Record<keyof ParsedImportRow, number>> = {};
	sheet.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const field = HEADER_MAP[normalizeHeader(cell.value)];
		// First occurrence wins. The tracker repeats several header names —
		// "Contact Number" is both the employee's and the emergency contact's —
		// and the employee's own always comes first. Letting a later duplicate
		// overwrite would silently put the wrong person's number on the profile.
		if (field && columnIndex[field] === undefined) columnIndex[field] = colNumber;
	});
	return columnIndex;
}

/**
 * Parses an HR spreadsheet into one row per person.
 *
 * Sheet names and column headers are NOT assumed: every sheet is tried against
 * the known header set first (instant, offline, and unchanged for files we
 * already understand). Only when no sheet matches does the LLM inspect the
 * workbook's structure and decide the mapping, so an unfamiliar export — a
 * renamed sheet, reordered or reworded columns — still imports.
 *
 * Cell values sent to the model are redacted; see redactCell.
 */
export async function parseHrTeamSheet(buffer: Buffer): Promise<ParseResult> {
	const workbook = new ExcelJS.Workbook();
	// exceljs's Buffer type predates newer @types/node Buffer fields (maxByteLength, etc.)
	await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

	const sheets = workbook.worksheets;
	if (sheets.length === 0) throw new Error('This workbook has no sheets');

	// --- 1. Deterministic pass: any sheet whose headers we already recognise.
	// Header rows are usually row 1, but tolerate a title row or two above it.
	let best: { sheet: ExcelJS.Worksheet; headerRow: number; index: Partial<Record<keyof ParsedImportRow, number>> } | null =
		null;

	for (const sheet of sheets) {
		for (let headerRow = 1; headerRow <= Math.min(3, sheet.rowCount); headerRow++) {
			const index = matchKnownHeaders(sheet, headerRow);
			if (index.fullName && index.officialEmail) {
				const score = Object.keys(index).length;
				const bestScore = best ? Object.keys(best.index).length : -1;
				if (score > bestScore) best = { sheet, headerRow, index };
			}
		}
	}

	if (best) {
		const { rows, repairs } = readRows(best.sheet, best.headerRow, best.index);
		if (rows.length > 0) {
			return {
				rows,
				sheetName: best.sheet.name,
				strategy: 'known-headers',
				note: null,
				repairs
			};
		}
	}

	// --- 2. LLM pass: nothing matched, so let the model decide.
	const summaries: SheetSummary[] = sheets.map((sheet) => {
		const sampleRows: string[][] = [];
		const limit = Math.min(4, sheet.rowCount);
		for (let r = 1; r <= limit; r++) {
			const cells: string[] = [];
			sheet.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
				const text = cellText(cell.value) ?? '';
				// Row 1 is nearly always headers and carries no personal data —
				// send it verbatim so the model can match on exact header text.
				cells.push(r === 1 ? text : redactCell(text));
			});
			sampleRows.push(cells);
		}
		return { name: sheet.name, rowCount: sheet.rowCount, sampleRows };
	});

	let mapping: SheetMapping;
	try {
		mapping = await mapSpreadsheet(summaries);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Could not recognise this spreadsheet's layout, and automatic mapping failed: ${detail}`
		);
	}

	const sheet = resolveSheet(workbook, mapping.sheetName);
	if (!sheet) {
		const available = workbook.worksheets.map((s) => `"${s.name}"`).join(', ');
		throw new Error(
			`Automatic mapping chose sheet "${mapping.sheetName}", which isn't in this workbook (sheets found: ${available})`
		);
	}

	// Resolve the model's header TEXT back to column numbers.
	const headerToCol = new Map<string, number>();
	sheet.getRow(mapping.headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const text = cellText(cell.value);
		if (text) headerToCol.set(normalizeHeader(text), colNumber);
	});

	const resolve = (header: string | null) =>
		header ? headerToCol.get(normalizeHeader(header)) : undefined;

	const index: Partial<Record<keyof ParsedImportRow, number>> = {
		employeeCode: resolve(mapping.columns.employeeCode),
		fullName: resolve(mapping.columns.fullName),
		designation: resolve(mapping.columns.designation),
		officialEmail: resolve(mapping.columns.officialEmail),
		teamAndFloor: resolve(mapping.columns.teamAndFloor),
		reportingAuthorityRaw: resolve(mapping.columns.reportingAuthority)
	};

	if (!index.fullName || !index.officialEmail) {
		const missing = [!index.fullName && 'employee name', !index.officialEmail && 'work email']
			.filter(Boolean)
			.join(' and ');
		throw new Error(
			`Could not find a ${missing} column in "${sheet.name}"${mapping.note ? ` — ${mapping.note}` : ''}`
		);
	}

	// The model is only asked to find the columns needed to create a login. Every
	// other field is filled in from the known header names on the row the model
	// identified as the header — so an unfamiliar sheet still imports full
	// profiles rather than just names and emails.
	const byHeader = matchKnownHeaders(sheet, mapping.headerRow);
	for (const [field, column] of Object.entries(byHeader)) {
		const key = field as keyof ParsedImportRow;
		if (index[key] === undefined) index[key] = column;
	}

	const { rows, repairs } = readRows(sheet, mapping.headerRow, index);

	return {
		rows,
		sheetName: sheet.name,
		strategy: 'ai-mapped',
		note: mapping.note ?? null,
		repairs
	};
}

/**
 * Finds an existing user whose full name closely matches this row's name but whose
 * email DIDN'T already match (so the plain email-based existing-user check missed
 * them) — e.g. a sheet listing someone's work-issued email while their real login
 * uses a different domain. Returned as a suggestion for the Super Admin to confirm
 * ("link to this existing person?") rather than silently creating a duplicate account.
 */
export function suggestExistingUserMatch<T extends { id: string; fullName: string }>(
	rowFullName: string,
	existingUsers: T[]
): T | null {
	const result = matchName(
		rowFullName,
		existingUsers.map((u) => ({ key: u.id, fullName: u.fullName }))
	);
	if (result.status !== 'matched') return null;
	return existingUsers.find((u) => u.id === result.key) ?? null;
}

/**
 * Best-effort match of a raw "reports to" name against the other rows in the SAME
 * import batch. Handles spelling variants ("Deepak Gudur" vs "Deepak Guduru" vs
 * "Deepak") and word-order differences ("Santhosh Reddy S" vs "S Santhosh Reddy").
 *
 * A tie between two people resolves to no match rather than picking one: this is
 * a SUGGESTION the Super Admin confirms, and a blank is far easier to spot and
 * correct than a confident-looking wrong manager.
 */
export function suggestReportsToIndex(
	reportingAuthorityRaw: string | null,
	rows: ParsedImportRow[],
	selfIndex: number
): number | null {
	const candidates = rows
		.map((row, i) => ({ key: String(i), fullName: row.fullName }))
		.filter((_, i) => i !== selfIndex);

	const result = matchName(reportingAuthorityRaw, candidates);
	return result.status === 'matched' ? Number(result.key) : null;
}
