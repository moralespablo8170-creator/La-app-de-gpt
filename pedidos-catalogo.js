// Pedidos que llegan del catálogo web: además del WhatsApp, quedan guardados en Firebase.
// En Inicio aparece el aviso y, el día de la entrega, con "Cargar en venta" el pedido
// pasa al carrito del cliente para revisarlo y guardarlo como una venta normal.
(function(){
  const $=id=>document.getElementById(id);
  const e=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const m=v=>typeof money==='function'?money(v):'$'+Math.round(v).toLocaleString('es-CL');
  const nrm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const digits=v=>String(v||'').replace(/\D/g,'').slice(-8);
  const cloud=()=>localStorage.getItem('zipperStorageMode')==='cloud'&&typeof window.zipperFirebaseCloud?.listCatalogOrders==='function';
  const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'})+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})};
  let orders=[],loading=false,lastLoad=0,error='';

  async function load(force){
    if(loading||!cloud())return;if(!force&&Date.now()-lastLoad<60000)return;
    loading=true;error='';
    try{orders=(await window.zipperFirebaseCloud.listCatalogOrders()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));lastLoad=Date.now()}
    catch(err){error=err.message||String(err)}
    finally{loading=false;renderAlert();if(!$('catOrders')?.classList.contains('hidden'))renderList()}
  }
  const mine=()=>orders.filter(o=>!o.seller&&!o.sellerPhone);
  const pending=()=>mine().filter(o=>o.status==='nuevo');

  function renderAlert(){
    const home=$('homeAlerts');if(!home)return;
    let box=$('catOrdersAlert');if(!box){box=document.createElement('div');box.id='catOrdersAlert';home.insertAdjacentElement('afterend',box)}
    const n=pending().length;
    box.innerHTML=n?'<div class="home-alert alert-stock"><div><strong>🛒 '+n+(n===1?' pedido nuevo':' pedidos nuevos')+' del catálogo</strong><span>'+e(pending().slice(0,3).map(o=>(o.who||'Cliente sin nombre')+' · '+m(o.total)).join(' · '))+'. Cárgalo en la app el día que lo entregues.</span></div><div class="home-alert-actions"><button class="primary" type="button" id="catOrdersOpen">Ver pedidos</button></div></div>':'';
    $('catOrdersOpen')?.addEventListener('click',open);
  }
  function orderHTML(o,canLoad){
    return '<article class="cat-order'+(o.status!=='nuevo'?' done':'')+'"><div class="cat-order-head"><strong>'+e(o.who||'Cliente sin nombre')+'</strong><span>'+m(o.total)+'</span></div>'+
      '<small>'+e(when(o.createdAt))+' · Pedido web #'+e(o.code||'')+(o.tel?' · 📞 '+e(o.tel):'')+(o.seller?' · para '+e(o.sellerName||'vendedor'):'')+(o.status==='cargado'?' · ✅ cargado '+e(when(o.loadedAt)):'')+'</small>'+
      '<ul>'+(o.lines||[]).map(l=>'<li>'+e(l.q)+' × '+e(l.name)+(l.flavor?' · '+e(l.flavor):'')+(l.box?' <b>(caja de '+e(l.units)+')</b>':'')+' — '+m(l.sub)+'</li>').join('')+'</ul>'+
      (o.msg?'<p class="muted">💬 '+e(o.msg)+'</p>':'')+
      '<div class="actions-small">'+(canLoad?'<button class="primary cat-order-load" data-id="'+e(o.id)+'" type="button">🛒 '+(o.status==='nuevo'?'Cargar en venta':'Cargar otra vez')+'</button>':'')+'<button class="danger cat-order-del" data-id="'+e(o.id)+'" type="button">🗑 Borrar</button></div></article>';
  }
  function renderList(){
    const body=$('catOrdersBody');if(!body)return;
    if(!cloud()){body.innerHTML='<p class="muted">Conecta tu cuenta de Firebase para ver los pedidos del catálogo.</p>';return}
    if(error){body.innerHTML='<p class="status">No se pudieron leer los pedidos: '+e(error)+'</p>';return}
    const p=pending(),done=mine().filter(o=>o.status!=='nuevo').slice(0,15),sellers=orders.filter(o=>o.seller||o.sellerPhone).slice(0,20);
    body.innerHTML=(loading&&!orders.length?'<p class="muted">Cargando…</p>':'')+
      (p.length?p.map(o=>orderHTML(o,true)).join(''):'<p class="muted empty-state">No hay pedidos nuevos del catálogo.</p>')+
      (done.length?'<details><summary>Ya cargados ('+done.length+')</summary>'+done.map(o=>orderHTML(o,true)).join('')+'</details>':'')+
      (sellers.length?'<details><summary>Pedidos de clientes de vendedores ('+sellers.length+')</summary><p class="muted">Estos los carga cada vendedor en su app.</p>'+sellers.map(o=>orderHTML(o,false)).join('')+'</details>':'');
    body.querySelectorAll('.cat-order-load').forEach(b=>b.onclick=()=>pickClient(orders.find(o=>o.id===b.dataset.id)));
    body.querySelectorAll('.cat-order-del').forEach(b=>b.onclick=async()=>{if(!confirm('¿Borrar este pedido del catálogo? (El mensaje de WhatsApp no se borra.)'))return;try{await window.zipperFirebaseCloud.deleteCatalogOrder(b.dataset.id);orders=orders.filter(o=>o.id!==b.dataset.id);renderList();renderAlert()}catch(err){alert('No se pudo borrar: '+(err.message||err))}});
  }
  function open(){
    let modal=$('catOrders');
    if(!modal){modal=document.createElement('div');modal.id='catOrders';modal.className='zipper-modal hidden';modal.innerHTML='<div class="zipper-modal-panel cat-orders-panel"><h2>🛒 Pedidos del catálogo</h2><div id="catOrdersBody"></div><div class="actions"><button id="catOrdersRefresh" class="secondary" type="button">↻ Actualizar</button><button id="catOrdersClose" class="primary" type="button">Cerrar</button></div></div>';document.body.appendChild(modal);
      $('catOrdersClose').onclick=()=>modal.classList.add('hidden');$('catOrdersRefresh').onclick=()=>load(true)}
    modal.classList.remove('hidden');renderList();load(true);
  }
  // Elegir a qué cliente se carga (sugiere por teléfono y por nombre).
  function pickClient(o){
    if(!o)return;
    const clients=(typeof getClients==='function'?getClients():[]).filter(c=>c.active!==false);
    const tel=digits(o.tel),who=nrm(o.who);
    const scored=clients.map(c=>({c,s:(tel&&digits(c.phone)===tel?3:0)+(who&&nrm(c.name)===who?2:who&&(nrm(c.name).includes(who)||who.includes(nrm(c.name)))?1:0)})).sort((a,b)=>b.s-a.s||a.c.name.localeCompare(b.c.name,'es'));
    const w=document.createElement('div');w.className='zipper-modal';w.style.zIndex='20001';
    w.innerHTML='<div class="zipper-modal-panel cat-orders-panel"><h2>¿A qué cliente lo cargo?</h2><p class="muted">Pedido de <b>'+e(o.who||'cliente sin nombre')+'</b>'+(o.tel?' · '+e(o.tel):'')+'</p><input class="cat-pick-q" type="search" placeholder="🔍 Buscar cliente…"><div class="cat-pick-list"></div><div class="actions"><button class="secondary" data-close type="button">Cancelar</button></div></div>';
    document.body.appendChild(w);
    const list=w.querySelector('.cat-pick-list'),q=w.querySelector('.cat-pick-q');
    const draw=()=>{const t=nrm(q.value);list.innerHTML=scored.filter(x=>!t||nrm(x.c.name).includes(t)||digits(x.c.phone).includes(t.replace(/\D/g,'')||'§')).slice(0,40).map(x=>'<button type="button" class="cat-pick-item'+(x.s>=2?' on':'')+'" data-id="'+e(x.c.id)+'"><b>'+e(x.c.name)+(x.s>=2?' ✓ sugerido':'')+'</b><span>'+e(x.c.address||'Sin dirección')+(x.c.phone?' · '+e(x.c.phone):'')+'</span></button>').join('')||'<p class="muted">No hay clientes con ese nombre. Créalo primero en Clientes.</p>'};
    draw();q.oninput=draw;
    w.onclick=ev=>{if(ev.target===w||ev.target.closest('[data-close]'))return w.remove();const b=ev.target.closest('.cat-pick-item');if(b){w.remove();loadIntoCart(o,b.dataset.id)}};
  }
  // Busca el producto de tu inventario para cada línea del pedido.
  function productFor(l){
    const links=(()=>{try{return JSON.parse(localStorage.getItem('zipperCatalogoEnlaces')||'{}')||{}}catch(_){return {}}})();
    const id=l.pid||links[l.key];if(!id||id==='none')return null;
    let p=typeof productById==='function'?productById(id):null;
    if(l.flavor){const all=typeof getProducts==='function'?getProducts():[];const base=p?String(p.baseProductId||p.id):String(id);const f=all.find(x=>String(x.baseProductId||x.id)===base&&nrm(x.flavor)===nrm(l.flavor));if(f)p=f}
    return p;
  }
  async function loadIntoCart(o,clientId){
    if(typeof openClientCart!=='function')return;
    if(cart.length&&!confirm('Hay productos en el carrito abierto. ¿Reemplazarlos por este pedido?'))return;
    if(typeof showView==='function')showView('home');
    openClientCart(clientId);
    const items=[],missing=[];
    (o.lines||[]).forEach(l=>{const p=productFor(l);if(!p){missing.push(l.name+(l.flavor?' · '+l.flavor:''));return}const qty=Number(l.q||0)*(l.box?Number(l.units||1):1);const ex=items.find(x=>String(x.productId)===String(p.id));if(ex)ex.qty+=qty;else items.push({productId:p.id,qty})});
    cart=items;showCartTray=true;
    if(typeof renderCart==='function')renderCart();
    $('saleStatus').textContent='🛒 Pedido web #'+(o.code||'')+' cargado. Revisa cantidades y stock, y guarda la venta como siempre.'+(missing.length?' ⚠ No encontré en tu inventario: '+missing.join(', ')+' (agrégalos a mano o enlázalos en Editar catálogo).':'');
    $('catOrders')?.classList.add('hidden');
    try{await window.zipperFirebaseCloud.setCatalogOrderStatus(o.id,'cargado',{loadedAt:new Date().toISOString()});o.status='cargado';o.loadedAt=new Date().toISOString();renderAlert()}catch(err){console.warn('Pedido catálogo: no se pudo marcar como cargado',err)}
    setTimeout(()=>$('cartSection')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  }
  function mount(){
    const css=document.createElement('style');css.textContent='.cat-orders-panel{max-width:620px!important;max-height:calc(100dvh - 24px);overflow-y:auto}.cat-order{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin:8px 0;background:#fff}.cat-order.done{opacity:.75}.cat-order-head{display:flex;justify-content:space-between;gap:8px;font-size:15px}.cat-order small{color:#64748b}.cat-order ul{margin:6px 0 6px 18px;font-size:13.5px}.cat-pick-q{width:100%;margin:6px 0}.cat-pick-list{display:flex;flex-direction:column;gap:6px;margin:6px 0 10px}.cat-pick-item{display:flex!important;flex-direction:column;align-items:flex-start!important;text-align:left;min-height:0!important;padding:9px 10px!important;border:1px solid #e5e7eb!important;border-radius:10px!important;background:#fff!important;color:#111827!important;width:100%}.cat-pick-item span{font-size:12.5px;color:#64748b;font-weight:400}.cat-pick-item.on{border-color:#16a34a!important;background:#f0fdf4!important}';
    document.head.appendChild(css);
    const home=window.renderHome;if(typeof home==='function'&&!home.__withCatOrders){window.renderHome=function(){const r=home.apply(this,arguments);try{renderAlert();load(false)}catch(err){console.error(err)}return r};window.renderHome.__withCatOrders=true}
    setTimeout(()=>load(true),7000);setInterval(()=>load(true),180000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0),{once:true});else setTimeout(mount,0);
  window.zipperCatalogOrders={open,load};
})();
