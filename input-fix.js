(()=>{
  // v20: limpia Service Workers/caches antiguos que podían dejar una versión móvil atascada.
  async function clearOldRuntime(){
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(k=>k.startsWith('zipper-app-')).map(k=>caches.delete(k)));
      }
    }catch(e){}
  }
  function prepareInputs(){
    document.querySelectorAll('input, textarea').forEach(el=>{
      el.readOnly=false;
      el.disabled=false;
      el.style.pointerEvents='auto';
      el.style.webkitUserSelect='text';
      el.style.userSelect='text';
      el.setAttribute('spellcheck','false');
    });
  }
  clearOldRuntime();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepareInputs,{once:true});
  else prepareInputs();
  window.addEventListener('pageshow',prepareInputs);
})();
