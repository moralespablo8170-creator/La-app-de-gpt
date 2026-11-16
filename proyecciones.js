// Proyección de compras y comparación de meses/años.
// Usa solo las ventas guardadas en el teléfono: no modifica datos.
(function(){
  const DAY=86400000;
  const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const parse=v=>{const [y,m,d]=String(v||'').slice(0,10).split('-').map(Number);return y?new Date(y,(m||1)-1,d||1,12).getTime():NaN};
  const iso=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const pct=(a,b)=>b>0?Math.round((a-b)/b*100):null;
  const pctLabel=v=>v===null?'<span class="pj-muted">sin datos</span>':'<span class="'+(v>=0?'pj-up':'pj-down')+'">'+(v>=0?'▲ +':'▼ ')+v+'%</span>';

  // Une cada línea vendida con el producto actual (por id o por nombre).
  function productIndex(){
    const products=getProducts(),byId=new Map(),byName=new Map();
    products.forEach(p=>{byId.set(String(p.id),p);if(p.baseProductId)byId.set(String(p.baseProductId)+'|'+norm(p.flavor||p.color||''),p);byName.set(norm(p.name),p)});
    return {products,find:i=>byId.get(String(i.productId))||byName.get(norm(i.desc))||null};
  }
  // Unidades vendidas por producto y día.
  function salesByProduct(){
    const idx=productIndex(),units=new Map();let first=Infinity;
    getSales().forEach(s=>{
      if(s.annulled||s.status==='annulled')return;
      const t=parse(saleDate(s));if(!Number.isFinite(t))return;first=Math.min(first,t);
      (s.items||[]).forEach(i=>{const p=idx.find(i);const key=p?String(p.id):'name:'+norm(i.desc);if(!units.has(key))units.set(key,{p,name:p?p.name:(i.desc||'Producto'),days:[]});units.get(key).days.push([t,Number(i.qty)||0])});
    });
    return {idx,units,first};
  }
  const sumRange=(days,from,to)=>days.reduce((a,[t,q])=>t>=from&&t<to?a+q:a,0);

  function forecast(days,start,horizon,first){
    const recentWindow=horizon<=7?28:90;
    const recent=sumRange(days,start-recentWindow*DAY,start)/recentWindow*horizon;
    const yearAgo=start-365*DAY;
    const hasLastYear=first<=yearAgo-28*DAY;
    let lastYear=null,growth=1,value=recent;
    if(hasLastYear){
      lastYear=sumRange(days,yearAgo,yearAgo+horizon*DAY);
      const prevRecent=sumRange(days,yearAgo-recentWindow*DAY,yearAgo),thisRecent=sumRange(days,start-recentWindow*DAY,start);
      growth=prevRecent>0?Math.min(2,Math.max(.5,thisRecent/prevRecent)):1;
      value=.5*recent+.5*lastYear*growth;
    }
    return {recent,lastYear,growth,value};
  }

  // ===== Pedido de compra dentro de Productos =====
  // Las cantidades del pedido van en la unidad en que compras al proveedor
  // (caja, display, bolsa…). Cada producto puede decir cuántas unidades de venta
  // trae esa unidad de compra; con eso se calcula el sugerido y se suma el stock al recibir.
  const ORDER_KEY='zipperPedidoCompraV1',SUPPLIER_KEY='zipperPedidosProveedor';
  const UNITS=['unidad','caja','display','bolsa','paquete','pack','fardo','tira'];
  const PLURAL={unidad:'unidades',caja:'cajas',display:'displays',bolsa:'bolsas',paquete:'paquetes',pack:'packs',fardo:'fardos',tira:'tiras'};
  const unitWord=(unit,n)=>Number(n)===1?unit:(PLURAL[unit]||unit+'s');
  function readOrder(){try{const o=JSON.parse(localStorage.getItem(ORDER_KEY)||'{}');return {horizon:[7,14,30].includes(Number(o.horizon))?Number(o.horizon):7,qty:o.qty&&typeof o.qty==='object'?o.qty:{}}}catch(_){return {horizon:7,qty:{}}}}
  function saveOrder(o){try{localStorage.setItem(ORDER_KEY,JSON.stringify(o))}catch(e){console.warn('No se pudo guardar el pedido',e)}}
  function readSupplierOrders(){try{const a=JSON.parse(localStorage.getItem(SUPPLIER_KEY)||'[]');return Array.isArray(a)?a:[]}catch(_){return []}}
  function saveSupplierOrders(a){try{localStorage.setItem(SUPPLIER_KEY,JSON.stringify(a));return true}catch(e){alert('No se pudo guardar el pedido en este teléfono.');return false}}
  // Unidad de compra del producto: {unit:'caja',pack:12}. Por defecto 1 unidad.
  function buyUnitOf(p){const unit=UNITS.includes(String(p?.buyUnit||''))?p.buyUnit:'unidad';const pack=unit==='unidad'?1:Math.max(1,Math.round(Number(p?.buyPack)||1));return {unit,pack}}
  const rawIdOf=p=>String(p?.baseProductId||p?.id);
  // Unidades de venta que ya vienen en camino (pedidos enviados y no recibidos).
  function incomingUnits(){const m=new Map();readSupplierOrders().filter(o=>o.status==='pendiente').forEach(o=>(o.lines||[]).forEach(l=>{const k=String(l.id);m.set(k,(m.get(k)||0)+(Number(l.qty)||0)*(Number(l.pack)||1))}));return m}
  // Sugerido: lo que se venderá en el período − stock − lo que ya viene en camino, redondeado hacia arriba a unidades de compra.
  function suggestions(order){
    const start=parse(localDate()),{units,first}=salesByProduct(),incoming=incomingUnits(),out=new Map();
    units.forEach(u=>{if(!u.p)return;const id=String(u.p.id),f=forecast(u.days,start,order.horizon,first),stock=Math.max(0,Number(u.p.stock)||0),coming=incoming.get(id)||0,{unit,pack}=buyUnitOf(u.p);const missing=Math.max(0,Math.ceil(f.value)-stock-coming);out.set(id,{suggest:Math.ceil(missing/pack),forecast:Math.round(f.value),lastYear:f.lastYear,stock,coming,unit,pack})});
    return {map:out};
  }
  let lastSug=null;
  const orderQty=(order,id)=>{const v=order.qty[id];return v==null?(lastSug?.map.get(id)?.suggest||0):Math.max(0,Number(v)||0)};
  const periodLabel=h=>h===30?'mes':h===14?'2 semanas':'semana';
  function purchaseStrip(id,order){
    const p=productById(id),info=lastSug.map.get(id),q=orderQty(order,id),edited=order.qty[id]!=null,{unit,pack}=buyUnitOf(p);
    const sells=info?'Vendes ~'+info.forecast+' und/'+periodLabel(order.horizon)+(info.lastYear!=null?' (año pasado '+info.lastYear+')':''):'Sin ventas recientes';
    const coming=info?.coming||incomingUnits().get(id)||0;
    const hint=(coming?'🚚 '+coming+' und en camino · ':'')+(info?'Sugerido: '+info.suggest+' '+unitWord(unit,info.suggest)+(edited&&info.suggest!==q?' (cambiado a mano)':''):'');
    return '<div class="buy-strip'+(q>0?' has-qty':'')+'" data-buy-id="'+esc(id)+'"><div class="buy-info"><strong>🛒 Pedir</strong><small>'+esc(sells)+'</small>'+(hint?'<small>'+esc(hint)+'</small>':'')+'<button type="button" class="buy-unit" title="Cambiar unidad de compra">📦 '+esc(unit==='unidad'?'Por unidad':unit[0].toUpperCase()+unit.slice(1)+' de '+pack+' und')+' ✎</button></div><div class="buy-stepper-wrap"><div class="buy-stepper"><button type="button" class="buy-minus" aria-label="Restar">−</button><input class="buy-qty" type="number" min="0" step="1" inputmode="numeric" value="'+q+'" aria-label="Cantidad a pedir"><button type="button" class="buy-plus" aria-label="Sumar">+</button></div><small class="buy-unit-label">'+esc(unitWord(unit,q))+(pack>1&&q>0?' = '+(q*pack)+' und':'')+'</small></div></div>';
  }
  function orderRows(order){
    const cat=$('lowStockCategory')?.value||'';
    return getProducts().filter(p=>!cat||String(p.category||'Otros').trim()===cat).map(p=>({p,q:orderQty(order,String(p.id)),...buyUnitOf(p)})).filter(x=>x.q>0).sort((a,b)=>String(a.p.name).localeCompare(String(b.p.name),'es'));
  }
  function renderOrderSummary(order){
    const box=$('buySummary');if(!box)return;
    const rows=orderRows(order),bultos=rows.reduce((a,x)=>a+x.q,0),cost=rows.reduce((a,x)=>a+x.q*x.pack*(Number(x.p.pricePurchase)||0),0),cat=$('lowStockCategory')?.value||'';
    box.innerHTML='<div class="buy-totals"><span><b>'+rows.length+'</b>'+(rows.length===1?'producto':'productos')+'</span><span><b>'+bultos+'</b>'+(bultos===1?'bulto':'bultos')+'</span><span><b>'+money(cost)+'</b>costo aprox.</span></div><p class="buy-scope">'+(cat?'Pedido a <b>'+esc(cat)+'</b>':'Pedido de <b>todas las categorías</b> · elige una categoría arriba para el pedido de un proveedor')+'</p>';
    const send=$('buySend');if(send){send.disabled=!rows.length;send.textContent=cat?'📤 Enviar pedido a '+cat:'📤 Enviar pedido'}
  }
  function decorateInventory(){
    renderSupplierOrders();
    const list=$('inventoryList');if(!list)return;
    const order=readOrder();
    if($('buyHorizon'))$('buyHorizon').value=String(order.horizon);
    const enabled=$('buyMode')?.checked;
    document.body.classList.toggle('buy-mode',!!enabled);
    if(!enabled){renderOrderSummary(order);return}
    lastSug=suggestions(order);
    const onlyBuy=$('buyOnly')?.checked;
    list.querySelectorAll('.product-card-row').forEach(row=>{
      const id=row.querySelector('.edit-product')?.dataset.id;if(!id)return;
      row.querySelector('.buy-strip')?.remove();
      row.querySelector('.inventory-actions')?.insertAdjacentHTML('beforebegin',purchaseStrip(id,order));
      row.classList.toggle('buy-hidden',!!onlyBuy&&orderQty(order,id)<=0);
    });
    renderOrderSummary(order);
  }
  function setQty(id,value){
    const order=readOrder();order.qty[id]=Math.max(0,Math.round(Number(value)||0));saveOrder(order);
    const strip=document.querySelector('.buy-strip[data-buy-id="'+CSS.escape(id)+'"]');
    if(strip){strip.outerHTML=purchaseStrip(id,order)}
    renderOrderSummary(order);
  }
  // Modal simple reutilizable.
  function modal(html){const m=document.createElement('div');m.className='po-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.innerHTML='<div class="po-card">'+html+'</div>';document.body.appendChild(m);return m}
  function editBuyUnit(id){
    const p=productById(id);if(!p)return;const cur=buyUnitOf(p);
    const m=modal('<h3>¿Cómo le compras '+esc(p.name)+' al proveedor?</h3><label>Unidad de compra<select id="poUnit">'+UNITS.map(u=>'<option value="'+u+'"'+(u===cur.unit?' selected':'')+'>'+(u==='unidad'?'Por unidad suelta':u[0].toUpperCase()+u.slice(1))+'</option>').join('')+'</select></label><label id="poPackRow">¿Cuántas unidades de venta trae?<input id="poPack" type="number" min="1" step="1" inputmode="numeric" value="'+cur.pack+'"></label><p class="muted" id="poUnitHelp"></p><div class="actions"><button class="secondary" type="button" data-close>Cancelar</button><button class="primary" type="button" id="poUnitSave">Guardar</button></div>');
    const sel=m.querySelector('#poUnit'),pack=m.querySelector('#poPack'),help=m.querySelector('#poUnitHelp');
    const sync=()=>{const u=sel.value;m.querySelector('#poPackRow').style.display=u==='unidad'?'none':'';help.textContent=u==='unidad'?'Pides y vendes por unidad: pedir 5 suma 5 al stock.':'Ejemplo: pedir 1 '+u+' suma '+(Math.max(1,Number(pack.value)||1))+' unidades al stock al recibir.'};
    sel.onchange=sync;pack.oninput=sync;sync();
    m.querySelector('[data-close]').onclick=()=>m.remove();
    m.querySelector('#poUnitSave').onclick=()=>{
      const unit=sel.value,n=unit==='unidad'?1:Math.round(Number(pack.value));
      if(!Number.isInteger(n)||n<1){help.textContent='Ingresa cuántas unidades trae (1 o más).';pack.focus();return}
      const ps=getRawProducts(),raw=ps.find(x=>String(x.id)===rawIdOf(p));if(!raw){m.remove();return}
      raw.buyUnit=unit;raw.buyPack=n;
      if(writeArray('zipperProductos',ps)){m.remove();renderInventory()}
    };
  }
  function sendOrder(){
    const order=readOrder(),rows=orderRows(order),cat=$('lowStockCategory')?.value||'';
    if(!rows.length)return;
    const text='Pedido Distribuidora Zipper'+(cat?' · '+cat:'')+'\n'+localDate()+'\n\n'+rows.map(x=>'• '+x.p.name+': '+x.q+' '+unitWord(x.unit,x.q)).join('\n');
    const register=()=>{
      const list=readSupplierOrders();
      list.unshift({id:uid(),date:localDate(),createdAt:new Date().toISOString(),supplier:cat||'Varios',status:'pendiente',lines:rows.map(x=>({id:String(x.p.id),rawId:rawIdOf(x.p),name:x.p.name,unit:x.unit,pack:x.pack,qty:x.q}))});
      if(!saveSupplierOrders(list))return;
      const o=readOrder();rows.forEach(x=>{delete o.qty[String(x.p.id)]});saveOrder(o);
      decorateInventory();
      if(typeof zipperToast==='function')zipperToast('🚚 Pedido registrado en "Pedidos por recibir". Cuando llegue, márcalo para sumar el stock.');
    };
    if(navigator.share){navigator.share({text}).then(register).catch(err=>{if(err?.name!=='AbortError')copyText(text,register)})}else copyText(text,register);
  }
  function copyText(text,done){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>{done();if(typeof zipperToast==='function')zipperToast('📋 Pedido copiado. Pégalo en WhatsApp al proveedor.')}).catch(()=>{prompt('Copia el pedido:',text);done()});else{prompt('Copia el pedido:',text);done()}}

  // ===== Pedidos por recibir =====
  const lineText=l=>l.qty+' '+unitWord(l.unit,l.qty)+(Number(l.pack)>1?' ('+(l.qty*l.pack)+' und)':'');
  function renderSupplierOrders(){
    const box=$('supplierOrders');if(!box)return;
    const all=readSupplierOrders(),pending=all.filter(o=>o.status==='pendiente'),done=all.filter(o=>o.status==='recibido').slice(0,5);
    if(!pending.length&&!done.length){box.innerHTML='';return}
    box.innerHTML='<div class="po-panel"><h3>🚚 Pedidos por recibir'+(pending.length?' <span class="po-count">'+pending.length+'</span>':'')+'</h3>'+
      (pending.length?pending.map(o=>'<div class="po-row"><div><strong>'+esc(o.supplier)+'</strong><small>'+esc(historyNice(o.date))+' · '+plural(o.lines.length,'producto','productos')+'</small><small>'+esc(o.lines.map(l=>l.name+': '+lineText(l)).join(' · '))+'</small></div><div class="po-row-actions"><button class="primary po-receive" type="button" data-id="'+esc(o.id)+'">📦 Llegó</button><button class="ghost po-delete" type="button" data-id="'+esc(o.id)+'" aria-label="Borrar pedido">🗑</button></div></div>').join(''):'<p class="muted">No hay pedidos en camino.</p>')+
      (done.length?'<details class="po-done"><summary>Últimos recibidos</summary>'+done.map(o=>{const miss=o.lines.filter(l=>(l.received??l.qty)<l.qty);return '<div class="po-done-row"><strong>'+esc(o.supplier)+'</strong> · recibido '+esc(historyNice(o.receivedDate||o.date))+(miss.length?' · <span class="po-miss">faltó: '+esc(miss.map(l=>l.name+' '+(l.qty-(l.received||0))+' '+unitWord(l.unit,l.qty-(l.received||0))).join(', '))+'</span>':' · <span class="po-ok">completo</span>')+'</div>'}).join('')+'</details>':'')+'</div>';
    box.querySelectorAll('.po-receive').forEach(b=>b.onclick=()=>receiveOrder(b.dataset.id));
    box.querySelectorAll('.po-delete').forEach(b=>b.onclick=()=>{if(!confirm('¿Borrar este pedido? No cambia el stock.'))return;saveSupplierOrders(readSupplierOrders().filter(o=>o.id!==b.dataset.id));decorateInventory()});
  }
  const historyNice=d=>typeof historyNiceDate==='function'?historyNiceDate(d):d;
  function receiveOrder(orderId){
    const order=readSupplierOrders().find(o=>o.id===orderId&&o.status==='pendiente');if(!order)return;
    const m=modal('<h3>Recibir pedido · '+esc(order.supplier)+'</h3><p class="muted">Pedido del '+esc(historyNice(order.date))+'. Si algo no llegó, baja la cantidad. Al confirmar se suma al stock.</p><div class="po-lines">'+order.lines.map((l,i)=>'<div class="po-line" data-i="'+i+'"><div><strong>'+esc(l.name)+'</strong><small>Pedido: '+esc(lineText(l))+'</small></div><div class="buy-stepper"><button type="button" class="po-minus">−</button><input class="po-got" type="number" min="0" step="1" inputmode="numeric" value="'+l.qty+'"><button type="button" class="po-plus">+</button></div></div>').join('')+'</div><p id="poReceiveInfo" class="po-info"></p><div class="po-receive-actions"><button class="primary wide" type="button" id="poAllOk">✅ Llegó todo completo</button><button class="secondary wide" type="button" id="poConfirm">Confirmar lo recibido</button><button class="ghost wide" type="button" data-close>Cancelar</button></div>');
    const info=m.querySelector('#poReceiveInfo');
    const got=()=>[...m.querySelectorAll('.po-line')].map(r=>Math.max(0,Math.round(Number(r.querySelector('.po-got').value)||0)));
    const refresh=()=>{const g=got(),miss=order.lines.filter((l,i)=>g[i]<l.qty);info.textContent=miss.length?'Falta: '+order.lines.map((l,i)=>g[i]<l.qty?l.name+' ('+(l.qty-g[i])+' '+unitWord(l.unit,l.qty-g[i])+')':'').filter(Boolean).join(', '):'✔ Todo completo';info.classList.toggle('po-miss',!!miss.length)};
    m.querySelectorAll('.po-line').forEach(r=>{const inp=r.querySelector('.po-got');r.querySelector('.po-minus').onclick=()=>{inp.value=Math.max(0,(Number(inp.value)||0)-1);refresh()};r.querySelector('.po-plus').onclick=()=>{inp.value=(Number(inp.value)||0)+1;refresh()};inp.oninput=refresh});
    refresh();
    m.querySelector('[data-close]').onclick=()=>m.remove();
    const confirmWith=g=>{
      const ps=getRawProducts(),added=[],lost=[];
      order.lines.forEach((l,i)=>{const units=g[i]*(Number(l.pack)||1);if(!units)return;const raw=ps.find(x=>String(x.id)===String(l.rawId));if(!raw){lost.push(l.name);return}raw.stock=Math.max(0,Number(raw.stock)||0)+units;added.push(l.name+' +'+units)});
      if(added.length&&!writeArray('zipperProductos',ps))return;
      const list=readSupplierOrders(),ix=list.findIndex(o=>o.id===order.id);
      if(ix>=0){list[ix]={...list[ix],status:'recibido',receivedDate:localDate(),receivedAt:new Date().toISOString(),lines:list[ix].lines.map((l,i)=>({...l,received:g[i]}))};saveSupplierOrders(list)}
      m.remove();renderInventory();
      const miss=order.lines.filter((l,i)=>g[i]<l.qty);
      const msg='Stock actualizado: '+(added.join(', ')||'sin cambios')+(miss.length?'. Faltó: '+miss.map(l=>l.name).join(', '):'')+(lost.length?'. No encontrados: '+lost.join(', '):'');
      if($('productStatus'))$('productStatus').textContent=msg;
      if(typeof zipperToast==='function')zipperToast('📦 '+msg);
    };
    m.querySelector('#poAllOk').onclick=()=>confirmWith(order.lines.map(l=>l.qty));
    m.querySelector('#poConfirm').onclick=()=>confirmWith(got());
  }

  // Comparación mes a mes y con el mismo mes del año anterior.
  function renderComparison(){
    const box=$('comparisonOutput');if(!box)return;
    const now=new Date(parse(localDate())),y=now.getFullYear(),m=now.getMonth(),dayOfMonth=now.getDate();
    const sales=getSales().filter(s=>!(s.annulled||s.status==='annulled'));
    const stats=(year,month,uptoDay)=>{let total=0,units=0,count=0;const clients=new Set();sales.forEach(s=>{const d=saleDate(s);const [sy,sm,sd]=d.split('-').map(Number);if(sy===year&&sm===month+1&&(!uptoDay||sd<=uptoDay)){total+=saleTotal(s);count++;clients.add(String(s.clienteId||s.cliente));(s.items||[]).forEach(i=>units+=Number(i.qty)||0)}});return {total,units,count,clients:clients.size}};
    const prev=new Date(y,m-1,1);
    const cur=stats(y,m,dayOfMonth),lastMonthSame=stats(prev.getFullYear(),prev.getMonth(),dayOfMonth),lastYearSame=stats(y-1,m,dayOfMonth);
    const lastMonthFull=stats(prev.getFullYear(),prev.getMonth()),lastYearFull=stats(y-1,m);
    const daysInMonth=new Date(y,m+1,0).getDate();
    const projected=Math.round(cur.total/dayOfMonth*daysInMonth);
    const months=[];for(let k=11;k>=0;k--){const d=new Date(y,m-k,1);const a=stats(d.getFullYear(),d.getMonth()),b=stats(d.getFullYear()-1,d.getMonth());months.push({label:MONTHS[d.getMonth()].slice(0,3)+' '+String(d.getFullYear()).slice(2),a,b})}
    const max=Math.max(1,...months.map(x=>Math.max(x.a.total,x.b.total)));
    box.innerHTML='<div class="pj-compare">'+
      '<div class="pj-cmp-card tile-blue"><span>'+MONTHS[m]+' (hasta el día '+dayOfMonth+')</span><strong>'+money(cur.total)+'</strong><small>'+plural(cur.count,'venta','ventas')+' · '+plural(cur.units,'unidad','unidades')+' · '+plural(cur.clients,'cliente','clientes')+'</small></div>'+
      '<div class="pj-cmp-card tile-violet"><span>vs. '+MONTHS[prev.getMonth()]+' a la misma fecha</span><strong>'+money(lastMonthSame.total)+'</strong><small>'+pctLabel(pct(cur.total,lastMonthSame.total))+' · mes completo '+money(lastMonthFull.total)+'</small></div>'+
      '<div class="pj-cmp-card tile-amber"><span>vs. '+MONTHS[m]+' '+(y-1)+' a la misma fecha</span><strong>'+money(lastYearSame.total)+'</strong><small>'+pctLabel(pct(cur.total,lastYearSame.total))+' · mes completo '+money(lastYearFull.total)+'</small></div>'+
      '<div class="pj-cmp-card tile-green"><span>Proyección de cierre de '+MONTHS[m]+'</span><strong>'+money(projected)+'</strong><small>Si sigues al ritmo actual</small></div></div>'+
      '<h3 class="pj-sub">Últimos 12 meses <span class="pj-legend"><i class="lg-now"></i>Este año <i class="lg-prev"></i>Año anterior</span></h3><div class="pj-bars">'+months.map(x=>'<div class="pj-bar-row"><span class="pj-bar-label">'+x.label+'</span><div class="pj-bar-track"><div class="pj-bar now" style="width:'+(x.a.total/max*100).toFixed(1)+'%"></div><div class="pj-bar prev" style="width:'+(x.b.total/max*100).toFixed(1)+'%"></div></div><span class="pj-bar-value">'+money(x.a.total)+'</span></div>').join('')+'</div>';
  }

  function updateTrendCard(){const card=$('trendCard');if(card)card.hidden=typeof statPeriod!=='undefined'&&statPeriod==='day'}
  function renderProjections(){try{renderComparison();updateTrendCard()}catch(error){console.error('Proyecciones:',error)}}
  window.renderProjections=renderProjections;
  function bind(){
    const original=window.renderCash;
    if(typeof original==='function'&&!original.__withProjections){window.renderCash=function(){const r=original.apply(this,arguments);renderProjections();return r};window.renderCash.__withProjections=true}
    document.addEventListener('click',e=>{if(e.target.closest('#cashView [data-period]'))setTimeout(updateTrendCard,0)});
    const inv=window.renderInventory;
    if(typeof inv==='function'&&!inv.__withOrder){window.renderInventory=function(){const r=inv.apply(this,arguments);try{decorateInventory()}catch(e){console.error('Pedido:',e)}return r};window.renderInventory.__withOrder=true}
    const list=$('inventoryList');
    list?.addEventListener('click',e=>{const strip=e.target.closest('.buy-strip');if(!strip)return;const id=strip.dataset.buyId,input=strip.querySelector('.buy-qty'),v=Number(input.value)||0;if(e.target.closest('.buy-unit'))editBuyUnit(id);else if(e.target.closest('.buy-plus'))setQty(id,v+1);else if(e.target.closest('.buy-minus'))setQty(id,Math.max(0,v-1))});
    list?.addEventListener('change',e=>{const input=e.target.closest('.buy-qty');if(input)setQty(input.closest('.buy-strip').dataset.buyId,input.value)});
    // El pedido de compra parte cerrado y se abre solo cuando se marca; se cierra al salir de Productos.
    $('buyMode')?.addEventListener('change',()=>renderInventory());
    if($('buyMode'))$('buyMode').checked=false;
    try{localStorage.removeItem('zipperPedidoVisible')}catch(_){}
    document.addEventListener('click',e=>{const tab=e.target.closest&&e.target.closest('.tab');if(tab&&tab.id!=='productsTab'&&$('buyMode')?.checked){$('buyMode').checked=false;document.body.classList.remove('buy-mode')}},true);
    // El buscador y el filtro de categoría llaman a la lista original: después se agrega el pedido.
    $('lowStockCategory')?.addEventListener('change',()=>setTimeout(decorateInventory,0));
    $('productSearch')?.addEventListener('input',()=>setTimeout(decorateInventory,0));
    $('buyOnly')?.addEventListener('change',decorateInventory);
    $('buyHorizon')?.addEventListener('change',()=>{const o=readOrder();o.horizon=Number($('buyHorizon').value)||7;saveOrder(o);decorateInventory()});
    $('buyReset')?.addEventListener('click',()=>{if(!confirm('¿Volver a las cantidades sugeridas? Se borran los cambios que hiciste a mano.'))return;const o=readOrder();o.qty={};saveOrder(o);decorateInventory()});
    $('buySend')?.addEventListener('click',sendOrder);
    renderSupplierOrders();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
