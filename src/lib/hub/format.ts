import { istDateKey } from '$lib/chat/rules';

/** Dates and small labels for Champ Hub, in IST like the rest of ESS. */

export const todayKey = () => istDateKey(new Date());

const day = (d: string) => new Date(d + 'T00:00:00Z');

export function dueLabel(due: string | null, today = todayKey()): string {
	if (!due) return 'No date';
	const diff = Math.round((day(due).getTime() - day(today).getTime()) / 86_400_000);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Tomorrow';
	if (diff === -1) return 'Yesterday';
	if (diff > 1 && diff < 7) return day(due).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
	return day(due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** 'overdue' | 'soon' (today or tomorrow) | '' — for tinting a due chip on open work. */
export function dueTone(due: string | null, done: boolean, today = todayKey()): 'overdue' | 'soon' | '' {
	if (!due || done) return '';
	if (due < today) return 'overdue';
	const diff = Math.round((day(due).getTime() - day(today).getTime()) / 86_400_000);
	return diff <= 1 ? 'soon' : '';
}

export function longDay(iso: string): string {
	return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function timeIst(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

export function ago(iso: string): string {
	const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
	return longDay(iso);
}

export const firstName = (full: string) => full.split(' ')[0];
