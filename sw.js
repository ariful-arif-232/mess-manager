const CACHE = 'mess-manager-v60-runtime-reset-20260814-2312';
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
