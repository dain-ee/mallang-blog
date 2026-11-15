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
    const u = (e.notification.data && e.notification.data.url) || './';
    if (/^https?:/.test(u)) return self.clients.openWindow(u); // 댓글·이웃 신청 알림 → 그 댓글·내소식으로 바로(11/15)
    const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of L) if ('focus' in c) return c.focus();
    return self.clients.openWindow(new URL('./', self.registration.scope).href);
  })());
});
// 화면(index.html)은 늘 새로 받아요 — 홈 화면 앱이 옛 화면을 붙들고 있지 않게(11/15)
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request)));
});
