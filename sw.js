const CACHE_NAME = 'zipper-app-pwa-20261007-2';
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=zipper-20261007-1",
  "./app.js?v=zipper-20261007-6",
  "./route-position-migration.js?v=1.2",
  "./route-position-migration-b.js?v=1.0",
  "./herramientas.js?v=1",
  "./pwa.js?v=zipper-20261007-1",
  "./manifest.json",
  "./data/zipper-seed.json",
  "./assets/zipper-compact.webp",
  "./assets/zipper-panel.webp",
  "./assets/icon-circle-192.png",
  "./assets/icon-circle-512.png",
  "./assets/icon-circle-maskable-512.png"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('zipper-app-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        return response;
      }
      const cached = await cache.match(request);
      return cached || response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
