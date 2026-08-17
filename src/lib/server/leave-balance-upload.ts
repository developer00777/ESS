/**
 * Shared limits for the leave-balance upload endpoints.
 *
 * A separate module rather than exports on the preview `+server.ts`: SvelteKit
 * only permits HTTP-verb exports (and `_`-prefixed names) from a route file, so
 * the apply endpoint cannot import a constant from its sibling route.
 */

/** A balance sheet is one row per employee, so it stays small. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The year an uploaded balance is set against; allocations are held per year.
 *
 * Falls back to the current year for anything unparseable, and bounds the range
 * so a mis-keyed year cannot file balances somewhere nobody will look.
 */
export function resolveYear(supplied: unknown, now = new Date().getFullYear()): number {
	if (typeof supplied !== 'string' || !/^\d{4}$/.test(supplied)) return now;
	const y = Number(supplied);
	if (y < now - 5 || y > now + 1) return now;
	return y;
}
