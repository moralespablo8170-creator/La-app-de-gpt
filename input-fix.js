(()=>{
  // v22: protección mínima de campos de entrada en móvil.
  // No limpia cachés ni Service Workers durante la interacción: eso puede provocar
  // trabajo innecesario justo cuando Android intenta abrir el teclado.
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepareInputs,{once:true});
  else prepareInputs();
  window.addEventListener('pageshow',prepareInputs,{passive:true});
})();
