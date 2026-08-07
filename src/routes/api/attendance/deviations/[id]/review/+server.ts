import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { attendance, attendanceDeviations, users } from '$lib/server/db/schema';
import { requireRole } from '$lib/server/rbac';
import { and, eq } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';
import { canReviewStage } from '$lib/server/approval-chain';

/**
 * SOP §2–§4: HR (or the Reporting Manager) decides an attendance correction.
 *
 * Approving is what actually fixes the record — the SOP says "attendance will be
 * corrected upon approval", so when the employee supplied the times they claim
 * are correct, those are written to the attendance row here. Without that the
 * approval would be a note on a request and the underlying attendance would stay
 * wrong, which is the whole problem the SOP exists to solve.
 */
export const POST: RequestHandler = async (event) => {
	const reviewer = requireRole(event, ['team_lead', 'admin', 'super_admin']);
	const deviationId = event.params.id!;
	const { decision, note } = await event.request.json();

	if (decision !== 'approve' && decision !== 'reject') {
		throw error(400, "decision must be 'approve' or 'reject'");
	}

	const [deviation] = await db
		.select()
		.from(attendanceDeviations)
		.where(eq(attendanceDeviations.id, deviationId))
		.limit(1);
	if (!deviation) throw error(404, 'Deviation request not found');

	if (
		deviation.status !== 'pending' &&
		deviation.status !== 'needs_manager_approval' &&
		deviation.status !== 'manager_approved'
	) {
		throw error(400, 'This request has already been decided');
	}

	// Attendance corrections run manager → HR → approved. Which stage this call
	// is deciding depends on where the request currently sits.
	const stage = deviation.status === 'manager_approved' ? 'hr' : 'manager';

	const [requester] = await db.select().from(users).where(eq(users.id, deviation.userId)).limit(1);
	if (!requester) throw error(404, 'Requesting employee not found');

	// Routed by the reporting line. Nobody decides their own correction — the
	// request is a claim about your own attendance, so approving it yourself
	// would defeat the review entirely.
	if (!(await canReviewStage(reviewer, requester.id, stage))) {
		throw error(
			403,
			requester.id === reviewer.id
				? 'You cannot decide your own attendance correction request'
				: stage === 'hr'
					? 'This request has manager sign-off and is now waiting on HR'
					: "Only this employee's reporting manager can give the first sign-off"
		);
	}

	// A rejection at either stage ends it. An approval at the manager stage hands
	// over to HR rather than crediting straight away; only HR's approval is final.
	const newStatus =
		decision === 'reject' ? 'rejected' : stage === 'hr' ? 'approved' : 'manager_approved';

	await db
		.update(attendanceDeviations)
		.set({
			status: newStatus,
			reviewerId: reviewer.id,
			reviewedAt: new Date(),
			reviewNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null
		})
		.where(eq(attendanceDeviations.id, deviationId));

	// --- Apply the correction (SOP §3: "attendance will be corrected upon approval") ---
	let attendanceCorrected = false;
	if (newStatus === 'approved' && (deviation.claimedCheckIn || deviation.claimedCheckOut)) {
		const [existing] = await db
			.select()
			.from(attendance)
			.where(and(eq(attendance.userId, deviation.userId), eq(attendance.date, deviation.date)))
			.limit(1);

		// The employee gives wall-clock 'HH:MM' for the day in question; combine the
		// two into a timestamp the same way a manual punch would be stored.
		const stamp = (hhmm: string | null) =>
			hhmm ? new Date(`${deviation.date}T${hhmm}:00`) : null;

		const checkInAt = stamp(deviation.claimedCheckIn) ?? existing?.checkInAt ?? null;
		const checkOutAt = stamp(deviation.claimedCheckOut) ?? existing?.checkOutAt ?? null;

		if (existing) {
			await db
				.update(attendance)
				.set({ checkInAt, checkOutAt })
				.where(eq(attendance.id, existing.id));
		} else {
			await db.insert(attendance).values({
				userId: deviation.userId,
				date: deviation.date,
				checkInAt,
				checkOutAt,
				source: 'manual'
			});
		}
		attendanceCorrected = true;
	}

	await logActivity({
		actorUserId: reviewer.id,
		action: `attendance.deviation_${newStatus}`,
		targetType: 'attendance_deviation',
		targetId: deviationId,
		details: {
			date: deviation.date,
			reason: deviation.reason,
			employeeId: deviation.userId,
			attendanceCorrected,
			// Recorded so an audit can see whether HR agreed with the model, not just
			// what the model said.
			aiSuggestedReason: deviation.aiSuggestedReason,
			aiConfidence: deviation.aiConfidence
		}
	});

	return json({ status: newStatus, attendanceCorrected });
};
