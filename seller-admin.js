import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import { getAuth, setPersistence, browserLocalPersistence, inMemoryPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, deleteUser, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, writeBatch, setDoc, updateDoc } from 'firebase/firestore';

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),ORG=ORG_ID;
// Plan Spark (gratuito): las cuentas se crean desde el navegador con una segunda
// instancia de Firebase, así la sesión del dueño no se cierra. El acceso se
// controla con el perfil members/{uid}: las reglas de Firestore niegan todo a un
// perfil desactivado. No se necesitan Cloud Functions ni el plan Blaze.
const provisioningApp=initializeApp(firebaseConfig,'zipper-seller-provisioning'),provisioningAuth=getAuth(provisioningApp);
const SELLER_ACCOUNT_CREATION_READY=true;
const SELLER_ACCESS_SERVER_READY=true;
// Elementos que ya no están en la página reciben un reemplazo invisible (así las funciones antiguas no fallan).
const ghosts={};const $=id=>document.getElementById(id)||(ghosts[id]||(ghosts[id]=document.createElement(id==='reportPeriod'||id==='compMode'?'select':'input')));
let owner=null,sellers=[],sessions=[],sales=[],visits=[],cash=[],clients=[],compensationBySeller={},drivers=[],driverSessions=[],openPanel='',selectedSellerId=null,loading=false;
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>'$'+Math.round(Number(value)||0).toLocaleString('es-CL');
let statusTimer=null;function status(message,state=''){const el=$('adminStatus');el.textContent=message;el.className='admin-toast'+(state?' '+state:'');clearTimeout(statusTimer);statusTimer=setTimeout(()=>el.classList.add('fade'),state==='error'?8000:3500)}
function dateValue(value){
 if(value&&typeof value.toDate==='function')return value.toDate();
 if(value instanceof Date)return value;
 if(typeof value==='number')return new Date(value);
 if(typeof value==='string'){const d=new Date(value.length===10?value+'T12:00:00':value);return Number.isNaN(d.getTime())?null:d}
 return null;
}
function time(value){const d=dateValue(value);return d?d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'—'}
function rowDate(row,collectionName){
 if(collectionName==='sessions'){const id=String(row.id||'');return id.slice(-10)}
 return String(row.date||row.fecha||'').slice(0,10);
}
function chosenSales(){const date=$('adminDate').value;return sales.filter(s=>rowDate(s,'sales')===date&&(!selectedSellerId||s.sellerUid===selectedSellerId))}
function chosenVisits(){const date=$('adminDate').value;return visits.filter(v=>rowDate(v,'visits')===date&&(!selectedSellerId||v.sellerUid===selectedSellerId))}
function chosenCash(){const date=$('adminDate').value;return cash.filter(v=>rowDate(v,'cash')===date&&(!selectedSellerId||v.sellerUid===selectedSellerId))}
function sessionFor(uid){const date=$('adminDate').value;return sessions.find(s=>s.sellerUid===uid&&rowDate(s,'sessions')===date)||null}
function sellerLabel(uid){const s=sellers.find(x=>x.uid===uid);return s?.displayName||s?.email||uid||''}
function dateKey(value){
 if(value&&typeof value.toDate==='function')value=value.toDate();
 if(value instanceof Date)return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,10);
 if(typeof value==='number')return dateKey(new Date(value));
 return typeof value==='string'?value.slice(0,10):'';
}
function periodBounds(){
 const reference=dateValue($('reportReference').value)||new Date(),kind=$('reportPeriod').value;
 const start=new Date(reference.getFullYear(),reference.getMonth(),reference.getDate());
 let end=new Date(start);
 if(kind==='week'){start.setDate(start.getDate()-((start.getDay()+6)%7));end=new Date(start);end.setDate(start.getDate()+6)}
 else if(kind==='month'){start.setDate(1);end=new Date(start.getFullYear(),start.getMonth()+1,0)}
 else if(kind==='semester'){const firstMonth=start.getMonth()<6?0:6;start.setMonth(firstMonth,1);end=new Date(start.getFullYear(),firstMonth+6,0)}
 else{start.setMonth(0,1);end=new Date(start.getFullYear(),11,31)}
 return {start:dateKey(start),end:dateKey(end)};
}
function renderPeriodReport(){
 const {start,end}=periodBounds(),clientById=new Map(clients.map(c=>[String(c.id),c]));
 const zoneTotals=new Map(),groups=new Map();
 $('reportPeriodLabel').textContent='Período: '+new Date(start+'T12:00:00').toLocaleDateString('es-CL')+' – '+new Date(end+'T12:00:00').toLocaleDateString('es-CL');
 sales.filter(s=>{const key=dateKey(s.date||s.fecha||s.occurredAt);return key>=start&&key<=end}).forEach(s=>{
  const client=clientById.get(String(s.clienteId||s.clientId||''));
  const zone=s.clientZone?String(s.clientZone).trim():(client?.comuna?'Comuna actual: '+String(client.comuna).trim():String(client?.zone||'Sin zona registrada'));
  const route=[s.routeWeek&&('Semana '+s.routeWeek),s.routeDay].filter(Boolean).join(' · ')||'Sin ruta registrada';
  const sellerUid=String(s.sellerUid||'sin-vendedor'),amount=Number(s.total)||0;
  const groupKey=JSON.stringify([sellerUid,zone,route]);
  const group=groups.get(groupKey)||{sellerUid,zone,route,count:0,total:0};
  group.count+=1;group.total+=amount;groups.set(groupKey,group);
  zoneTotals.set(zone,(zoneTotals.get(zone)||0)+amount);
 });
 const rows=[...groups.values()].sort((a,b)=>a.zone.localeCompare(b.zone,'es')||b.total-a.total);
 $('periodSellerRows').innerHTML=rows.length?rows.map(row=>{
  const share=zoneTotals.get(row.zone)?row.total/zoneTotals.get(row.zone)*100:0;
  return '<tr><td>'+safe(sellerLabel(row.sellerUid))+'</td><td>'+safe(row.zone)+'</td><td>'+safe(row.route)+'</td><td>'+row.count+'</td><td>'+money(row.total)+'</td><td>'+share.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%</td></tr>';
 }).join(''):'<tr><td colspan="6">No hay ventas registradas en este período.</td></tr>';
}
const digits=v=>{const d=String(v??'').replace(/\D/g,'');return d===''?'':Number(d)};
const pct=v=>{const t=String(v??'').trim().replace('%','').replace(',','.');return t===''?'':Number(t)};
function tierText(tiers,i){const t=tiers[i],next=tiers.slice().map(x=>x.threshold).filter(x=>x!==''&&x>t.threshold).sort((a,b)=>a-b)[0];if(t.threshold===''||t.ratePct==='')return 'Completa el monto y el %.';return (next!=null?'De '+money(t.threshold)+' a '+money(next-1):'Desde '+money(t.threshold)+' en adelante')+' → '+t.ratePct.toLocaleString('es-CL')+' %'}
function renderCompTiers(tiers){
 const list=tiers.length?tiers:[{threshold:0,ratePct:''}];
 $('compTiers').innerHTML=list.map((tier,index)=>'<div class="comp-tier"><div class="comp-tier-head">Tramo '+(index+1)+(list.length>1?'<button class="admin-btn secondary" type="button" data-comp-remove="'+index+'">Quitar</button>':'')+'</div><div class="comp-tier-fields"><label>Desde ventas de ($)<input data-comp-threshold="'+index+'" type="text" inputmode="numeric" value="'+safe(tier.threshold===''?'':Number(tier.threshold).toLocaleString('es-CL'))+'"'+(index===0?' placeholder="0"':' placeholder="Ej: 2.000.000"')+'></label><label>Comisión (%)<input data-comp-rate="'+index+'" type="text" inputmode="decimal" value="'+safe(tier.ratePct===''?'':String(tier.ratePct).replace('.',','))+'" placeholder="Ej: 3"></label></div><small data-comp-text="'+index+'">'+safe(tierText(list,index))+'</small></div>').join('');
 document.querySelectorAll('[data-comp-remove]').forEach(button=>button.onclick=()=>{if(!window.confirm('¿Estás seguro que quieres quitar este tramo de comisión?'))return;const current=readCompTiers();current.splice(Number(button.dataset.compRemove),1);renderCompTiers(current);renderCompSim()});
 document.querySelectorAll('[data-comp-threshold],[data-comp-rate]').forEach(input=>input.oninput=()=>{const t=readCompTiers();t.forEach((_,i)=>{const el=document.querySelector('[data-comp-text="'+i+'"]');if(el)el.textContent=tierText(t,i)});renderCompSim()});
}
function readCompTiers(){
 return [...document.querySelectorAll('[data-comp-threshold]')].map((input,index)=>({threshold:digits(input.value),ratePct:pct(document.querySelector('[data-comp-rate="'+index+'"]')?.value)}));
}
function renderCompSim(){
 const box=$('compSimResult');if(!box)return;
 const salesTotal=digits($('compSimSales').value),base=digits($('compBaseSalary').value)||0,tiers=readCompTiers().filter(t=>t.threshold!==''&&t.ratePct!==''&&Number.isFinite(t.ratePct));
 if(salesTotal===''||!tiers.length){box.innerHTML='Escribe un monto de ventas para ver cuánto ganaría.';return}
 const calc=commissionBreakdown(salesTotal,tiers,$('compMode').value);
 box.innerHTML='Si vende <b>'+money(salesTotal)+'</b>: comisión <b>'+money(calc.total)+'</b> + sueldo base '+money(base)+' = <b>'+money(calc.total+base)+'</b> bruto.<br><small>'+safe(calc.breakdown)+'</small>';
}
function compensationFor(uid,month){
 if(!uid||!month)return null;
 return Object.values(compensationBySeller).filter(p=>p.sellerUid===uid&&String(p.effectiveMonth||'')<=month).sort((a,b)=>String(a.effectiveMonth).localeCompare(String(b.effectiveMonth))).at(-1)||null;
}
function renderCompForm(){
 const select=$('compSeller'),previous=select.value,month=$('commissionMonth').value;
 select.innerHTML='<option value="">Seleccionar vendedor</option>'+sellers.map(s=>'<option value="'+safe(s.uid)+'">'+safe(s.displayName||s.email||s.uid)+(s.active===true?'':' · desactivado')+'</option>').join('');
 const next=sellers.some(s=>s.uid===previous)?previous:(sellers.some(s=>s.uid===selectedSellerId)?selectedSellerId:'');
 select.value=next;
 const policy=compensationFor(next,month);
 $('compBaseSalary').value=policy?Number(policy.monthlyBaseSalary||0).toLocaleString('es-CL'):'';$('compMode').value=policy?.mode==='total'?'total':'marginal';
 renderCompTiers(policy?.tiers?.length?policy.tiers:[{threshold:0,ratePct:''}]);renderCompSim();
 $('compStatus').textContent=next?(policy?'Condiciones vigentes desde '+policy.effectiveMonth+'. Guardar crea o corrige las condiciones desde '+month+' y no cambia meses anteriores.':'Sin condiciones vigentes para ese vendedor y mes.'):'Selecciona un vendedor para definir sus condiciones.';
}
// Escalonada (marginal): cada % se aplica solo a la parte vendida dentro de su tramo.
// Por meta alcanzada (total): el % del tramo más alto alcanzado se aplica a todo lo vendido.
function commissionBreakdown(salesTotal,tiers,mode='marginal'){
 const sorted=tiers.slice().sort((a,b)=>a.threshold-b.threshold);let total=0;const pieces=[];
 const reached=sorted.filter(t=>salesTotal>=t.threshold).at(-1)||sorted[0];
 const next=sorted.find(t=>t.threshold>salesTotal);
 if(mode==='total'){
  total=salesTotal*(reached?reached.ratePct:0)/100;
  pieces.push(money(salesTotal)+' × '+(reached?reached.ratePct:0).toLocaleString('es-CL')+' % = '+money(total));
 }else sorted.forEach((tier,index)=>{
  const nx=sorted[index+1],upper=nx?Math.min(salesTotal,nx.threshold):salesTotal;
  const segment=Math.max(0,upper-tier.threshold),amount=segment*tier.ratePct/100;
  total+=amount;
  if(segment>0)pieces.push('Tramo '+(index+1)+': '+money(segment)+' × '+tier.ratePct.toLocaleString('es-CL')+' % = '+money(amount));
 });
 return {total:Math.round(total),effective:salesTotal>0?Math.round(total)/salesTotal*100:0,reached,next,breakdown:pieces.length?pieces.join(' · '):'Sin comisión por ventas.'};
}
function renderCompResults(){
 const month=$('commissionMonth').value;
 // Solo cuentan las ventas entregadas y pagadas (marcadas en Caja diaria), en el mes en que se cobraron.
 // Las rechazadas se anulan y desaparecen; las que esperan entrega se muestran aparte y aún no cuentan.
 const totals=new Map(),waiting=new Map();
 sales.forEach(s=>{const uid=String(s.sellerUid||'');if(!uid)return;const amount=Number(s.total)||0;
  if(s.collectionStatus==='collected'&&dateKey(s.collectedAt||s.date||s.fecha||s.occurredAt).slice(0,7)===month)totals.set(uid,(totals.get(uid)||0)+amount);
  else if(s.collectionStatus==='awaiting_delivery'&&dateKey(s.date||s.fecha||s.occurredAt).slice(0,7)<=month)waiting.set(uid,(waiting.get(uid)||0)+amount)});
 const cards=sellers.filter(s=>!selectedSellerId||s.uid===selectedSellerId).map(s=>{
  const policy=compensationFor(s.uid,month),salesTotal=totals.get(s.uid)||0,name=safe(s.displayName||s.email||'Vendedor');
  if(!policy||!Array.isArray(policy.tiers)||!policy.tiers.length)return '<div class="comp-card"><div class="comp-card-head">'+name+'<span>'+money(salesTotal)+' cobrado</span></div><small>Falta configurar su sueldo base y tramos (arriba).</small>'+(waiting.get(s.uid)?'<small>⏳ Por entregar y cobrar: '+money(waiting.get(s.uid))+' (aún no cuenta)</small>':'')+'</div>';
  const calc=commissionBreakdown(salesTotal,policy.tiers,policy.mode),base=Number(policy.monthlyBaseSalary)||0;
  const prog=calc.next?Math.min(100,Math.round((salesTotal-calc.reached.threshold)/(calc.next.threshold-calc.reached.threshold)*100)):100;
  return '<div class="comp-card"><div class="comp-card-head">'+name+'<span>'+money(calc.total+base)+'</span></div><div class="comp-lines"><span>Ventas entregadas y pagadas</span><b>'+money(salesTotal)+'</b>'+(waiting.get(s.uid)?'<span>⏳ Por entregar y cobrar (aún no cuenta)</span><b>'+money(waiting.get(s.uid))+'</b>':'')+'<span>Comisión ('+calc.effective.toLocaleString('es-CL',{maximumFractionDigits:2})+' % efectivo)</span><b>'+money(calc.total)+'</b><span>Sueldo base</span><b>'+money(base)+'</b><span><strong>Total bruto estimado</strong></span><b>'+money(calc.total+base)+'</b></div><div class="comp-bar"><i style="width:'+prog+'%"></i></div><small>'+(calc.next?'Le faltan '+money(calc.next.threshold-salesTotal)+' para el tramo de '+calc.next.ratePct.toLocaleString('es-CL')+' %':'Está en el tramo más alto ('+calc.reached.ratePct.toLocaleString('es-CL')+' %)')+' · '+(policy.mode==='total'?'por meta alcanzada':'escalonada')+'</small><details><summary>Ver cálculo</summary><small>'+safe(calc.breakdown)+'</small></details></div>';
 });
 $('compResults').innerHTML=cards.join('')||'<p class="admin-muted">Aún no hay vendedores registrados.</p>';
}
async function saveCompensation(){
 const uid=$('compSeller').value,baseRaw=$('compBaseSalary').value,month=$('commissionMonth').value;
 if(!owner||!uid){$('compStatus').textContent='Selecciona un vendedor.';return}
 if(!month){$('compStatus').textContent='Selecciona el mes desde el que aplicarán estas condiciones.';return}
 if(navigator.onLine===false){$('compStatus').textContent='Conéctate a internet para guardar las condiciones.';return}
 const base=digits(baseRaw),tiers=readCompTiers();
 if(base===''){$('compStatus').textContent='Ingresa el sueldo base bruto en pesos (puede ser 0 si solo gana comisión).';$('compBaseSalary').focus();return}
 if(!tiers.length||tiers.some(t=>t.threshold===''||t.ratePct===''||!Number.isFinite(t.threshold)||!Number.isFinite(t.ratePct)||!Number.isInteger(t.threshold)||t.threshold<0||t.ratePct<0||t.ratePct>100)){
  $('compStatus').textContent='Completa cada meta y porcentaje entre 0% y 100%.';return
 }
 tiers.sort((a,b)=>a.threshold-b.threshold);
 if(tiers[0].threshold!==0||tiers.some((t,i)=>i>0&&t.threshold===tiers[i-1].threshold)){
  $('compStatus').textContent='La primera meta debe comenzar en $0 y las siguientes deben ser distintas.';return
 }
 const button=$('compSave');button.disabled=true;$('compStatus').textContent='Guardando condiciones…';
 try{
  const policy={sellerUid:uid,effectiveMonth:month,monthlyBaseSalary:Math.round(base),mode:$('compMode').value==='total'?'total':'marginal',tiers,updatedBy:owner.uid,updatedAt:new Date().toISOString()};
  const policyId=uid+'_'+month;
  await setDoc(doc(db,'orgs',ORG,'sellerCompensation',policyId),policy);
  compensationBySeller[policyId]=policy;
  renderCompForm();renderCompResults();
  $('compStatus').textContent='✅ Sueldo y tramos guardados desde '+month+'. Los meses anteriores conservan sus propias condiciones.';status('Sueldo de vendedor guardado.','ok');
 }catch(error){console.error(error);$('compStatus').textContent=error.message||'No se pudieron guardar las condiciones.'}
 finally{button.disabled=false}
}
function render(){
 const date=$('adminDate').value,filteredSales=chosenSales(),filteredVisits=chosenVisits(),filteredCash=chosenCash();
 $('statSales').textContent=String(filteredSales.length);
 $('statTotal').textContent=money(filteredSales.reduce((n,s)=>n+Number(s.total||0),0));
 $('statCash').textContent=money(filteredSales.filter(s=>s.paymentStatus!=='pending'&&s.paymentMethod!=='pending'&&s.collectionStatus!=='awaiting_delivery').reduce((n,s)=>n+Number(s.total||0),0)+filteredCash.filter(x=>x.sourceType==='payment'||x.type==='payment').reduce((n,x)=>n+Number(x.amount??x.monto??x.total??0),0));
 $('statVisits').textContent=String(filteredVisits.length);
 renderPeriodReport();renderCompForm();renderCompResults();
 $('adminCount').textContent=sellers.length+' vendedor'+(sellers.length===1?'':'es')+' · '+date;
 // Cada vendedor es una tarjeta con botones; el panel elegido se abre justo debajo de su tarjeta.
 ['panelDay','panelComp','panelAccess','panelDriver'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.add('admin-hidden');document.getElementById('panelHolder')?.appendChild(el)}});
 const team=[...sellers,...drivers];
 $('adminSellers').innerHTML=team.length?team.map(s=>{
  if(s.role==='driver'){const sel=s.uid===selectedSellerId,ds=driverSessions.find(x=>x.driverUid===s.uid&&String(x.id).endsWith(localDateStr()));const tb=(p,l)=>'<button type="button" data-panel="'+p+'" data-uid="'+safe(s.uid)+'" class="'+(sel&&openPanel===p?'on':'')+'">'+l+'</button>';return '<article class="admin-row" style="background:'+(sel&&openPanel?'#fff7ed':'white')+'"><strong>🚚 '+safe(s.displayName||s.email||'Repartidor')+' · repartidor'+(s.active===true?'':' · desactivado')+'</strong><small>'+(ds?.status==='open'?'🟢 Jornada abierta':ds?.status==='closed'?'⚪ Jornada cerrada':'Sin jornada hoy')+(ds?' · '+(ds.delivered||0)+' entregados':'')+(ds?.lastLocAt?' · 📍 '+ago(ds.lastLocAt):'')+'</small><div class="seller-card-tabs" style="grid-template-columns:1fr 1fr">'+tb('driver','🚚 Día')+tb('access','🔑 Acceso')+'</div><div class="seller-slot" data-slot="'+safe(s.uid)+'"></div></article>'}
  const selected=s.uid===selectedSellerId,active=s.active===true;
  const daySales=sales.filter(x=>x.sellerUid===s.uid&&rowDate(x,'sales')===date),session=sessionFor(s.uid);
  const waiting=sales.filter(x=>x.sellerUid===s.uid&&x.collectionStatus==='awaiting_delivery').length;
  const tab=(p,label)=>'<button type="button" data-panel="'+p+'" data-uid="'+safe(s.uid)+'" class="'+(selected&&openPanel===p?'on':'')+'">'+label+'</button>';
  return '<article class="admin-row" style="background:'+(selected&&openPanel?'#eef2ff':'white')+'"><strong>'+safe(s.displayName||s.email||'Vendedor')+(active?'':' · desactivado')+'</strong><small>'+(session?.status==='open'?'🟢 Jornada abierta':session?.status==='closed'?'⚪ Jornada cerrada':'Sin jornada')+' · '+daySales.length+' ventas · '+money(daySales.reduce((n,x)=>n+Number(x.total||0),0))+(waiting?' · ⏳ '+waiting+' por entregar':'')+'</small><div class="seller-card-tabs">'+tab('day','📅 Día')+tab('comp','💰 Sueldo')+tab('access','🔑 Acceso')+'</div><div class="seller-slot" data-slot="'+safe(s.uid)+'"></div></article>';
 }).join(''):'<p class="admin-muted">Aún no hay vendedores. Créalos abajo.</p>';
 if(!team.length){const nb=document.getElementById('newSellerBox');if(nb)nb.open=true}
 document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{const same=selectedSellerId===b.dataset.uid&&openPanel===b.dataset.panel;selectedSellerId=b.dataset.uid;openPanel=same?'':b.dataset.panel;if($('compSeller'))$('compSeller').value=selectedSellerId;render();if(openPanel)setTimeout(()=>document.querySelector('[data-slot="'+CSS.escape(selectedSellerId)+'"]')?.scrollIntoView({behavior:'smooth',block:'start'}),50)});
 const slot=openPanel&&document.querySelector('[data-slot="'+CSS.escape(selectedSellerId||'')+'"]');
 if(slot){const id={day:'panelDay',comp:'panelComp',access:'panelAccess',driver:'panelDriver'}[openPanel],el=document.getElementById(id);if(el){el.classList.remove('admin-hidden');slot.appendChild(el)}
  if(openPanel==='driver'){renderDriverPanel();clearInterval(driverTimer);driverTimer=setInterval(()=>{if(openPanel==='driver'&&document.visibilityState==='visible')refresh()},60000)}else clearInterval(driverTimer);
  if(openPanel==='access'){const x=team.find(v=>v.uid===selectedSellerId),active=x?.active===true;$('accessBody').innerHTML='<p class="admin-muted">Correo: <b>'+safe(x?.email||'sin correo')+'</b> · '+(active?'acceso activo':'acceso desactivado')+'</p>'+(x?.email?'<button type="button" class="admin-btn" id="accWa">📲 Enviar acceso por WhatsApp</button><button type="button" class="admin-btn secondary" id="accReset">📧 Enviarle correo para cambiar clave</button>':'')+'<button type="button" class="admin-btn secondary" id="accToggle">'+(active?'⛔ Desactivar a este vendedor':'✅ Activar a este vendedor')+'</button>';
   if($('accWa'))$('accWa').onclick=()=>shareSellerAccess(x.displayName,x.email,'',x.role);if($('accReset'))$('accReset').onclick=()=>sendSellerReset(x.uid);$('accToggle').onclick=()=>toggleSeller(x.uid)}
 }
 const seller=sellers.find(s=>s.uid===selectedSellerId),session=seller?sessionFor(seller.uid):null;
 $('adminDetailTitle').textContent=seller?'Detalle de '+(seller.displayName||seller.email||'vendedor'):'Detalle diario · todos los vendedores';
 $('detailOpened').textContent=time(session?.openedAtLocal||session?.openedAt);
 $('detailFirstSale').textContent=time(session?.firstSaleAtLocal||session?.firstSaleAt);
 $('detailClosed').textContent=time(session?.closedAtLocal||session?.closedAt);
 const detailSales=seller?filteredSales:filteredSales;
 $('detailSales').textContent=String(detailSales.length);
 $('adminCash').innerHTML=filteredCash.map(x=>'<article class="admin-row"><strong>'+safe(x.sourceType==='expense'||x.type==='expense'?'Gasto':'Abono / movimiento')+' · '+money(x.amount??x.monto??x.total)+'</strong><small>'+safe(x.clientName||x.cliente||x.description||x.descripcion||'')+' · '+safe(time(x.createdAt||x.fecha))+' · '+safe(x.paymentMethod||x.formaPago||'')+'</small></article>').join('')||'<p class="admin-muted">Sin movimientos de caja en esta fecha.</p>';
 $('adminSales').innerHTML=filteredSales.map(s=>'<article class="admin-row"><strong>'+safe(s.cliente||s.clientName||'Cliente')+' · '+money(s.total)+'</strong><small>'+safe(s.folio||s.id)+' · '+safe(time(s.occurredAt||s.createdAt||s.fecha))+' · '+safe(s.paymentMethod||s.formaPago||'')+(s.collectionStatus==='awaiting_delivery'?' · Por cobrar al entregar':'')+' · '+safe(sellerLabel(s.sellerUid)||s.sellerName||'')+'</small></article>').join('')||'<p class="admin-muted">Sin ventas en esta fecha.</p>';
 $('adminVisits').innerHTML=filteredVisits.map(v=>{const client=clients.find(c=>String(c.id)===String(v.clientId)),saleExists=v.status!=='sale'||sales.some(s=>String(s.id)===String(v.saleId||'')&&String(s.sellerUid||'')===String(v.sellerUid||''))||(!v.saleId&&sales.some(s=>String(s.sellerUid||'')===String(v.sellerUid||'')&&String(s.clienteId||s.clientId||'')===String(v.clientId||'')&&rowDate(s,'sales')===rowDate(v,'visits'))),visitLabel=v.status==='sale'?(saleExists?'visitado · venta registrada':'visitado · sin venta'):v.status||'visitado';return '<article class="admin-row"><strong>'+safe(v.clientName||v.cliente||client?.name||v.clientId||'Cliente')+' · '+safe(visitLabel)+'</strong><small>'+safe(v.routeWeek||'')+' '+safe(v.routeDay||'')+' · '+safe(sellerLabel(v.sellerUid))+'</small></article>'}).join('')||'<p class="admin-muted">Sin visitas en esta fecha.</p>';
}
// Saca del catálogo de vendedores los productos de la categoría Remedios (una vez; los nuevos salen ocultos solos).
let remediesChecked=false;
async function hideRemediesFromSellers(){
 if(remediesChecked||!owner)return;remediesChecked=true;
 const snap=await getDocs(collection(db,'orgs',ORG,'products'));
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const visible=snap.docs.filter(d=>norm(d.data().category).includes('remedio')&&d.data().sellerVisible!==false);
 for(let i=0;i<visible.length;i+=400){const batch=writeBatch(db);visible.slice(i,i+400).forEach(d=>batch.update(d.ref,{sellerVisible:false}));await batch.commit()}
 if(visible.length)status(visible.length+' remedios quitados del catálogo de vendedores.','ok');
}
const localDateStr=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
// ===== Repartidor =====
function renderDriverPanel(){
 const uid=selectedSellerId,date=$('driverDate').value||localDateStr();if(!$('driverDate').value)$('driverDate').value=date;
 const ds=driverSessions.find(x=>x.driverUid===uid&&String(x.id).endsWith(date));
 const hm=v=>v?new Date(v).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'—';
 const rows=sales.filter(x=>x.deliveredBy===uid&&String(x.deliveredAt||x.collectedAt||'').slice(0,10)===date);
 const ok=rows.filter(x=>x.collectionStatus==='collected'),cash=ok.filter(x=>x.paymentMethod!=='transfer').reduce((a,x)=>a+Number(x.total||0),0),tr=ok.filter(x=>x.paymentMethod==='transfer').reduce((a,x)=>a+Number(x.total||0),0);
 const mins=ds?.openedAtLocal&&ds?.closedAtLocal?Math.round((new Date(ds.closedAtLocal)-new Date(ds.openedAtLocal))/60000):null;
 const waiting=sales.filter(x=>x.collectionStatus==='awaiting_delivery').length;
 renderDriverGps(ds,rows);
 $('driverBody').innerHTML='<div class="admin-grid"><div class="admin-stat"><strong>'+hm(ds?.openedAtLocal)+'</strong><span>Inicio</span></div><div class="admin-stat"><strong>'+(ds?.closedAtLocal?hm(ds.closedAtLocal):ds?'Sin cerrar':'—')+'</strong><span>Término</span></div><div class="admin-stat"><strong>'+(mins!=null?Math.floor(mins/60)+' h '+String(mins%60).padStart(2,'0'):'—')+'</strong><span>Jornada</span></div><div class="admin-stat"><strong>'+ok.length+' / '+rows.length+'</strong><span>Entregados</span></div><div class="admin-stat"><strong>'+money(cash)+'</strong><span>Efectivo a rendir</span></div><div class="admin-stat"><strong>'+money(tr)+'</strong><span>Transferencias</span></div></div><p class="admin-muted">Pedidos de vendedores esperando reparto: '+waiting+'</p>'+
  (rows.length?rows.map(x=>'<article class="admin-row"><strong>'+safe(x.cliente||'Cliente')+' · '+money(x.total)+'</strong><small>'+(x.collectionStatus==='collected'?'✅ Entregado · '+(x.paymentMethod==='transfer'?'Transferencia':'Efectivo')+(x.paymentMethodOriginal?' (cambió)':''):'✖ Rechazado · '+safe(x.deliveryNote||''))+' · '+hm(x.deliveredAt)+'</small></article>').join(''):'<p class="admin-muted">Sin entregas en esta fecha.</p>');
}
// Ubicación del repartidor: último punto enviado, recorrido del día y lugares de entrega.
let driverMap=null,driverLayer=null,driverTimer=null;
function ago(iso){const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'recién':m<60?'hace '+m+' min':'hace '+Math.floor(m/60)+' h '+(m%60)+' min'}
function renderDriverGps(ds,rows){
 const box=$('driverGps'),mapEl=$('driverMap');
 if(!ds?.lastLat){box.innerHTML='<div class="gps-box old">📍 Sin ubicación en esta fecha. Se ve cuando el repartidor inicia la jornada y tiene la app abierta con el GPS permitido.</div>';mapEl.style.display='none';return}
 const old=Date.now()-new Date(ds.lastLocAt).getTime()>15*60000&&ds.status==='open';
 box.innerHTML='<div class="gps-box'+(old?' old':'')+'">📍 <b>'+(ds.status==='open'?'Última ubicación':'Ubicación al cerrar')+'</b> '+ago(ds.lastLocAt)+' ('+new Date(ds.lastLocAt).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+', precisión '+(ds.lastAccuracy||'?')+' m)'+(old?'<br>⚠️ Hace rato no envía ubicación: puede tener la app cerrada o sin señal.':'')+'<br><a href="https://www.google.com/maps?q='+ds.lastLat+','+ds.lastLng+'" target="_blank" rel="noopener">Ver en Google Maps</a></div>';
 if(typeof L==='undefined'){mapEl.style.display='none';return}
 mapEl.style.display='block';
 if(!driverMap){driverMap=L.map('driverMap');L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(driverMap)}
 if(driverLayer)driverLayer.remove();driverLayer=L.layerGroup().addTo(driverMap);
 const pts=(Array.isArray(ds.track)?ds.track:[]).map(p=>[p.lat,p.lng]);
 if(pts.length>1)L.polyline(pts,{color:'#2563eb',weight:3,opacity:.6}).addTo(driverLayer);
 const bounds=[[ds.lastLat,ds.lastLng],...pts];
 rows.filter(x=>x.deliveredLat).forEach((x,i)=>{L.marker([x.deliveredLat,x.deliveredLng],{icon:L.divIcon({className:x.collectionStatus==='collected'?'dnum':'drej',html:x.collectionStatus==='collected'?'✓':'✖',iconSize:[22,22]})}).addTo(driverLayer).bindPopup(safe(x.cliente||'Cliente')+' · '+money(x.total));bounds.push([x.deliveredLat,x.deliveredLng])});
 L.marker([ds.lastLat,ds.lastLng],{icon:L.divIcon({className:'dnow',iconSize:[18,18]})}).addTo(driverLayer).bindPopup('Repartidor · '+ago(ds.lastLocAt));
 driverMap.fitBounds(L.latLngBounds(bounds).pad(.2),{maxZoom:16});setTimeout(()=>driverMap.invalidateSize(),120);
}
async function loadOffice(){try{const s=await getDoc(doc(db,'orgs',ORG,'settings','delivery'));$('officeAddress').value=s.exists()&&s.data().officeAddress?s.data().officeAddress:'Quebrada de Aroma 1517, Peñalolén'}catch(_){}}
async function saveOffice(){const v=$('officeAddress').value.trim();if(v.length<5){status('Escribe la dirección de la oficina.','error');return}try{await setDoc(doc(db,'orgs',ORG,'settings','delivery'),{officeAddress:v.includes('Chile')?v:v+', Santiago, Chile',officeLat:null,officeLng:null,updatedAt:new Date().toISOString()},{merge:true});status('Dirección de la oficina guardada.','ok')}catch(e){status(e.message||'No se pudo guardar la dirección.','error')}}
async function refresh(){
 if(!owner||loading)return;loading=true;status('Actualizando información de vendedores…');
 try{
  // A single denied collection must not hide the other owner reports.
  const names=['members','sessions','sales','visits','cashMovements','clients','sellerCompensation','driverSessions'];
  const results=await Promise.allSettled(names.map(name=>getDocs(collection(db,'orgs',ORG,name))));
  const failures=[];
  const docs=Object.fromEntries(results.map((result,index)=>{
   const name=names[index];
   if(result.status==='fulfilled')return [name,result.value.docs];
   failures.push(name);
   console.warn('Control de vendedores: lectura fallida en '+name,result.reason);
   return [name,null];
  }));
  if(docs.members!==null){sellers=docs.members.map(d=>({uid:d.id,...d.data()})).filter(x=>x.role==='seller');drivers=docs.members.map(d=>({uid:d.id,...d.data()})).filter(x=>x.role==='driver')}
  if(docs.driverSessions!==null)driverSessions=docs.driverSessions.map(d=>({id:d.id,...d.data()}));
  loadOffice();
  hideRemediesFromSellers().catch(e=>console.warn('Remedios:',e));
  if(docs.sellerCompensation!==null)compensationBySeller=Object.fromEntries(docs.sellerCompensation.map(d=>[d.id,d.data()]));
  if(docs.sessions!==null)sessions=docs.sessions.map(d=>({id:d.id,...d.data()}));
  if(docs.sales!==null)sales=docs.sales.map(d=>({id:d.id,...d.data()})).filter(s=>s.collectionStatus!=='cancelled');
  if(docs.visits!==null)visits=docs.visits.map(d=>({id:d.id,...d.data()}));
  if(docs.cashMovements!==null)cash=docs.cashMovements.map(d=>({id:d.id,...d.data()}));
  if(docs.clients!==null)clients=docs.clients.map(d=>({id:d.id,...d.data()}));
  if(selectedSellerId&&!sellers.some(s=>s.uid===selectedSellerId))selectedSellerId=null;
  if(!selectedSellerId&&sellers.length)selectedSellerId=sellers[0].uid;
  $('adminOwnerName').textContent=owner.displayName||owner.email||'Propietario';
  render();status(failures.length?'Lectura parcial: Firebase rechazó '+failures.join(', ')+'. Revisa permisos de propietario y reglas publicadas.':'Datos de vendedores actualizados.',failures.length?'error':'ok');
 }catch(error){console.error(error);status(error.message||'No se pudieron consultar los movimientos.','error')}
 finally{loading=false}
}
async function verify(user){
 if(!user){owner=null;updateSellerCreationState();$('adminApp').classList.add('admin-hidden');$('adminLogin').classList.remove('admin-hidden');status('Ingresa con la cuenta propietaria.');return}
 const snap=await getDoc(doc(db,'orgs',ORG,'members',user.uid)),data=snap.exists()?snap.data():null;
 if(!data||data.active!==true||data.role!=='owner'){owner=null;await signOut(auth);$('adminApp').classList.add('admin-hidden');$('adminLogin').classList.remove('admin-hidden');status('Esta cuenta no tiene permisos de propietario.','error');return}
 owner={uid:user.uid,email:user.email||'',...data};updateSellerCreationState();$('adminLogin').classList.add('admin-hidden');$('adminApp').classList.remove('admin-hidden');$('adminDate').value=localDate();$('reportReference').value=localDate();$('commissionMonth').value=localDate().slice(0,7);await refresh();await refreshCatalogPrepState();await refreshSellerModeState();
}
async function login(){
 const b=$('adminLoginButton');b.disabled=true;status('Verificando cuenta propietaria…');
 try{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,$('adminEmail').value.trim(),$('adminPassword').value);$('adminPassword').value=''}
 catch(error){status(error.message||'No se pudo iniciar sesión.','error')}
 finally{b.disabled=false}
}

async function refreshCatalogPrepState(){
 const button=$('catalogPrepareButton'),check=$('catalogBackupConfirm'),label=$('catalogPrepStatus');
 if(!owner)return;
 try{
  const snap=await getDoc(doc(db,'orgs',ORG,'settings','sellerMode'));
  if(snap.exists()&&Number(snap.data().catalogVersion)>=1){
   label.textContent=snap.data().enabled===true?'Catálogo protegido. El acceso vendedor ya está activado.':'Catálogo protegido. El acceso vendedor sigue desactivado.';
   button.textContent='Catálogo ya protegido';button.disabled=true;check.disabled=true;return;
  }
  label.textContent='El catálogo todavía no está preparado.';
  button.disabled=!check.checked||navigator.onLine===false;
 }catch(error){label.textContent=error.message||'No se pudo revisar el estado del catálogo.';button.disabled=true}
}
async function prepareCatalog(){
 const button=$('catalogPrepareButton'),label=$('catalogPrepStatus');
 if(!owner||!$('catalogBackupConfirm').checked)return;
 if(navigator.onLine===false){label.textContent='Conéctate a internet antes de preparar el catálogo.';return}
 if(localStorage.getItem('zipperStorageMode')!=='cloud'){label.textContent='Primero conecta la app principal a Firebase.';return}
 try{const outbox=JSON.parse(localStorage.getItem('zipperFirebaseOutboxV1')||'{}');if(outbox.zipperProductos){label.textContent='Hay cambios de inventario pendientes de sincronizar. Espera a que la app principal indique “Firebase al día” e inténtalo nuevamente.';return}}catch(_){}
 button.disabled=true;button.textContent='Preparando…';label.textContent='Separando precios de compra y protegiendo el catálogo…';
 try{
  const settingRef=doc(db,'orgs',ORG,'settings','sellerMode');
  const modeSnap=await getDoc(settingRef);
  if(modeSnap.exists()&&Number(modeSnap.data().catalogVersion)>=1){await refreshCatalogPrepState();return}
  const [productSnap,costSnap]=await Promise.all([
   getDocs(collection(db,'orgs',ORG,'products')),
   getDocs(collection(db,'orgs',ORG,'productCosts'))
  ]);
  if(!productSnap.size)throw new Error('No se encontraron productos en Firebase.');
  const costMap=new Map(costSnap.docs.map(item=>[item.id,item.data()])),operations=[];
  const privateFields=['pricePurchase','purchasePrice','cost','costPrice','buyPrice','precioCompra'];
  productSnap.docs.forEach(item=>{
   const data={id:item.id,...item.data()},old=costMap.get(item.id)||{};
   const purchasePrice=data.pricePurchase??data.purchasePrice??data.costPrice??data.cost??data.buyPrice??data.precioCompra??old.pricePurchase??0;
   const safeData={...data};
   privateFields.forEach(key=>delete safeData[key]);
   safeData.sellerVisible=true;
   operations.push({ref:item.ref,data:safeData});
   operations.push({ref:doc(db,'orgs',ORG,'productCosts',item.id),data:{id:item.id,pricePurchase:Math.max(0,Number(purchasePrice)||0),updatedAt:new Date().toISOString()}});
  });
  for(let start=0;start<operations.length;start+=450){
   const batch=writeBatch(db);
   operations.slice(start,start+450).forEach(op=>batch.set(op.ref,op.data));
   await batch.commit();
  }
  await setDoc(settingRef,{id:'sellerMode',enabled:false,catalogVersion:1,preparedAt:new Date().toISOString(),preparedBy:owner.uid});
  localStorage.setItem('zipperSellerCatalogVersion','1');
  label.textContent='Catálogo preparado: '+productSnap.size+' productos. Los costos quedaron privados; el acceso de vendedores sigue desactivado.';
  await refreshCatalogPrepState();await refreshSellerModeState();
 }catch(error){
  console.error(error);label.textContent=error.message||'No se pudo preparar el catálogo.';
  button.disabled=!$('catalogBackupConfirm').checked;button.textContent='Reintentar preparación';
 }
}
function updateSellerCreationState(){
 const button=$('sellerCreateAccount');
 if(button)button.disabled=!owner||!SELLER_ACCOUNT_CREATION_READY;
 if(!owner)$('sellerProfileStatus').textContent='Inicia sesión como propietario.';
 else $('sellerProfileStatus').textContent='Completa los datos para crear la cuenta del vendedor.';
}
async function createSellerAccount(){
 const button=$('sellerCreateAccount'),label=$('sellerProfileStatus');
 const displayName=$('sellerDisplayName').value.trim(),email=$('sellerEmail').value.trim().toLowerCase(),password=$('sellerPassword').value;
 if(!owner){label.textContent='Inicia sesión como propietario.';return}
 if(navigator.onLine===false){label.textContent='Conéctate a internet para crear la cuenta.';return}
 if(displayName.length<2||displayName.length>80){label.textContent='Escribe el nombre del vendedor (2 a 80 caracteres).';return}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){label.textContent='Escribe un correo electrónico válido.';return}
 if(email===String(owner.email||'').toLowerCase()){label.textContent='Usa un correo distinto al de la cuenta propietaria.';return}
 if(password.length<8){label.textContent='La clave inicial debe tener al menos 8 caracteres.';return}
 button.disabled=true;label.textContent='Creando la cuenta del vendedor…';
 let created=null;
 try{
  await setPersistence(provisioningAuth,inMemoryPersistence);
  const credential=await createUserWithEmailAndPassword(provisioningAuth,email,password);
  created=credential.user;
  await updateProfile(created,{displayName}).catch(()=>{});
  const now=new Date().toISOString();
  const role=$('memberRole').value==='driver'?'driver':'seller';
  await setDoc(doc(db,'orgs',ORG,'members',created.uid),{role,active:true,displayName,email,provisionedBy:owner.uid,createdAt:now,updatedAt:now});
  $('sellerDisplayName').value='';$('sellerEmail').value='';
  selectedSellerId=created.uid;
  label.textContent='✅ Cuenta creada para '+displayName+' · '+email+'. La clave no se guarda en la app: envíasela ahora.';
  showCreatedAccess(displayName,email,password);
  await refresh();
 }catch(error){
  console.error('No se pudo crear la cuenta del vendedor.',error.code||error.message);
  // Si la cuenta de acceso se creó pero el perfil no, se retira para no dejarla a medias.
  if(created)await deleteUser(created).catch(()=>{});
  const code=String(error.code||'');
  label.textContent=code.includes('email-already-in-use')?'Ese correo ya tiene una cuenta. Usa otro correo o reactiva el vendedor desde la lista.'
   :code.includes('operation-not-allowed')?'Activa el acceso por correo y contraseña en Firebase Console → Authentication → Sign-in method.'
   :code.includes('weak-password')?'La clave es demasiado débil. Usa al menos 8 caracteres combinando letras y números.'
   :code.includes('invalid-email')?'El correo no es válido.'
   :code.includes('permission-denied')?'Firebase rechazó el perfil. Revisa que las reglas de Firestore estén publicadas.'
   :(error.message||'No se pudo crear la cuenta.');
 }finally{
  await signOut(provisioningAuth).catch(()=>{});
  $('sellerPassword').value='';
  button.disabled=!owner;
 }
}
// ===== Entrega de acceso al vendedor =====
const SELLER_APP_URL=new URL('./vendedor.html',location.href).href;
const DRIVER_APP_URL=new URL('./repartidor.html',location.href).href;
function sellerAccessText(name,email,password,role){
 return ['Hola '+(name||'')+', este es tu acceso a la app de '+(role==='driver'?'reparto':'ventas')+' de *Distribuidora Zipper*:','','1) Abre este enlace en Chrome: '+(role==='driver'?DRIVER_APP_URL:SELLER_APP_URL),'2) Correo: '+email,password?'3) Clave: '+password:'3) Clave: la que te entregué (si no la recuerdas, toca "¿Olvidaste tu clave?" en la app)','','Para dejarla como app: en Chrome toca ⋮ → "Agregar a pantalla principal".'].join('\n');
}
function shareSellerAccess(name,email,password,role){
 const role2=role||($('memberRole').value==='driver'?'driver':'seller');
 const url='https://wa.me/?text='+encodeURIComponent(sellerAccessText(name,email,password,role2));
 const w=window.open(url,'_blank');if(!w)location.href=url;
}
function showCreatedAccess(name,email,password){
 let box=$('sellerCreatedAccess');
 if(!box){box=document.createElement('div');box.id='sellerCreatedAccess';box.className='admin-row';box.style.cssText='margin-top:10px;background:#f0fdf4;border-color:#86efac';$('sellerProfileStatus').after(box)}
 box.innerHTML='<strong>Datos para '+safe(name)+'</strong><small>Enlace: '+safe(SELLER_APP_URL)+'</small><small>Correo: '+safe(email)+'</small><small>Clave: '+safe(password)+'</small><button type="button" class="admin-btn" id="sellerCreatedWa">📲 Enviar acceso por WhatsApp</button><button type="button" class="admin-btn secondary" id="sellerCreatedDone">Listo, ya se lo envié</button>';
 $('sellerCreatedWa').onclick=()=>shareSellerAccess(name,email,password,$('memberRole').value);
 $('sellerCreatedDone').onclick=()=>box.remove();
}
async function sendSellerReset(uid){
 const seller=[...sellers,...drivers].find(item=>item.uid===uid);if(!seller?.email)return;
 if(!window.confirm('¿Enviar a '+seller.email+' un correo para que '+(seller.displayName||'el vendedor')+' cree una clave nueva?'))return;
 try{await sendPasswordResetEmail(provisioningAuth,seller.email);status('Correo enviado a '+seller.email+'. El vendedor debe abrirlo (revisar spam) y crear su clave nueva.','ok')}
 catch(error){console.error(error);status(error.code&&String(error.code).includes('user-not-found')?'Ese correo no tiene cuenta creada.':(error.message||'No se pudo enviar el correo.'),'error')}
}
async function toggleSeller(uid){
 if(!owner||navigator.onLine===false){status('Necesitas la cuenta propietaria y conexión para cambiar el acceso.','error');return}
 const seller=sellers.find(item=>item.uid===uid);if(!seller)return;
 const nextActive=seller.active!==true;
 if(!nextActive&&!window.confirm('¿Desactivar el acceso de '+(seller.displayName||seller.email||uid)+'?'))return;
 try{
  await updateDoc(doc(db,'orgs',ORG,'members',uid),{active:nextActive,updatedAt:new Date().toISOString()});
  status(nextActive?'Vendedor activado. Ya puede ingresar con su correo y clave.':'Acceso desactivado. El vendedor ya no puede ver ni registrar datos; su app se cierra al recibir el cambio.','ok');
  await refresh();
 }catch(error){console.error(error);status(error.message||'No se pudo cambiar el acceso.','error')}
}
async function refreshSellerModeState(){
 const button=$('sellerModeToggle'),label=$('sellerModeStatus');
 if(!button||!owner)return;
 try{
  const snap=await getDoc(doc(db,'orgs',ORG,'settings','sellerMode')),data=snap.exists()?snap.data():null;
  const det=document.getElementById('catalogDetails');if(det){const ready=data&&Number(data.catalogVersion)>=1;det.open=!ready;det.querySelector('summary').textContent=ready?'Catálogo para vendedores ✓ protegido':'Catálogo para vendedores (falta prepararlo)'}
  if(!data||Number(data.catalogVersion)<1){button.disabled=true;button.textContent='Activar acceso de vendedores';label.textContent='Primero prepara el catálogo (abajo).';return}
  const enabled=data.enabled===true;
  button.disabled=false;
  button.textContent=enabled?'Pausar acceso de todos los vendedores':'Activar acceso de vendedores';
  button.dataset.enabled=enabled?'1':'0';
  label.textContent=enabled?'✅ Acceso activo: los vendedores pueden entrar.':'⏸ En pausa: ningún vendedor puede entrar.';button.textContent=enabled?'⏸ Pausar acceso de todos los vendedores':'▶ Activar acceso de vendedores';
 }catch(error){label.textContent=error.message||'No se pudo revisar el acceso de vendedores.';button.disabled=true}
}
async function toggleSellerMode(){
 const button=$('sellerModeToggle');if(!owner||!button)return;
 const enable=button.dataset.enabled!=='1';
 if(!enable&&!window.confirm('¿Pausar el acceso de todos los vendedores?'))return;
 button.disabled=true;
 try{
  await setDoc(doc(db,'orgs',ORG,'settings','sellerMode'),{enabled:enable,updatedAt:new Date().toISOString(),updatedBy:owner.uid},{merge:true});
  status(enable?'Acceso de vendedores activado.':'Acceso de vendedores en pausa.','ok');
 }catch(error){console.error(error);status(error.message||'No se pudo cambiar el acceso de vendedores.','error')}
 await refreshSellerModeState();
}
async function logout(){await signOut(auth);owner=null;sellers=[];sessions=[];sales=[];visits=[];cash=[]}
$('adminLoginButton').onclick=login;$('adminLogout').onclick=logout;$('adminDate').onchange=render;$('reportPeriod').onchange=render;$('reportReference').onchange=render;$('commissionMonth').onchange=()=>{renderCompForm();renderCompResults()};$('compSeller').onchange=renderCompForm;$('compAddTier').onclick=()=>{const tiers=readCompTiers();tiers.push({threshold:'',ratePct:''});renderCompTiers(tiers)};$('compMode').onchange=renderCompSim;$('compSimSales').oninput=renderCompSim;$('compBaseSalary').oninput=renderCompSim;$('compSave').onclick=saveCompensation;$('officeSave').onclick=saveOffice;$('driverDate').onchange=renderDriverPanel;$('sellerCreateAccount').onclick=createSellerAccount;updateSellerCreationState();
$('catalogBackupConfirm').onchange=refreshCatalogPrepState;
$('catalogPrepareButton').onclick=prepareCatalog;
if($('sellerModeToggle'))$('sellerModeToggle').onclick=toggleSellerMode;
onAuthStateChanged(auth,user=>verify(user).catch(error=>{console.error(error);status('No se pudo verificar la cuenta.','error')}));
