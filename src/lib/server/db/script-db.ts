import { drizzle } from 'drizzle-orm/d1';
import { bridgeD1, bridgeUrl } from '../cloudflare-bridge';
import { useDatabase, type Db } from './client';
import * as schema from './schema';

/**
 * The D1 database for scripts run under plain Node inside the Cloudflare
 * container (start.sh: migrate, seed, cleanup), through the Worker bridge.
 *
 * `db` from ./client also works after this, for library code the scripts call.
 */
export function openScriptDb(): Db {
	const base = bridgeUrl();
	if (!base) {
		throw new Error(
			'CF_BRIDGE_URL is not set. These scripts run inside the Cloudflare container; ' +
				'from your PC use scripts/cloudflare/d1.ts (getPlatformProxy) instead.'
		);
	}
	const d1 = bridgeD1(base);
	useDatabase(d1);
	return drizzle(d1 as never, { schema });
}
