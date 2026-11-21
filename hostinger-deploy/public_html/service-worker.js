const CACHE_NAME = 'ideal-hrms-static-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/admin.html',
  '/employee.html',
  '/manifest.json',
  '/config/app-config.js',
  '/assets/css/hrms.css',
  '/assets/js/indexeddb.js',
  '/assets/js/api.js',
  '/assets/js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('script.google.com') !== -1) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
