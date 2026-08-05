/**
 * Shift pairing and worked hours.
 *
 * A night shift starts on one calendar day and ends on the next, so its two
 * punches arrive as two attendance rows. Subtracting them per-row gives
 * nonsense (a check-in with no check-out, then a check-out with no check-in),
 * which is why the pairing happens here rather than in the calendar.
 */

/** Standard full shift. Days shorter than this are flagged, never rewritten. */
export const STANDARD_SHIFT_MINUTES = 9 * 60;

/**
 * Longest gap that still counts as one shift when the employee has no shift
 * window on file. Chosen to cover a 9-hour shift plus a long break or a late
 * logout, while refusing to pair two genuinely separate days: an 18:00 check-in
 * and a 09:00 check-out the next morning is 15 hours and stays unpaired.
 */
export const MAX_PAIR_GAP_MINUTES = 14 * 60;

export interface ShiftDay {
	/** 'YYYY-MM-DD' — the day the shift is credited to (its start date). */
	date: string;
	checkInAt: Date | null;
	checkOutAt: Date | null;
	/** Minutes worked once the shift is paired across midnight, if computable. */
	workedMinutes: number | null;
	/** True when a check-out from the following day completed this shift. */
	crossesMidnight: boolean;
	/**
	 * The date whose row was absorbed into this shift, when it crossed midnight.
	 * Stated explicitly so the UI never has to re-derive a calendar date from a
	 * timestamp — that conversion is timezone-dependent.
	 */
	absorbedDate: string | null;
	/** True when worked time is known and falls short of a standard shift. */
	isShort: boolean;
	/**
	 * Set when a check-out couldn't be attributed to any check-in — e.g. a gap
	 * beyond MAX_PAIR_GAP_MINUTES, or a missing punch. Surfaced rather than
	 * silently absorbed, because it means the record needs a human.
	 */
	anomaly:
		| 'missing-check-out'
		| 'orphan-check-out'
		| 'gap-too-long'
		| 'check-out-before-check-in'
		| null;
}

export interface AttendanceRowInput {
	date: string;
	checkInAt: string | Date | null;
	checkOutAt: string | Date | null;
}

const toDate = (v: string | Date | null): Date | null => {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
};

const minutesBetween = (from: Date, to: Date) =>
	Math.round((to.getTime() - from.getTime()) / 60_000);

const nextDay = (date: string): string => {
	const [y, m, d] = date.split('-').map(Number);
	const nd = new Date(Date.UTC(y, m - 1, d + 1));
	return nd.toISOString().slice(0, 10);
};

/**
 * Pairs attendance rows into shifts and computes worked minutes.
 *
 * A row whose check-out is missing borrows the next day's check-out when that
 * day has no check-in of its own — the signature of a shift that ran past
 * midnight. The borrowed row is then consumed, so a night shift is reported
 * once against its start date instead of twice.
 *
 * `maxGapMinutes` bounds how far a check-out can sit from its check-in. Pass
 * the employee's own shift length plus some slack when it is known; the default
 * covers staff with no shift window on file.
 */
export function pairShifts(
	rows: AttendanceRowInput[],
	maxGapMinutes: number = MAX_PAIR_GAP_MINUTES
): ShiftDay[] {
	const byDate = new Map<string, AttendanceRowInput>();
	for (const r of rows) byDate.set(r.date.slice(0, 10), r);

	const dates = [...byDate.keys()].sort();
	const consumed = new Set<string>();
	const out: ShiftDay[] = [];

	for (const date of dates) {
		if (consumed.has(date)) continue;
		const row = byDate.get(date)!;
		const checkIn = toDate(row.checkInAt);
		let checkOut = toDate(row.checkOutAt);
		let crossesMidnight = false;
		let absorbedDate: string | null = null;
		let anomaly: ShiftDay['anomaly'] = null;

		// A check-out with no check-in that wasn't claimed by the previous day's
		// shift is an orphan — a missed punch-in, not a night shift.
		if (!checkIn && checkOut) {
			out.push({
				date,
				checkInAt: null,
				checkOutAt: checkOut,
				workedMinutes: null,
				crossesMidnight: false,
				absorbedDate: null,
				isShort: false,
				anomaly: 'orphan-check-out'
			});
			continue;
		}

		// A check-out earlier than this row's own check-in belongs to the previous
		// day's shift, not this one — the device filed both punches under the date
		// each occurred on. Back-to-back night shifts always look like this.
		if (checkIn && checkOut && checkOut < checkIn) {
			checkOut = null;
		}

		if (checkIn && !checkOut) {
			// Look to the next day for the other half of an overnight shift. The
			// next day may also hold its own check-in (the following night shift);
			// what matters is that its check-out precedes that check-in, which marks
			// it as this shift's ending rather than that shift's.
			const following = byDate.get(nextDay(date));
			const followingIn = toDate(following?.checkInAt ?? null);
			const followingOut = toDate(following?.checkOutAt ?? null);
			const outBelongsToUs =
				followingOut !== null && (followingIn === null || followingOut < followingIn);

			if (followingOut && outBelongsToUs) {
				const gap = minutesBetween(checkIn, followingOut);
				if (gap > 0 && gap <= maxGapMinutes) {
					checkOut = followingOut;
					crossesMidnight = true;
					absorbedDate = nextDay(date);
					// Only consume the next day outright when it holds nothing else.
					// A day that also starts its own shift must still be reported.
					if (!followingIn) consumed.add(absorbedDate);
				} else {
					anomaly = 'gap-too-long';
				}
			} else {
				anomaly = 'missing-check-out';
			}
		}

		let workedMinutes: number | null = null;
		if (checkIn && checkOut) {
			const span = minutesBetween(checkIn, checkOut);
			if (span < 0) {
				// Both punches were filed against the same date but the out precedes
				// the in — a device/clock fault. Reporting 0h would read as a real
				// zero-hour day, so the time is withheld and the row flagged.
				anomaly = 'check-out-before-check-in';
			} else {
				workedMinutes = span;
			}
		}

		out.push({
			date,
			checkInAt: checkIn,
			checkOutAt: checkOut,
			workedMinutes,
			crossesMidnight,
			absorbedDate,
			isShort: workedMinutes !== null && workedMinutes < STANDARD_SHIFT_MINUTES,
			anomaly
		});
	}

	return out;
}

/**
 * Parses an office-timings string into a shift length in minutes.
 *
 * The HR tracker writes these freehand — "06:00 PM to 03:30 AM", "10.00-7.00",
 * "6PM-3 AM" — so the parser is deliberately tolerant. Returns null when the
 * value can't be read, which makes the caller fall back to the default gap.
 *
 * Note: several rows read "06:00 PM to 03:30 PM", which is 21.5 hours and
 * plainly a typo for AM. An end time that produces an implausibly long shift
 * is therefore re-read as the following morning.
 */
export function parseShiftMinutes(officeTimings: string | null | undefined): number | null {
	const raw = (officeTimings ?? '').trim();
	if (!raw) return null;

	// Two clock values separated by "to", "-", or an en dash.
	const parts = raw.split(/\s*(?:to|–|—|-)\s*/i).filter(Boolean);
	if (parts.length < 2) return null;

	const parseClock = (s: string): { minutes: number; hadMeridiem: boolean } | null => {
		const meridiem = /pm/i.test(s) ? 'pm' : /am/i.test(s) ? 'am' : null;
		const digits = s.replace(/[^0-9.:]/g, '');
		if (!digits) return null;
		const [h, m = '0'] = digits.split(/[.:]/);
		let hour = Number(h);
		const minute = Number(m);
		if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
		if (meridiem === 'pm' && hour < 12) hour += 12;
		if (meridiem === 'am' && hour === 12) hour = 0;
		return { minutes: hour * 60 + minute, hadMeridiem: meridiem !== null };
	};

	const start = parseClock(parts[0]);
	const end = parseClock(parts[1]);
	if (!start || !end) return null;

	let span = end.minutes - start.minutes;
	// End before start means the shift runs past midnight.
	if (span <= 0) span += 1440;
	// A "shift" over 16 hours is a mis-written meridiem, not a real one.
	if (span > 16 * 60) span -= 12 * 60;
	if (span <= 0 || span > 16 * 60) return null;
	return span;
}

/**
 * The pairing gap to allow for one employee: their own shift length plus three
 * hours of slack for late logouts, or the default when no timings are on file.
 */
export function gapForShift(officeTimings: string | null | undefined): number {
	const shift = parseShiftMinutes(officeTimings);
	return shift === null ? MAX_PAIR_GAP_MINUTES : Math.min(shift + 180, MAX_PAIR_GAP_MINUTES);
}
