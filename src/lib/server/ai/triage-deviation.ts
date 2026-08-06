import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * LLM triage for attendance deviation requests (SOP §2–§4).
 *
 * The model is ADVISORY ONLY. It never approves, rejects, or writes attendance —
 * HR decides. What it does is the tedious part of the SOP: read the employee's
 * free-text account, classify it against the fixed reason list, and say whether
 * the corroborating ProHance/biometric data actually supports the claim.
 *
 * Its output is stored on the request (ai* columns) so a decision made weeks
 * later can be audited against exactly what the model saw and said, rather than
 * re-running a non-deterministic call and getting a different answer.
 */

export const DEVIATION_REASONS = [
	'login_not_captured',
	'logout_not_captured',
	'missing_biometric_punch',
	'biometric_system_mismatch',
	'prohance_mismatch',
	'system_server_issue',
	'machine_malfunction',
	'technical_error',
	'wrong_half_day',
	'wrong_absent',
	'incorrect_working_hours'
] as const;

export type DeviationReason = (typeof DEVIATION_REASONS)[number];

export const DEVIATION_REASON_LABELS: Record<DeviationReason, string> = {
	login_not_captured: 'Login not captured',
	logout_not_captured: 'Logout not captured',
	missing_biometric_punch: 'Missing biometric punch',
	biometric_system_mismatch: 'Biometric and system login mismatch',
	prohance_mismatch: 'ProHance activity mismatch',
	system_server_issue: 'System / server issue',
	machine_malfunction: 'Machine malfunction',
	technical_error: 'Technical error affecting attendance',
	wrong_half_day: 'Incorrectly marked Half Day',
	wrong_absent: 'Incorrectly marked Absent',
	incorrect_working_hours: 'Incorrect working hours'
};

/**
 * Corroborating data we hand the model. Never includes anything the employee typed.
 * All times are local wall-clock 'HH:MM' on `date`, matching the employee's claimed
 * times and the shift window, so the model never has to reconcile two clocks.
 */
export interface DeviationEvidence {
	date: string;
	dayOfWeek: string;
	portalCheckIn: string | null;
	portalCheckOut: string | null;
	attendanceSource: string | null;
	prohanceFirstLogin: string | null;
	prohanceLastLogout: string | null;
	prohanceLoggedMinutes: number | null;
	prohanceActiveMinutes: number | null;
	prohanceDayType: string | null;
	isHoliday: boolean;
	holidayName: string | null;
	shiftWindow: string | null;
	priorRequestsThisMonth: number;
}

export interface DeviationTriage {
	summary: string;
	suggested_reason: DeviationReason;
	confidence: number;
	evidence_note: string;
	flags: string[];
}

const TRIAGE_PROMPT = `You triage employee attendance-correction requests for an HR team, following this SOP:

- A deviation is when attendance is not captured correctly: missing biometric punch, missing login/logout, mismatch between systems, or a system/technical issue.
- Employees may raise at most 3 biometric-related requests per month; beyond that both HR and the Reporting Manager must approve.
- Requests may also be raised when the portal wrongly marks Half Day, Absent, or incorrect working hours.

You are ADVISORY. You do NOT approve or reject. You classify and you report what the evidence shows.

Return strict JSON, nothing else, no markdown fences, no commentary:
{"summary":"one sentence, factual, max 25 words","suggested_reason":"<one of the allowed reasons>","confidence":0.0-1.0,"evidence_note":"one or two sentences on whether the system data corroborates the employee's account","flags":["..."]}

Allowed suggested_reason values (use exactly one):
login_not_captured, logout_not_captured, missing_biometric_punch, biometric_system_mismatch, prohance_mismatch, system_server_issue, machine_malfunction, technical_error, wrong_half_day, wrong_absent, incorrect_working_hours

Rules:
- Base "confidence" on how well the evidence supports the claim, not on how confident the employee sounds.
- If ProHance shows substantial activity but the portal has no punch, that CORROBORATES a missing-punch claim — say so.
- If there is no corroborating activity at all, say so plainly and use a low confidence. Do not invent supporting detail.
- Never state that the request should be approved or rejected.

Optional flags (include only when true): no_prohance_activity, prohance_supports_claim, outside_shift_window, holiday_or_weekend, exceeds_monthly_cap, short_hours, no_portal_record, conflicting_records.`;

async function callOpenRouter(prompt: string, payload: unknown): Promise<{ raw: string; model: string }> {
	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash';
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			temperature: 0,
			messages: [{ role: 'user', content: `${prompt}\n\nREQUEST:\n${JSON.stringify(payload, null, 2)}` }]
		})
	});

	if (!res.ok) {
		throw new Error(`OpenRouter request failed (${res.status}): ${await res.text()}`);
	}
	const data = await res.json();
	const content: string | undefined = data?.choices?.[0]?.message?.content;
	if (!content) throw new Error('OpenRouter returned no content');
	return { raw: content, model };
}

function parseJson<T>(raw: string): T {
	return JSON.parse(
		raw
			.trim()
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/```\s*$/i, '')
	) as T;
}

/**
 * Triage one request. Returns null when triage is unavailable (no API key,
 * provider error, malformed output) — submission must never depend on the LLM
 * being reachable, so callers save the request regardless and HR reviews it
 * unaided.
 */
export async function triageDeviation(input: {
	employeeStatement: string;
	employeeSelectedReason: DeviationReason;
	claimedCheckIn: string | null;
	claimedCheckOut: string | null;
	evidence: DeviationEvidence;
}): Promise<(DeviationTriage & { model: string }) | null> {
	try {
		const { raw, model } = await callOpenRouter(TRIAGE_PROMPT, input);
		const parsed = parseJson<DeviationTriage>(raw);

		// Defend against a model that invents a reason outside the enum — the
		// value lands in a Postgres enum column, so an invalid one would throw
		// on insert and lose the employee's request.
		const reason = (DEVIATION_REASONS as readonly string[]).includes(parsed.suggested_reason)
			? parsed.suggested_reason
			: input.employeeSelectedReason;

		const confidence =
			typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
				? parsed.confidence
				: 0;

		return {
			summary: String(parsed.summary ?? '').slice(0, 400),
			suggested_reason: reason as DeviationReason,
			confidence,
			evidence_note: String(parsed.evidence_note ?? '').slice(0, 800),
			flags: Array.isArray(parsed.flags) ? parsed.flags.map(String).slice(0, 8) : [],
			model
		};
	} catch (err) {
		console.error('[triage-deviation] triage unavailable:', err);
		return null;
	}
}
