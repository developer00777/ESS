/** Registers the `$env/*` resolver hook; see env-shim.mjs. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./env-shim.mjs', pathToFileURL(import.meta.filename));
