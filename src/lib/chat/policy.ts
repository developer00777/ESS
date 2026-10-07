/**
 * Champ Chat's rules, set by HR in Admin Controls › Chat rules.
 *
 *   dm       who an Employee may start a direct message with, when they do
 *            not hold "Message anyone". Each switch adds a group of people.
 *   groups   who may start a group chat: anyone, or only people holding
 *            "Start group chats" (Team Leads, HR and Super Admins by
 *            default, plus any named role given it).
 *
 * The defaults are the rule Champ Chat launched with.
 */

export type ChatPolicy = {
	dm: {
		team: boolean;
		managerAndReports: boolean;
		concernedHr: boolean;
		allHr: boolean;
		everyone: boolean;
	};
	groups: 'everyone' | 'privileged';
};

export const DEFAULT_CHAT_POLICY: ChatPolicy = {
	dm: { team: true, managerAndReports: true, concernedHr: true, allHr: true, everyone: false },
	groups: 'everyone'
};

/** Fills gaps from the defaults, so an older saved policy still reads right. */
export function normalisePolicy(raw: unknown): ChatPolicy {
	const r = (raw ?? {}) as Partial<ChatPolicy>;
	const dm = { ...DEFAULT_CHAT_POLICY.dm, ...(r.dm ?? {}) };
	for (const k of Object.keys(dm) as (keyof ChatPolicy['dm'])[]) dm[k] = !!dm[k];
	return { dm, groups: r.groups === 'privileged' ? 'privileged' : 'everyone' };
}

/** "their team, their manager and direct reports and HR", for the settings page and errors. */
export function describeDmRule(p: ChatPolicy): string {
	if (p.dm.everyone) return 'anyone in the company';
	const parts = [
		p.dm.team && 'their team',
		p.dm.managerAndReports && 'their manager and direct reports',
		p.dm.concernedHr && !p.dm.allHr && 'their concerned HR',
		p.dm.allHr && 'HR'
	].filter(Boolean) as string[];
	if (parts.length === 0) return 'nobody, unless they hold "Message anyone"';
	return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
