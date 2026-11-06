import type { D1DatabaseLike, R2BucketLike, R2ObjectLike } from './platform';

/**
 * D1 and R2 for the portal running inside the Cloudflare container.
 *
 * Only a Worker can use the D1 and R2 bindings. The container reaches them
 * through its Worker instead: plain HTTP to CF_BRIDGE_URL (a reserved address,
 * 198.51.100.7) never leaves Cloudflare; the Worker intercepts it
 * (outboundByHost in cloudflare/src/index.ts) and runs the query or file
 * operation on its own bindings. No API keys exist anywhere.
 *
 * The objects below have the same shape as the real bindings, so drizzle's D1
 * driver and the file store (db/store.ts) use them unchanged.
 *
 * No SvelteKit imports: start.sh's migrate/seed scripts use this under plain Node.
 */

export function bridgeUrl(): string | null {
	const url = process.env.CF_BRIDGE_URL?.trim();
	return url ? url.replace(/\/+$/, '') : null;
}

/* ------------------------------- D1 ------------------------------- */

type Param = string | number | null | { $b64: string };

/** Values crossing the bridge as JSON. Blobs travel as base64. */
function encodeParam(v: unknown): Param {
	if (v === undefined || v === null) return null;
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (typeof v === 'bigint') return Number(v);
	if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
		return { $b64: Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v).toString('base64') };
	}
	if (typeof v === 'number' || typeof v === 'string') return v;
	return String(v);
}

type Mode = 'all' | 'raw' | 'run' | 'first';
type Wire = { sql: string; params: Param[] };

export class BridgeError extends Error {}

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
	let res: Response;
	try {
		res = await fetch(base + path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (err) {
		throw new BridgeError(`D1 bridge unreachable: ${err instanceof Error ? err.message : String(err)}`);
	}
	const text = await res.text();
	if (!res.ok) throw new BridgeError(text || `D1 bridge returned ${res.status}`);
	return JSON.parse(text) as T;
}

class BridgeStatement {
	constructor(
		private readonly base: string,
		readonly sql: string,
		readonly params: Param[] = []
	) {}

	bind(...values: unknown[]): BridgeStatement {
		return new BridgeStatement(this.base, this.sql, values.map(encodeParam));
	}

	wire(): Wire {
		return { sql: this.sql, params: this.params };
	}

	private exec<T>(mode: Mode): Promise<T> {
		return post<T>(this.base, '/d1/query', { ...this.wire(), mode });
	}

	all<T = Record<string, unknown>>() {
		return this.exec<{ results: T[]; success: boolean; meta: Record<string, unknown> }>('all');
	}
	raw<T = unknown[]>() {
		return this.exec<T[]>('raw');
	}
	run() {
		return this.exec<{ results: unknown[]; success: boolean; meta: Record<string, unknown> }>('run');
	}
	first<T = Record<string, unknown>>() {
		return this.exec<T | null>('first');
	}
}

export function bridgeD1(base: string): D1DatabaseLike {
	return {
		prepare: (sql: string) => new BridgeStatement(base, sql),
		batch: (statements: unknown[]) =>
			post<unknown[]>(base, '/d1/batch', { statements: (statements as BridgeStatement[]).map((s) => s.wire()) }),
		exec: (sql: string) => post<unknown>(base, '/d1/exec', { sql })
	};
}

/* ------------------------------- R2 ------------------------------- */

const SAFE_KEY = /^[A-Za-z0-9._\-\/]+$/;

function fileUrl(base: string, key: string): string {
	if (!SAFE_KEY.test(key)) throw new BridgeError(`unsafe file key: ${key}`);
	return `${base}/files/${key}`;
}

export function bridgeR2(base: string): R2BucketLike {
	return {
		async get(key) {
			const res = await fetch(fileUrl(base, key));
			if (res.status === 404) return null;
			if (!res.ok) throw new BridgeError(`R2 get ${key} failed (${res.status})`);
			const bytes = await res.arrayBuffer();
			const contentType = res.headers.get('content-type') ?? undefined;
			const obj: R2ObjectLike = { arrayBuffer: async () => bytes, httpMetadata: { contentType } };
			return obj;
		},
		async put(key, value, options) {
			const body = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
			const res = await fetch(fileUrl(base, key), {
				method: 'PUT',
				headers: {
					'content-type': options?.httpMetadata?.contentType ?? 'application/octet-stream',
					'content-length': String(body.byteLength)
				},
				body: body as unknown as BodyInit
			});
			if (!res.ok) throw new BridgeError(`R2 put ${key} failed (${res.status})`);
			return null;
		},
		async delete(keys) {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				const res = await fetch(fileUrl(base, key), { method: 'DELETE' });
				if (!res.ok && res.status !== 404) throw new BridgeError(`R2 delete ${key} failed (${res.status})`);
			}
		},
		async head(key) {
			const res = await fetch(fileUrl(base, key), { method: 'HEAD' });
			if (res.status === 404) return null;
			if (!res.ok) throw new BridgeError(`R2 head ${key} failed (${res.status})`);
			return {};
		}
	};
}
