if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
      .catch(error => console.error('No se pudo preparar Zipper sin conexión:', error));
  });
}
