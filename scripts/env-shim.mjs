/**
 * Resolves SvelteKit's `$env/dynamic/private` to process.env for standalone
 * scripts run with tsx.
 *
 * Server modules import `$env/dynamic/private`, which only exists inside the
 * SvelteKit build. Without this shim a CLI script cannot import anything that
 * transitively reaches those modules — which includes the spreadsheet parser.
 * Aliasing it lets a script run the SAME parsing code the app runs, rather than
 * a reimplementation that could drift from it.
 */
import { pathToFileURL } from 'node:url';

const SHIM = pathToFileURL(new URL('./env-shim-module.mjs', import.meta.url).pathname).href;

export function resolve(specifier, context, next) {
	if (specifier === '$env/dynamic/private' || specifier === '$env/dynamic/public') {
		return { url: SHIM, shortCircuit: true };
	}
	if (specifier === '$env/static/private' || specifier === '$env/static/public') {
		return { url: SHIM, shortCircuit: true };
	}
	return next(specifier, context);
}
