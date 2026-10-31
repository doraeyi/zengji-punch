// 曾記麻辣燙打卡：Service Worker（只負責推播通知）

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { title: '曾記麻辣燙', body: event.data ? event.data.text() : '' };
	}
	const title = data.title || '曾記麻辣燙';
	// 開著的頁面馬上更新資料（有人打卡、改班表、請假）
	const refreshPages = self.clients
		.matchAll({ type: 'window' })
		.then((list) => list.forEach((client) => client.postMessage({ type: 'refresh' })));
	event.waitUntil(
		Promise.all([refreshPages, self.registration.showNotification(title, {
			body: data.body || '',
			icon: '/icon-192.png',
			badge: '/badge-96.png',
			tag: data.tag,
			renotify: Boolean(data.tag),
			data: { url: data.url || '/' }
		})])
	);
});

// 點通知：已經開著就切過去，沒開就開新視窗
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if (client.url.startsWith(self.location.origin) && 'focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			return self.clients.openWindow(url);
		})
	);
});
