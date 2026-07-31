import type { RequestHandler } from './$types';
import { text, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/postgres';
import { attendance, devicePunches, employeeProfiles } from '$lib/server/db/schema';
import { verifyDeviceToken, parseAttlog } from '$lib/server/device-push';
import { and, eq } from 'drizzle-orm';

// EasyTime Pro / ZKTeco ADMS push endpoint. Devices are configured to point at this exact
// path (see docs/easytime-pro-integration.md) and speak a plain-text protocol, not JSON —
// responses MUST be `text/plain` or the device firmware treats the push as failed and retries.
//
// Auth: since the stock ADMS protocol has no token concept, we require a `token` query param
// (the shared secret from device_push_tokens) on every request. Requests without a valid,
// unrevoked token are rejected before any parsing happens.

async function requireDeviceToken(url: URL) {
	const token = url.searchParams.get('token');
	const tokenId = await verifyDeviceToken(token);
	if (!tokenId) {
		throw error(401, 'invalid or missing token');
	}
	return tokenId;
}

// Device handshake / config poll: GET .../cdata?SN=...&options=all
export const GET: RequestHandler = async ({ url }) => {
	await requireDeviceToken(url);
	// Minimal handshake reply devices expect before they start pushing ATTLOG data.
	return text('GET OPTION FROM: server\nATTLOG=1\nOPERLOG=0\nATTPHOTO=0\nErrorDelay=30\nDelay=30\nTransFlag=1\n');
};

// Punch data push: POST .../cdata?SN=...&table=ATTLOG
export const POST: RequestHandler = async ({ url, request }) => {
	const tokenId = await requireDeviceToken(url);

	const table = url.searchParams.get('table');
	const deviceSerial = url.searchParams.get('SN');
	const body = await request.text();

	if (table && table !== 'ATTLOG') {
		// OPERLOG/user-info tables etc — accept and no-op, we only care about punches.
		return text('OK');
	}

	const punches = parseAttlog(body);
	let applied = 0;

	for (const punch of punches) {
		const [profile] = await db
			.select({ userId: employeeProfiles.userId })
			.from(employeeProfiles)
			.where(eq(employeeProfiles.biometricDeviceId, punch.deviceUserPin))
			.limit(1);

		const matchedUserId = profile?.userId ?? null;
		let attendanceId: string | null = null;

		if (matchedUserId) {
			const dateStr = punch.punchedAt.toISOString().slice(0, 10);
			const [existing] = await db
				.select()
				.from(attendance)
				.where(and(eq(attendance.userId, matchedUserId), eq(attendance.date, dateStr)))
				.limit(1);

			// Explicit device status wins. Only fall back to "first punch of day = in,
			// next = out" inference when the device didn't tell us (direction === null).
			// Retried/duplicate/out-of-order punches must never regress an existing
			// timestamp: check-in keeps the earliest time seen, check-out keeps the latest.
			let isCheckIn: boolean;
			if (punch.direction === 'in') isCheckIn = true;
			else if (punch.direction === 'out') isCheckIn = false;
			else isCheckIn = !existing?.checkInAt;

			if (!existing) {
				const [created] = await db
					.insert(attendance)
					.values({
						userId: matchedUserId,
						date: dateStr,
						checkInAt: isCheckIn ? punch.punchedAt : null,
						checkOutAt: isCheckIn ? null : punch.punchedAt,
						source: 'biometric'
					})
					.returning();
				attendanceId = created.id;
			} else {
				const patch: Partial<typeof attendance.$inferInsert> = { source: 'biometric' };
				if (isCheckIn) {
					if (!existing.checkInAt || punch.punchedAt < existing.checkInAt) {
						patch.checkInAt = punch.punchedAt;
					}
				} else {
					if (!existing.checkOutAt || punch.punchedAt > existing.checkOutAt) {
						patch.checkOutAt = punch.punchedAt;
					}
				}
				const [updated] = await db
					.update(attendance)
					.set(patch)
					.where(eq(attendance.id, existing.id))
					.returning();
				attendanceId = updated.id;
			}
			applied += 1;
		}

		await db.insert(devicePunches).values({
			tokenId,
			deviceSerial,
			deviceUserPin: punch.deviceUserPin,
			punchedAt: punch.punchedAt,
			direction: punch.direction,
			rawLine: punch.rawLine,
			matchedUserId,
			attendanceId
		});
	}

	// ZKTeco/ADMS devices expect exactly this on success, optionally with a count.
	return text(`OK: ${applied}`);
};
