/**
 * The browser side of Champ Hub: tab counts, the toast, the open task sheet,
 * and a small fetch helper. Live updates ride the Champ Chat stream (one
 * connection per tab, src/lib/chat/client.svelte.ts): a task or meeting
 * change invalidates the 'hub:data' dependency, so whichever Hub page is open
 * reloads its own data.
 */

import { invalidate, pushState } from '$app/navigation';
import { page } from '$app/state';
import { chat } from '$lib/chat/client.svelte';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; message: string; status: number; task?: unknown };

/** POST/PATCH/DELETE JSON, with the server's plain-words message on failure. */
export async function api<T = Record<string, unknown>>(url: string, method = 'POST', body?: unknown): Promise<ApiResult<T>> {
	try {
		const res = await fetch(url, {
			method,
			headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) return { ok: false, message: data.message ?? `That did not work (${res.status})`, status: res.status, task: data.task };
		return { ok: true, ...(data as T) };
	} catch {
		return { ok: false, message: 'You seem to be offline. Try again in a moment.', status: 0 };
	}
}

type Toast = { id: number; text: string; tone: 'ok' | 'bad'; undo?: () => void | Promise<void> };

class HubClient {
	counts = $state({ needs: 0, work: 0, urgent: false, minutes: 0 });
	toast = $state<Toast | null>(null);
	paletteOpen = $state(false);
	newTaskOpen = $state(false);

	private started = false;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;
	private seq = 0;

	start() {
		if (this.started || typeof window === 'undefined') return;
		this.started = true;
		void this.refreshCounts();
		chat.on((e) => {
			if (e.type === 'tasks.changed' || e.type === 'meetings.changed' || e.type === 'card.updated' || e.type === 'reconnected') this.changed();
			// A new mention or ESS card changes Today, and only Today.
			else if (e.type === 'message.created' || e.type === 'read') {
				if (location.pathname === '/hub') this.changed(1500);
				else this.countsSoon();
			}
		});
		setInterval(() => void this.refreshCounts(), 5 * 60_000);
	}

	/** Something changed on the server: reload what is on screen, once. */
	changed(delay = 300) {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			void invalidate('hub:data');
			void this.refreshCounts();
		}, delay);
	}

	private countsTimer: ReturnType<typeof setTimeout> | null = null;
	private countsSoon() {
		if (this.countsTimer) return;
		this.countsTimer = setTimeout(() => {
			this.countsTimer = null;
			void this.refreshCounts();
		}, 3000);
	}

	async refreshCounts() {
		try {
			const res = await fetch('/api/hub/counts');
			if (res.ok) this.counts = await res.json();
		} catch {
			/* offline: the next event retries */
		}
	}

	say(text: string, opts: { tone?: 'ok' | 'bad'; undo?: () => void | Promise<void> } = {}) {
		const id = ++this.seq;
		this.toast = { id, text, tone: opts.tone ?? 'ok', undo: opts.undo };
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			if (this.toast?.id === id) this.toast = null;
		}, opts.undo ? 6000 : 4000);
	}

	/** Open a task in the side sheet without leaving the page. */
	openTask(id: string) {
		pushState('', { task: id });
	}

	/** The task the sheet should show: shallow state, or ?task= from a link. */
	get openTaskId(): string | null {
		return page.state.task ?? page.url.searchParams.get('task');
	}
}

export const hub = new HubClient();
