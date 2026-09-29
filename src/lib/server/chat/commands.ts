import { db } from '$lib/server/db/postgres';
import { chatChannels, chatReminders, employeeProfiles, holidayCalendars, holidays, leaveAllocations, leaveTypes, users } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '$lib/server/auth';
import { ensureLeaveAllocations } from '$lib/server/leave-accrual';
import { parseDay, parseReminder, parseSlash, SLASH_COMMANDS } from '$lib/chat/rules';
import { addTodo, sendMessage, type SendResult } from './messages';
import { membership } from './access';
import { workStatuses } from './presence';

/**
 * Slash commands. The ESS lookups (/balance, /whoisout, /leave) answer with a
 * message only you can see; /poll posts to the conversation; /remind and
 * /todo confirm privately; /champ asks Champ in the open.
 */

const fmt = (d: string) =>
	new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function privateReply(viewer: SessionUser, channelId: string, body: string, card: Parameters<typeof sendMessage>[1]['card'] = null) {
	return sendMessage(viewer, { channelId, body, card, kind: card ? 'card' : 'system', visibleTo: viewer.id, asSystem: true });
}

export async function runCommand(viewer: SessionUser, channelId: string, text: string, threadRootId: string | null): Promise<SendResult | null> {
	const cmd = parseSlash(text);
	if (!cmd) return null;
	if (!(await membership(channelId, viewer.id))) return { ok: false, message: 'You are not in this conversation' };
	const now = new Date();

	switch (cmd.cmd) {
		case 'balance': {
			await ensureLeaveAllocations([viewer.id]);
			const rows = await db
				.select({ name: leaveTypes.name, code: leaveTypes.code, allocated: leaveAllocations.allocatedDays, used: leaveAllocations.usedDays })
				.from(leaveAllocations)
				.innerJoin(leaveTypes, eq(leaveTypes.id, leaveAllocations.leaveTypeId))
				.where(and(eq(leaveAllocations.userId, viewer.id), eq(leaveAllocations.year, now.getFullYear()), eq(leaveTypes.isActive, true)));
			if (rows.length === 0) return privateReply(viewer, channelId, 'You have no leave balances for this year yet. HR publishes them from the leave policy.');
			const lines = rows.map((r) => `${r.name}${r.code ? ` (${r.code})` : ''}: ${Number(r.allocated) - Number(r.used)} left of ${Number(r.allocated)}`);
			return privateReply(viewer, channelId, `Your leave for ${now.getFullYear()}:\n${lines.join('\n')}`);
		}

		case 'whoisout': {
			if (!viewer.teamId) return privateReply(viewer, channelId, 'You are not on a team yet, so there is nobody to list.');
			const team = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(and(eq(users.teamId, viewer.teamId), eq(users.isActive, true)));
			const work = await workStatuses(now);
			const out = team
				.filter((p) => p.id !== viewer.id)
				.map((p) => ({ p, s: work.get(p.id) }))
				.filter(({ s }) => s && ['leave', 'holiday', 'weekoff'].includes(s.state));
			return privateReply(
				viewer,
				channelId,
				out.length ? `Off in your team today:\n${out.map(({ p, s }) => `${p.fullName}: ${s!.label}`).join('\n')}` : 'Everyone in your team is working today.'
			);
		}

		case 'leave': {
			const start = parseDay(cmd.arg || 'tomorrow', now);
			if (!start) return privateReply(viewer, channelId, 'Tell me the day, for example /leave Fri or /leave 12 Oct.');
			const [profile] = await db.select({ shiftGroupId: employeeProfiles.shiftGroupId }).from(employeeProfiles).where(eq(employeeProfiles.userId, viewer.id)).limit(1);
			const [hol] = profile?.shiftGroupId
				? await db
						.select({ name: holidays.name })
						.from(holidays)
						.innerJoin(holidayCalendars, eq(holidayCalendars.id, holidays.calendarId))
						.where(and(eq(holidays.date, start), eq(holidayCalendars.shiftGroupId, profile.shiftGroupId), eq(holidayCalendars.status, 'published')))
						.limit(1)
				: [];
			const note = hol ? `${fmt(start)} is ${hol.name}, a holiday for your shift, so it would not use a leave day.` : `Leave on ${fmt(start)}. Check the details and press Submit on the form.`;
			return privateReply(viewer, channelId, note, {
				type: 'notice',
				tone: hol ? 'warn' : 'info',
				title: hol ? `${fmt(start)} is a holiday` : `Apply for leave on ${fmt(start)}`,
				text: 'Opens the leave form with the date filled in. Nothing is sent until you submit it.',
				href: `/leave/apply?start=${start}`
			});
		}

		case 'remind': {
			const r = parseReminder(cmd.arg, now);
			if (!r) return privateReply(viewer, channelId, 'Try /remind in 30m check the queue, or /remind tomorrow 9am standup.');
			await db.insert(chatReminders).values({ userId: viewer.id, channelId, text: r.text || 'Reminder', remindAt: r.at });
			const when = r.at.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
			return privateReply(viewer, channelId, `Okay, I will remind you on ${when}${r.text ? `: ${r.text}` : ''}.`);
		}

		case 'poll': {
			if (!cmd.question || cmd.options.length < 2) {
				return privateReply(viewer, channelId, 'Write it like /poll Lunch on Friday? | Yes | No, with at least two options.');
			}
			return sendMessage(viewer, {
				channelId,
				threadRootId,
				body: cmd.question,
				kind: 'poll',
				card: { type: 'poll', question: cmd.question.slice(0, 200), options: cmd.options.map((o) => o.slice(0, 80)) }
			});
		}

		case 'todo': {
			const [c] = await db.select({ kind: chatChannels.kind }).from(chatChannels).where(eq(chatChannels.id, channelId)).limit(1);
			if (c?.kind === 'system') return privateReply(viewer, channelId, 'To-dos belong to a channel or conversation.');
			const done = await addTodo(viewer, channelId, cmd.text);
			if (!done.ok) return privateReply(viewer, channelId, done.message);
			return privateReply(viewer, channelId, `Added to this conversation's to-dos: ${cmd.text}`);
		}

		case 'champ': {
			if (!cmd.question) return privateReply(viewer, channelId, 'Ask a question after /champ, for example /champ next holiday.');
			return sendMessage(viewer, { channelId, threadRootId, body: `@Champ ${cmd.question}`, mentions: [] });
		}

		default:
			return privateReply(viewer, channelId, `There is no /${cmd.name}. You can use ${SLASH_COMMANDS.map((c) => c.c).join(', ')}.`);
	}
}
