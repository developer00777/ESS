import { env } from '$env/dynamic/private';
import { matchName, type NameCandidate } from '$lib/server/name-match';
import { dueFromMeeting, readNextStep, TASK_PRIORITIES, type TaskPriority } from '$lib/tasks/rules';
import type { MeetingSummary } from '$lib/tasks/types';

/**
 * Turning a meeting summary into action items.
 *
 * Same stance as deviation triage (src/lib/server/ai/triage-deviation.ts):
 * the model is advisory. It proposes items with an owner, a due phrase and a
 * confidence; nothing reaches anyone's board until the host publishes. Its
 * raw output and model name are stored with the meeting so a review can be
 * audited against exactly what it said.
 *
 * Owners are never trusted as returned: the name goes through the same
 * matcher the HR imports use, first against the meeting's attendees and then
 * the host's team, and an ambiguous or unknown name is left as "Needs owner"
 * with the name the minutes used. With no API key, or a failed call, each
 * next step is read plainly instead (src/lib/tasks/rules.ts readNextStep).
 */

export type Attendee = { userId: string | null; name: string; email: string | null };

export type DraftItem = {
	title: string;
	ownerId: string | null;
	ownerHeard: string | null;
	dueDate: string | null;
	priority: TaskPriority;
	stepIndex: number | null;
	confidence: number;
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const PROMPT = `You turn a meeting summary into action items for an HR portal's task board.

Return ONLY JSON: {"items":[{"step_index":0,"title":"...","owner_name":"...","due_text":"...","priority":"high|medium|low","confidence":0.0}]}

Rules:
- One item per concrete action in NEXT_STEPS. step_index is the index of the next step it came from.
- A next step that names two people doing separate things becomes two items with the same step_index.
- title: an imperative phrase without the owner's name, under 90 characters ("Dedupe the Q3 healthcare list").
- owner_name: the person exactly as the summary names them, or null when nobody is named ("Someone needs to…").
- due_text: the due phrase as written ("Thursday", "14 Oct", "tomorrow"), or null. Never invent a date.
- priority: high only when the summary marks it urgent, blocking or due within two days; low for nice-to-haves; else medium.
- confidence: how sure you are about the owner and the action, 0 to 1. Lower it when the owner is unclear.
- Skip statements that are not actions (decisions, observations).`;

const clean = (name: string) => name.replace(/\([^)]*\)/g, '').replace(/['’]s\b.*$/, '').trim();

/** The login a name in the minutes refers to, or null when unsure. */
export function resolveOwner(heard: string | null, attendees: NameCandidate[], team: NameCandidate[]): string | null {
	if (!heard) return null;
	const name = clean(heard);
	if (!name) return null;
	for (const pool of [attendees, team]) {
		if (pool.length === 0) continue;
		const r = matchName(name, pool);
		if (r.status === 'matched') return r.key;
		if (r.status === 'ambiguous') return null;
	}
	return null;
}

function plainRead(summary: MeetingSummary): { stepIndex: number; title: string; ownerHeard: string | null; dueText: string | null; priority: TaskPriority; confidence: number | null }[] {
	return summary.nextSteps.map((step, i) => {
		const r = readNextStep(step);
		return { stepIndex: i, title: r.title, ownerHeard: r.ownerHeard, dueText: r.dueText, priority: 'medium' as TaskPriority, confidence: null };
	});
}

async function modelRead(summary: MeetingSummary, attendees: Attendee[], teamNames: string[], meetingDay: string) {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) return null;
	const model = env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash';
	const payload = {
		MEETING_DAY: meetingDay,
		ATTENDEES: attendees.map((a) => a.name),
		HOST_TEAM: teamNames,
		OVERVIEW: summary.overview,
		DETAILS: summary.details,
		NEXT_STEPS: summary.nextSteps.map((s, i) => ({ index: i, text: s }))
	};
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: `${PROMPT}\n\nMEETING:\n${JSON.stringify(payload, null, 2)}` }] })
		});
		if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
		const data = await res.json();
		const raw: string = data?.choices?.[0]?.message?.content ?? '';
		const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')) as { items?: unknown[] };
		if (!Array.isArray(parsed.items)) throw new Error('No items array');
		const items = parsed.items
			.map((x) => x as Record<string, unknown>)
			.filter((x) => typeof x.title === 'string' && x.title.trim())
			.map((x) => {
				const step = Number(x.step_index);
				return {
					stepIndex: Number.isInteger(step) && step >= 0 && step < summary.nextSteps.length ? step : null,
					title: String(x.title).trim().slice(0, 300),
					ownerHeard: typeof x.owner_name === 'string' && x.owner_name.trim() ? x.owner_name.trim() : null,
					dueText: typeof x.due_text === 'string' && x.due_text.trim() ? x.due_text.trim() : null,
					priority: ((TASK_PRIORITIES as readonly string[]).includes(String(x.priority)) ? x.priority : 'medium') as TaskPriority,
					confidence: typeof x.confidence === 'number' && x.confidence >= 0 && x.confidence <= 1 ? x.confidence : null
				};
			});
		return { items, raw, model };
	} catch (err) {
		console.error('[meetings] extraction unavailable, reading next steps plainly:', err instanceof Error ? err.message : err);
		return null;
	}
}

export async function extractItems(input: {
	summary: MeetingSummary;
	meetingDay: string;
	attendees: Attendee[];
	team: { id: string; fullName: string }[];
}): Promise<{ items: DraftItem[]; extraction: Record<string, unknown> }> {
	const attendeePool: NameCandidate[] = input.attendees.filter((a) => a.userId).map((a) => ({ key: a.userId!, fullName: a.name }));
	const teamPool: NameCandidate[] = input.team.map((p) => ({ key: p.id, fullName: p.fullName }));
	const fromModel = await modelRead(input.summary, input.attendees, input.team.map((t) => t.fullName), input.meetingDay);
	const read = fromModel?.items ?? plainRead(input.summary);
	const items = read.map((r) => {
		const ownerId = resolveOwner(r.ownerHeard, attendeePool, teamPool);
		// Without the model, confidence says only whether an owner was found.
		const base = r.confidence ?? (ownerId ? 0.75 : r.ownerHeard ? 0.45 : 0.4);
		return {
			title: r.title,
			ownerId,
			ownerHeard: r.ownerHeard,
			dueDate: dueFromMeeting(r.dueText, input.meetingDay),
			priority: r.priority,
			stepIndex: r.stepIndex,
			// A named owner nobody could match is never high confidence.
			confidence: Math.round((r.ownerHeard && !ownerId ? Math.min(base, 0.5) : base) * 1000) / 1000
		};
	});
	return {
		items,
		extraction: fromModel ? { model: fromModel.model, raw: fromModel.raw, at: new Date().toISOString() } : { model: null, plain: true, at: new Date().toISOString() }
	};
}
