import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Checking that a webhook really came from Zoom.
 *
 * Zoom signs every event: `x-zm-signature` is "v0=" + the HMAC-SHA256 (hex),
 * keyed with the app's secret token, of "v0:{x-zm-request-timestamp}:{raw
 * body}". The raw body must be the exact bytes received, so callers read the
 * request as text before parsing it.
 *
 * When the endpoint is first saved in the Zoom app, Zoom sends an
 * `endpoint.url_validation` event and expects { plainToken, encryptedToken }
 * back, where encryptedToken is the HMAC of plainToken with the same secret.
 */

export const MAX_SKEW_SECONDS = 300;

export function hmacHex(secret: string, message: string): string {
	return createHmac('sha256', secret).update(message).digest('hex');
}

export function verifyZoomSignature(input: { secret: string; timestamp: string | null; signature: string | null; rawBody: string; nowMs?: number }): boolean {
	const { secret, timestamp, signature, rawBody } = input;
	if (!secret || !timestamp || !signature) return false;
	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) return false;
	// Zoom sends seconds; refuse anything replayed from more than five minutes ago.
	const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
	if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;
	const expected = Buffer.from('v0=' + hmacHex(secret, `v0:${timestamp}:${rawBody}`));
	const given = Buffer.from(signature);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

export function urlValidationResponse(secret: string, plainToken: string) {
	return { plainToken, encryptedToken: hmacHex(secret, plainToken) };
}

/**
 * Meeting UUIDs that start with "/" or contain "//" must be URL-encoded twice
 * in an API path, or Zoom reads the slashes as path separators.
 */
export function encodeMeetingUuid(uuid: string): string {
	const once = encodeURIComponent(uuid);
	return uuid.startsWith('/') || uuid.includes('//') ? encodeURIComponent(once) : once;
}
