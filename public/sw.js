/*
  Service worker: a small script the browser keeps around even when
  Comeback isn't open, so reminders can still pop up. It only shows
  notifications; it doesn't cache the app. Registered in src/push.ts.

  The send-reminders Supabase function sends { title, body, tag, url }.
*/

self.addEventListener('install', () => self.skipWaiting());
// Take charge of open tabs right away, so a tapped notification can steer them.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Comeback', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag replaces an older reminder instead of stacking up.
      tag: data.tag || 'comeback',
      data: { url: data.url || '/' },
    }),
  );
});

// Tapping the notification opens Comeback, or switches to it if it's open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
