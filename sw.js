const CACHE = 'mess-manager-v98-bazar-date-buyer-size';
const SHELL = [
  './',
  './index.html',
  './manifest.json?v=20260814-borderless2',
  './icons/icon.png?v=20260814-borderless2',
  './icons/icon-192.png?v=20260814-borderless2',
  './icons/icon-512.png?v=20260814-borderless2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}

  const sender = String(payload.sender_name || '').trim();
  const message = String(payload.body || '').trim();
  const title = sender ? `${sender} sent a message` : 'New Mess Chat message';
  const createdAt = Date.parse(payload.created_at || '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const active = list.some(client => client.url.startsWith(self.registration.scope) && client.visibilityState === 'visible' && client.focused);
      if (active) return;

      const options = {
        body: message || 'New chat message',
        icon: './icons/icon-192.png?v=20260814-borderless2',
        tag: `mess-chat-${payload.message_id || Date.now()}`,
        renotify: true,
        data: { url: payload.url || './?open=chat' }
      };

      if (Number.isFinite(createdAt)) options.timestamp = createdAt;

      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const scope = self.registration.scope;
  const target = new URL(event.notification.data?.url || './?open=chat', scope).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
      const existing = list.find(client => client.url.startsWith(scope));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-chat' });
        return;
      }
      await clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.endsWith('.supabase.co')) return;

  const sameOrigin = url.origin === self.location.origin;
  const runtimeAsset = sameOrigin && /\.(?:html|js|css)$/.test(url.pathname);

  if (runtimeAsset) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'reload' }))
        .then(response => response)
        .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (sameOrigin && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
  );
});
