// Seguridad básica del lado del teléfono.
// 1) Impide que otra página muestre la app "por dentro" (en un marco) para engañar con toques falsos.
// 2) No deja que un link abierto desde la app tome control de esta pestaña.
(function(){
  try{if(window.top!==window.self){window.top.location.replace(window.self.location.href)}}catch(_){document.documentElement.style.display='none'}
  document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[target="_blank"]');if(a){var r=(a.getAttribute('rel')||'');if(!/noopener/.test(r))a.setAttribute('rel',(r+' noopener noreferrer').trim())}},true);
})();
