const CACHE_NAME = 'zipper-app-pwa-20261119-83';
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261119-confirma1",
  "./tema-colores.css?v=20261117-avisos-2",
  "./assets/ilustraciones/ruta.svg",
  "./assets/ilustraciones/clientes.svg",
  "./assets/ilustraciones/productos.svg",
  "./assets/ilustraciones/caja.svg",
  "./assets/ilustraciones/historial.svg",
  "./assets/ilustraciones/factura.svg",
  "./assets/ilustraciones/vendedores.svg",
  "./assets/ilustraciones/nube.svg",
  "./assets/ilustraciones/carrito.svg",
  "./app.js?v=20261119-confirma1",
  "./whatsapp.js?v=20261115-4",
  "./cobranza.js?v=20261116-5",
  "./ideas.js?v=20261115-1",
  "./informe-vendedores.js?v=20261117-4",
  "./vendedores-caja.js?v=20261116-2",
  "./catalogo-admin.js?v=20261119-promos1",
  "./historial-atajos.js?v=20261118-1",
  "./pedidos-catalogo.js?v=20261119-1",
  "./avisos-inicio.js?v=20261119-1",
  "./fotos-productos.js?v=20261117-2",
  "./producto-foto.js?v=20261119-confirma1",
  "./rutas-clientes.js?v=20261119-confirma1",
  "./proyecciones.js?v=20261117-8",
  "./firebase-cloud.js?v=20261119-confirma1",
  "./firebase-config.js",
  "./firebase-test-config.js",
  "./seller-assignments.js?v=zipper-seller-bulk-20261115-v2",
  "./vendedor.html",
  "./repartidor.html",
  "./repartidor-manifest.json?v=1",
  "./driver-app.js?v=20261119-confirma1",
  "./vendedor-manifest.json?v=1",
  "./seller-app.js?v=zipper-seller-v16-20261117",
  "./vendedor-catalogo.js?v=20261117-3",
  "./seller-admin.html",
  "./seller-admin.js?v=20261119-confirma1",
  "./route-position-migration.js?v=1.2",
  "./route-position-migration-b.js?v=1.0",
  "./herramientas.js?v=20261115-restauracion-v33",
  "./pwa.js?v=20261101-chrome-update-v20",
  "./manifest.json?v=20261015-icono-exterior-v2",
  "./data/zipper-seed.json",
  "./assets/zipper-compact.webp",
  "./assets/zipper-panel.webp",
  "./assets/icono-512.png?v=20261015-icono-exterior-v2"
];
self.addEventListener('install', event => {
  event.waitUntil((async () => { const cache=await caches.open(CACHE_NAME); await cache.add('./index.html'); await Promise.allSettled(APP_SHELL.filter(url=>url!=='./index.html').map(url=>cache.add(url))); await self.skipWaiting(); })());
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
