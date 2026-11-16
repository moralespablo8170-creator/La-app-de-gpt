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
  function link(){const c=read(),phone=clean(c.phone);if(!valid(phone))return '';const u=new URL(BASE);u.searchParams.set('v',phone);const nm=sellerName();if(nm)u.searchParams.set('n',nm);const uid=window.zipperSellerOrders?.uid?.();if(uid)u.searchParams.set('s',uid);return u.toString()}
  function message(){return 'Hola 👋, te comparto el catálogo de *Distribuidora Zipper*. Marca los productos que necesitas y envíame tu pedido por WhatsApp:\n'+link()}
  function render(){
    const box=$('catalogTab');if(!box)return;const c=read(),phone=clean(c.phone),ok=valid(phone);
    box.innerHTML='<div class="card"><h2>📒 Catálogo para mis clientes</h2><p class="muted">Envía el catálogo a tus clientes. Ellos marcan los productos y el pedido <b>te llega a tu WhatsApp</b>. Los precios son los de la distribuidora.</p>'+
      '<label>Mi WhatsApp (aquí te llegan los pedidos)<input id="vcPhone" inputmode="tel" placeholder="569 1234 5678" value="'+esc(c.phone||'569 ')+'"></label>'+
      '<label>Mi nombre (lo ve el cliente)<input id="vcName" value="'+esc(sellerName())+'"></label><p id="vcMsg" class="muted"></p>'+
      '<div class="actions"><button id="vcShare" type="button"'+(ok?'':' disabled')+'>📤 Enviar catálogo por WhatsApp</button><button id="vcView" class="secondary" type="button">👀 Ver catálogo</button><button id="vcCopy" class="secondary" type="button"'+(ok?'':' disabled')+'>📋 Copiar enlace</button></div>'+
      '<p id="vcLink" class="muted" style="word-break:break-all"></p></div>'+
      '<div class="card"><h2>🛒 Pedidos de mis clientes</h2><p class="muted">Los pedidos que tus clientes hacen desde tu enlace quedan aquí. El día de la entrega toca <b>Cargar en venta</b>.</p><div id="vcOrders"><p class="muted">Cargando…</p></div><div class="actions"><button id="vcOrdersRefresh" class="secondary" type="button">↻ Actualizar pedidos</button></div></div>';
    const save=()=>{const p=clean($('vcPhone').value),n=$('vcName').value.trim();write({phone:p,name:n});const msg=$('vcMsg');if(p.length>3&&!valid(p)){msg.textContent='Número incompleto: deben ser 8 dígitos después de 569.';return false}msg.textContent='';return true};
    const refresh=()=>{const l=link();$('vcLink').textContent=l?'Tu enlace: '+l:'Escribe tu WhatsApp para activar tu enlace.';$('vcShare').disabled=!l;$('vcCopy').disabled=!l};
    $('vcPhone').onchange=()=>{save();refresh()};$('vcName').onchange=()=>{save();refresh()};refresh();
    $('vcShare').onclick=()=>{if(!save()||!link())return;location.href='https://wa.me/?text='+encodeURIComponent(message())};
    $('vcCopy').onclick=()=>{if(!save()||!link())return;const t=link();(navigator.clipboard?.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{$('vcMsg').textContent='✅ Enlace copiado.'}).catch(()=>prompt('Copia tu enlace:',t))};
    $('vcView').onclick=()=>{save();window.open(link()||BASE,'_blank')};
    $('vcOrdersRefresh').onclick=loadOrders;loadOrders();
  }
  const money=n=>'$'+Math.round(Number(n)||0).toLocaleString('es-CL');
  const nrm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const digits=v=>String(v||'').replace(/\D/g,'').slice(-8);
  let orders=[];
  async function loadOrders(){
    const box=$('vcOrders');if(!box)return;const api=window.zipperSellerOrders;
    if(!api){box.innerHTML='<p class="muted">Inicia sesión para ver tus pedidos.</p>';return}
    try{orders=await api.list()}catch(e){box.innerHTML='<p class="muted">No se pudieron leer los pedidos: '+esc(e.message||e)+'</p>';return}
    const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'})+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})};
    const row=o=>'<article class="vc-order'+(o.status!=='nuevo'?' done':'')+'"><div class="vc-head"><strong>'+esc(o.who||'Cliente sin nombre')+'</strong><b>'+money(o.total)+'</b></div><small>'+esc(when(o.createdAt))+' · #'+esc(o.code||'')+(o.tel?' · 📞 '+esc(o.tel):'')+(o.status==='cargado'?' · ✅ cargado':'')+'</small><ul>'+(o.lines||[]).map(l=>'<li>'+esc(l.q)+' × '+esc(l.name)+(l.flavor?' · '+esc(l.flavor):'')+(l.box?' (caja de '+esc(l.units)+')':'')+'</li>').join('')+'</ul>'+(o.msg?'<small>💬 '+esc(o.msg)+'</small>':'')+'<div class="actions"><button class="vc-load" data-id="'+esc(o.id)+'" type="button">🛒 '+(o.status==='nuevo'?'Cargar en venta':'Cargar otra vez')+'</button><button class="secondary vc-del" data-id="'+esc(o.id)+'" type="button">🗑 Borrar</button></div></article>';
    const nuevos=orders.filter(o=>o.status==='nuevo'),hechos=orders.filter(o=>o.status!=='nuevo').slice(0,10);
    box.innerHTML=(nuevos.length?nuevos.map(row).join(''):'<p class="muted">No tienes pedidos nuevos.</p>')+(hechos.length?'<details><summary>Ya cargados ('+hechos.length+')</summary>'+hechos.map(row).join('')+'</details>':'');
    box.querySelectorAll('.vc-load').forEach(b=>b.onclick=()=>pickClient(orders.find(o=>o.id===b.dataset.id)));
    box.querySelectorAll('.vc-del').forEach(b=>b.onclick=async()=>{if(!confirm('¿Borrar este pedido?'))return;try{await window.zipperSellerOrders.remove(b.dataset.id);loadOrders()}catch(e){alert('No se pudo borrar: '+(e.message||e))}});
    const btn=$('vcTabBtn');if(btn)btn.textContent='📒 Catálogo'+(nuevos.length?' ('+nuevos.length+')':'');
  }
  function pickClient(o){
    if(!o)return;const list=window.zipperSellerOrders.clients(),tel=digits(o.tel),who=nrm(o.who);
    const scored=list.map(c=>({c,s:(tel&&digits(c.phone)===tel?3:0)+(who&&nrm(c.name)===who?2:who&&(nrm(c.name).includes(who)||who.includes(nrm(c.name)))?1:0)})).sort((a,b)=>b.s-a.s||String(a.c.name).localeCompare(String(b.c.name),'es'));
    const w=document.createElement('div');w.className='vc-modal';
    w.innerHTML='<div class="vc-panel"><h2>¿A qué cliente lo cargo?</h2><p class="muted">Pedido de <b>'+esc(o.who||'cliente sin nombre')+'</b></p><input class="vc-q" type="search" placeholder="🔍 Buscar cliente…"><div class="vc-list"></div><button class="secondary vc-cancel" type="button">Cancelar</button></div>';
    document.body.appendChild(w);const q=w.querySelector('.vc-q'),box=w.querySelector('.vc-list');
    const draw=()=>{const t=nrm(q.value);box.innerHTML=scored.filter(x=>!t||nrm(x.c.name).includes(t)).slice(0,40).map(x=>'<button type="button" class="vc-item'+(x.s>=2?' on':'')+'" data-id="'+esc(x.c.id)+'"><b>'+esc(x.c.name)+(x.s>=2?' ✓ sugerido':'')+'</b><span>'+esc(x.c.address||'')+'</span></button>').join('')||'<p class="muted">No tienes clientes con ese nombre. Créalo primero en Clientes.</p>'};
    draw();q.oninput=draw;
    w.onclick=async ev=>{if(ev.target===w||ev.target.closest('.vc-cancel'))return w.remove();const b=ev.target.closest('.vc-item');if(!b)return;w.remove();show(false);await window.zipperSellerOrders.load(o,b.dataset.id)};
  }
  function show(on){
    ['routeTab','saleTab','clientsTab'].forEach(id=>{if(on)$(id)?.classList.add('hide')});
    $('catalogTab')?.classList.toggle('hide',!on);
    if(on){document.querySelectorAll('#sellerNav [data-tab]').forEach(b=>b.classList.remove('active'));$('vcTabBtn')?.classList.add('active');render();window.scrollTo({top:0})}
    else $('vcTabBtn')?.classList.remove('active');
  }
  function mount(){
    const css=document.createElement('style');css.textContent='.vc-order{border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin:8px 0;background:#fff}.vc-order.done{opacity:.7}.vc-head{display:flex;justify-content:space-between;gap:8px}.vc-order ul{margin:6px 0 6px 18px;font-size:14px}.vc-order small{color:#64748b;display:block}.vc-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center}.vc-panel{background:#fff;width:100%;max-width:560px;max-height:85vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px}.vc-q{width:100%;margin:8px 0}.vc-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.vc-item{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a}.vc-item span{font-size:12.5px;color:#64748b;font-weight:400}.vc-item.on{border-color:#16a34a;background:#f0fdf4}';document.head.appendChild(css);
    setTimeout(()=>{if(window.zipperSellerOrders?.uid?.())loadOrders()},6000);
    const nav=$('sellerNav'),app=$('sellerApp');if(!nav||!app||$('vcTabBtn'))return;
    const sec=document.createElement('section');sec.id='catalogTab';sec.className='hide';app.appendChild(sec);
    const b=document.createElement('button');b.id='vcTabBtn';b.type='button';b.textContent='📒 Catálogo';nav.appendChild(b);
    b.onclick=()=>show(true);
    nav.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>show(false)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
