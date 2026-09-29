/**
 * Turning message text into safe HTML, and chat times.
 *
 * Everything is escaped first; only then are links, @mentions and `code`
 * marked up, so a message can never inject markup of its own.
 */

export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderBody(body: string, meName?: string): string {
	let html = escapeHtml(body);
	// Links: http(s) only, opened in a new tab without a referrer.
	html = html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
	// `inline code`
	html = html.replace(/`([^`\n]{1,200})`/g, '<code>$1</code>');
	// @mentions, with yours standing out.
	html = html.replace(/(^|\s)@(channel|here|[A-Z][\w.'-]*(?: [A-Z][\w.'-]*)?)/g, (m, pre, name) => {
		const me = meName && (name === meName || meName.startsWith(name + ' ') || name === meName.split(' ')[0]);
		return `${pre}<span class="mention${me || name === 'channel' || name === 'here' ? ' mention-me' : ''}">@${name}</span>`;
	});
	return html;
}

const IST = 'Asia/Kolkata';

export function timeOf(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST });
}

/** "Today", "Yesterday", "Mon 28 Sep" — the divider between days. */
export function dayLabel(iso: string, now = new Date()): string {
	const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST });
	const d = new Date(iso);
	if (key(d) === key(now)) return 'Today';
	if (key(d) === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
	return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', timeZone: IST });
}

export function dayKey(iso: string): string {
	return new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });
}

export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]!.toUpperCase())
		.join('');
}
