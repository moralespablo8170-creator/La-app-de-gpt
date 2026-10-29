const CACHE_NAME = 'zipper-app-pwa-20261029-seller-functions-v21';
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=zipper-sync-status-20261029-v1",
  "./app.js?v=zipper-cobro-entrega-20261029-v1",
  "./firebase-cloud.js?v=zipper-firebase-offline-queue-20261029-v9",
  "./seller-assignments.js?v=zipper-seller-routes-20261029-v1",
  "./vendedor.html",
  "./seller-app.js?v=zipper-seller-revocation-20261029-v3",
  "./seller-admin.html",
  "./seller-admin.js?v=zipper-seller-admin-functions-20261029-v14",
  "./route-position-migration.js?v=1.2",
  "./route-position-migration-b.js?v=1.0",
  "./herramientas.js?v=20261012-restauracion-v32",
  "./pwa.js?v=20261007-2",
  "./manifest.json?v=20261015-icono-exterior-v2",
  "./data/zipper-seed.json",
  "./assets/zipper-compact.webp",
  "./assets/zipper-panel.webp",
  "./assets/icono-512.png?v=20261015-icono-exterior-v2"
];
self.addEventListener('install', event => {
  event.waitUntil((async () => { await caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)); await self.skipWaiting(); })());
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
