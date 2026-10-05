import { loadConfig } from './config.js';
import {
	CATCH_UP_ALARM,
	queueResend,
	resetCursor,
	runSync,
	testEasyTime,
	testEss
} from './sync.js';

const SYNC_ALARM = 'sync';

async function scheduleSync(force = false) {
	const { intervalMinutes } = await loadConfig();
	const period = Math.min(60, Math.max(1, Math.round(Number(intervalMinutes)) || 5));
	const existing = await chrome.alarms.get(SYNC_ALARM);
	if (!force && existing?.periodInMinutes === period) return;
	await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: period, delayInMinutes: 0.1 });
}

chrome.runtime.onInstalled.addListener(() => {
	scheduleSync(true);
});

chrome.runtime.onStartup.addListener(() => {
	scheduleSync();
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.config) scheduleSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === SYNC_ALARM || alarm.name === CATCH_UP_ALARM) runSync(alarm.name);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	handle(message).then(
		(result) => sendResponse({ ok: true, result }),
		(err) => sendResponse({ ok: false, error: err?.message ?? String(err), kind: err?.kind ?? null })
	);
	return true;
});

async function handle(message) {
	switch (message?.type) {
		case 'sync-now':
			runSync('manual');
			return null;
		case 'resend':
			queueResend(message.from, message.to);
			return null;
		case 'reset':
			await resetCursor();
			return null;
		case 'test-easytime':
			return testEasyTime(message.easytimeUrl);
		case 'test-ess':
			return testEss(message.essUrl, message.token);
		default:
			throw new Error(`Unknown request: ${message?.type}`);
	}
}
