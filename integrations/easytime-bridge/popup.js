import { loadConfig } from './config.js';
import { istDate } from './time.js';

const $ = (id) => document.getElementById(id);

const STATE_LABELS = { ok: 'OK', error: 'Needs attention', running: 'Syncing', idle: 'Idle' };

function when(ms) {
	return ms
		? new Date(ms).toLocaleString('en-IN', {
				timeZone: 'Asia/Kolkata',
				dateStyle: 'medium',
				timeStyle: 'short'
			})
		: '—';
}

function render(status = {}) {
	const state = status.state ?? 'idle';
	$('state').textContent = STATE_LABELS[state] ?? state;
	$('state').dataset.state = state === 'error' && status.kind === 'logged-out' ? 'warn' : state;
	$('message').textContent = status.message ?? 'Not run yet.';
	$('last-success').textContent = when(status.lastSuccessAt);
	$('position').textContent = status.position ?? '—';

	const run = status.lastRun;
	$('last-run').textContent = run
		? `${run.posted} sent · ${run.matched} applied · ${run.duplicate} already in ESS · ${run.unmatched} unmatched`
		: '—';
}

let unmatchedRange = null;

function renderUnmatched(unmatched = {}) {
	const entries = Object.values(unmatched).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
	$('unmatched').hidden = entries.length === 0;
	$('unmatched-count').textContent = String(entries.length);

	const list = $('unmatched-codes');
	list.replaceChildren(
		...entries.map(({ code, from, to }) => {
			const item = document.createElement('li');
			const dates = document.createElement('span');
			dates.className = 'hint';
			dates.textContent = from === to ? ` ${from}` : ` ${from} → ${to}`;
			item.append(code, dates);
			return item;
		})
	);

	unmatchedRange = entries.length
		? {
				from: entries.reduce((m, e) => (e.from < m ? e.from : m), entries[0].from),
				to: entries.reduce((m, e) => (e.to > m ? e.to : m), entries[0].to)
			}
		: null;
	$('unmatched-range').textContent = unmatchedRange
		? unmatchedRange.from === unmatchedRange.to
			? unmatchedRange.from
			: `${unmatchedRange.from} → ${unmatchedRange.to}`
		: '';
}

async function send(message) {
	const reply = await chrome.runtime.sendMessage(message);
	if (!reply?.ok) throw new Error(reply?.error ?? 'The extension did not answer.');
	return reply.result;
}

function feedback(text) {
	$('feedback').textContent = text;
}

$('sync-now').addEventListener('click', async () => {
	feedback('');
	try {
		await send({ type: 'sync-now' });
	} catch (err) {
		feedback(err.message);
	}
});

$('open-easytime').addEventListener('click', async () => {
	const { easytimeUrl } = await loadConfig();
	if (easytimeUrl) await chrome.tabs.create({ url: easytimeUrl });
	else await chrome.runtime.openOptionsPage();
});

$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('resend').addEventListener('submit', async (event) => {
	event.preventDefault();
	try {
		await send({ type: 'resend', from: $('resend-from').value, to: $('resend-to').value });
		feedback('Re-send queued. Progress shows above.');
	} catch (err) {
		feedback(err.message);
	}
});

$('resend-unmatched').addEventListener('click', async () => {
	if (!unmatchedRange) return;
	try {
		await send({ type: 'resend', ...unmatchedRange });
		feedback(`Re-send of ${unmatchedRange.from} → ${unmatchedRange.to} queued. Progress shows above.`);
	} catch (err) {
		feedback(err.message);
	}
});

$('clear-unmatched').addEventListener('click', async () => {
	try {
		await send({ type: 'clear-unmatched' });
		feedback('List cleared. Codes still unknown come back on their next punch or re-send.');
	} catch (err) {
		feedback(err.message);
	}
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local') return;
	if (changes.status) render(changes.status.newValue);
	if (changes.unmatched) renderUnmatched(changes.unmatched.newValue);
});

const today = istDate();
$('resend-from').max = today;
$('resend-to').max = today;
$('resend-to').value = today;

chrome.storage.local.get(['status', 'unmatched']).then(({ status, unmatched }) => {
	render(status);
	renderUnmatched(unmatched);
});
