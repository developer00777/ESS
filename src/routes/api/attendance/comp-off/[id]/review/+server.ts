import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/postgres';
import { compOffCredits, users } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/rbac';
import { eq } from 'drizzle-orm';
import { logActivity } from '$lib/server/db/mongo';
import { evaluateCompOffEligibility } from '$lib/server/comp-off';
import { canReviewStage } from '$lib/server/approval-chain';

/**
 * SOP §1: verify attendance, confirm 7+ hours, then credit the comp-off.
 *
 * Comp-off is a ONE-step approval — the claimant's reporting manager decides and
 * that credits it. The only question is whether the person really worked the
 * day, which the manager is the one placed to answer; there is no HR stage to
 * add. Leave and attendance corrections keep the two-step manager → HR chain.
 *
 * Eligibility is re-checked at decision time rather than trusting the snapshot
 * taken when the employee claimed. A ProHance re-sync between claim and decision
 * can change the worked hours, and crediting a comp-off the record no longer
 * supports is exactly what the verification step is meant to prevent.
 */
export const POST: RequestHandler = async (event) => {
	// Authorisation is by assignment — canReviewStage below is the real gate. A
	// named reporting manager may hold no admin role, and a role check here
	// refused them before that logic ever ran.
	const approver = requireUser(event);
	const creditId = event.params.id!;
	const { decision, note } = await event.request.json();

	if (decision !== 'approve' && decision !== 'reject') {
		throw error(400, "decision must be 'approve' or 'reject'");
	}

	const [credit] = await db
		.select()
		.from(compOffCredits)
		.where(eq(compOffCredits.id, creditId))
		.limit(1);
	if (!credit) throw error(404, 'Comp-off claim not found');
	if (credit.status !== 'pending') throw error(400, 'This claim has already been decided');

	const [claimant] = await db.select().from(users).where(eq(users.id, credit.userId)).limit(1);
	if (!claimant) throw error(404, 'Claiming employee not found');

	// Routed by the reporting line, not by role: the claimant's own manager
	// decides. HR remains the fallback when no manager is resolvable, so a claim
	// is never stranded — which is what previously left a Super Admin's own
	// claim pending with nobody able to see it.
	if (!(await canReviewStage(approver, claimant.id, 'manager'))) {
		throw error(
			403,
			claimant.id === approver.id
				? 'You cannot approve your own comp-off claim'
				: "Only this employee's reporting manager can decide their comp-off"
		);
	}

	// Re-verify against the current record before crediting.
	let recheck: Awaited<ReturnType<typeof evaluateCompOffEligibility>> | null = null;
	if (decision === 'approve') {
		recheck = await evaluateCompOffEligibility(credit.userId, credit.workedDate);
		// The claim itself is the one live row for this date, so "already claimed"
		// is expected here and is not a reason to refuse.
		const blocking = recheck.reasons.filter((r) => !r.includes('already been claimed'));
		if (blocking.length > 0) {
			throw error(422, `Cannot credit this comp-off — ${blocking[0]}`);
		}
	}

	const newStatus = decision === 'approve' ? 'approved' : 'rejected';

	const [updated] = await db
		.update(compOffCredits)
		.set({
			status: newStatus,
			approverId: approver.id,
			decidedAt: new Date(),
			decisionNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
			// Keep the verified hours, so the credited balance reflects what HR confirmed.
			...(recheck?.workedMinutes != null ? { workedMinutes: recheck.workedMinutes } : {})
		})
		.where(eq(compOffCredits.id, creditId))
		.returning();

	await logActivity({
		actorUserId: approver.id,
		action: `comp_off.${newStatus}`,
		targetType: 'comp_off_credit',
		targetId: creditId,
		details: {
			workedDate: credit.workedDate,
			employeeId: credit.userId,
			workedMinutes: updated.workedMinutes,
			expiresOn: updated.expiresOn
		}
	});

	return json({ credit: updated });
};
