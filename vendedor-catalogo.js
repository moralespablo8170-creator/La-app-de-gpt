// App del vendedor → pestaña "📒 Catálogo": ver el catálogo (solo mirar) y enviar
// a sus clientes un enlace propio. Los pedidos que hagan con ese enlace le llegan
// directo al WhatsApp del vendedor, no al del dueño.
(function(){
  const BASE='https://moralespablo8170-creator.github.io/La-app-de-gpt/catalogo.html';
  const KEY='zipperVendedorCatalogo';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(_){return {}}};
  const write=v=>{try{localStorage.setItem(KEY,JSON.stringify(v))}catch(_){}};
  const clean=v=>{let d=String(v||'').replace(/\D/g,'');if(d.length===8)d='569'+d;if(d.length===9&&d.startsWith('9'))d='56'+d;return d};
  const valid=d=>/^569\d{8}$/.test(d);
  const sellerName=()=>(read().name||String($('sellerWelcome')?.textContent||'').split(' · ')[0]||'').trim();
  function link(){const c=read(),phone=clean(c.phone);if(!valid(phone))return '';const u=new URL(BASE);u.searchParams.set('v',phone);const nm=sellerName();if(nm)u.searchParams.set('n',nm);return u.toString()}
  function message(){return 'Hola 👋, te comparto el catálogo de *Distribuidora Zipper*. Marca los productos que necesitas y envíame tu pedido por WhatsApp:\n'+link()}
  function render(){
    const box=$('catalogTab');if(!box)return;const c=read(),phone=clean(c.phone),ok=valid(phone);
    box.innerHTML='<div class="card"><h2>📒 Catálogo para mis clientes</h2><p class="muted">Envía el catálogo a tus clientes. Ellos marcan los productos y el pedido <b>te llega a tu WhatsApp</b>. Los precios son los de la distribuidora.</p>'+
      '<label>Mi WhatsApp (aquí te llegan los pedidos)<input id="vcPhone" inputmode="tel" placeholder="569 1234 5678" value="'+esc(c.phone||'569 ')+'"></label>'+
      '<label>Mi nombre (lo ve el cliente)<input id="vcName" value="'+esc(sellerName())+'"></label><p id="vcMsg" class="muted"></p>'+
      '<div class="actions"><button id="vcShare" type="button"'+(ok?'':' disabled')+'>📤 Enviar catálogo por WhatsApp</button><button id="vcView" class="secondary" type="button">👀 Ver catálogo</button><button id="vcCopy" class="secondary" type="button"'+(ok?'':' disabled')+'>📋 Copiar enlace</button></div>'+
      '<p id="vcLink" class="muted" style="word-break:break-all"></p></div>';
    const save=()=>{const p=clean($('vcPhone').value),n=$('vcName').value.trim();write({phone:p,name:n});const msg=$('vcMsg');if(p.length>3&&!valid(p)){msg.textContent='Número incompleto: deben ser 8 dígitos después de 569.';return false}msg.textContent='';return true};
    const refresh=()=>{const l=link();$('vcLink').textContent=l?'Tu enlace: '+l:'Escribe tu WhatsApp para activar tu enlace.';$('vcShare').disabled=!l;$('vcCopy').disabled=!l};
    $('vcPhone').onchange=()=>{save();refresh()};$('vcName').onchange=()=>{save();refresh()};refresh();
    $('vcShare').onclick=()=>{if(!save()||!link())return;location.href='https://wa.me/?text='+encodeURIComponent(message())};
    $('vcCopy').onclick=()=>{if(!save()||!link())return;const t=link();(navigator.clipboard?.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{$('vcMsg').textContent='✅ Enlace copiado.'}).catch(()=>prompt('Copia tu enlace:',t))};
    $('vcView').onclick=()=>{save();window.open(link()||BASE,'_blank')};
  }
  function show(on){
    ['routeTab','saleTab','clientsTab'].forEach(id=>{if(on)$(id)?.classList.add('hide')});
    $('catalogTab')?.classList.toggle('hide',!on);
    if(on){document.querySelectorAll('#sellerNav [data-tab]').forEach(b=>b.classList.remove('active'));$('vcTabBtn')?.classList.add('active');render();window.scrollTo({top:0})}
    else $('vcTabBtn')?.classList.remove('active');
  }
  function mount(){
    const nav=$('sellerNav'),app=$('sellerApp');if(!nav||!app||$('vcTabBtn'))return;
    const sec=document.createElement('section');sec.id='catalogTab';sec.className='hide';app.appendChild(sec);
    const b=document.createElement('button');b.id='vcTabBtn';b.type='button';b.textContent='📒 Catálogo';nav.appendChild(b);
    b.onclick=()=>show(true);
    nav.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>show(false)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
