const ZONE = 'Asia/Kolkata';
const OFFSET = '+05:30';

const formatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

export function istDateTime(date = new Date()) {
	const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function istDate(date = new Date()) {
	return istDateTime(date).slice(0, 10);
}

export function addDays(day, count) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + count);
	return date.toISOString().slice(0, 10);
}

export function shiftMinutes(dateTime, minutes) {
	const instant = new Date(`${dateTime.replace(' ', 'T')}${OFFSET}`);
	return istDateTime(new Date(instant.getTime() + minutes * 60_000));
}

export function punchTimeOf(record) {
	const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(String(record?.punch_time ?? ''));
	return match ? `${match[1]} ${match[2]}:${match[3] ?? '00'}` : null;
}

export function isDay(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
