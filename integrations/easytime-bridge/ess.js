export class EssError extends Error {
	constructor(kind, message, status = null) {
		super(message);
		this.name = 'EssError';
		this.kind = kind;
		this.status = status;
	}
}

export function createEssClient({ baseUrl, token, timeoutMs = 28_000 }) {
	const endpoint = `${baseUrl}/api/attendance/easytime-import`;

	async function request(method, payload) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const unreachable = (err) =>
			new EssError(
				'unreachable',
				`ESS is not reachable at ${baseUrl} (${err.name === 'AbortError' ? 'timed out' : err.message}).`
			);

		try {
			let response;
			let text;
			try {
				response = await fetch(endpoint, {
					method,
					credentials: 'omit',
					cache: 'no-store',
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/json',
						...(payload ? { 'Content-Type': 'application/json' } : {})
					},
					body: payload ? JSON.stringify(payload) : undefined,
					signal: controller.signal
				});
				text = await response.text();
			} catch (err) {
				throw unreachable(err);
			}

			let body = null;
			try {
				body = text ? JSON.parse(text) : null;
			} catch {
				body = null;
			}
			const detail = body?.message ?? text.replace(/\s+/g, ' ').slice(0, 160);

			if (response.status === 401) {
				throw new EssError('token', 'ESS rejected the import token. Check it on the settings page.', 401);
			}
			if (response.status === 413) {
				throw new EssError('too-large', 'ESS refused the batch as too large.', 413);
			}
			if (response.status === 400) {
				throw new EssError('contract', `ESS could not read the batch: ${detail}`, 400);
			}
			if (!response.ok) {
				throw new EssError('server', `ESS answered HTTP ${response.status}: ${detail}`, response.status);
			}
			if (!body) {
				throw new EssError('server', 'ESS sent a reply that is not JSON.', response.status);
			}
			return body;
		} finally {
			clearTimeout(timer);
		}
	}

	return {
		status: () => request('GET'),
		post: (punches, agent) => request('POST', { punches, agent })
	};
}
