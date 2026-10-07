import { syncAll } from './sync';
import { applyRetention, fireReminders, postCelebrations, sendDigests } from './notify';
import { istMinutes } from '$lib/chat/rules';

/**
 * Champ Chat's background jobs, started with the server (hooks.server.ts) and
 * guarded like the ProHance poller against a second start under dev HMR.
 *
 *   roster sync    every 10 min   team and shift channels follow the roster
 *   reminders      every 30 s     /remind
 *   email digest   every 10 min   unread DMs after 2 h, mentions after 4 h
 *   celebrations   every 30 min   posts once a day, from 9 am IST
 *   retention      every 6 h      deletes messages older than six months
 *   zoom           every 30 min   summaries whose webhook never arrived (Champ Hub)
 */
export function startChatScheduler() {
	const g = globalThis as { __chatScheduler?: boolean };
	if (g.__chatScheduler) return;
	g.__chatScheduler = true;

	const safe = (name: string, fn: () => Promise<unknown>) => () =>
		fn().catch((err) => console.error(`[chat] ${name} failed:`, err instanceof Error ? err.message : err));

	const sync = safe('roster sync', syncAll);
	setTimeout(sync, 8_000);
	setInterval(sync, 10 * 60_000);

	setInterval(safe('reminders', () => fireReminders()), 30_000);
	setInterval(safe('digest', () => sendDigests()), 10 * 60_000);
	setInterval(
		safe('celebrations', async () => {
			if (istMinutes(new Date()) >= 9 * 60) await postCelebrations();
		}),
		30 * 60_000
	);
	const zoom = safe('zoom reconcile', async () => {
		const { reconcileZoom } = await import('$lib/server/meetings/service');
		await reconcileZoom();
	});
	setTimeout(zoom, 90_000);
	setInterval(zoom, 30 * 60_000);
	const retention = safe('retention', () => applyRetention());
	setTimeout(retention, 60_000);
	setInterval(retention, 6 * 3_600_000);
}
