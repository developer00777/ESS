/**
 * Gives scripts run from your PC (the one-time import, diagnostics) the same
 * D1 database and R2 bucket the Worker uses, through wrangler's getPlatformProxy.
 *
 *   default            a local simulation under .wrangler/state/v3
 *   --persist <dir>    a local simulation in another folder
 *   --remote           the real Cloudflare D1 and R2 (needs `npx wrangler login`
 *                      in cloudflare/ first)
 *
 * The database and bucket names and the D1 id are read from
 * cloudflare/wrangler.jsonc, so there is one place to change them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type { D1DatabaseLike, R2BucketLike } from '../../src/lib/server/platform';

/**
 * wrangler (and mongodb, for the import) are installed in cloudflare/, not in
 * the app: the app's packages all go into the container image.
 */
export const fromCloudflareDir = createRequire(resolve('cloudflare', 'package.json'));

export const remote = process.argv.includes('--remote');

function argValue(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

function workerConfig() {
	const text = readFileSync(join('cloudflare', 'wrangler.jsonc'), 'utf8');
	const pick = (re: RegExp, what: string) => {
		const v = text.match(re)?.[1];
		if (!v) throw new Error(`cloudflare/wrangler.jsonc has no ${what}`);
		return v;
	};
	const databaseId = pick(/"database_id"\s*:\s*"([^"]+)"/, 'd1 database_id');
	if (remote && databaseId.startsWith('REPLACE_')) {
		throw new Error('Put the D1 database id in cloudflare/wrangler.jsonc first (npx wrangler d1 create champ-hr-ess).');
	}
	return {
		databaseId,
		databaseName: pick(/"database_name"\s*:\s*"([^"]+)"/, 'd1 database_name'),
		bucketName: pick(/"binding"\s*:\s*"FILES"\s*,\s*"bucket_name"\s*:\s*"([^"]+)"/, 'FILES bucket')
	};
}

export async function openCloudflare() {
	const { databaseId, databaseName, bucketName } = workerConfig();
	// Only the storage bindings: the real config also declares the container,
	// which a script has no use for.
	const config = {
		name: 'champ-hr-ess-scripts',
		compatibility_date: '2026-10-01',
		d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId, remote }],
		r2_buckets: [{ binding: 'FILES', bucket_name: bucketName, remote }]
	};
	mkdirSync('.wrangler', { recursive: true });
	const configPath = join('.wrangler', 'scripts.wrangler.json');
	writeFileSync(configPath, JSON.stringify(config, null, 2));

	const persist = argValue('--persist') ?? '.wrangler/state/v3';
	const { getPlatformProxy } = fromCloudflareDir('wrangler') as typeof import('wrangler');
	const proxy = await getPlatformProxy<{ DB: D1DatabaseLike; FILES: R2BucketLike }>({
		configPath,
		persist: { path: persist },
		remoteBindings: remote
	});
	console.log(
		remote
			? `[cloudflare] using the REMOTE (live) D1 "${databaseName}" and R2 "${bucketName}"`
			: `[cloudflare] using a LOCAL simulation in ${persist}`
	);
	return { d1: proxy.env.DB, files: proxy.env.FILES, close: () => proxy.dispose() };
}
