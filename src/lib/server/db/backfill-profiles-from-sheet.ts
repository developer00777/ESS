/**
 * Backfills employee profiles from an HR tracker spreadsheet.
 *
 * Why this exists: an early bulk import saved only the columns needed to create
 * a login — every staged row's profile_data is null — so the roster it created
 * carries no gender, joining or confirmation date. Pink leave is restricted to
 * female employees, so a blank gender means nobody accrues it. The staged rows
 * hold nothing to re-apply, which leaves the original spreadsheet as the only
 * source for the missing values.
 *
 * People are matched on employee code, falling back to work email. Values are
 * written with coalesce so ONLY blank columns are filled: anything HR has since
 * corrected in the portal outranks the spreadsheet and is left untouched.
 *
 * Usage (dry run prints the plan and writes nothing):
 *   DATABASE_URL=... tsx src/lib/server/db/backfill-profiles-from-sheet.ts <file.xlsx>
 *   DATABASE_URL=... tsx src/lib/server/db/backfill-profiles-from-sheet.ts <file.xlsx> --apply
 */
import ExcelJS from 'exceljs';
import pg from 'pg';
import { checkPinkLeaveEligibility } from '../leave-eligibility';

/**
 * Reads the tracker's identity, gender and date columns.
 *
 * Deliberately does NOT go through parseHrTeamSheet: that pulls in the LLM
 * mapping fallback, which needs SvelteKit's $env and cannot load outside the
 * app. This script only needs four well-known columns from a sheet whose
 * headers already match, so it reads them directly.
 */
interface SheetRow {
	fullName: string;
	officialEmail: string;
	employeeCode: string | null;
	gender: string | null;
	dateOfJoining: string | null;
	dateOfConfirmation: string | null;
}

const HEADERS: Record<string, keyof SheetRow> = {
	'name of the champion': 'fullName',
	'official e mail': 'officialEmail',
	'cipl emp code': 'employeeCode',
	gender: 'gender',
	'date of joining': 'dateOfJoining',
	'date of confirmation': 'dateOfConfirmation'
};

/** HR sheets use "-", "NA" and friends to mean "nothing here". */
const PLACEHOLDERS = new Set(['-', '--', 'na', 'n/a', 'nil', 'none', 'null']);

function cellText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	// Excel dates arrive as Date objects; a date column needs ISO, not a locale string.
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
	}
	if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
		return String((value as { text: unknown }).text).trim() || null;
	}
	const text = String(value).trim().replace(/'+$/, '');
	if (text === '' || PLACEHOLDERS.has(text.toLowerCase())) return null;
	return text;
}

async function readSheet(file: string): Promise<SheetRow[]> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(file);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error('This workbook has no sheets');

	const columns: Partial<Record<keyof SheetRow, number>> = {};
	sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const field = HEADERS[String(cell.value ?? '').trim().toLowerCase()];
		// First occurrence wins — the tracker repeats several header names.
		if (field && columns[field] === undefined) columns[field] = colNumber;
	});
	if (!columns.fullName || !columns.officialEmail) {
		throw new Error(`Could not find name and work-email columns in "${sheet.name}"`);
	}

	const rows: SheetRow[] = [];
	sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber === 1) return;
		const at = (field: keyof SheetRow) => {
			const col = columns[field];
			return col ? cellText(row.getCell(col).value) : null;
		};
		const fullName = at('fullName');
		const officialEmail = at('officialEmail');
		if (!fullName || !officialEmail) return;
		rows.push({
			fullName,
			officialEmail: officialEmail.toLowerCase(),
			employeeCode: at('employeeCode'),
			gender: at('gender'),
			dateOfJoining: at('dateOfJoining'),
			dateOfConfirmation: at('dateOfConfirmation')
		});
	});
	return rows;
}

/** Profile columns this script is allowed to fill. Deliberately narrow. */
const COLUMNS = [
	['gender', 'gender'],
	['dateOfJoining', 'date_of_joining'],
	['dateOfConfirmation', 'date_of_confirmation']
] as const;

async function main() {
	const [file, ...flags] = process.argv.slice(2);
	const apply = flags.includes('--apply');
	if (!file) throw new Error('Usage: backfill-profiles-from-sheet.ts <file.xlsx> [--apply]');
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL is required');

	const sheetRows = await readSheet(file);
	console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${sheetRows.length} rows from ${file}\n`);

	const client = new pg.Client({
		connectionString,
		// Railway's managed Postgres terminates TLS with its own certificate.
		ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false }
	});
	await client.connect();

	try {
		const { rows: profiles } = await client.query<{
			user_id: string;
			email: string;
			employee_code: string | null;
		}>(`select p.user_id, u.email, p.employee_code
		    from employee_profiles p join users u on u.id = p.user_id`);

		const byCode = new Map(
			profiles.filter((p) => p.employee_code).map((p) => [p.employee_code!.toUpperCase(), p])
		);
		const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));

		let matched = 0;
		let updated = 0;
		const unmatched: string[] = [];

		for (const row of sheetRows) {
			const code = row.employeeCode?.trim().toUpperCase();
			const target = (code ? byCode.get(code) : undefined) ?? byEmail.get(row.officialEmail);

			if (!target) {
				unmatched.push(`${row.fullName} (${code ?? row.officialEmail})`);
				continue;
			}
			matched++;

			const sets: string[] = [];
			const params: unknown[] = [];
			for (const [field, column] of COLUMNS) {
				const value = row[field];
				if (!value) continue;
				params.push(value);
				// coalesce: fill the blank, never overwrite what is already recorded.
				sets.push(`${column} = coalesce(${column}, $${params.length})`);
			}

			const verdict = checkPinkLeaveEligibility({
				gender: row.gender,
				dateOfJoining: row.dateOfJoining,
				dateOfConfirmation: row.dateOfConfirmation,
				pinkLeaveEligibleOverride: null
			});

			if (sets.length > 0 && apply) {
				params.push(target.user_id);
				await client.query(
					`update employee_profiles set ${sets.join(', ')}, updated_at = now()
					 where user_id = $${params.length}`,
					params
				);
				updated++;
			}

			console.log(
				`${row.fullName.padEnd(25)} ${(row.gender ?? '-').padEnd(7)} ` +
					`doj=${(row.dateOfJoining ?? '-').padEnd(11)} ` +
					`=> ${verdict.eligible ? 'PINK YES' : `no (${verdict.reason})`}`
			);
		}

		console.log(`\nmatched ${matched}/${sheetRows.length}, ${apply ? 'updated' : 'would update'} ${updated}`);
		for (const name of unmatched) console.log(`NO MATCH: ${name}`);
		if (!apply) console.log('\nDry run — nothing written. Re-run with --apply.');
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
