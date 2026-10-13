import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/rbac';
import { loadShiftsFor, officeToday } from '$lib/server/shifts';
import { openShift, CHECKOUT_GRACE_MINUTES, CHECKOUT_REMINDER_MINUTES } from '$lib/shift-hours';

/**
 * The caller's shift that has a check-in and no check-out yet, for the
 * check-out reminder (at 9 hours) and the missed-punch prompt (at 9h 30m).
 * Polled by ShiftReminder, so a check-out that syncs closes the prompt.
 */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const now = new Date();
	const today = officeToday(now);
	const yesterday = new Date(`${today}T00:00:00Z`);
	yesterday.setUTCDate(yesterday.getUTCDate() - 1);

	const shifts = await loadShiftsFor(user.id, yesterday.toISOString().slice(0, 10), today, now);
	const open = openShift(shifts, now);
	return json({
		now: now.toISOString(),
		reminderMinutes: CHECKOUT_REMINDER_MINUTES,
		graceMinutes: CHECKOUT_GRACE_MINUTES,
		shift: open?.checkInAt ? { date: open.date, checkInAt: open.checkInAt.toISOString() } : null
	});
};
