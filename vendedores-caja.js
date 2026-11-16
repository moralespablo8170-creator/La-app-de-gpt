// Caja diaria → "Entregas de vendedores": control aparte, NO suma en la caja del dueño.
// Muestra por vendedor lo que falta entregar y lo entregado en el período, y permite
// marcar cada pedido como entregado y pagado (eligiendo cómo pagó el cliente) o rechazado.
(function(){
  const NAMES_KEY='zipperNombresVendedores';
  const $=id=>document.getElementById(id);
  let names={};try{names=JSON.parse(localStorage.getItem(NAMES_KEY)||'{}')||{}}catch(_){names={}}
  let loadingNames=false;
  async function loadNames(){
    if(loadingNames||localStorage.getItem('zipperStorageMode')!=='cloud'||typeof window.zipperFirebaseCloud?.listMembers!=='function')return;
    loadingNames=true;
    try{const list=await window.zipperFirebaseCloud.listMembers();const next={};(list||[]).forEach(m=>{if(m.role==='seller')next[m.uid]=m.displayName||m.email||'Vendedor'});names=next;localStorage.setItem(NAMES_KEY,JSON.stringify(names));render()}catch(e){console.warn('Nombres de vendedores:',e)}
    finally{loadingNames=false}
  }
  const sellerName=uid=>names[uid]||'Vendedor';
  const payText=m=>m==='transfer'?'Transferencia':'Efectivo';
  function render(){
    const box=$('sellerCashBox');if(!box)return;
    const all=getSales().filter(isSellerSale);
    if(!all.length){box.innerHTML='';return}
    const range=typeof cashRangeDates==='function'?cashRangeDates():{start:localDate(),end:localDate()};
    const inRange=d=>d>=range.start&&d<=range.end;
    const waiting=all.filter(s=>s.collectionStatus==='awaiting_delivery');
    const done=all.filter(s=>s.collectionStatus==='collected'&&inRange(String(s.collectedAt||saleDate(s)).slice(0,10)));
    const rejected=all.filter(s=>s.collectionStatus==='delivery_rejected');
    const uids=[...new Set([...waiting,...done,...rejected].map(s=>String(s.sellerUid||'')))];
    if(!uids.length){box.innerHTML='';return}
    box.innerHTML='<section class="seller-cash"><div class="seller-cash-head"><strong>🧑‍💼 ENTREGAS DE VENDEDORES</strong><small>Control aparte · no suma en tu caja</small></div>'+uids.map(uid=>{
      const rj=rejected.filter(s=>String(s.sellerUid)===uid);
      const w=waiting.filter(s=>String(s.sellerUid)===uid).sort((a,b)=>saleDate(a).localeCompare(saleDate(b))),d=done.filter(s=>String(s.sellerUid)===uid);
      const cash=d.filter(s=>paymentMethodOf(s)!=='transfer').reduce((a,s)=>a+saleTotal(s),0),transfer=d.filter(s=>paymentMethodOf(s)==='transfer').reduce((a,s)=>a+saleTotal(s),0);
      return '<div class="seller-cash-block"><div class="seller-cash-name">'+esc(sellerName(uid))+'</div>'+
        '<div class="seller-cash-totals"><div><b>'+money(w.reduce((a,s)=>a+saleTotal(s),0))+'</b><small>'+w.length+' por entregar</small></div><div><b>'+money(cash)+'</b><small>efectivo entregado</small></div><div><b>'+money(transfer)+'</b><small>transferencias</small></div></div>'+
        (w.length?w.map(s=>'<article class="seller-cash-row"><div><strong>'+esc(s.cliente||clientById(s.clienteId)?.name||'Cliente')+' · '+money(saleTotal(s))+'</strong><span>Pedido #'+esc(s.folio||'')+' · '+esc(historyNiceDate?historyNiceDate(saleDate(s)):saleDate(s))+' · '+(s.items||[]).length+' productos</span></div><label class="seller-cash-pay">Pagó con<select data-pay="'+esc(String(s.id))+'"><option value="cash"'+(paymentMethodOf(s)!=='transfer'?' selected':'')+'>Efectivo</option><option value="transfer"'+(paymentMethodOf(s)==='transfer'?' selected':'')+'>Transferencia</option></select></label><div class="actions-small"><button class="secondary seller-cash-ticket" data-id="'+esc(String(s.id))+'" type="button">🧾 Ver</button><button class="primary seller-cash-ok" data-id="'+esc(String(s.id))+'" type="button">✅ Entregado y pagado</button><button class="secondary seller-cash-no" data-id="'+esc(String(s.id))+'" type="button">✖ Rechazado</button></div></article>').join(''):'<p class="muted">Sin pedidos por entregar.</p>')+
        (rj.length?'<div class="seller-cash-rej"><strong>✖ Rechazados por el repartidor ('+rj.length+')</strong>'+rj.map(s=>'<article class="seller-cash-row"><div><strong>'+esc(s.cliente||'Cliente')+' · '+money(saleTotal(s))+'</strong><span>'+esc(s.deliveryNote||'Sin motivo')+' · '+esc(s.deliveredByName||'Repartidor')+'</span></div><div class="actions-small"><button class="primary seller-cash-no" data-id="'+esc(String(s.id))+'" type="button">Anular (vuelve el stock)</button><button class="secondary seller-cash-retry" data-id="'+esc(String(s.id))+'" type="button">↺ Repartir otra vez</button></div></article>').join('')+'</div>':'')+
        (d.length?'<details class="seller-cash-done"><summary>Entregados en este período ('+d.length+')</summary>'+d.map(s=>'<div>'+esc(s.cliente||'Cliente')+' · '+money(saleTotal(s))+' · '+payText(paymentMethodOf(s))+(s.paymentMethodOriginal&&s.paymentMethodOriginal!==paymentMethodOf(s)?' (cambió de '+payText(s.paymentMethodOriginal)+')':'')+(s.deliveredByName?' · entregó '+esc(s.deliveredByName):'')+'</div>').join('')+'</details>':'')+'</div>';
    }).join('')+'</section>';
    box.querySelectorAll('.seller-cash-ok').forEach(b=>b.onclick=()=>{const sel=box.querySelector('[data-pay="'+CSS.escape(b.dataset.id)+'"]');markDeliverySaleCollected(b.dataset.id,sel?.value)});
    box.querySelectorAll('.seller-cash-no').forEach(b=>b.onclick=()=>annulSale(b.dataset.id));
    box.querySelectorAll('.seller-cash-retry').forEach(b=>b.onclick=()=>{const rows=getSales(),s=rows.find(x=>String(x.id)===String(b.dataset.id));if(!s)return;s.collectionStatus='awaiting_delivery';['deliveredBy','deliveredByName','deliveredAt','deliveryNote'].forEach(k=>delete s[k]);if(writeArray('zipperComprobantes',rows))renderCash()});
    box.querySelectorAll('.seller-cash-ticket').forEach(b=>b.onclick=()=>{const sale=getSales().find(x=>String(x.id)===String(b.dataset.id));if(sale&&typeof openReceiptPreview==='function'){renderPrint(sale);openReceiptPreview()}});
    if(uids.some(u=>!names[u]))loadNames();
  }
  window.zipperSellerCash={render,sellerName};
  function wrap(){const fn=window.renderCash;if(typeof fn!=='function'||fn.__withSellerCash)return;window.renderCash=function(){const r=fn.apply(this,arguments);try{render()}catch(e){console.error('Entregas vendedores:',e)}return r};window.renderCash.__withSellerCash=true;loadNames()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(wrap,0),{once:true});else setTimeout(wrap,0);
})();
