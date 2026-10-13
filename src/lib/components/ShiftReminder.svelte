<script lang="ts">
	import { goto } from '$app/navigation';
	import Clock from '@lucide/svelte/icons/clock';
	import Fingerprint from '@lucide/svelte/icons/fingerprint-pattern';

	/**
	 * Check-out prompts, on every ESS page, for whoever is checked in:
	 *
	 *   9h after check-in      a reminder to punch out on the biometric device
	 *   9h 30m, still no out   the punch is treated as missed: raise a correction
	 *
	 * Both are measured from the shift's own check-in, so they work for any
	 * shift, day or night. The open shift is polled, so a check-out that syncs
	 * closes the prompt; a dismissed prompt stays dismissed for that shift.
	 */

	type OpenShift = { date: string; checkInAt: string };
	type Stage = 'remind' | 'missed';

	const POLL_MS = 5 * 60_000;
	const SNOOZE_MS = 15 * 60_000;
	const SEEN_KEY = 'essShiftAlerts';

	let shift = $state<OpenShift | null>(null);
	let reminderMinutes = $state(9 * 60);
	let graceMinutes = $state(9 * 60 + 30);
	/** Server clock minus this browser's, so a wrong PC clock can't skew the timers. */
	let skew = 0;
	let stage = $state<Stage | null>(null);
	let tick = $state(Date.now());
	let timers: ReturnType<typeof setTimeout>[] = [];

	type Seen = Record<string, { remind?: boolean; missed?: boolean; snoozeUntil?: number }>;
	function readSeen(): Seen {
		try {
			return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
		} catch {
			return {};
		}
	}
	function writeSeen(update: (s: Seen) => void) {
		try {
			const seen = readSeen();
			update(seen);
			// Only the last few shifts matter.
			const keys = Object.keys(seen).sort().slice(-10);
			localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, seen[k]]))));
		} catch {
			/* storage blocked: the prompt may simply show again */
		}
	}

	async function fetchOpen(): Promise<OpenShift | null | undefined> {
		try {
			const r = await fetch('/api/attendance/open-shift');
			if (!r.ok) return undefined;
			const body = await r.json();
			skew = Date.parse(body.now) - Date.now();
			reminderMinutes = body.reminderMinutes;
			graceMinutes = body.graceMinutes;
			return body.shift;
		} catch {
			return undefined; // offline: keep what we have
		}
	}

	async function refresh() {
		const next = await fetchOpen();
		if (next === undefined) return;
		const changed = next?.checkInAt !== shift?.checkInAt;
		shift = next;
		if (!shift) stage = null;
		if (changed || !timers.length) schedule();
	}

	function clearTimers() {
		for (const t of timers) clearTimeout(t);
		timers = [];
	}

	function schedule() {
		clearTimers();
		if (!shift) return;
		const start = Date.parse(shift.checkInAt);
		const now = Date.now() + skew;
		const toRemind = start + reminderMinutes * 60_000 - now;
		const toMissed = start + graceMinutes * 60_000 - now;
		if (toMissed <= 0) show('missed');
		else {
			if (toRemind <= 0) show('remind');
			else timers.push(setTimeout(() => void confirmThenShow('remind'), toRemind));
			timers.push(setTimeout(() => void confirmThenShow('missed'), toMissed));
		}
	}

	/** Re-checks before prompting: the check-out may have synced since the last poll. */
	async function confirmThenShow(kind: Stage) {
		const current = shift?.checkInAt;
		const next = await fetchOpen();
		if (next !== undefined) shift = next;
		if (shift && shift.checkInAt === current) show(kind);
		else if (!shift) stage = null;
	}

	function show(kind: Stage) {
		if (!shift) return;
		const seen = readSeen()[shift.checkInAt] ?? {};
		if (seen[kind]) return;
		if (kind === 'missed' && seen.snoozeUntil && Date.now() < seen.snoozeUntil) {
			timers.push(setTimeout(() => void confirmThenShow('missed'), seen.snoozeUntil - Date.now()));
			return;
		}
		if (stage === 'missed' && kind === 'remind') return;
		stage = kind;
		notifyIfHidden(kind);
	}

	/** A system notification as well, when the portal is open in a background tab. */
	function notifyIfHidden(kind: Stage) {
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		if (document.visibilityState === 'visible') return;
		try {
			const n = new Notification(kind === 'remind' ? 'Time to punch out' : 'Biometric check-out missed?', {
				body: kind === 'remind' ? `You checked in at ${clock(shift!.checkInAt)} — 9 hours ago.` : 'No check-out has reached the portal. Raise a correction if you punched out.',
				tag: 'ess-shift'
			});
			n.onclick = () => {
				window.focus();
				n.close();
			};
		} catch {
			/* some browsers only allow notifications from a service worker */
		}
	}

	function dismiss() {
		if (!shift || !stage) return;
		const key = shift.checkInAt;
		const kind = stage;
		writeSeen((s) => {
			s[key] = { ...s[key], [kind]: true };
		});
		stage = null;
	}

	/** "I punched out": wait a little for the device to sync, then check again. */
	function snooze() {
		if (!shift) return;
		const key = shift.checkInAt;
		const until = Date.now() + SNOOZE_MS;
		writeSeen((s) => {
			s[key] = { ...s[key], snoozeUntil: until };
		});
		stage = null;
		timers.push(setTimeout(() => void confirmThenShow('missed'), SNOOZE_MS));
	}

	function raise() {
		if (!shift) return;
		const date = shift.date;
		dismiss();
		void goto(`/attendance?raise=${date}`);
	}

	function clock(iso: string) {
		return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
	}

	const elapsed = $derived.by(() => {
		if (!shift) return '';
		const mins = Math.max(0, Math.floor((tick + skew - Date.parse(shift.checkInAt)) / 60_000));
		return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
	});

	$effect(() => {
		void refresh();
		const poll = setInterval(() => void refresh(), POLL_MS);
		const clockTick = setInterval(() => (tick = Date.now()), 30_000);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(poll);
			clearInterval(clockTick);
			clearTimers();
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

{#if shift && stage}
	<div class="ess-scrim shift-scrim" aria-hidden="true"></div>
	<div class="shift-wrap">
		<div class="ess-modal shift-pop" role="alertdialog" aria-modal="true" aria-labelledby="shift-pop-title" aria-describedby="shift-pop-body">
			{#if stage === 'remind'}
				<div class="ess-modal__body shift-body">
					<span class="ess-tile ess-tile--info"><Clock size={20} /></span>
					<div>
						<h2 id="shift-pop-title">Time to punch out</h2>
						<p id="shift-pop-body">
							You checked in at <strong>{clock(shift.checkInAt)}</strong> — {elapsed} ago, a full 9-hour shift.
							Remember to punch out on the biometric device when you leave, or your check-out will be marked missed at 9h 30m.
						</p>
					</div>
				</div>
				<div class="ess-modal__foot">
					<button type="button" class="ess-btn ess-btn--primary" onclick={dismiss}>OK, got it</button>
				</div>
			{:else}
				<div class="ess-modal__body shift-body">
					<span class="ess-tile ess-tile--warn"><Fingerprint size={20} /></span>
					<div>
						<h2 id="shift-pop-title">Biometric check-out missed?</h2>
						<p id="shift-pop-body">
							You checked in at <strong>{clock(shift.checkInAt)}</strong>, {elapsed} ago, and no check-out has reached the portal.
							If you forgot to punch out, raise a correction with your actual check-out time so HR can fix the record.
						</p>
					</div>
				</div>
				<div class="ess-modal__foot">
					<button type="button" class="ess-btn ess-btn--ghost" onclick={dismiss}>Dismiss</button>
					<button type="button" class="ess-btn ess-btn--outline" onclick={snooze}>I've punched out</button>
					<button type="button" class="ess-btn ess-btn--primary" onclick={raise}>Raise correction</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.shift-scrim {
		z-index: 80;
	}
	.shift-wrap {
		position: fixed;
		inset: 0;
		z-index: 81;
		display: grid;
		place-items: center;
		padding: 16px;
		pointer-events: none;
	}
	.shift-pop {
		pointer-events: auto;
		width: min(460px, calc(100vw - 32px));
		animation: pop var(--ess-t-slow, 0.25s) both;
	}
	@keyframes pop {
		from {
			transform: translateY(10px) scale(0.98);
			opacity: 0;
		}
	}
	.shift-body {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 14px;
		align-items: start;
	}
	h2 {
		margin: 0 0 6px;
		font-family: var(--ess-font-display);
		font-size: 20px;
		font-weight: 600;
		color: var(--ess-text);
	}
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ess-text-secondary);
	}
	.ess-modal__foot {
		flex-wrap: wrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.shift-pop {
			animation: none;
		}
	}
</style>
