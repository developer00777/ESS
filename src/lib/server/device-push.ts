import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '$lib/server/db/postgres';
import { devicePushTokens } from '$lib/server/db/schema';
import { eq, isNull } from 'drizzle-orm';

export function hashDeviceToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Validates the shared push token against stored hashes using a constant-time
 * compare per row (SHA-256 hashes are fixed-length, so this is safe).
 */
export async function verifyDeviceToken(token: string | null): Promise<string | null> {
	if (!token) return null;
	const candidateHash = Buffer.from(hashDeviceToken(token));

	const rows = await db
		.select({ id: devicePushTokens.id, tokenHash: devicePushTokens.tokenHash })
		.from(devicePushTokens)
		.where(isNull(devicePushTokens.revokedAt));

	for (const row of rows) {
		const stored = Buffer.from(row.tokenHash);
		if (stored.length === candidateHash.length && timingSafeEqual(stored, candidateHash)) {
			await db
				.update(devicePushTokens)
				.set({ lastUsedAt: new Date() })
				.where(eq(devicePushTokens.id, row.id));
			return row.id;
		}
	}
	return null;
}

export interface ParsedPunch {
	deviceUserPin: string;
	punchedAt: Date;
	direction: 'in' | 'out' | null;
	rawLine: string;
}

/**
 * Parses the ADMS/iclock ATTLOG body EasyTime Pro / ZKTeco devices push.
 * Each line: `PIN\tTIMESTAMP\tSTATUS\tVERIFY\t...` (tab-separated, extra columns vary by firmware).
 * STATUS: 0/1 check-in-ish vs check-out-ish per ZKTeco convention (0=in, 1=out); anything else is left null
 * and resolved by the check-in/check-out application logic instead of trusted blindly.
 */
export function parseAttlog(body: string): ParsedPunch[] {
	const punches: ParsedPunch[] = [];
	for (const line of body.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const cols = trimmed.split('\t');
		const [pin, timestamp, status] = cols;
		if (!pin || !timestamp) continue;

		const punchedAt = new Date(timestamp.replace(' ', 'T'));
		if (Number.isNaN(punchedAt.getTime())) continue;

		let direction: 'in' | 'out' | null = null;
		if (status === '0') direction = 'in';
		else if (status === '1') direction = 'out';

		punches.push({ deviceUserPin: pin, punchedAt, direction, rawLine: trimmed });
	}
	return punches;
}
