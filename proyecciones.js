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
  const ORDER_KEY='zipperPedidoCompraV1';
  function readOrder(){try{const o=JSON.parse(localStorage.getItem(ORDER_KEY)||'{}');return {horizon:Number(o.horizon)||7,margin:o.margin==null?20:Number(o.margin),qty:o.qty&&typeof o.qty==='object'?o.qty:{}}}catch(_){return {horizon:7,margin:20,qty:{}}}}
  function saveOrder(o){try{localStorage.setItem(ORDER_KEY,JSON.stringify(o))}catch(e){console.warn('No se pudo guardar el pedido',e)}}
  // Sugerido por producto: proyección de venta del período + margen − stock actual.
  function suggestions(order){
    const start=parse(localDate()),{units,first}=salesByProduct(),out=new Map();
    units.forEach(u=>{if(!u.p)return;const f=forecast(u.days,start,order.horizon,first);const need=Math.ceil(f.value*(1+order.margin/100));const stock=Math.max(0,Number(u.p.stock)||0);out.set(String(u.p.id),{suggest:Math.max(0,need-stock),forecast:Math.round(f.value),lastYear:f.lastYear,stock})});
    return {map:out,hasYear:Number.isFinite(first)&&first<=start-393*DAY};
  }
  let lastSug=null;
  const orderQty=(order,id)=>{const v=order.qty[id];return v==null?(lastSug?.map.get(id)?.suggest||0):Math.max(0,Number(v)||0)};
  function purchaseStrip(id,order){
    const info=lastSug.map.get(id),q=orderQty(order,id),edited=order.qty[id]!=null;
    const detail=info?('Proyección '+info.forecast+(info.lastYear!=null?' · año pasado '+info.lastYear:'')+(edited&&info.suggest!==q?' · sugerido '+info.suggest:'')):'Sin ventas recientes';
    return '<div class="buy-strip'+(q>0?' has-qty':'')+'" data-buy-id="'+esc(id)+'"><div class="buy-info"><strong>🛒 Comprar</strong><small>'+esc(detail)+'</small></div><div class="buy-stepper"><button type="button" class="buy-minus" aria-label="Restar">−</button><input class="buy-qty" type="number" min="0" step="1" inputmode="numeric" value="'+q+'" aria-label="Unidades a comprar"><button type="button" class="buy-plus" aria-label="Sumar">+</button></div></div>';
  }
  function orderRows(order){
    const cat=$('lowStockCategory')?.value||'';
    return getProducts().filter(p=>!cat||String(p.category||'Otros').trim()===cat).map(p=>({p,q:orderQty(order,String(p.id))})).filter(x=>x.q>0).sort((a,b)=>String(a.p.name).localeCompare(String(b.p.name),'es'));
  }
  function renderOrderSummary(order){
    const box=$('buySummary');if(!box)return;
    const rows=orderRows(order),units=rows.reduce((a,x)=>a+x.q,0),cost=rows.reduce((a,x)=>a+x.q*(Number(x.p.pricePurchase)||0),0),cat=$('lowStockCategory')?.value||'';
    box.innerHTML='<div class="buy-totals"><span><b>'+rows.length+'</b>'+(rows.length===1?'producto':'productos')+'</span><span><b>'+units+'</b>unidades</span><span><b>'+money(cost)+'</b>costo aprox.</span></div><p class="buy-scope">'+(cat?'Pedido de <b>'+esc(cat)+'</b>':'Pedido de <b>todas las categorías</b> · elige una categoría arriba para el pedido de un proveedor')+'</p>';
    const send=$('buySend');if(send){send.disabled=!rows.length;send.textContent=cat?'📤 Enviar pedido a '+cat:'📤 Enviar pedido'}
  }
  function decorateInventory(){
    const list=$('inventoryList');if(!list)return;
    const order=readOrder();
    if($('buyHorizon'))$('buyHorizon').value=String(order.horizon);
    if($('buyMargin'))$('buyMargin').value=String(order.margin);
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
  function sendOrder(){
    const order=readOrder(),rows=orderRows(order),cat=$('lowStockCategory')?.value||'';
    if(!rows.length)return;
    const text='Pedido Distribuidora Zipper'+(cat?' · '+cat:'')+'\n'+localDate()+'\n\n'+rows.map(x=>'• '+x.p.name+': '+x.q).join('\n')+'\n\nTotal: '+rows.reduce((a,x)=>a+x.q,0)+' unidades';
    const done=()=>{if(typeof zipperToast==='function')zipperToast('📋 Pedido copiado. Pégalo en WhatsApp al proveedor.')};
    if(navigator.share){navigator.share({text}).catch(err=>{if(err?.name!=='AbortError')copyText(text,done)})}else copyText(text,done);
  }
  function copyText(text,done){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>prompt('Copia el pedido:',text));else prompt('Copia el pedido:',text)}

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
    list?.addEventListener('click',e=>{const strip=e.target.closest('.buy-strip');if(!strip)return;const id=strip.dataset.buyId,input=strip.querySelector('.buy-qty'),v=Number(input.value)||0;if(e.target.closest('.buy-plus'))setQty(id,v+1);else if(e.target.closest('.buy-minus'))setQty(id,Math.max(0,v-1))});
    list?.addEventListener('change',e=>{const input=e.target.closest('.buy-qty');if(input)setQty(input.closest('.buy-strip').dataset.buyId,input.value)});
    $('buyMode')?.addEventListener('change',()=>{localStorage.setItem('zipperPedidoVisible',$('buyMode').checked?'1':'0');renderInventory()});
    if($('buyMode'))$('buyMode').checked=localStorage.getItem('zipperPedidoVisible')==='1';
    // El buscador y el filtro de categoría llaman a la lista original: después se agrega el pedido.
    $('lowStockCategory')?.addEventListener('change',()=>setTimeout(decorateInventory,0));
    $('productSearch')?.addEventListener('input',()=>setTimeout(decorateInventory,0));
    $('buyOnly')?.addEventListener('change',decorateInventory);
    $('buyHorizon')?.addEventListener('change',()=>{const o=readOrder();o.horizon=Number($('buyHorizon').value)||7;saveOrder(o);decorateInventory()});
    $('buyMargin')?.addEventListener('change',()=>{const o=readOrder();o.margin=Number($('buyMargin').value)||0;saveOrder(o);decorateInventory()});
    $('buyReset')?.addEventListener('click',()=>{if(!confirm('¿Volver a las cantidades sugeridas? Se borran los cambios que hiciste a mano.'))return;const o=readOrder();o.qty={};saveOrder(o);decorateInventory()});
    $('buySend')?.addEventListener('click',sendOrder);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
