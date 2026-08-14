const CACHE = 'mess-manager-v59-core-logout-fix';
const SHELL = ['./','./index.html','./app-splash.css','./splash-theme.js','./settings-pro.css','./settings-admin-fix.css','./admin-profile-view.css','./dark-theme-final.css','./member-delete-polish.css','./member-profile.css','./page-detail-fixes.css','./activity-compact.css','./ledger-premium.css','./mobile-top-flow-fix.css','./styles.css','./polish-v2.css','./polish-v3.css','./admin-ai.css','./entry-form-pro.css','./entry-form-final.css','./entry-form-compact.css','./app.js','./ui-pro.js','./features-pro.js','./ux-fixes.js','./polish-v2.js','./polish-v3.js','./admin-ai.js','./otp-auth.js','./entry-form-pro.js','./page-detail-fixes.js','./activity-compact.js','./settings-pro.js','./member-activity-access.js','./member-profile.js','./ledger-premium.js','./admin-profile-view.js','./app-polish-final.js','./config.js','./manifest.json?v=20260814-borderless2','./icons/icon.png?v=20260814-borderless2','./icons/icon-192.png?v=20260814-borderless2','./icons/icon-512.png?v=20260814-borderless2'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.hostname.endsWith('.supabase.co')) return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
