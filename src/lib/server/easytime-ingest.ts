import { db } from '$lib/server/db/postgres';
import {
	attendance,
	attendanceImportTokens,
	attendanceImports,
	devicePunches,
	employeeProfiles
} from '$lib/server/db/schema';
import {
	mergePunch,
	normalizeEmpCode,
	punchDedupeKey,
	type ParsedPunch,
	type PunchDay
} from '$lib/server/easytime-import';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';

export const MAX_FEED_RECORDS = 1000;

const IMPORT_LOCK_KEY = 4_172_026;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockAttendanceImports(tx: Tx): Promise<void> {
	await tx.execute(sql`select pg_advisory_xact_lock(${IMPORT_LOCK_KEY}::bigint)`);
}

export interface KeyedPunch extends ParsedPunch {
	dedupeKey: string;
}

export function orderAndCollapse(punches: ParsedPunch[]): { punches: KeyedPunch[]; repeats: number } {
	const sorted = [...punches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
	const seen = new Set<string>();
	const unique: KeyedPunch[] = [];

	for (const punch of sorted) {
		const dedupeKey = punchDedupeKey(punch);
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		unique.push({ ...punch, dedupeKey });
	}

	return { punches: unique, repeats: punches.length - unique.length };
}

export interface IngestResult {
	importId: string;
	rowCount: number;
	matchedCount: number;
	unmatchedCount: number;
	duplicateCount: number;
	unmatchedEmpCodes: string[];
}

export async function ingestPunches(
	parsed: ParsedPunch[],
	options: { tokenId: string; filename: string | null }
): Promise<IngestResult> {
	const { punches, repeats } = orderAndCollapse(parsed);

	const codes = [...new Set(punches.map((p) => normalizeEmpCode(p.empCode)))];
	const profiles = codes.length
		? await db
				.select({ userId: employeeProfiles.userId, employeeCode: employeeProfiles.employeeCode })
				.from(employeeProfiles)
				.where(inArray(employeeProfiles.employeeCode, codes))
		: [];

	const userByCode = new Map(
		profiles
			.filter((p): p is { userId: string; employeeCode: string } => Boolean(p.employeeCode))
			.map((p) => [normalizeEmpCode(p.employeeCode), p.userId])
	);

	let matchedCount = 0;
	let unmatchedCount = 0;
	let duplicateCount = repeats;
	const unmatchedCodes = new Set<string>();

	const importId = await db.transaction(async (tx) => {
		await lockAttendanceImports(tx);

		const keys = punches.map((p) => p.dedupeKey);
		const stored = keys.length
			? await tx
					.select({
						id: devicePunches.id,
						dedupeKey: devicePunches.dedupeKey,
						attendanceId: devicePunches.attendanceId
					})
					.from(devicePunches)
					.where(inArray(devicePunches.dedupeKey, keys))
			: [];
		const storedByKey = new Map(stored.map((row) => [row.dedupeKey, row]));

		const [importRow] = await tx
			.insert(attendanceImports)
			.values({
				tokenId: options.tokenId,
				filename: options.filename,
				rowCount: parsed.length,
				matchedCount: 0,
				unmatchedCount: 0
			})
			.returning({ id: attendanceImports.id });

		const days = new Map<string, DayRow>();

		for (const punch of punches) {
			const previous = storedByKey.get(punch.dedupeKey);
			if (previous?.attendanceId) {
				duplicateCount += 1;
				continue;
			}

			const userId = userByCode.get(normalizeEmpCode(punch.empCode)) ?? null;
			if (!userId) {
				unmatchedCount += 1;
				unmatchedCodes.add(punch.empCode);
				if (!previous) {
					await tx.insert(devicePunches).values(punchRow(punch, importRow.id, null, null));
				}
				continue;
			}

			const attendanceId = await applyPunch(tx, days, userId, punch);
			matchedCount += 1;

			if (previous) {
				await tx
					.update(devicePunches)
					.set({ matchedUserId: userId, attendanceId })
					.where(eq(devicePunches.id, previous.id));
			} else {
				await tx.insert(devicePunches).values(punchRow(punch, importRow.id, userId, attendanceId));
			}
		}

		await tx
			.update(attendanceImports)
			.set({ matchedCount, unmatchedCount, duplicateCount })
			.where(eq(attendanceImports.id, importRow.id));

		return importRow.id;
	});

	return {
		importId,
		rowCount: parsed.length,
		matchedCount,
		unmatchedCount,
		duplicateCount,
		unmatchedEmpCodes: [...unmatchedCodes]
	};
}

interface DayRow extends PunchDay {
	id: string;
}

async function applyPunch(
	tx: Tx,
	days: Map<string, DayRow>,
	userId: string,
	punch: KeyedPunch
): Promise<string> {
	const key = `${userId}|${punch.punchDate}`;
	let day = days.get(key);

	if (!day) {
		const [existing] = await tx
			.select({
				id: attendance.id,
				checkInAt: attendance.checkInAt,
				checkOutAt: attendance.checkOutAt
			})
			.from(attendance)
			.where(and(eq(attendance.userId, userId), eq(attendance.date, punch.punchDate)))
			.limit(1);
		day = existing;
	}

	const merged = mergePunch(day ?? null, punch);

	if (!day) {
		const [created] = await tx
			.insert(attendance)
			.values({
				userId,
				date: punch.punchDate,
				checkInAt: merged.checkInAt,
				checkOutAt: merged.checkOutAt,
				source: 'biometric'
			})
			.returning({ id: attendance.id });
		day = { id: created.id, checkInAt: merged.checkInAt, checkOutAt: merged.checkOutAt };
	} else if (merged.changed) {
		const patch: Partial<typeof attendance.$inferInsert> = { source: 'biometric' };
		patch[merged.changed] = punch.punchedAt;
		await tx.update(attendance).set(patch).where(eq(attendance.id, day.id));
		day = { id: day.id, checkInAt: merged.checkInAt, checkOutAt: merged.checkOutAt };
	}

	days.set(key, day);
	return day.id;
}

function punchRow(
	punch: KeyedPunch,
	importId: string,
	matchedUserId: string | null,
	attendanceId: string | null
): typeof devicePunches.$inferInsert {
	return {
		importId,
		empCode: punch.empCode,
		firstName: punch.firstName,
		lastName: punch.lastName,
		deptCode: punch.deptCode,
		deptName: punch.deptName,
		punchedAt: punch.punchedAt,
		verifyType: punch.verifyType,
		punchState: punch.punchState,
		direction: punch.direction,
		workCode: punch.workCode,
		cardNumber: punch.cardNumber,
		areaName: punch.areaName,
		terminalAlias: punch.terminalAlias,
		terminalSn: punch.terminalSn,
		temperature: punch.temperature,
		maskFlag: punch.maskFlag,
		rawLine: punch.rawLine,
		matchedUserId,
		attendanceId,
		dedupeKey: punch.dedupeKey
	};
}

export interface FeedStatus {
	ok: true;
	tokenLabel: string | null;
	lastImport: {
		at: Date;
		rowCount: number;
		matchedCount: number;
		unmatchedCount: number;
		duplicateCount: number;
	} | null;
	latestPunchAt: Date | null;
	maxRecords: number;
}

export async function loadFeedStatus(tokenId: string): Promise<FeedStatus> {
	const [[token], [lastImport], [latest]] = await Promise.all([
		db
			.select({ label: attendanceImportTokens.label })
			.from(attendanceImportTokens)
			.where(eq(attendanceImportTokens.id, tokenId))
			.limit(1),
		db
			.select({
				at: attendanceImports.createdAt,
				rowCount: attendanceImports.rowCount,
				matchedCount: attendanceImports.matchedCount,
				unmatchedCount: attendanceImports.unmatchedCount,
				duplicateCount: attendanceImports.duplicateCount
			})
			.from(attendanceImports)
			.where(eq(attendanceImports.tokenId, tokenId))
			.orderBy(desc(attendanceImports.createdAt))
			.limit(1),
		db
			.select({ at: max(devicePunches.punchedAt) })
			.from(devicePunches)
			.innerJoin(attendanceImports, eq(devicePunches.importId, attendanceImports.id))
			.where(eq(attendanceImports.tokenId, tokenId))
	]);

	return {
		ok: true,
		tokenLabel: token?.label ?? null,
		lastImport: lastImport ?? null,
		latestPunchAt: latest?.at ?? null,
		maxRecords: MAX_FEED_RECORDS
	};
}
