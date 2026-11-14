/* 말랑블로그 알림. scripts/collect.js 가 보낸 새 글 알림을 띄우고, 누르면 앱을 열어요. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((L) => L.forEach((c) => c.postMessage('mb:push')));
  e.waitUntil(self.registration.showNotification(d.title || '말랑블로그', { body: d.body || '', icon: 'assets/appicon/mark-192.png', badge: 'assets/appicon/mark-192.png', tag: d.tag || 'mb', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of L) if ('focus' in c) return c.focus();
    return self.clients.openWindow(new URL('./', self.registration.scope).href);
  })());
});
