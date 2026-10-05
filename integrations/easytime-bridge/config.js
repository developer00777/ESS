export const DEFAULTS = {
	easytimeUrl: '',
	essUrl: 'https://champ-hr.com',
	token: '',
	intervalMinutes: 5,
	lookbackDays: 7,
	chunkSize: 500
};

export async function loadConfig() {
	const { config } = await chrome.storage.local.get('config');
	return { ...DEFAULTS, ...(config ?? {}) };
}

export async function saveConfig(config) {
	await chrome.storage.local.set({ config });
}

export function isConfigured(config) {
	return Boolean(config.easytimeUrl && config.essUrl && config.token);
}

export function baseUrlOf(value) {
	let url;
	try {
		url = new URL(String(value).trim());
	} catch {
		throw new Error(`"${value}" is not a web address`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`"${value}" must start with http:// or https://`);
	}
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function hostPatternOf(value) {
	const url = new URL(value);
	return `${url.protocol}//${url.hostname}/*`;
}
