// Envío por WhatsApp: ticket al guardar la venta, desde "Ver ticket" y recordatorio de pago.
// Solo arma el mensaje y abre WhatsApp: no modifica ventas, stock ni clientes.
(function(){
  // Teléfono guardado como 569XXXXXXXX (o solo los 8 dígitos). Devuelve '' si no sirve.
  function waPhone(client){
    let d=String(client?.phone||'').replace(/\D/g,'');
    if(d.length===8)d='569'+d;
    if(d.length===9&&d.startsWith('9'))d='56'+d;
    return /^569\d{8}$/.test(d)?d:'';
  }
  const pesos=v=>typeof money==='function'?money(v):'$'+Math.round(Number(v)||0).toLocaleString('es-CL');
  function payText(sale){
    if(sale.collectionStatus==='awaiting_delivery')return 'Cobro al entregar';
    if(sale.paymentStatus==='pending'||sale.paymentMethod==='pending')return 'Pendiente de pago';
    return sale.paymentMethod==='transfer'?'Transferencia':'Efectivo';
  }
  function debtOf(client){try{return client&&typeof clientDebt==='function'?Math.max(0,Number(clientDebt(client.id))||0):0}catch(_){return 0}}

  function saleText(sale){
    const client=typeof clientById==='function'?clientById(sale.clienteId):null;
    const lines=(sale.items||[]).map(i=>{const q=Number(i.qty)||0,p=Number(i.price)||0;return '• '+q+' x '+(i.desc||'Producto')+(i.promotion?' (oferta)':'')+' — '+pesos(Math.round(q*p))});
    const debt=debtOf(client);
    return ['*Distribuidora Zipper*','Comprobante #'+sale.folio+' · '+sale.fecha,'Cliente: '+(sale.cliente||client?.name||''),'',...lines,'','*TOTAL: '+pesos(saleTotal(sale))+'*','Pago: '+payText(sale)]
      .concat(debt>0?['Saldo pendiente total: '+pesos(debt)]:[])
      .concat(['','¡Gracias por su compra!']).join('\n');
  }
  function reminderText(client,debt){
    return ['Hola '+(client?.name||'')+', le saluda *Distribuidora Zipper*.','Le recordamos que tiene un saldo pendiente de *'+pesos(debt)+'*.','Puede pagarlo en la próxima visita o por transferencia.','¡Muchas gracias!'].join('\n');
  }
  function open(phone,text){
    const url='https://wa.me/'+(phone||'')+'?text='+encodeURIComponent(text);
    const win=window.open(url,'_blank');
    if(!win)location.href=url;
  }
  function sendSale(sale){
    if(!sale)return;
    const client=typeof clientById==='function'?clientById(sale.clienteId):null;
    open(waPhone(client),saleText(sale));
  }
  function buttonLabel(client){const p=waPhone(client);return p?'📲 Enviar por WhatsApp a '+p.slice(3,7)+' '+p.slice(7):'📲 Enviar por WhatsApp (elegir contacto)'}

  // Aviso después de guardar la venta.
  function showSaved(sale){
    if(!sale)return;
    const client=typeof clientById==='function'?clientById(sale.clienteId):null;
    let box=document.getElementById('saleSavedWhatsApp');
    if(!box){box=document.createElement('div');box.id='saleSavedWhatsApp';box.className='wa-saved hidden';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');document.body.appendChild(box)}
    box.innerHTML='<div class="wa-saved-card"><div class="wa-saved-check">✅</div><h3>Venta guardada</h3><p><strong>'+esc(sale.cliente||'')+'</strong><br>Folio #'+esc(sale.folio)+' · '+esc(pesos(saleTotal(sale)))+' · '+esc(payText(sale))+'</p>'+
      (waPhone(client)?'':'<p class="wa-saved-note">Este cliente no tiene teléfono guardado: WhatsApp te pedirá elegir el contacto.</p>')+
      '<button id="waSavedSend" class="wa-btn wide" type="button">'+esc(buttonLabel(client))+'</button><button id="waSavedClose" class="secondary wide" type="button">Listo</button></div>';
    box.classList.remove('hidden');
    const close=()=>box.classList.add('hidden');
    box.querySelector('#waSavedSend').onclick=()=>{sendSale(sale);close()};
    box.querySelector('#waSavedClose').onclick=close;
  }

  // Botón WhatsApp dentro de "Ver ticket".
  function addReceiptButton(){
    const actions=document.querySelector('#receiptPrintModal .actions');
    if(!actions||document.getElementById('receiptWhatsApp'))return;
    const b=document.createElement('button');b.id='receiptWhatsApp';b.type='button';b.className='wa-btn';b.textContent='📲 WhatsApp';
    b.onclick=()=>{if(typeof preparedReceipt!=='undefined'&&preparedReceipt)sendSale(preparedReceipt)};
    actions.insertBefore(b,document.getElementById('receiptPrintNow'));
  }

  // Botón "Recordar pago" en Historial → Pendientes.
  function decoratePending(){
    if(typeof historyType==='undefined'||historyType!=='pending')return;
    document.querySelectorAll('#historyOutput .pending-row').forEach(row=>{
      if(row.querySelector('.wa-remind'))return;
      const id=row.querySelector('.mark-paid')?.dataset.id;const sale=getSales().find(s=>String(s.id)===String(id));if(!sale)return;
      const client=clientById(sale.clienteId),debt=debtOf(client);if(!client||debt<=0)return;
      const b=document.createElement('button');b.type='button';b.className='wa-btn wa-remind';b.textContent='📲 Recordar pago';
      b.onclick=()=>open(waPhone(client),reminderText(client,debt));
      row.querySelector('.actions-small')?.appendChild(b);
    });
  }

  window.zipperWhatsApp={waPhone,saleText,sendSale,showSaved};
  function bind(){
    addReceiptButton();
    const original=window.renderHistory;
    if(typeof original==='function'&&!original.__withWhatsApp){window.renderHistory=function(){const r=original.apply(this,arguments);try{decoratePending()}catch(e){console.error('WhatsApp:',e)}return r};window.renderHistory.__withWhatsApp=true}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
