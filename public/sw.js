const CACHE = 'tidy-v1';
const PRECACHE = ['/', '/inbox', '/capture', '/focus', '/review', '/settings', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Network-first for API (never cache POST; GET only fallback if offline)
  if (req.url.includes('/api/')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // Cache-first for app shell/static
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const resClone = res.clone();
      // cache html/css/js/fonts/images; ignore opaque and errors
      if (res.status === 200 && ['basic','cors'].includes(res.type)) {
        caches.open(CACHE).then(cache => cache.put(req, resClone)).catch(() => {});
      }
      return res;
    }))
  );
});
