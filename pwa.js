// Actualización de la PWA instalada desde Chrome, sin borrar almacenamiento local.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !navigator.serviceWorker.controller) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
      await registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(console.error);
      });
    } catch (error) {
      console.error('No se pudo actualizar Zipper sin conexión:', error);
    }
  });
}
