import { DEFAULTS, baseUrlOf, hostPatternOf, loadConfig, saveConfig } from './config.js';

const $ = (id) => document.getElementById(id);

const FIELDS = ['easytimeUrl', 'essUrl', 'token', 'intervalMinutes', 'lookbackDays', 'chunkSize'];

function show(text, isError = false) {
	$('result').hidden = false;
	$('result').textContent = text;
	$('result').classList.toggle('error', isError);
}

function readForm() {
	return {
		easytimeUrl: baseUrlOf($('easytimeUrl').value),
		essUrl: baseUrlOf($('essUrl').value),
		token: $('token').value.trim(),
		intervalMinutes: Number($('intervalMinutes').value),
		lookbackDays: Number($('lookbackDays').value),
		chunkSize: Number($('chunkSize').value)
	};
}

function requestAccess(...urls) {
	return chrome.permissions.request({ origins: urls.map(hostPatternOf) });
}

async function send(message) {
	const reply = await chrome.runtime.sendMessage(message);
	if (!reply?.ok) throw new Error(reply?.error ?? 'The extension did not answer.');
	return reply.result;
}

$('settings').addEventListener('submit', async (event) => {
	event.preventDefault();
	let config;
	try {
		config = readForm();
	} catch (err) {
		show(err.message, true);
		return;
	}

	if (!(await requestAccess(config.easytimeUrl, config.essUrl))) {
		show('Chrome needs access to both addresses for the bridge to work.', true);
		return;
	}

	await saveConfig(config);
	show(`Saved. The bridge syncs every ${config.intervalMinutes} minute(s) while Chrome is running.`);
});

$('test-easytime').addEventListener('click', async () => {
	let easytimeUrl;
	try {
		easytimeUrl = baseUrlOf($('easytimeUrl').value);
	} catch (err) {
		show(err.message, true);
		return;
	}

	if (!(await requestAccess(easytimeUrl))) {
		show('Chrome needs access to the EasyTime address to test it.', true);
		return;
	}

	show('Asking EasyTime Pro…');
	try {
		const probe = await send({ type: 'test-easytime', easytimeUrl });
		show(
			[
				'EasyTime Pro answered with data.',
				`Transactions on record: ${probe.total ?? 'not reported'}`,
				`Page size parameter: ${probe.sizeParam}`,
				`Newest-first by id: ${probe.orderingById ? 'yes' : 'no (falls back to time windows)'}`,
				`Date filter: ${probe.timeFilter ? 'works' : 'IGNORED, so the bridge cannot sync'}`,
				probe.sample
					? `Latest punch: ${probe.sample.emp_code} at ${probe.sample.punch_time}`
					: 'No punches on record yet.'
			].join('\n'),
			!probe.timeFilter
		);
	} catch (err) {
		show(`EasyTime Pro: ${err.message}`, true);
	}
});

$('test-ess').addEventListener('click', async () => {
	let essUrl;
	try {
		essUrl = baseUrlOf($('essUrl').value);
	} catch (err) {
		show(err.message, true);
		return;
	}

	if (!(await requestAccess(essUrl))) {
		show('Chrome needs access to the ESS address to test it.', true);
		return;
	}

	show('Asking ESS…');
	try {
		const status = await send({ type: 'test-ess', essUrl, token: $('token').value.trim() });
		const last = status.lastImport;
		show(
			[
				`ESS accepted the token "${status.tokenLabel ?? 'unnamed'}".`,
				last
					? `Last batch: ${new Date(last.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}, ${last.rowCount} punches (${last.matchedCount} applied, ${last.duplicateCount} already there, ${last.unmatchedCount} unmatched).`
					: 'Nothing has been sent with this token yet.',
				`Largest batch accepted: ${status.maxRecords} punches.`
			].join('\n')
		);
	} catch (err) {
		show(`ESS: ${err.message}`, true);
	}
});

$('reset').addEventListener('click', async () => {
	if (!confirm('Forget the sync position? The next sync re-reads the look-back period.')) return;
	try {
		await send({ type: 'reset' });
		show('Sync position cleared.');
	} catch (err) {
		show(err.message, true);
	}
});

loadConfig().then((config) => {
	for (const field of FIELDS) $(field).value = config[field] ?? DEFAULTS[field];
});
