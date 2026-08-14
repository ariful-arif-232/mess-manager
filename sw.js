const CACHE = 'mess-manager-v31';
const SHELL = ['./','./index.html','./app-splash.css','./settings-pro.css','./dark-theme-final.css','./styles.css','./polish-v2.css','./polish-v3.css','./admin-ai.css','./entry-form-pro.css','./entry-form-final.css','./entry-form-compact.css','./app.js','./ui-pro.js','./features-pro.js','./ux-fixes.js','./polish-v2.js','./polish-v3.js','./admin-ai.js','./otp-auth.js','./entry-form-pro.js','./settings-pro.js','./config.js','./manifest.json','./icons/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.hostname.endsWith('.supabase.co')) return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
