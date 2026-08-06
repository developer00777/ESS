/**
 * Test stub for SvelteKit's `$env/dynamic/private`.
 *
 * The modules under test (comp-off, leave rules) sit in files that also import
 * the Postgres pool, which reads DATABASE_URL from this virtual module at
 * import time. Vitest resolves it here instead so the pure functions can be
 * imported without a SvelteKit build or a live database — the pool is
 * constructed but never connected, since no test calls a query.
 */
export const env: Record<string, string | undefined> = {
	DATABASE_URL: 'postgres://test:test@localhost:5432/test'
};
