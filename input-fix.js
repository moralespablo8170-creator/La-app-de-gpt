(()=>{
  // v23: elimina una sola vez cualquier Service Worker/caché antiguo de la app.
  // Después deja la aplicación sin limpieza ni trabajo adicional durante la escritura.
  const FLAG='zipper-v23-runtime-reset';
  async function resetOldRuntime(){
    try{
      let changed=false;
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        if(regs.length){
          await Promise.all(regs.map(r=>r.unregister()));
          changed=true;
        }
      }
      if('caches' in window){
        const keys=await caches.keys();
        const old=keys.filter(k=>/zipper|la-app-de-gpt/i.test(k));
        if(old.length){
          await Promise.all(old.map(k=>caches.delete(k)));
          changed=true;
        }
      }
      if(changed&&!sessionStorage.getItem(FLAG)){
        sessionStorage.setItem(FLAG,'1');
        location.reload();
        return;
      }
    }catch(e){}
    prepareInputs();
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
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>resetOldRuntime(),{once:true});
  }else resetOldRuntime();
})();
