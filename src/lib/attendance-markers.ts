/**
 * Day markers for the attendance calendar.
 *
 * Each day carries a single letter in the cell's bottom-right corner. The
 * letter for a leave day is derived from the leave type's policy `code` rather
 * than hardcoded, so publishing a new type through the policy document gives it
 * a marker automatically — no code change, and the calendar stays consistent
 * with whatever the live policy says.
 */

export interface MarkerLeave {
	status: string;
	days?: string | number | null;
	typeName: string;
	typeCode?: string | null;
}

export interface DayMarker {
	/** The letter shown in the cell. */
	letter: string;
	/** Drives the colour; maps to a --ess-* token in the calendar's styles. */
	tone: 'present' | 'half' | 'leave' | 'absent' | 'holiday' | 'weekoff';
	/** Full wording for the tooltip and the accessible label. */
	label: string;
}

/**
 * The marker for a leave day comes from its policy code, so a type published
 * through the policy document gets a marker with no code change here.
 *
 * A single letter isn't enough on its own: P/H/A are already taken by
 * Present/Half/Absent, and the codes the policy extractor suggests collide with
 * each other (MATERNITY and PATERNITY, EL and a hypothetical EMERGENCY). So a
 * short code is shown as-is — "EL" and "SL" are what HR already writes — and a
 * longer one is abbreviated to two letters, which keeps Maternity ("MA")
 * distinct from Paternity ("PA") and from Present ("P").
 */
const RESERVED_MARKERS = new Set(['P', 'H', 'A']);

export function leaveLetter(leave: MarkerLeave): string {
	const code = leave.typeCode?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (!code) return 'L';

	// One or two characters is already the abbreviation HR uses. Only a
	// single character can collide with the Present/Half/Absent markers, and
	// padding it to two ("P" → "PL") both resolves that and reads as leave.
	const marker = code.length <= 2 ? code : code.slice(0, 2);
	return RESERVED_MARKERS.has(marker) ? `${marker}L` : marker;
}

/** A leave application counts as a half day when it books 0.5 days. */
export function isHalfDayLeave(leave: MarkerLeave): boolean {
	if (leave.days === null || leave.days === undefined) return false;
	return Number(leave.days) === 0.5;
}

/**
 * ProHance-based presence, used only when no portal/biometric record exists.
 * 4+ hours on system counts as a present day, 2–4 hours as a half day —
 * agreed with HR on 2026-08-05 so ProHance-tracked staff don't read as
 * absent while the biometric feed is still being wired up.
 */
export const PROHANCE_PRESENT_MINUTES = 240;
export const PROHANCE_HALF_MINUTES = 120;

export function prohancePresence(
	timeOnSystemMinutes: number | null | undefined
): 'present' | 'half' | null {
	const mins = timeOnSystemMinutes ?? 0;
	if (mins >= PROHANCE_PRESENT_MINUTES) return 'present';
	if (mins >= PROHANCE_HALF_MINUTES) return 'half';
	return null;
}

export interface DayInputs {
	hasCheckIn: boolean;
	leaves: MarkerLeave[];
	isHoliday: boolean;
	isAbsent: boolean;
	/** ProHance time-on-system for the day, when the day has one. */
	prohanceMinutes?: number | null;
	/** True when the employee's roster (or the Sat/Sun default) makes this a day off. */
	isWeekOff?: boolean;
}

/**
 * Resolves the single marker for a day.
 *
 * Order matters: an approved leave outranks a check-in, because someone on
 * approved half-day leave who also badged in is on leave for the day, not
 * simply present. Pending leave does not outrank attendance — it hasn't been
 * granted yet.
 */
export function dayMarker(day: DayInputs): DayMarker | null {
	const approved = day.leaves.find((l) => l.status === 'approved');

	if (approved) {
		const half = isHalfDayLeave(approved);
		return {
			letter: half ? 'H' : leaveLetter(approved),
			tone: half ? 'half' : 'leave',
			label: half ? `Half day · ${approved.typeName}` : approved.typeName
		};
	}

	if (day.hasCheckIn) {
		return { letter: 'P', tone: 'present', label: 'Present' };
	}

	// No attendance record — ProHance activity stands in as presence evidence.
	// Deliberately ranked above pending leave: hours on system are a fact,
	// an undecided application is not.
	const ph = prohancePresence(day.prohanceMinutes);
	if (ph === 'present') {
		return { letter: 'P', tone: 'present', label: 'Present · 4h+ on system (ProHance)' };
	}
	if (ph === 'half') {
		return { letter: 'H', tone: 'half', label: 'Half day · 2–4h on system (ProHance)' };
	}

	// Pending leave still marks the day so it doesn't read as an absence while
	// awaiting a decision.
	const pending = day.leaves[0];
	if (pending) {
		return {
			letter: leaveLetter(pending),
			tone: 'leave',
			label: `${pending.typeName} · ${pending.status}`
		};
	}

	// A holiday is only marked when nothing else happened that day — someone who
	// worked a holiday should still read as Present.
	if (day.isHoliday) return { letter: 'HO', tone: 'holiday', label: 'Holiday' };

	// Same rule for a week off: it is what the day *was* when nothing else
	// happened. Ranked below holiday so a public holiday falling on a week off
	// still reads as the holiday, which is the more specific fact.
	if (day.isWeekOff) return { letter: 'WO', tone: 'weekoff', label: 'Week off' };

	if (day.isAbsent) return { letter: 'A', tone: 'absent', label: 'Absent' };
	return null;
}
