import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ExtractedHoliday {
	date: string; // YYYY-MM-DD
	name: string;
	type: 'PUBLIC' | 'RESTRICTED' | 'OPTIONAL';
}

export interface ExtractedHolidayTable {
	shift_group_key: string; // e.g. 'day_shift', 'night_shift', 'singapore'
	shift_group_label: string;
	holidays: ExtractedHoliday[];
}

export interface ExtractedHolidayCalendar {
	tables: ExtractedHolidayTable[];
}

export interface ExtractedLeaveType {
	code: string;
	name: string;
	accrual_per_month: number | null;
	eligibility: 'post_probation' | 'pre_probation' | 'all' | null;
	carry_forward_cap_days: number | null;
	requires_documentation: boolean;
	documentation_note: string | null;
	fixed_days: number | null;
	/**
	 * Entitlement that refreshes every month and does NOT accumulate — pink
	 * (menstrual) leave is the current case. Distinct from accrual_per_month,
	 * which builds a balance: an unused monthly quota lapses at month end.
	 */
	monthly_quota_days: number | null;
	/** 'female' | 'male' | null. Restricts who may apply at all. */
	gender_eligibility: 'female' | 'male' | null;
	notes: string | null;
}

export interface ExtractedLeavePolicy {
	leave_types: ExtractedLeaveType[];
	general_rules: string[];
}

const HOLIDAY_PROMPT = `Extract every holiday row from this holiday calendar image/document into strict JSON.
The document may contain multiple tables, one per shift group / office (e.g. Day Shift, Night Shift, Singapore, or named locations).
Infer a stable machine key for each table (snake_case, e.g. "day_shift", "night_shift", "singapore").
Classify each holiday's "type" as one of PUBLIC (mandatory paid holiday), RESTRICTED (floater/optional holiday employees opt into), or OPTIONAL (informational only). If the source doesn't distinguish, default to PUBLIC, except entries explicitly labeled "Seasonal Holiday" or "Restricted" which should be RESTRICTED.
Output JSON matching exactly this shape, nothing else, no markdown fences, no commentary:
{"tables":[{"shift_group_key":"...","shift_group_label":"...","holidays":[{"date":"YYYY-MM-DD","name":"...","type":"PUBLIC|RESTRICTED|OPTIONAL"}]}]}`;

const LEAVE_POLICY_PROMPT = `Extract the leave policy rules from this document into strict JSON matching exactly this shape, nothing else, no markdown fences, no commentary:
{"leave_types":[{"code":"EL|SL|PINK|MATERNITY|PATERNITY|BEREAVEMENT|...","name":"...","accrual_per_month":number_or_null,"monthly_quota_days":number_or_null,"gender_eligibility":"female|male|null","eligibility":"post_probation|pre_probation|all|null","carry_forward_cap_days":number_or_null,"requires_documentation":true_or_false,"documentation_note":string_or_null,"fixed_days":number_or_null,"notes":string_or_null}],"general_rules":["..."]}

Use a short stable "code" per leave type (uppercase, no spaces).

Three mutually exclusive ways a leave type is granted — set exactly one and leave the others null:
- "accrual_per_month": builds a balance that carries over (e.g. Earned Leave 1.5/month).
- "monthly_quota_days": refreshes each calendar month and does NOT accumulate. Use this when the document says the leave must be used within the month it is credited, cannot be carried forward, or lapses at month end. Pink Leave (also written menstrual leave) is this kind — code it "PINK".
- "fixed_days": event-based, granted per occurrence (maternity/paternity/bereavement).

Set "gender_eligibility" only when the document restricts the leave to one gender; Pink/menstrual leave is "female". Otherwise null.
Set "carry_forward_cap_days" to 0 when the document says the leave cannot be carried forward.
Put non-machine-readable rules ("cannot be encashed", "lapses at month end") in "notes" so they are shown to employees verbatim.`;

interface OpenRouterMessage {
	role: 'user';
	content: Array<
		| { type: 'text'; text: string }
		| { type: 'image_url'; image_url: { url: string } }
		| { type: 'file'; file: { filename: string; file_data: string } }
	>;
}

async function callOpenRouter(messages: OpenRouterMessage[]): Promise<string> {
	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash';
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

	const res = await fetch(OPENROUTER_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ model, messages, temperature: 0 })
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
	}

	const data = await res.json();
	const content: string | undefined = data?.choices?.[0]?.message?.content;
	if (!content) throw new Error('OpenRouter returned no content');
	return content;
}

function parseJsonResponse<T>(raw: string): T {
	const cleaned = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```\s*$/i, '');
	return JSON.parse(cleaned) as T;
}

/** filename decides whether we send an image_url (jpeg/png) or a file (pdf) content part. */
function isImageFile(mimeType: string): boolean {
	return mimeType.startsWith('image/');
}

export async function extractHolidayCalendar(
	fileBase64: string,
	mimeType: string,
	filename: string
): Promise<ExtractedHolidayCalendar> {
	const contentPart = isImageFile(mimeType)
		? ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } } as const)
		: ({ type: 'file', file: { filename, file_data: `data:${mimeType};base64,${fileBase64}` } } as const);

	const raw = await callOpenRouter([
		{ role: 'user', content: [{ type: 'text', text: HOLIDAY_PROMPT }, contentPart] }
	]);
	return parseJsonResponse<ExtractedHolidayCalendar>(raw);
}

export async function extractLeavePolicy(
	fileBase64: string,
	mimeType: string,
	filename: string
): Promise<ExtractedLeavePolicy> {
	const contentPart = isImageFile(mimeType)
		? ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } } as const)
		: ({ type: 'file', file: { filename, file_data: `data:${mimeType};base64,${fileBase64}` } } as const);

	const raw = await callOpenRouter([
		{ role: 'user', content: [{ type: 'text', text: LEAVE_POLICY_PROMPT }, contentPart] }
	]);
	return parseJsonResponse<ExtractedLeavePolicy>(raw);
}
