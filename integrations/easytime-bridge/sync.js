import { baseUrlOf, isConfigured, loadConfig } from './config.js';
import { createReader, EasyTimeError } from './easytime.js';
import { createEssClient } from './ess.js';
import { addDays, isDay, istDate, istDateTime, punchTimeOf, shiftMinutes } from './time.js';

export const CATCH_UP_ALARM = 'catch-up';

const RUN_BUDGET_MS = 240_000;
const KEEPALIVE_MS = 20_000;
const CAPS_TTL_MS = 6 * 60 * 60_000;
const HEARTBEAT_MS = 30 * 60_000;
const TAIL_MAX_PAGES = 5;
const WINDOW_MAX_PAGES = 20;
const DAY_MAX_PAGES = 100;
const WINDOW_OVERLAP_MINUTES = 120;
const MIN_CHUNK = 50;
const MAX_CHUNK = 1000;

let inFlight = null;

export function runSync(trigger) {
	inFlight ??= doSync(trigger).finally(() => {
		inFlight = null;
	});
	return inFlight;
}

export function queueResend(from, to) {
	if (!isDay(from) || !isDay(to)) throw new Error('Pick both dates.');
	if (from > to) throw new Error('The start date is after the end date.');
	if (to > istDate()) throw new Error('The end date is in the future.');

	void (async () => {
		if (inFlight) await inFlight;
		await saveCursor(resendCursor(await loadCursor(), from, to));
		await runSync('resend');
	})().catch((err) => setStatus({ state: 'error', kind: 'resend', message: err.message }));
}

export async function resetCursor() {
	if (inFlight) await inFlight;
	await chrome.storage.local.remove(['cursor', 'heartbeatAt']);
	await chrome.storage.session.remove('caps');
	await setStatus({
		state: 'idle',
		kind: null,
		message: 'Sync position cleared. The next sync starts from the look-back period.',
		position: null
	});
}

export async function testEasyTime(easytimeUrl) {
	const result = await createReader({ baseUrl: baseUrlOf(easytimeUrl) }).probe();
	await chrome.storage.session.remove('caps');
	return result;
}

export async function testEss(essUrl, token) {
	return createEssClient({ baseUrl: baseUrlOf(essUrl), token }).status();
}

async function doSync(trigger) {
	const config = await loadConfig();
	if (!isConfigured(config)) {
		await setStatus({
			state: 'error',
			kind: 'setup',
			message: 'Open the settings page and fill in the EasyTime address, ESS address and import token.'
		});
		return;
	}

	const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), KEEPALIVE_MS);
	const run = {
		trigger,
		startedAt: Date.now(),
		posted: 0,
		matched: 0,
		unmatched: 0,
		duplicate: 0,
		skipped: 0,
		codes: new Set()
	};
	const size = clamp(config.chunkSize, MIN_CHUNK, MAX_CHUNK);
	const ctx = {
		reader: createReader({ baseUrl: config.easytimeUrl }),
		ess: createEssClient({ baseUrl: config.essUrl, token: config.token }),
		pageSize: size,
		chunkSize: size,
		lookbackDays: clamp(config.lookbackDays, 1, 62),
		agent: `EasyTime bridge ${chrome.runtime.getManifest().version}`,
		caps: null,
		run
	};

	await setStatus({ state: 'running', message: 'Syncing…' });

	try {
		ctx.caps = await capabilities(ctx.reader);
		const state = { cursor: (await loadCursor()) ?? (await freshCursor(ctx)) };
		await saveCursor(state.cursor);

		const deadline = run.startedAt + RUN_BUDGET_MS;
		let more = true;
		while (more && Date.now() < deadline) {
			more = state.cursor.mode === 'backfill' ? await backfillDay(state, ctx) : await tail(state, ctx);
		}
		if (more) await chrome.alarms.create(CATCH_UP_ALARM, { delayInMinutes: 0.5 });

		await heartbeat(ctx);

		await setStatus({
			state: 'ok',
			kind: null,
			message: more ? 'Catching up. The next batch starts in a moment.' : 'Up to date.',
			lastSuccessAt: Date.now(),
			lastRun: summarize(run),
			position: describe(state.cursor),
			...(run.posted > 0 ? { unmatchedCodes: [...run.codes] } : {})
		});
	} catch (err) {
		if (err instanceof EasyTimeError && err.kind === 'bad-response') {
			await chrome.storage.session.remove('caps');
		}
		await setStatus({
			state: 'error',
			kind: err?.kind ?? 'unknown',
			message: err?.message ?? String(err),
			lastRun: summarize(run),
			...(run.posted > 0 ? { unmatchedCodes: [...run.codes] } : {})
		});
	} finally {
		clearInterval(keepAlive);
	}
}

async function capabilities(reader) {
	const { caps } = await chrome.storage.session.get('caps');
	if (caps && Date.now() - caps.probedAt < CAPS_TTL_MS) return caps;

	const probed = await reader.probe();
	if (!probed.timeFilter) {
		throw new EasyTimeError(
			'unsupported',
			'EasyTime Pro ignored the start_time/end_time filter, so the bridge cannot read it day by day.'
		);
	}

	const fresh = { ...probed, probedAt: Date.now() };
	await chrome.storage.session.set({ caps: fresh });
	return fresh;
}

async function freshCursor(ctx) {
	let day = addDays(istDate(), -ctx.lookbackDays);
	const status = await ctx.ess.status();
	if (status.latestPunchAt) {
		const latest = istDate(new Date(status.latestPunchAt));
		if (latest > day) day = latest;
	}

	return {
		mode: 'backfill',
		day,
		until: null,
		tailFromId: ctx.caps.orderingById ? await ctx.reader.latestId(ctx.caps.sizeParam) : null,
		lastId: null,
		lastPunchTime: null
	};
}

function resendCursor(current, from, to) {
	if (current?.mode === 'backfill') {
		return {
			...current,
			day: from < current.day ? from : current.day,
			until: current.until === null ? null : to > current.until ? to : current.until
		};
	}
	return {
		mode: 'backfill',
		day: from,
		until: current ? to : null,
		tailFromId: current?.lastId ?? null,
		lastId: null,
		lastPunchTime: current?.lastPunchTime ?? null
	};
}

async function backfillDay(state, ctx) {
	const cursor = state.cursor;
	const today = istDate();
	const last = cursor.until && cursor.until < today ? cursor.until : today;

	if (cursor.day > last) {
		await setCursor(state, {
			mode: 'tail',
			day: null,
			until: null,
			tailFromId: null,
			lastId: cursor.tailFromId,
			lastPunchTime: cursor.lastPunchTime
		});
		return true;
	}

	const { records, truncated } = await collect(
		ctx,
		{
			start_time: `${cursor.day} 00:00:00`,
			end_time: `${addDays(cursor.day, 1)} 00:00:00`,
			ordering: ctx.caps.orderingById ? 'id' : undefined
		},
		DAY_MAX_PAGES
	);
	if (truncated) {
		throw new EasyTimeError(
			'unsupported',
			`EasyTime Pro returned more than ${DAY_MAX_PAGES} pages for ${cursor.day}.`
		);
	}

	await postAll(ctx, records, `day ${cursor.day}`);
	await setCursor(state, {
		...cursor,
		day: addDays(cursor.day, 1),
		lastPunchTime: latestPunchTime(cursor.lastPunchTime, records)
	});
	return true;
}

async function tail(state, ctx) {
	if (!ctx.caps.orderingById) return tailByWindow(state, ctx);

	if (state.cursor.lastId === null || state.cursor.lastId === undefined) {
		const lastId = await ctx.reader.latestId(ctx.caps.sizeParam);
		const more = await tailByWindow(state, ctx);
		await setCursor(
			state,
			state.cursor.mode === 'tail' ? { ...state.cursor, lastId } : { ...state.cursor, tailFromId: lastId }
		);
		return more;
	}

	return tailById(state, ctx);
}

async function tailById(state, ctx) {
	const cursor = state.cursor;
	let page = await ctx.reader.fetchFirst({ ordering: '-id', [ctx.caps.sizeParam]: ctx.pageSize });

	const newestId = Number(page.records[0]?.id);
	if (Number.isFinite(newestId) && newestId < cursor.lastId) {
		await restartBackfill(state, ctx, { tailFromId: newestId });
		return true;
	}

	const fresh = [];
	let pages = 1;
	let reached = false;
	for (;;) {
		for (const record of page.records) {
			if (Number(record.id) <= cursor.lastId) {
				reached = true;
				break;
			}
			fresh.push(record);
		}
		if (reached || !page.next || pages >= TAIL_MAX_PAGES) break;
		page = await ctx.reader.fetchNext(page.next);
		pages += 1;
	}

	if (!reached && page.next) {
		await restartBackfill(state, ctx, { tailFromId: highestId(fresh) });
		return true;
	}
	if (fresh.length === 0) return false;

	await postAll(ctx, fresh, `after #${cursor.lastId}`);
	await setCursor(state, {
		...cursor,
		lastId: highestId(fresh),
		lastPunchTime: latestPunchTime(cursor.lastPunchTime, fresh)
	});
	return false;
}

async function tailByWindow(state, ctx) {
	const cursor = state.cursor;
	const start = cursor.lastPunchTime
		? shiftMinutes(cursor.lastPunchTime, -WINDOW_OVERLAP_MINUTES)
		: `${istDate()} 00:00:00`;

	const { records, truncated } = await collect(
		ctx,
		{ start_time: start, end_time: istDateTime(new Date(Date.now() + 60_000)) },
		WINDOW_MAX_PAGES
	);
	if (truncated) {
		await restartBackfill(state, ctx, { tailFromId: null });
		return true;
	}
	if (records.length === 0) return false;

	await postAll(ctx, records, `since ${start}`);
	await setCursor(state, { ...cursor, lastPunchTime: latestPunchTime(cursor.lastPunchTime, records) });
	return false;
}

async function restartBackfill(state, ctx, { tailFromId }) {
	const lastPunchTime = state.cursor.lastPunchTime;
	await setCursor(state, {
		mode: 'backfill',
		day: lastPunchTime ? addDays(lastPunchTime.slice(0, 10), -1) : addDays(istDate(), -ctx.lookbackDays),
		until: null,
		tailFromId,
		lastId: null,
		lastPunchTime
	});
}

async function collect(ctx, params, maxPages) {
	let page = await ctx.reader.fetchFirst({ ...params, [ctx.caps.sizeParam]: ctx.pageSize });
	const records = [...page.records];
	let pages = 1;

	while (page.next) {
		if (pages >= maxPages) return { records, truncated: true };
		page = await ctx.reader.fetchNext(page.next);
		records.push(...page.records);
		pages += 1;
	}

	return { records, truncated: false };
}

async function postAll(ctx, records, label) {
	const punches = records
		.map((record) => ({ record, time: punchTimeOf(record) }))
		.filter(({ record, time }) => time && String(record.emp_code ?? '').trim())
		.sort(
			(a, b) =>
				(a.time < b.time ? -1 : a.time > b.time ? 1 : 0) ||
				(Number(a.record.id) || 0) - (Number(b.record.id) || 0)
		)
		.map(({ record }) => record);
	ctx.run.skipped += records.length - punches.length;

	let size = ctx.chunkSize;
	for (let i = 0; i < punches.length; ) {
		const chunk = punches.slice(i, i + size);
		let result;
		try {
			result = await ctx.ess.post(chunk, `${ctx.agent} · ${label}`.slice(0, 120));
		} catch (err) {
			if (err.kind === 'too-large' && size > MIN_CHUNK) {
				size = Math.max(MIN_CHUNK, Math.floor(size / 2));
				continue;
			}
			throw err;
		}

		ctx.run.posted += chunk.length;
		ctx.run.matched += result.matchedCount ?? 0;
		ctx.run.unmatched += result.unmatchedCount ?? 0;
		ctx.run.duplicate += result.duplicateCount ?? 0;
		for (const code of result.unmatchedEmpCodes ?? []) ctx.run.codes.add(code);
		i += chunk.length;
	}

	if (punches.length > 0) await chrome.storage.local.set({ heartbeatAt: Date.now() });
}

async function heartbeat(ctx) {
	const { heartbeatAt } = await chrome.storage.local.get('heartbeatAt');
	if (heartbeatAt && Date.now() - heartbeatAt < HEARTBEAT_MS) return;
	await ctx.ess.status();
	await chrome.storage.local.set({ heartbeatAt: Date.now() });
}

async function loadCursor() {
	const { cursor } = await chrome.storage.local.get('cursor');
	return cursor ?? null;
}

async function saveCursor(cursor) {
	await chrome.storage.local.set({ cursor });
}

async function setCursor(state, cursor) {
	state.cursor = cursor;
	await saveCursor(cursor);
}

async function setStatus(patch) {
	const { status: previous } = await chrome.storage.local.get('status');
	const status = { ...(previous ?? {}), ...patch, at: Date.now() };
	await chrome.storage.local.set({ status });
	await paintBadge(status);
	return status;
}

async function paintBadge(status) {
	const text = status.state === 'running' ? '…' : status.state === 'error' ? '!' : '';
	await chrome.action.setBadgeText({ text });
	if (text) {
		await chrome.action.setBadgeBackgroundColor({
			color:
				status.state === 'running' ? '#64748b' : status.kind === 'logged-out' ? '#d97706' : '#dc2626'
		});
	}
	await chrome.action.setTitle({ title: `EasyTime → ESS: ${status.message ?? ''}`.slice(0, 250) });
}

function describe(cursor) {
	if (cursor.mode === 'backfill') {
		return `Catching up: next day to read is ${cursor.day}${cursor.until ? ` (re-sending until ${cursor.until})` : ''}`;
	}
	return cursor.lastPunchTime ? `Following new punches; latest sent ${cursor.lastPunchTime}` : 'Following new punches';
}

function summarize(run) {
	return {
		trigger: run.trigger,
		posted: run.posted,
		matched: run.matched,
		unmatched: run.unmatched,
		duplicate: run.duplicate,
		skipped: run.skipped,
		codes: [...run.codes],
		finishedAt: Date.now()
	};
}

function highestId(records) {
	return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
}

function latestPunchTime(current, records) {
	let latest = current;
	for (const record of records) {
		const time = punchTimeOf(record);
		if (time && (!latest || time > latest)) latest = time;
	}
	return latest;
}

function clamp(value, min, max) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : min;
}
