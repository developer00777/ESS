/*
 * Champ Chat service worker: web push only. It shows the alert when the
 * portal is closed and opens the conversation when the alert is clicked.
 * It deliberately caches nothing, so it can never serve a stale portal.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { title: 'Champ Chat', body: event.data ? event.data.text() : '' };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || 'Champ Chat', {
			body: data.body || '',
			tag: data.tag || 'chat',
			data: { url: data.url || '/chat' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/chat';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if ('focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			return self.clients.openWindow(url);
		})
	);
});
