const TRANSACTIONS_PATH = '/iclock/api/transactions/';

const FIELDS = [
	'id',
	'emp_code',
	'first_name',
	'last_name',
	'dept_code',
	'dept_name',
	'department',
	'punch_time',
	'punch_state',
	'verify_type',
	'work_code',
	'card_number',
	'card_no',
	'area_alias',
	'area_name',
	'terminal_alias',
	'terminal_sn',
	'temperature',
	'mask_flag',
	'is_mask'
];

export class EasyTimeError extends Error {
	constructor(kind, message) {
		super(message);
		this.name = 'EasyTimeError';
		this.kind = kind;
	}
}

export function createReader({ baseUrl, timeoutMs = 25_000 }) {
	const origin = new URL(baseUrl).origin;

	const loggedOut = () =>
		new EasyTimeError('logged-out', 'Log in to EasyTime Pro in this Chrome profile, then sync again.');

	async function getJson(target) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const unreachable = (err) =>
			new EasyTimeError(
				'unreachable',
				`EasyTime Pro is not reachable at ${baseUrl} (${err.name === 'AbortError' ? 'timed out' : err.message}). Check that the VPN is connected.`
			);

		try {
			let response;
			try {
				response = await fetch(target, {
					credentials: 'include',
					redirect: 'manual',
					cache: 'no-store',
					headers: { Accept: 'application/json' },
					signal: controller.signal
				});
			} catch (err) {
				throw unreachable(err);
			}

			if (
				response.type === 'opaqueredirect' ||
				(response.status >= 300 && response.status < 400) ||
				response.status === 401
			) {
				throw loggedOut();
			}

			let text;
			try {
				text = await response.text();
			} catch (err) {
				throw unreachable(err);
			}

			if (response.status === 403) {
				if (/credentials were not provided|not authenticated/i.test(text)) throw loggedOut();
				throw new EasyTimeError(
					'forbidden',
					'The EasyTime Pro user logged in here is not allowed to read transactions.'
				);
			}
			if (!response.ok) {
				throw new EasyTimeError('bad-response', `EasyTime Pro answered HTTP ${response.status}.`);
			}

			try {
				return JSON.parse(text);
			} catch {
				throw loggedOut();
			}
		} finally {
			clearTimeout(timer);
		}
	}

	function trim(row) {
		const record = {};
		for (const key of FIELDS) {
			const value = row?.[key];
			if (value !== null && value !== undefined && typeof value !== 'object') record[key] = value;
		}
		return record;
	}

	function rebase(link) {
		const url = new URL(link, origin);
		return `${origin}${url.pathname}${url.search}`;
	}

	function page(body) {
		const rows = Array.isArray(body)
			? body
			: Array.isArray(body?.data)
				? body.data
				: Array.isArray(body?.results)
					? body.results
					: null;

		if (!rows) {
			const detail = body?.msg ?? body?.detail ?? body?.code;
			throw new EasyTimeError(
				'bad-response',
				`Unexpected reply from ${TRANSACTIONS_PATH}${detail !== undefined ? `: ${detail}` : ''}.`
			);
		}

		return {
			records: rows.map(trim),
			next: typeof body?.next === 'string' && body.next ? rebase(body.next) : null,
			count: typeof body?.count === 'number' ? body.count : null
		};
	}

	function urlFor(params) {
		const url = new URL(`${baseUrl}${TRANSACTIONS_PATH}`);
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
		}
		return url.toString();
	}

	async function fetchFirst(params) {
		return page(await getJson(urlFor(params)));
	}

	async function fetchNext(next) {
		return page(await getJson(next));
	}

	async function latestId(sizeParam = 'page_size') {
		const { records } = await fetchFirst({ ordering: '-id', [sizeParam]: 1 });
		return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
	}

	async function probe() {
		let sizeParam = null;
		let newest = null;
		for (const candidate of ['page_size', 'limit']) {
			const result = await fetchFirst({ ordering: '-id', [candidate]: 2 });
			newest ??= result;
			if (result.records.length <= 2) {
				sizeParam = candidate;
				newest = result;
				break;
			}
		}
		sizeParam ??= 'page_size';

		const oldest = await fetchFirst({ ordering: 'id', [sizeParam]: 2 });
		const past = await fetchFirst({
			[sizeParam]: 1,
			start_time: '2000-01-01 00:00:00',
			end_time: '2000-01-02 00:00:00'
		});

		const ids = (records) => records.map((record) => Number(record.id));
		const descending = ids(newest.records);
		const ascending = ids(oldest.records);
		const hasIds = descending.length > 0 && descending.every(Number.isFinite);

		return {
			sizeParam,
			orderingById:
				hasIds &&
				!(descending.length >= 2 && descending[0] < descending[1]) &&
				!(ascending.length >= 2 && ascending[0] > ascending[1]),
			timeFilter: past.records.length === 0,
			total: newest.count,
			sample: newest.records[0] ?? null
		};
	}

	return { fetchFirst, fetchNext, latestId, probe };
}
