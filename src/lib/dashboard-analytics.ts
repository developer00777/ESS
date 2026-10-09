type Punch = { date: string; checkInAt: Date | string | null; checkOutAt: Date | string | null };
export function attendanceWindow(today: string) {
	const end = new Date(`${today}T00:00:00Z`);
	end.setUTCDate(end.getUTCDate() + (7 - end.getUTCDay()) % 7);
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - 90);
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export function buildAttendanceHeatmap(today: string, rows: Punch[]) {
	const { start } = attendanceWindow(today);
	const recorded = new Map<string, { hours: number; complete: boolean }>();
	for (const row of rows) {
		if (!row.checkInAt || row.date > today) continue;
		const hours = row.checkOutAt ? (new Date(row.checkOutAt).getTime() - new Date(row.checkInAt).getTime()) / 3600000 : 0;
		const previous = recorded.get(row.date);
		recorded.set(row.date, { hours: Math.max(previous?.hours ?? 0, Number.isFinite(hours) && hours > 0 ? hours : 0), complete: Boolean(previous?.complete || (row.checkOutAt && hours >= 0)) });
	}
	return Array.from({ length: 91 }, (_, i) => {
		const date = new Date(`${start}T00:00:00Z`);
		date.setUTCDate(date.getUTCDate() + i);
		const key = date.toISOString().slice(0, 10);
		const entry = recorded.get(key);
		return { date: key, label: date.toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), hours: Math.round((entry?.hours ?? 0) * 10) / 10, level: key > today ? -1 : !entry ? 0 : !entry.complete ? 1 : entry.hours < 4 ? 2 : entry.hours < 8 ? 3 : 4, recorded: Boolean(entry), complete: entry?.complete ?? false };
	});
}
