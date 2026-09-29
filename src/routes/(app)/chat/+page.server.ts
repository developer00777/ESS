import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { hasCap } from '$lib/server/capabilities';
import { sidebarFor } from '$lib/server/chat/channels';
import { channelCreationScope } from '$lib/server/chat/access';
import { loadFeed } from '$lib/server/announcements';
import { announcementActions, loadAnnouncementAdmin } from '$lib/server/announcement-admin';
import { champConfigured } from '$lib/server/champ/chat';

/**
 * Champ Chat. The page renders the first sidebar on the server; after that
 * the live stream (/api/chat/stream) and /api/chat/* keep it current.
 *
 * #announcements is part of chat: everyone reads the announcement feed here,
 * and people who may post announcements get the composer and read counts.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// Page loads run alongside the (app) layout's, so this cannot rely on the
	// layout's redirect having happened first.
	const user = locals.user;
	if (!user) throw redirect(303, '/login');
	const canPost = hasCap(user, 'announcements.post');
	const [sidebar, feed, admin] = await Promise.all([
		sidebarFor(user),
		loadFeed(user.id),
		canPost ? loadAnnouncementAdmin() : Promise.resolve(null)
	]);
	return {
		me: { id: user.id, fullName: user.fullName, role: user.role, teamId: user.teamId },
		can: {
			postAnnouncements: canPost,
			createChannels: channelCreationScope(user),
			hrDesk: hasCap(user, 'chat.hr_desk'),
			moderate: hasCap(user, 'chat.moderate'),
			export: hasCap(user, 'chat.export'),
			mentionAll: hasCap(user, 'chat.mention_all'),
			champ: champConfigured()
		},
		sidebar,
		feed,
		announcementAdmin: admin,
		now: new Date().toISOString()
	};
};

export const actions: Actions = announcementActions as unknown as Actions;
