// 웹푸시 서비스워커 — 알림 표시 + 클릭 시 해당 채널로 이동.
// 페이로드: { title, body, url, tag } (lib/push/webPush.ts와 계약)

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* 페이로드 파싱 실패 → 기본 문구 */
  }
  const title = data.title || '새 메시지';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
