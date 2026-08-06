import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Tests run without the SvelteKit plugin: these are unit tests over pure
 * modules, so pulling in the full app build would only add startup cost and a
 * dependency on `svelte-kit sync` having run.
 *
 * `$lib` is aliased by hand for the same reason — it is the one SvelteKit
 * convention the modules under test rely on.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			// Modules under test share a file with the Postgres pool, which reads
			// this virtual module at import time. Stubbed so the pure functions are
			// importable without a SvelteKit build.
			'$env/dynamic/private': fileURLToPath(
				new URL('./src/lib/server/__mocks__/env-dynamic-private.ts', import.meta.url)
			)
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
