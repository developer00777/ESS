/**
 * Audits an HR master tracker before it is uploaded to Admin Controls ›
 * People › Bulk import. Runs the portal's own parser (parseHrTeamSheet), then
 * checks each row against what the import and the rest of ESS rely on: login
 * emails, employee codes, reporting lines, dates, shift timings and the
 * shape of ID numbers. Prints counts and names only, never ID or bank numbers.
 *
 *   npx tsx --import ./scripts/env-shim-register.mjs scripts/audit-master-tracker.ts "<file.xlsx>" [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { parseHrTeamSheet, suggestReportsToIndex, looksLikeEmail, type ParsedImportRow } from '../src/lib/server/bulk-import';
import { matchName } from '../src/lib/server/name-match';
import { parseOfficeHours, verhoeffValid } from '../src/lib/chat/rules';

const file = process.argv[2];
const out = process.argv[3];
if (!file) throw new Error('Pass the .xlsx path');

const today = new Date().toISOString().slice(0, 10);
const issues: Record<string, string[]> = {};
const add = (k: string, v: string) => (issues[k] ??= []).push(v);
const who = (r: ParsedImportRow, i: number) => `${r.employeeCode ?? '(no code)'} ${r.fullName} [sheet row ~${i + 2}]`;
const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const years = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

async function main() {
	const buf = readFileSync(file);

	// Raw count of people rows, to see who the parser leaves out.
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(buf as unknown as ArrayBuffer);
	const ws = wb.worksheets[0];
	let rawPeople = 0;
	const rawNamesWithoutEmail: string[] = [];
	ws.eachRow((row, n) => {
		if (n === 1) return;
		const name = String(row.getCell(3).text ?? '').trim();
		const email = String(row.getCell(18).text ?? '').trim();
		if (!name) return;
		rawPeople++;
		if (!email) rawNamesWithoutEmail.push(`${String(row.getCell(2).text).trim() || '(no code)'} ${name} [sheet row ${n}]`);
	});

	const parsed = await parseHrTeamSheet(buf);
	const rows = parsed.rows;

	// --- identity: login email and employee code
	const byEmail = new Map<string, number[]>();
	const byCode = new Map<string, number[]>();
	const byName = new Map<string, number[]>();
	rows.forEach((r, i) => {
		const e = r.officialEmail.trim().toLowerCase();
		(byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push(i);
		if (r.employeeCode) (byCode.get(r.employeeCode.trim().toUpperCase()) ?? byCode.set(r.employeeCode.trim().toUpperCase(), []).get(r.employeeCode.trim().toUpperCase())!).push(i);
		const nm = r.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
		(byName.get(nm) ?? byName.set(nm, []).get(nm)!).push(i);

		if (!looksLikeEmail(r.officialEmail)) add('Login email is not an email address', `${who(r, i)}: "${r.officialEmail}"`);
		else if (!/@championsmail\.com$/i.test(r.officialEmail.trim())) add('Login email is not @championsmail.com', `${who(r, i)}: ${r.officialEmail}`);
		if (!r.employeeCode) add('Missing employee code (biometric punches will not link)', who(r, i));
		else if (!/^CIPL\d{4}$/i.test(r.employeeCode.trim())) add('Employee code not in CIPLnnnn form', `${who(r, i)}: "${r.employeeCode}"`);
		if (!r.designation) add('Missing designation', who(r, i));
		if (!r.teamAndFloor) add('Missing team', who(r, i));
		if (r.personalEmail && !looksLikeEmail(r.personalEmail)) add('Personal email is not an email address', `${who(r, i)}: "${r.personalEmail}"`);
	});
	for (const [e, idx] of byEmail) if (idx.length > 1) add('Same login email on more than one row (only one login can be created)', `${e}: ${idx.map((i) => rows[i].fullName).join(', ')}`);
	for (const [c, idx] of byCode) if (idx.length > 1) add('Same employee code on more than one row', `${c}: ${idx.map((i) => rows[i].fullName).join(', ')}`);
	for (const [n, idx] of byName) if (idx.length > 1) add('Same name on more than one row (check they are different people)', `${n}: ${idx.map((i) => rows[i].employeeCode ?? '?').join(', ')}`);

	// --- reporting lines, resolved the way the import suggests them
	const chief = /^chief\b|^ceo$|^md$|^director$/i;
	rows.forEach((r, i) => {
		const raw = r.reportingAuthorityRaw?.trim() || null;
		if (!raw) add('No direct reporting authority (leave and attendance approvals fall to HR)', who(r, i));
		else if (!chief.test(raw)) {
			const idx = suggestReportsToIndex(raw, rows, i);
			if (idx === null) {
				const amb = matchName(raw, rows.map((x, j) => ({ key: String(j), fullName: x.fullName })).filter((_, j) => j !== i));
				if (amb.status === 'ambiguous') add('Reporting authority matches more than one person', `${who(r, i)} → "${raw}" could be ${amb.tied.map((t) => t.fullName).join(' / ')}`);
				else add('Reporting authority matches nobody in the sheet', `${who(r, i)} → "${raw}"`);
			} else if (idx === i) add('Reports to themselves', who(r, i));
		}
		const dot = r.dottedLineAuthorityRaw?.trim();
		if (dot && !chief.test(dot) && !/^(na|n\/a|nil|-|none)$/i.test(dot) && suggestReportsToIndex(dot, rows, i) === null) add('Dotted-line authority matches nobody in the sheet', `${who(r, i)} → "${dot}"`);
	});

	// --- dates
	rows.forEach((r, i) => {
		if (!r.dateOfJoining) add('Missing date of joining (leave accrual and tenure need it)', who(r, i));
		else if (!isDate(r.dateOfJoining)) add('Date of joining not a date', `${who(r, i)}: "${r.dateOfJoining}"`);
		else if (r.dateOfJoining > today) add('Date of joining is in the future', `${who(r, i)}: ${r.dateOfJoining}`);
		if (r.dateOfConfirmation === today) add('Date of confirmation is TODAY (looks like a =TODAY() formula, not a real date)', who(r, i));
		else if (r.dateOfConfirmation && isDate(r.dateOfConfirmation) && r.dateOfJoining && isDate(r.dateOfJoining) && r.dateOfConfirmation < r.dateOfJoining)
			add('Confirmed before joining', `${who(r, i)}: joined ${r.dateOfJoining}, confirmed ${r.dateOfConfirmation}`);
		else if (r.dateOfConfirmation && !isDate(r.dateOfConfirmation)) add('Date of confirmation not a date', `${who(r, i)}: "${r.dateOfConfirmation}"`);
		const dob = r.dobActual ?? r.dobDocuments;
		if (!dob) add('Missing date of birth (no birthday wishes, no age checks)', who(r, i));
		else if (!isDate(dob)) add('Date of birth not a date', `${who(r, i)}: "${dob}"`);
		else {
			const age = years(dob, today);
			if (age < 18 || age > 70) add('Date of birth gives an unlikely age', `${who(r, i)}: ${dob} (age ${age.toFixed(0)})`);
		}
		if (r.dobDocuments && r.dobActual && isDate(r.dobDocuments) && isDate(r.dobActual) && Math.abs(years(r.dobDocuments, r.dobActual)) > 3)
			add('Document DOB and actual DOB differ by over 3 years (check for a typo)', `${who(r, i)}: ${r.dobDocuments} vs ${r.dobActual}`);
	});

	// --- shift and contact
	rows.forEach((r, i) => {
		if (!r.officeTimings) add('Missing office timings (quiet hours default to 9 to 6)', who(r, i));
		else if (!parseOfficeHours(r.officeTimings)) add('Office timings cannot be read', `${who(r, i)}: "${r.officeTimings}"`);
		if (!r.gender) add('Missing gender (pink leave eligibility cannot be worked out)', who(r, i));
		else if (!/^(male|female|m|f|other|transgender)$/i.test(r.gender.trim())) add('Gender value not recognised', `${who(r, i)}: "${r.gender}"`);
		const digits = (r.phone ?? '').replace(/\D/g, '');
		if (!r.phone) add('Missing contact number', who(r, i));
		else if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith('91')))) add('Contact number is not a 10-digit mobile', `${who(r, i)}: ${digits.length} digits`);
		if (!r.emergencyContactPhone) add('Missing emergency contact number', who(r, i));
	});

	// --- ID and bank shapes (counted, never printed)
	rows.forEach((r, i) => {
		const a = (r.aadharNumber ?? '').replace(/\D/g, '');
		if (!r.aadharNumber) add('Missing Aadhaar', who(r, i));
		else if (a.length !== 12 || !verhoeffValid(a)) add('Aadhaar number fails the checksum (typo)', who(r, i));
		if (!r.panNumber) add('Missing PAN', who(r, i));
		else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(r.panNumber.trim().toUpperCase())) add('PAN not in ABCDE1234F form', who(r, i));
		if (r.uanNumber && !/^\d{12}$/.test(r.uanNumber.replace(/\s/g, ''))) add('UAN is not 12 digits', who(r, i));
		if (!r.bankAccountNumber) add('Missing bank account', who(r, i));
		else if (!/^\d{9,18}$/.test(r.bankAccountNumber.replace(/\s/g, ''))) add('Bank account not 9 to 18 digits', who(r, i));
		if (r.bankAccountNumber && !r.bankIfsc) add('Bank account without IFSC', who(r, i));
		else if (r.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(r.bankIfsc.trim().toUpperCase())) add('IFSC not in the 11-character form', who(r, i));
	});

	// The parser's own repairs: values it moved out of the wrong column.
	const repairKinds: Record<string, number> = {};
	for (const notes of Object.values(parsed.repairs)) for (const n of notes) {
		const k = n.replace(/"[^"]*"/g, '"…"').replace(/\d{4,}/g, '#').slice(0, 110);
		repairKinds[k] = (repairKinds[k] ?? 0) + 1;
	}

	const summary = {
		file,
		sheet: parsed.sheetName,
		strategy: parsed.strategy,
		rawPeopleRows: rawPeople,
		parsedRows: rows.length,
		droppedRows: rawNamesWithoutEmail,
		rowsWithRepairs: Object.keys(parsed.repairs).length,
		repairKinds,
		issues: Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, { count: v.length, items: v }]))
	};
	if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
	console.log(`Parsed ${rows.length} of ${rawPeople} people rows using ${parsed.strategy} on "${parsed.sheetName}". Rows with automatic repairs: ${summary.rowsWithRepairs}.`);
	for (const [k, v] of Object.entries(issues).sort((a, b) => b[1].length - a[1].length)) console.log(`${String(v.length).padStart(4)}  ${k}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
