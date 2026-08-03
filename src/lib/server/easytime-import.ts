import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '$lib/server/db/postgres';
import { attendanceImportTokens } from '$lib/server/db/schema';
import { eq, isNull } from 'drizzle-orm';

export function hashImportToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Validates the shared import token against stored hashes using a constant-time
 * compare per row (SHA-256 hashes are fixed-length, so this is safe).
 */
export async function verifyImportToken(token: string | null): Promise<string | null> {
	if (!token) return null;
	const candidateHash = Buffer.from(hashImportToken(token));

	const rows = await db
		.select({ id: attendanceImportTokens.id, tokenHash: attendanceImportTokens.tokenHash })
		.from(attendanceImportTokens)
		.where(isNull(attendanceImportTokens.revokedAt));

	for (const row of rows) {
		const stored = Buffer.from(row.tokenHash);
		if (stored.length === candidateHash.length && timingSafeEqual(stored, candidateHash)) {
			await db
				.update(attendanceImportTokens)
				.set({ lastUsedAt: new Date() })
				.where(eq(attendanceImportTokens.id, row.id));
			return row.id;
		}
	}
	return null;
}

export interface ParsedPunch {
	empCode: string;
	firstName: string | null;
	lastName: string | null;
	deptCode: string | null;
	deptName: string | null;
	punchedAt: Date;
	verifyType: string | null;
	punchState: string | null;
	direction: 'in' | 'out' | null;
	workCode: string | null;
	cardNumber: string | null;
	areaName: string | null;
	terminalAlias: string | null;
	terminalSn: string | null;
	temperature: string | null;
	maskFlag: string | null;
	rawLine: string;
}

/**
 * Column order of the EasyTime Pro "Data Template", exactly as configured:
 *
 *   {emp_code}\t{first_name}\t{last_name}\t{dept_code}\t{dept_name}\t{date}
 *   \t{time}\t{verify_type}\t{punch_state}\t{work_code}\t{card_number}
 *   \t{area_name}\t{terminal_alias}\t{terminal_sn}\t{temperature}\t{mask_flag}\r\n
 *
 * Date format yyyy-MM-DD, time format HH:mm. Trailing columns are tolerated as
 * optional so a template with fewer fields still imports; emp_code, date and
 * time are the only hard requirements.
 */
const COLUMNS = [
	'empCode',
	'firstName',
	'lastName',
	'deptCode',
	'deptName',
	'date',
	'time',
	'verifyType',
	'punchState',
	'workCode',
	'cardNumber',
	'areaName',
	'terminalAlias',
	'terminalSn',
	'temperature',
	'maskFlag'
] as const;

function clean(value: string | undefined): string | null {
	if (value === undefined) return null;
	const s = value.trim();
	return s === '' || s === '-' ? null : s;
}

/**
 * ZKTeco/EasyTime punch_state convention: 0 = check-in, 1 = check-out.
 * Some deployments emit text ("Check In"/"Check Out") or 4/5 for overtime
 * in/out, so both are handled. Anything unrecognised stays null and is
 * resolved by the check-in/check-out application logic rather than guessed.
 */
export function interpretPunchState(raw: string | null): 'in' | 'out' | null {
	if (raw === null) return null;
	const v = raw.trim().toLowerCase();
	if (v === '0' || v === '4' || v.includes('in')) return 'in';
	if (v === '1' || v === '5' || v.includes('out')) return 'out';
	return null;
}

/**
 * Parses an EasyTime Pro scheduled-export file (.txt/.csv, tab-separated).
 * Skips blank lines and a header row if the file happens to carry one.
 */
export function parseEasyTimeExport(body: string): ParsedPunch[] {
	const punches: ParsedPunch[] = [];

	for (const line of body.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Tolerate comma-separated files too — EasyTime allows .csv output.
		const cols = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',');

		const row: Record<string, string | null> = {};
		COLUMNS.forEach((name, i) => {
			row[name] = clean(cols[i]);
		});

		const empCode = row.empCode;
		const date = row.date;
		const time = row.time;
		if (!empCode || !date || !time) continue;

		// Header row (the template field names themselves, or a literal header).
		if (empCode.toLowerCase().includes('emp_code') || date.toLowerCase() === 'date') continue;

		const punchedAt = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
		if (Number.isNaN(punchedAt.getTime())) continue;

		punches.push({
			empCode,
			firstName: row.firstName,
			lastName: row.lastName,
			deptCode: row.deptCode,
			deptName: row.deptName,
			punchedAt,
			verifyType: row.verifyType,
			punchState: row.punchState,
			direction: interpretPunchState(row.punchState),
			workCode: row.workCode,
			cardNumber: row.cardNumber,
			areaName: row.areaName,
			terminalAlias: row.terminalAlias,
			terminalSn: row.terminalSn,
			temperature: row.temperature,
			maskFlag: row.maskFlag,
			rawLine: trimmed
		});
	}

	return punches;
}

/** Employee codes are matched case-insensitively with surrounding space trimmed. */
export function normalizeEmpCode(code: string): string {
	return code.trim().toUpperCase();
}
