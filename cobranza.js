// Cobranza y recordatorio de respaldo.
// - Por cliente: deuda, días desde la compra fiada más antigua que sigue sin pagar y aviso por WhatsApp.
// - En Inicio: avisos para el dueño (deudas atrasadas y respaldo semanal).
// Solo lee ventas y abonos; lo único que guarda es la fecha del último aviso y del último respaldo.
(function(){
  const DAY=86400000;
  const AVISOS_KEY='zipperCobranzaAvisos';        // {clienteId: 'AAAA-MM-DD'}
  const BACKUP_KEY='zipperRespaldoUltimaFecha';   // excluida de los respaldos por su prefijo
  const BACKUP_SNOOZE_KEY='zipperRespaldoPosponer';
  const BACKUP_EVERY=7;
  const parse=v=>{const [y,m,d]=String(v||'').slice(0,10).split('-').map(Number);return y?new Date(y,(m||1)-1,d||1,12).getTime():NaN};
  const daysSince=v=>{const t=parse(v);return Number.isFinite(t)?Math.max(0,Math.round((parse(localDate())-t)/DAY)):0};
  const readJSON=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v??f}catch(_){return f}};
  const niceDate=d=>typeof historyNiceDate==='function'?historyNiceDate(d):d;

  // Niveles de atraso (días desde la compra fiada más antigua sin pagar).
  function level(days){
    if(days>30)return {key:'red',label:'Muy atrasado'};
    if(days>15)return {key:'orange',label:'Atrasado'};
    if(days>7)return {key:'amber',label:'Por vencer'};
    return {key:'green',label:'Al día'};
  }

  // Ventas fiadas que siguen abiertas, pagando primero las más antiguas.
  function openSales(clientId){
    const ledger=typeof currentDebtLedger==='function'?currentDebtLedger(clientId):[];
    let paid=ledger.filter(e=>e.kind==='payment').reduce((a,e)=>a+e.amount,0);
    const sales=getSales();
    const out=[];
    ledger.filter(e=>e.kind==='sale').forEach(e=>{
      const due=Math.max(0,e.amount-paid);paid=Math.max(0,paid-e.amount);
      if(due>0){const s=sales.find(x=>String(x.id)===e.saleId);out.push({date:e.date,due,total:e.amount,folio:s?.folio,saleId:e.saleId})}
    });
    return out;
  }
  function debtors(){
    const avisos=readJSON(AVISOS_KEY,{});
    return debtClients().map(d=>{
      const open=openSales(d.id),oldest=open[0]?.date||'',days=oldest?daysSince(oldest):0;
      return {...d,client:clientById(d.id),open,oldest,days,level:level(days),lastNotice:avisos[d.id]||''};
    }).sort((a,b)=>b.days-a.days||b.debt-a.debt);
  }

  function reminderText(x){
    const name=x.client?.name||x.name;
    const lines=x.open.map(o=>'• '+niceDate(o.date)+(o.folio?' · ticket #'+o.folio:'')+': '+money(o.due));
    return ['Hola '+name+', le saluda *Distribuidora Zipper*. Nos contactamos con Ud. para recordarle que tiene un saldo pendiente de *'+money(x.debt)+'*.',
      '',...lines,'',
      'Quedamos atentos a sus comentarios. De antemano, ¡muchas gracias!','Saludos.'].join('\n');
  }
  function sendReminder(x){
    const phone=window.zipperWhatsApp?.waPhone(x.client)||'';
    const url='https://wa.me/'+phone+'?text='+encodeURIComponent(reminderText(x));
    const avisos=readJSON(AVISOS_KEY,{});avisos[x.id]=localDate();
    try{localStorage.setItem(AVISOS_KEY,JSON.stringify(avisos))}catch(_){}
    const win=window.open(url,'_blank');if(!win)location.href=url;
    setTimeout(()=>{if(typeof renderHistory==='function')renderHistory()},300);
  }

  // Lista de cobranza en Historial → Por cobrar.
  function renderCollection(){
    if(typeof historyType==='undefined'||historyType!=='pending')return;
    const out=$('historyOutput');if(!out)return;
    const list=debtors();
    out.querySelector('.cobranza')?.remove();
    out.querySelectorAll('.wa-remind').forEach(b=>b.remove());
    // Solo los clientes que aún deben: el detalle de tickets antiguos ya está en Historial → Ventas.
    out.innerHTML='';
    if(!list.length){out.innerHTML='<p class="muted empty-state">🎉 Ningún cliente te debe.</p>';return}
    const late=list.filter(x=>x.days>15);
    const box=document.createElement('section');box.className='cobranza';
    box.innerHTML='<div class="cobranza-head"><h3>💰 Cobranza por cliente</h3><span>'+plural(list.length,'cliente','clientes')+' · '+money(list.reduce((a,x)=>a+x.debt,0))+(late.length?' · <b>'+late.length+' con más de 15 días</b>':'')+'</span></div>'+
      list.map((x,i)=>'<article class="cobranza-row lvl-'+x.level.key+'"><div class="cobranza-main"><strong>'+esc(x.client?.name||x.name)+'</strong><span class="cobranza-badge">'+(x.days?x.days+(x.days===1?' día':' días'):'Hoy')+' · '+x.level.label+'</span><small>'+plural(x.open.length,'compra pendiente','compras pendientes')+(x.oldest?' · desde '+esc(niceDate(x.oldest)):'')+(x.lastNotice?' · último aviso '+esc(x.lastNotice===localDate()?'hoy':'hace '+daysSince(x.lastNotice)+' días'):'')+'</small></div><div class="cobranza-side"><strong>'+money(x.debt)+'</strong><button class="wa-btn cobranza-wa" data-i="'+i+'" type="button">📲 Recordar</button><button class="secondary cobranza-pay" data-i="'+i+'" type="button">Abonar</button></div></article>').join('')+
      '';
    out.appendChild(box);
    box.querySelectorAll('.cobranza-wa').forEach(b=>b.onclick=()=>sendReminder(list[Number(b.dataset.i)]));
    box.querySelectorAll('.cobranza-pay').forEach(b=>b.onclick=()=>{if(typeof addDebtPayment==='function')addDebtPayment(list[Number(b.dataset.i)].id)});
  }

  // ===== Avisos en Inicio =====
  function lastBackup(){return localStorage.getItem(BACKUP_KEY)||''}
  function markBackup(){try{localStorage.setItem(BACKUP_KEY,localDate());localStorage.removeItem(BACKUP_SNOOZE_KEY)}catch(_){};renderAlerts()}
  function renderAlerts(){
    const box=$('homeAlerts');if(!box)return;
    const parts=[];
    // Respaldo semanal
    const last=lastBackup(),age=last?daysSince(last):null,snooze=localStorage.getItem(BACKUP_SNOOZE_KEY)||'';
    if((age===null||age>=BACKUP_EVERY)&&snooze!==localDate()){
      parts.push('<div class="home-alert alert-backup"><div><strong>💾 Toca guardar el respaldo semanal</strong><span>'+(last?'El último fue hace '+age+' días ('+esc(niceDate(last))+').':'Todavía no hay un respaldo registrado en este teléfono.')+'</span></div><div class="home-alert-actions"><button id="alertBackupNow" class="primary" type="button">Guardar ahora</button><button id="alertBackupLater" class="ghost" type="button">Mañana</button></div></div>');
    }
    // Stock bajo al iniciar la ruta del día
    const route=readJSON('zipperRutaSesion',null),hidden=localStorage.getItem('zipperStockAvisoOculto')===localDate();
    if(route&&route.date===localDate()&&!hidden){
      let low=[];try{low=getProducts().filter(p=>p.active!==false).map(p=>({p,stock:Math.max(0,Number(p.stock)||0),min:productMinimum(p)})).filter(x=>x.stock<=x.min).sort((a,b)=>a.stock-b.stock||String(a.p.name).localeCompare(String(b.p.name),'es'))}catch(e){console.error('Stock bajo:',e)}
      if(low.length){
        const zero=low.filter(x=>x.stock===0).length;
        parts.push('<div class="home-alert alert-stock"><div><strong>📦 Antes de salir: '+plural(low.length,'producto','productos')+' con stock bajo'+(zero?' · '+zero+' sin stock':'')+'</strong><span>'+low.slice(0,6).map(x=>esc(x.p.name)+' ('+x.stock+')').join(', ')+(low.length>6?' y '+(low.length-6)+' más':'')+'</span></div><div class="home-alert-actions"><button id="alertStockOpen" class="primary" type="button">Ver productos</button><button id="alertStockHide" class="ghost" type="button">Ocultar hoy</button></div></div>');
      }
    }
    // Cobranza
    let list=[];try{list=debtors()}catch(e){console.error('Cobranza:',e)}
    const late=list.filter(x=>x.days>15);
    if(list.length){
      const total=list.reduce((a,x)=>a+x.debt,0),shown=(late.length?late:list).slice(0,3);
      parts.push('<div class="home-alert '+(late.length?'alert-debt':'alert-collect')+'"><div><strong>💰 Cobranza: '+plural(list.length,'cliente debe','clientes deben')+' '+money(total)+'</strong><span>'+(late.length?'⏰ '+late.length+' con más de 15 días: ':'Más antiguos: ')+shown.map(x=>esc(x.client?.name||x.name)+' ('+x.days+(x.days===1?' día':' días')+')').join(', ')+((late.length||list.length)>3?' y '+((late.length||list.length)-3)+' más':'')+'</span></div><div class="home-alert-actions"><button id="alertDebtOpen" class="primary" type="button">Ver cobranza y recordar</button></div></div>');
    }
    box.innerHTML=parts.join('');
    $('alertBackupNow')?.addEventListener('click',()=>{if(typeof window.zipperBackupDirect==='function')window.zipperBackupDirect();else if(typeof exportZipperBackup==='function')exportZipperBackup()});
    $('alertBackupLater')?.addEventListener('click',()=>{try{localStorage.setItem(BACKUP_SNOOZE_KEY,localDate())}catch(_){};renderAlerts()});
    $('alertStockOpen')?.addEventListener('click',()=>{document.getElementById('productsTab')?.click();setTimeout(()=>window.scrollTo(0,0),50)});
    $('alertStockHide')?.addEventListener('click',()=>{try{localStorage.setItem('zipperStockAvisoOculto',localDate())}catch(_){};renderAlerts()});
    $('alertDebtOpen')?.addEventListener('click',()=>{document.getElementById('historyTab')?.click();setTimeout(()=>{if(typeof setHistoryType==='function'){if($('historyFrom'))$('historyFrom').value='';if($('historyTo'))$('historyTo').value='';setHistoryType('pending')}window.scrollTo(0,0)},50)});
  }

  window.zipperCobranza={debtors,reminderText,renderAlerts};
  function wrap(name,after,flag){const fn=window[name];if(typeof fn!=='function'||fn[flag])return;window[name]=function(){const r=fn.apply(this,arguments);try{after()}catch(e){console.error('Cobranza:',e)}return r};window[name][flag]=true}
  function bind(){
    wrap('renderHistory',renderCollection,'__withCobranza');
    wrap('renderHome',renderAlerts,'__withAlerts');
    // Registrar la fecha cada vez que se guarda un respaldo (botón de Herramientas o aviso).
    wrap('zipperBackupDirect',markBackup,'__withMark');
    wrap('exportZipperBackup',markBackup,'__withMark');
    renderAlerts();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else setTimeout(bind,0);
})();
