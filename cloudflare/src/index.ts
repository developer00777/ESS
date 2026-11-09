/**
 * Runs the portal on Cloudflare Containers, with its data in D1 and R2.
 *
 *   browser → this Worker → the one container (app + Redis on localhost)
 *                                   │ http://198.51.100.7/… (intercepted, never leaves Cloudflare)
 *                                   ▼
 *                     bridge() below ─┬─ /d1/…     → DB    (D1: every table)
 *                                     └─ /files/…  → FILES (R2: uploaded files)
 *
 * Only a Worker can use the D1 and R2 bindings, so the container's queries
 * and file reads come back through here (src/lib/server/cloudflare-bridge.ts
 * is the other end). No API keys are involved. Redis (sessions, rate limits,
 * caches) lives in the container's memory and is reset on every restart.
 *
 * There is a single, always-on instance, like the one Railway service:
 *   - the app's background jobs (setInterval) run inside it, so a second copy
 *     would send every email twice;
 *   - live chat keeps its open streams in memory.
 */
import { Container, getContainer } from '@cloudflare/containers';
import { BRIDGE_HOST, bridge, type BridgeEnv } from './bridge';

// The containers library routes intercepted container traffic through this entrypoint.
export { ContainerProxy } from '@cloudflare/containers';

interface Env extends BridgeEnv {
	APP: DurableObjectNamespace<AppContainer>;
	/** Which Worker version is live; a change means vars/secrets may have changed. */
	CF_VERSION_METADATA: WorkerVersionMetadata;
	/** Every var and secret, passed through to the container as environment variables. */
	[key: string]: unknown;
}

/** The container sees the visitor's IP in this header; the login rate limit keys on it. */
const CLIENT_IP_HEADER = 'x-portal-client-ip';

/** Durable Object storage key: the Worker version the running container was started with. */
const STARTED_VERSION_KEY = 'startedWithVersion';

/** How long one request waits for a booting app before showing the "starting" page. */
const BOOT_WAIT_MS = 90_000;
/** Running but not listening for this long means the boot is stuck: restart the container. */
const STUCK_AFTER_MS = 6 * 60_000;

/** The containers library's reply when port 3000 refused the connection. */
async function isNotListening(res: Response): Promise<boolean> {
	if (res.status !== 500 || !res.headers.get('content-type')?.startsWith('text/plain')) return false;
	const text = await res.clone().text();
	return text.startsWith('Error proxying request to container') && text.includes('not listening');
}

/** Shown while the portal boots; the browser retries on its own. */
function startingPage(): Response {
	const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Starting up</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#333}</style>
</head><body><div><h1>The portal is starting up</h1><p>This takes about a minute. The page reloads on its own.</p></div></body></html>`;
	return new Response(html, {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '10', 'cache-control': 'no-store' }
	});
}

export class AppContainer extends Container<Env> {
	defaultPort = 3000;
	sleepAfter = '1h';
	enableInternet = true; // Resend, Zoom, Clerk, ProHance, OpenRouter are all outside


	constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
		super(ctx, env);
		const vars: Record<string, string> = {};
		for (const [key, value] of Object.entries(env)) {
			if (typeof value === 'string') vars[key] = value;
		}
		this.envVars = {
			...vars,
			CF_BRIDGE_URL: `http://${BRIDGE_HOST}`,
			ADDRESS_HEADER: CLIENT_IP_HEADER,
			PORT: '3000',
			HOST: '0.0.0.0'
		};
	}

	/** Never go to sleep: the background jobs must keep running with nobody on the site. */
	override async onActivityExpired() {
		this.renewActivityTimeout();
	}

	override async onStart() {
		console.log('[app] container started');
		await this.ctx.storage.put(STARTED_VERSION_KEY, this.currentVersion());
	}

	private restarting: Promise<void> | null = null;

	private currentVersion(): string {
		return (this.env as Env).CF_VERSION_METADATA?.id ?? 'unknown';
	}

	/**
	 * The container only reads its env vars when it starts, and it never sleeps.
	 * So after a deploy or a dashboard var/secret edit (= a new Worker version),
	 * restart it once so the new settings actually take effect.
	 */
	private async restartIfStale(): Promise<void> {
		const started = await this.ctx.storage.get<string>(STARTED_VERSION_KEY);
		if (started === this.currentVersion()) return;
		const { status } = await this.getState();
		if (status === 'running' || status === 'healthy') {
			console.log(`[app] worker version changed (${started ?? 'none'} -> ${this.currentVersion()}), restarting container`);
			await this.stopAndWait();
		}
		// Record now so a slow start can't trigger a second restart; onStart re-records.
		await this.ctx.storage.put(STARTED_VERSION_KEY, this.currentVersion());
	}

	/** When requests first found the app not listening while marked healthy (see fetch). */
	private notListeningSince: number | null = null;

	/**
	 * Starts the container if needed and waits until the app answers on its
	 * port. Booting takes longer than the library's built-in 20 s (bridge check,
	 * D1 migrations, seed), so a longer limit is given here.
	 */
	private async waitUntilListening(timeoutMs: number): Promise<boolean> {
		try {
			await this.startAndWaitForPorts({ ports: 3000, cancellationOptions: { portReadyTimeoutMS: timeoutMs } });
			this.notListeningSince = null;
			return true;
		} catch (err) {
			console.warn(`[app] not listening yet after ${timeoutMs / 1000}s: ${err instanceof Error ? err.message : err}`);
			return false;
		}
	}

	/** Stops the container and waits (up to 2 min) until it is really gone. */
	private async stopAndWait(): Promise<void> {
		await this.stop();
		for (let i = 0; i < 120; i++) {
			const s = (await this.getState()).status;
			if (!this.ctx.container?.running || s === 'stopped' || s === 'stopped_with_code') break;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}

	override async fetch(request: Request): Promise<Response> {
		this.restarting ??= this.restartIfStale().finally(() => (this.restarting = null));
		await this.restarting;

		// Not up yet (first start, after a stop): wait for the boot, not just 20 s.
		if ((await this.getState()).status !== 'healthy' && !(await this.waitUntilListening(BOOT_WAIT_MS))) {
			return startingPage();
		}

		const res = await super.fetch(request);
		if (!(await isNotListening(res))) {
			this.notListeningSince = null;
			return res;
		}

		// Marked healthy, but nothing on port 3000: Cloudflare restarted the
		// container underneath us (deploy rollout, host move) and the app is
		// still booting, or the boot is stuck. Wait for it; if it stays down
		// too long, start it over (this also re-attaches the D1/R2 bridge).
		this.notListeningSince ??= Date.now();
		if (Date.now() - this.notListeningSince > STUCK_AFTER_MS) {
			console.error('[app] container running but not listening for too long, restarting it');
			this.notListeningSince = null;
			await this.stopAndWait();
		}
		if (await this.waitUntilListening(BOOT_WAIT_MS)) {
			// Only body-less requests can be sent again.
			if (request.method === 'GET' || request.method === 'HEAD') return super.fetch(request);
		}
		return startingPage();
	}

	override onStop(params: { exitCode?: number; reason?: string }) {
		console.log(`[app] container stopped (exit ${params.exitCode}, ${params.reason})`);
	}

	override onError(error: unknown) {
		console.error('[app] container error', error);
		throw error;
	}
}

// Route the container's requests to BRIDGE_HOST into bridge().
// This must be an ASSIGNMENT, not a `static outboundByHost = …` class field:
// with target es2022 a class field defines its own property and skips the
// library's static setter, so the handler never gets registered and the
// request falls through to the internet (403 "direct IP access").
AppContainer.outboundByHost = {
	[BRIDGE_HOST]: (req, env) => bridge(req, env as unknown as Env)
};

function app(env: Env) {
	return getContainer(env.APP, 'main');
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Overwrite whatever the visitor sent, so the header cannot be spoofed.
		const headers = new Headers(request.headers);
		headers.set(CLIENT_IP_HEADER, request.headers.get('cf-connecting-ip') ?? '0.0.0.0');
		return app(env).fetch(new Request(request, { headers }));
	},

	/**
	 * Every 5 minutes: make sure the container is up. After a deploy, a crash
	 * or a Cloudflare host move, this starts it again even if nobody visits,
	 * so the background jobs resume within minutes.
	 */
	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		const res = await app(env).fetch(new Request('http://app/login'));
		if (!res.ok) console.error(`[keep-alive] /login returned ${res.status}`);
	}
} satisfies ExportedHandler<Env>;
