// Envío por WhatsApp: ticket al guardar la venta, desde "Ver ticket" y recordatorio de pago.
// Solo arma el mensaje y abre WhatsApp: no modifica ventas, stock ni clientes.
(function(){
  // Teléfono guardado como 569XXXXXXXX (o solo los 8 dígitos). Devuelve '' si no sirve.
  function waPhone(client){
    let d=String(client?.phone||client?.telefono||client?.celular||client?.whatsapp||'').replace(/\D/g,'');
    if(d.startsWith('00'))d=d.slice(2);
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
    const phone=waPhone(client);
    if(phone){open(phone,saleText(sale));return}
    askPhone(client,sale);
  }
  // Cliente sin teléfono válido: se pide el número, se puede guardar en la ficha y se envía directo.
  function askPhone(client,sale){
    document.getElementById('waAskPhone')?.remove();
    const m=document.createElement('div');m.id='waAskPhone';m.className='po-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
    m.innerHTML='<div class="po-card"><h3>📲 WhatsApp de '+esc(client?.name||sale.cliente||'cliente')+'</h3><p class="muted">Este cliente no tiene un celular válido guardado'+(client?.phone?' (tiene: '+esc(client.phone)+')':'')+'. Escríbelo para enviarle el ticket directo.</p><label>Celular<input id="waAskInput" type="tel" inputmode="numeric" maxlength="15" value="569 "></label><label class="check-row"><input id="waAskSave" type="checkbox" checked> Guardar este número en la ficha del cliente</label><p id="waAskError" class="po-info po-miss"></p><div class="po-receive-actions"><button id="waAskSend" class="wa-btn wide" type="button">📲 Enviar al número</button><button id="waAskPick" class="secondary wide" type="button">Elegir contacto en WhatsApp</button><button class="ghost wide" type="button" data-close>Cancelar</button></div></div>';
    document.body.appendChild(m);
    const input=m.querySelector('#waAskInput');setTimeout(()=>{input.focus();input.setSelectionRange(input.value.length,input.value.length)},50);
    m.querySelector('[data-close]').onclick=()=>m.remove();
    m.querySelector('#waAskPick').onclick=()=>{m.remove();open('',saleText(sale))};
    m.querySelector('#waAskSend').onclick=()=>{
      const phone=waPhone({phone:input.value});
      if(!phone){m.querySelector('#waAskError').textContent='Número incompleto: deben ser 8 dígitos después de 569.';input.focus();return}
      if(client&&m.querySelector('#waAskSave').checked){
        try{const rows=readArray('zipperClientes'),row=rows.find(x=>String(x.id)===String(client.id));if(row){row.phone=phone;writeArray('zipperClientes',rows)}}catch(e){console.warn('No se pudo guardar el teléfono',e)}
      }
      m.remove();open(phone,saleText(sale));
    };
  }

  // Botón WhatsApp dentro de "Ver ticket".
  function addReceiptButton(){
    const actions=document.querySelector('#receiptPrintModal .actions');
    if(!actions||document.getElementById('receiptWhatsApp'))return;
    const b=document.createElement('button');b.id='receiptWhatsApp';b.type='button';b.className='wa-btn';b.textContent='📲 WhatsApp';
    b.onclick=()=>{if(typeof preparedReceipt!=='undefined'&&preparedReceipt)sendSale(preparedReceipt)};
    actions.insertBefore(b,document.getElementById('receiptPrintNow'));
  }

  window.zipperWhatsApp={waPhone,saleText,sendSale};
  function bind(){
    addReceiptButton();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
