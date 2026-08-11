/**
 * Backfills employee profiles from an HR tracker spreadsheet.
 *
 * Why this exists: an early bulk import saved only the columns needed to create
 * a login — every staged row's profile_data is null — so the roster it created
 * carries no gender, no contact details, no bank or ID fields. Pink leave is
 * restricted to female employees, so a blank gender also meant nobody accrued
 * it. The staged rows hold nothing to re-apply, which leaves the original
 * spreadsheet as the only source for the missing values.
 *
 * Parsing goes through parseHrTeamSheet — the SAME code the portal's bulk
 * import runs, including its column-drift repair — so a backfilled profile is
 * indistinguishable from one the portal imported. A reimplementation here would
 * drift from the app and produce subtly different profiles.
 *
 * People are matched on employee code, falling back to work email. Values are
 * written with coalesce so ONLY blank columns are filled: anything HR has since
 * corrected in the portal outranks the spreadsheet and is left untouched.
 *
 * Usage (dry run prints the plan and writes nothing):
 *   DATABASE_URL=... npm run backfill:profiles -- <file.xlsx>
 *   DATABASE_URL=... npm run backfill:profiles -- <file.xlsx> --apply
 */
import fs from 'node:fs';
import pg from 'pg';
import { parseHrTeamSheet } from '../bulk-import';
import { profileValuesFromImport } from '../import-profile-fields';
import { checkPinkLeaveEligibility } from '../leave-eligibility';

/** camelCase profile key → employee_profiles column. */
function toSnakeCase(key: string): string {
	return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Columns holding structured JSON rather than a scalar. */
const JSON_COLUMNS = new Set(['children']);

async function main() {
	const [file, ...flags] = process.argv.slice(2);
	const apply = flags.includes('--apply');
	if (!file) throw new Error('Usage: backfill-profiles-from-sheet.ts <file.xlsx> [--apply]');
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL is required');

	// exceljs's Buffer type predates newer @types/node Buffer fields.
	const parsed = await parseHrTeamSheet(fs.readFileSync(file) as Parameters<typeof parseHrTeamSheet>[0]);
	console.log(
		`${apply ? 'APPLY' : 'DRY RUN'} — ${parsed.rows.length} rows from "${parsed.sheetName}" (${parsed.strategy})\n`
	);

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

		// Only columns that actually exist are written — the parser knows fields
		// that predate or postdate a given database.
		const { rows: columnRows } = await client.query<{ column_name: string }>(
			`select column_name from information_schema.columns where table_name = 'employee_profiles'`
		);
		const existingColumns = new Set(columnRows.map((r) => r.column_name));

		let matched = 0;
		let updated = 0;
		let fieldsWritten = 0;
		const unmatched: string[] = [];

		for (const row of parsed.rows) {
			// Identity and org fields are applied explicitly below; the rest is the
			// profile payload, exactly as the portal's own import splits it.
			const {
				fullName: _fullName,
				officialEmail: _officialEmail,
				employeeCode: _employeeCode,
				salaryBankRaw: _salaryBankRaw,
				designation,
				teamAndFloor,
				reportingAuthorityRaw,
				dottedLineAuthorityRaw,
				...profileData
			} = row;

			const values: Record<string, unknown> = {
				...profileValuesFromImport(profileData),
				// Org fields the parser returns separately from the profile payload.
				...(designation ? { designation } : {}),
				...(teamAndFloor ? { teamAndFloor } : {}),
				...(reportingAuthorityRaw ? { directReportingAuthority: reportingAuthorityRaw } : {}),
				...(dottedLineAuthorityRaw ? { dottedLineReportingAuthority: dottedLineAuthorityRaw } : {})
			};

			const code = row.employeeCode?.trim().toUpperCase();
			const target =
				(code ? byCode.get(code) : undefined) ?? byEmail.get(row.officialEmail.toLowerCase());
			if (!target) {
				unmatched.push(`${row.fullName} (${code ?? row.officialEmail})`);
				continue;
			}
			matched++;

			const sets: string[] = [];
			const params: unknown[] = [];
			for (const [key, value] of Object.entries(values)) {
				if (value === null || value === undefined || value === '') continue;
				const column = toSnakeCase(key);
				if (!existingColumns.has(column)) continue;
				params.push(JSON_COLUMNS.has(column) ? JSON.stringify(value) : value);
				// coalesce: fill the blank, never overwrite what is already recorded.
				sets.push(`${column} = coalesce(${column}, $${params.length})`);
			}

			const verdict = checkPinkLeaveEligibility({
				gender: (values.gender as string) ?? null,
				dateOfJoining: (values.dateOfJoining as string) ?? null,
				dateOfConfirmation: (values.dateOfConfirmation as string) ?? null,
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
			fieldsWritten += sets.length;

			console.log(
				`${row.fullName.padEnd(25)} ${String(values.gender ?? '-').padEnd(7)} ` +
					`fields=${String(sets.length).padStart(2)} ` +
					`=> ${verdict.eligible ? 'PINK YES' : `no (${verdict.reason})`}`
			);
		}

		console.log(
			`\nmatched ${matched}/${parsed.rows.length}, ` +
				`${apply ? 'updated' : 'would update'} ${updated} profiles, ` +
				`${fieldsWritten} field writes offered`
		);
		for (const name of unmatched) console.log(`NO MATCH: ${name}`);
		if (Object.keys(parsed.repairs).length > 0) {
			console.log(`\nrows with data-quality repairs: ${Object.keys(parsed.repairs).length}`);
			for (const [index, notes] of Object.entries(parsed.repairs)) {
				console.log(`  ${parsed.rows[Number(index)]?.fullName}: ${notes.join('; ')}`);
			}
		}
		if (!apply) console.log('\nDry run — nothing written. Re-run with --apply.');
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
