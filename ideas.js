// Ayudas de venta:
// - Carrito: "Lo que suele llevar" el cliente, para agregarlo con un toque.
// - Historial → Sin comprar: clientes que compraban y dejaron de hacerlo.
// Solo leen ventas y clientes; agregar al carrito usa las mismas reglas de stock del carrito.
(function(){
  const DAY=86400000;
  const parse=v=>{const [y,m,d]=String(v||'').slice(0,10).split('-').map(Number);return y?new Date(y,(m||1)-1,d||1,12).getTime():NaN};
  const daysSince=v=>{const t=parse(v);return Number.isFinite(t)?Math.max(0,Math.round((parse(localDate())-t)/DAY)):null};
  const live=s=>!(s.annulled||s.status==='annulled');
  const clientSales=id=>getSales().filter(s=>live(s)&&String(s.clienteId)===String(id)).sort((a,b)=>saleDate(b).localeCompare(saleDate(a))||Number(b.folio||0)-Number(a.folio||0));
  const niceDate=d=>typeof historyNiceDate==='function'?historyNiceDate(d):d;

  // ===== Pedido sugerido en el carrito =====
  function suggestedFor(clientId){
    const sales=clientSales(clientId).filter(s=>!editingSaleId||String(s.id)!==String(editingSaleId)).slice(0,4);
    if(!sales.length)return {items:[],sales:0};
    const map=new Map();
    sales.forEach(s=>{const seen=new Set();(s.items||[]).forEach(i=>{const p=productById(i.productId)||productById(i.baseProductId);if(!p)return;const k=String(p.id);if(!map.has(k))map.set(k,{p,times:0,qty:0});const e=map.get(k);e.qty+=Number(i.qty)||0;if(!seen.has(k)){e.times++;seen.add(k)}})});
    const min=sales.length>=2?2:1;
    const items=[...map.values()].filter(e=>e.times>=min).map(e=>({p:e.p,times:e.times,qty:Math.max(1,Math.round(e.qty/e.times))})).sort((a,b)=>b.times-a.times||String(a.p.name).localeCompare(String(b.p.name),'es')).slice(0,12);
    return {items,sales:sales.length,last:saleDate(sales[0])};
  }
  function inCartQty(p){const k=String(p.baseProductId||p.id);return cart.reduce((a,x)=>{const q=productById(x.productId);return a+(q&&String(q.baseProductId||q.id)===k?Number(x.qty||0):0)},0)}
  function addToCart(p,qty){
    const fresh=productById(p.id);if(!fresh||qty<1)return 'missing';
    if(qty+inCartQty(fresh)>availableCartStock(fresh))return 'stock';
    const existing=cart.find(i=>String(i.productId)===String(fresh.id));
    if(existing)existing.qty+=qty;else cart.push({productId:fresh.id,qty});
    return 'ok';
  }
  // Desactivado a pedido (quitaba pantalla en el carrito). Para volver a mostrarlo, poner SHOW_SUGGESTED=true.
  const SHOW_SUGGESTED=false;
  function renderSuggested(){
    if(!SHOW_SUGGESTED){const b=$('cartSuggested');if(b)b.remove();return}
    const section=$('cartSection');if(!section||section.classList.contains('hidden')||!selectedClientId)return;
    let box=$('cartSuggested');
    if(!box){box=document.createElement('div');box.id='cartSuggested';box.className='cart-suggested';section.querySelector('.cart-search-box')?.before(box)}
    const {items,sales,last}=suggestedFor(selectedClientId);
    if(!items.length){box.innerHTML='';box.hidden=true;return}
    box.hidden=false;
    const open=box.dataset.open!=='0';
    const rows=items.map((x,i)=>{const inCart=cart.some(c=>String(c.productId)===String(x.p.id));const stock=Math.max(0,Number(productById(x.p.id)?.stock)||0);return '<div class="sug-row'+(inCart?' in-cart':'')+'"><div><strong>'+esc(x.p.name)+'</strong><small>Lleva ~'+x.qty+' · en '+x.times+' de '+sales+' compras · stock '+stock+'</small></div>'+(inCart?'<span class="sug-ok">✓ En el carrito</span>':stock<=0?'<span class="sug-none">Sin stock</span>':'<button type="button" class="sug-add" data-i="'+i+'">+ '+Math.min(x.qty,stock)+'</button>')+'</div>'}).join('');
    box.innerHTML='<button type="button" class="sug-toggle" aria-expanded="'+open+'"><span>🔁 Lo que suele llevar</span><small>'+plural(items.length,'producto','productos')+' · última compra '+esc(niceDate(last))+'</small><b>'+(open?'▲':'▼')+'</b></button>'+(open?'<div class="sug-list">'+rows+'</div><button type="button" class="sug-all primary wide">＋ Agregar todo lo sugerido</button><p class="sug-msg" aria-live="polite"></p>':'');
    box.querySelector('.sug-toggle').onclick=()=>{box.dataset.open=open?'0':'1';renderSuggested()};
    const msg=t=>{const m=box.querySelector('.sug-msg');if(m)m.textContent=t};
    box.querySelectorAll('.sug-add').forEach(b=>b.onclick=()=>{const x=items[Number(b.dataset.i)],stock=Math.max(0,Number(productById(x.p.id)?.stock)||0),r=addToCart(x.p,Math.min(x.qty,stock));if(r==='ok')renderCart();else msg(r==='stock'?'Stock insuficiente para '+x.p.name+'.':'Producto no encontrado.')});
    const all=box.querySelector('.sug-all');
    if(all)all.onclick=()=>{let added=0;const skipped=[];items.forEach(x=>{if(cart.some(c=>String(c.productId)===String(x.p.id)))return;const stock=Math.max(0,Number(productById(x.p.id)?.stock)||0);const q=Math.min(x.qty,stock);if(q<1){skipped.push(x.p.name);return}addToCart(x.p,q)==='ok'?added++:skipped.push(x.p.name)});renderCart();msg((added?plural(added,'producto agregado','productos agregados'):'Nada nuevo para agregar')+(skipped.length?'. Sin stock: '+skipped.join(', '):'')+'. Revisa las cantidades en la bandeja.')};
  }

  // ===== Clientes que dejaron de comprar =====
  const LOST_DAYS=21;
  function lostClients(){
    const byClient=new Map();
    getSales().filter(live).forEach(s=>{const k=String(s.clienteId||'');if(!k)return;if(!byClient.has(k))byClient.set(k,[]);byClient.get(k).push(s)});
    const out=[];
    getClients().filter(c=>c.active!==false).forEach(c=>{
      const list=(byClient.get(String(c.id))||[]).sort((a,b)=>saleDate(a).localeCompare(saleDate(b)));
      if(list.length<2)return; // solo clientes que ya compraban
      const dates=[...new Set(list.map(saleDate))];
      const last=dates[dates.length-1],days=daysSince(last);
      const span=(parse(last)-parse(dates[0]))/DAY,every=dates.length>1?Math.max(1,Math.round(span/(dates.length-1))):null;
      const limit=Math.max(LOST_DAYS,every?every*2:0);
      if(days==null||days<limit)return;
      const total=list.reduce((a,s)=>a+saleTotal(s),0);
      out.push({c,last,days,every,count:list.length,avg:Math.round(total/list.length)});
    });
    return out.sort((a,b)=>b.avg*b.count-a.avg*a.count||b.days-a.days);
  }
  function lostText(x){return 'Hola '+x.c.name+', le saluda *Distribuidora Zipper*. Hace un tiempo que no le visitamos con pedido: ¿necesita algo para esta semana? Quedamos atentos. ¡Saludos!'}
  function renderLost(){
    if(typeof historyType==='undefined'||historyType!=='lost')return;
    const out=$('historyOutput');if(!out)return;
    const list=lostClients();
    out.innerHTML=list.length?'<p class="muted lost-intro">Clientes que compraban seguido y llevan más de '+LOST_DAYS+' días (o el doble de lo habitual) sin comprar. Los primeros son los que más compraban.</p>'+list.map((x,i)=>'<article class="history-row lost-row'+(x.days>60?' lost-old':'')+'"><div><strong>'+esc(x.c.name)+'</strong><span>Última compra: '+esc(niceDate(x.last))+' · hace '+x.days+' días</span><span>'+plural(x.count,'compra','compras')+(x.every?' · compraba cada ~'+x.every+' días':'')+' · ticket promedio '+money(x.avg)+'</span><span>'+esc([x.c.address,x.c.routeWeek&&x.c.routeDay?'Sem '+x.c.routeWeek+' · '+x.c.routeDay:''].filter(Boolean).join(' · '))+'</span></div><div class="actions-small"><button class="wa-btn lost-wa" data-i="'+i+'" type="button">📲 Escribir</button><button class="secondary lost-sell" data-i="'+i+'" type="button">🛒 Vender</button></div></article>').join(''):'<p class="muted empty-state">🎉 Ningún cliente habitual ha dejado de comprar.</p>';
    out.querySelectorAll('.lost-wa').forEach(b=>b.onclick=()=>{const x=list[Number(b.dataset.i)],phone=window.zipperWhatsApp?.waPhone(x.c)||'',url='https://wa.me/'+phone+'?text='+encodeURIComponent(lostText(x));const w=window.open(url,'_blank');if(!w)location.href=url});
    out.querySelectorAll('.lost-sell').forEach(b=>b.onclick=()=>{const x=list[Number(b.dataset.i)];document.getElementById('homeTab')?.click();setTimeout(()=>openClientCart(x.c.id),50)});
  }

  window.zipperIdeas={suggestedFor,lostClients};
  function wrap(name,after,flag){const fn=window[name];if(typeof fn!=='function'||fn[flag])return;window[name]=function(){const r=fn.apply(this,arguments);try{after()}catch(e){console.error('Ideas:',e)}return r};window[name][flag]=true}
  function bind(){wrap('renderCart',renderSuggested,'__withSuggested');wrap('renderHistory',renderLost,'__withLost')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else setTimeout(bind,0);
})();
