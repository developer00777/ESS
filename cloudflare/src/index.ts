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
			await this.stop();
			for (let i = 0; i < 120; i++) {
				const s = (await this.getState()).status;
				if (s === 'stopped' || s === 'stopped_with_code') break;
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
		// Record now so a slow start can't trigger a second restart; onStart re-records.
		await this.ctx.storage.put(STARTED_VERSION_KEY, this.currentVersion());
	}

	override async fetch(request: Request): Promise<Response> {
		this.restarting ??= this.restartIfStale().finally(() => (this.restarting = null));
		await this.restarting;
		return super.fetch(request);
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
