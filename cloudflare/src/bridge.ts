/**
 * The container's way to D1 and R2 (see index.ts): requests it sends to
 * BRIDGE_HOST are handed to bridge() with the Worker's own bindings.
 * src/lib/server/cloudflare-bridge.ts is the other end.
 *
 * Kept apart from index.ts (no containers import) so the same code can be
 * exercised locally against wrangler's D1/R2 simulation.
 */

export interface BridgeEnv {
	/** The portal's database: every table. */
	DB: D1Database;
	/** Uploaded files (policy documents, pictures, attachments) under files/<id>. */
	FILES: R2Bucket;
}

/**
 * Plain-HTTP requests from the container to this address never leave
 * Cloudflare: they are handed to bridge(). It is a reserved documentation
 * address (TEST-NET-2), so it can never collide with a real host.
 */
export const BRIDGE_HOST = '198.51.100.7';
const SAFE_KEY = /^[A-Za-z0-9._\-\/]+$/;

type Param = string | number | null | { $b64: string };
type Wire = { sql: string; params?: Param[] };

function decodeParam(v: Param): unknown {
	if (v && typeof v === 'object' && '$b64' in v) {
		const bin = atob(v.$b64);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out.buffer;
	}
	return v;
}

function statement(db: D1Database, w: Wire): D1PreparedStatement {
	const stmt = db.prepare(w.sql);
	return w.params?.length ? stmt.bind(...w.params.map(decodeParam)) : stmt;
}

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * D1 for the container:
 *   POST /d1/query  {sql, params, mode: all|raw|run|first}
 *   POST /d1/batch  {statements: [{sql, params}]}   runs as one transaction
 *   POST /d1/exec   {sql}
 */
async function d1Bridge(req: Request, env: BridgeEnv, path: string): Promise<Response> {
	if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
	const body = (await req.json()) as Wire & { mode?: string; statements?: Wire[] };
	try {
		if (path === 'd1/query') {
			const stmt = statement(env.DB, body);
			switch (body.mode) {
				case 'raw':
					return json(await stmt.raw());
				case 'run':
					return json(await stmt.run());
				case 'first':
					return json(await stmt.first());
				default:
					return json(await stmt.all());
			}
		}
		if (path === 'd1/batch') {
			const stmts = (body.statements ?? []).map((w) => statement(env.DB, w));
			return json(stmts.length ? await env.DB.batch(stmts) : []);
		}
		if (path === 'd1/exec') return json(await env.DB.exec(body.sql));
	} catch (err) {
		// The message (e.g. "UNIQUE constraint failed: users.email") goes back
		// to the app, which reports it as a database error.
		return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
	}
	return new Response('not found', { status: 404 });
}

/** R2 for the container: GET/HEAD/PUT/DELETE /files/<key> → FILES <key>. */
async function filesBridge(req: Request, env: BridgeEnv, key: string): Promise<Response> {
	if (!key || !SAFE_KEY.test(key) || key.split('/').includes('..')) {
		return new Response('bad key', { status: 400 });
	}
	switch (req.method) {
		case 'HEAD': {
			const head = await env.FILES.head(key);
			return new Response(null, { status: head ? 200 : 404 });
		}
		case 'GET': {
			const obj = await env.FILES.get(key);
			if (!obj) return new Response('not found', { status: 404 });
			return new Response(obj.body, {
				headers: {
					'content-length': String(obj.size),
					'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream'
				}
			});
		}
		case 'PUT': {
			const length = Number(req.headers.get('content-length'));
			if (!req.body || !Number.isFinite(length) || length < 0) {
				return new Response('content-length required', { status: 411 });
			}
			// Stream straight into R2 without buffering the file in memory.
			const { readable, writable } = new FixedLengthStream(length);
			const contentType = req.headers.get('content-type') ?? undefined;
			const [, put] = await Promise.all([
				req.body.pipeTo(writable),
				env.FILES.put(key, readable, { httpMetadata: contentType ? { contentType } : undefined })
			]);
			return new Response(put?.etag ?? 'ok', { status: 201 });
		}
		case 'DELETE':
			await env.FILES.delete(key);
			return new Response(null, { status: 204 });
	}
	return new Response('method not allowed', { status: 405 });
}

export async function bridge(req: Request, env: BridgeEnv): Promise<Response> {
	const path = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
	if (path === '_ping') {
		await Promise.all([env.DB.prepare('select 1').first(), env.FILES.list({ limit: 1 })]);
		return new Response('ok');
	}
	if (path.startsWith('d1/')) return d1Bridge(req, env, path);
	if (path.startsWith('files/')) return filesBridge(req, env, path.slice('files/'.length));
	return new Response('not found', { status: 404 });
}
