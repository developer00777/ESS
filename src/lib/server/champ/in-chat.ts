import type { SessionUser } from '$lib/server/auth';
import { sendMessage } from '$lib/server/chat/messages';
import { publish } from '$lib/server/chat/bus';
import { channelMemberIds } from '$lib/server/chat/access';
import { askChamp } from './chat';

/**
 * "@Champ …" in a conversation. The answer is posted for everyone in it to
 * read, as agreed for Champ Chat, so Champ runs in channel mode: only the
 * tools that are safe to answer in public (holidays, policy, announcements,
 * the asker's own records). Anything wider it sends to Champ in the chat sidebar.
 */
export async function answerInChannel(asker: SessionUser, channelId: string, questionText: string, threadRootId: string | null) {
	const question = questionText.replace(/(^|\s)@champ\b[:,]?/gi, ' ').trim();
	const members = await channelMemberIds(channelId);
	await publish(members, { type: 'typing', channelId, userId: 'champ', name: 'Champ' });
	const result = await askChamp(asker, [], question || 'hello', 'channel');
	const who = asker.fullName.split(' ')[0];
	await sendMessage(asker, {
		channelId,
		threadRootId,
		body: `@${who} ${result.reply}`,
		kind: 'champ',
		mentions: [asker.id],
		asSystem: true
	});
}
