import type { DayKind } from '$lib/payroll';

/** How each tracker code reads in the legend, the cells and their tooltips. */
export const KIND_LEGEND: { kind: DayKind; code: string; label: string }[] = [
	{ kind: 'present', code: 'P', label: 'Present' },
	{ kind: 'half', code: 'H', label: 'Half day' },
	{ kind: 'absent', code: 'A', label: 'Absent' },
	{ kind: 'leave', code: 'EL…', label: 'Leave' },
	{ kind: 'pink', code: 'PH', label: 'Pink leave' },
	{ kind: 'compoff', code: 'CO', label: 'Comp off' },
	{ kind: 'compoff_half', code: 'CH', label: 'Half-day comp off' },
	{ kind: 'weekoff', code: 'WO', label: 'Week off' },
	{ kind: 'holiday', code: 'HD', label: 'Holiday' },
	{ kind: 'not_joined', code: 'NJ', label: 'Before joining' },
	{ kind: 'exited', code: 'EX', label: 'After last working day' }
];

export const KIND_LABEL: Record<DayKind, string> = {
	present: 'Present',
	half: 'Half day',
	absent: 'Absent',
	weekoff: 'Week off',
	holiday: 'Holiday',
	pink: 'Pink leave',
	compoff: 'Comp off',
	compoff_half: 'Half-day comp off',
	leave: 'Leave',
	not_joined: 'Before joining',
	exited: 'After last working day',
	upcoming: 'Still to come'
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-10-07' → '7 Oct 2026'. */
export const fmtDate = (d: string | null | undefined) => (d ? `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '—');
/** '2026-10-07' → 'Wed'. */
export const dow = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** Days as payroll writes them: 2, 2.5, 0.25. */
export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
