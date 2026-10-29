import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, writeBatch, setDoc, updateDoc } from 'firebase/firestore';

const config={
 apiKey:'AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF',
 authDomain:'zipper-a12f1.firebaseapp.com',
 projectId:'zipper-a12f1',
 storageBucket:'zipper-a12f1.firebasestorage.app',
 messagingSenderId:'729619217486',
 appId:'1:729619217486:web:6350b05ead8ecd70c1171f',
 measurementId:'G-KX0HXC2Z54'
};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app),ORG='zipper-a12f1';
const $=id=>document.getElementById(id);
let owner=null,sellers=[],sessions=[],sales=[],visits=[],cash=[],clients=[],compensationBySeller={},selectedSellerId=null,loading=false;
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>'$'+Math.round(Number(value)||0).toLocaleString('es-CL');
function status(message,state=''){const el=$('adminStatus');el.textContent=message;el.className='admin-status'+(state?' '+state:'')}
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
function renderCompTiers(tiers){
 const tbody=$('compTiers');
 tbody.innerHTML=(tiers.length?tiers:[{threshold:0,ratePct:''}]).map((tier,index)=>'<tr><td><input data-comp-threshold="'+index+'" type="number" min="0" step="10000" inputmode="numeric" value="'+safe(tier.threshold??'')+'" aria-label="Meta inicial del tramo '+(index+1)+'"></td><td><input data-comp-rate="'+index+'" type="number" min="0" max="100" step="0.1" inputmode="decimal" value="'+safe(tier.ratePct??'')+'" aria-label="Porcentaje del tramo '+(index+1)+'"></td><td><button class="admin-btn secondary" type="button" data-comp-remove="'+index+'">Quitar</button></td></tr>').join('');
 document.querySelectorAll('[data-comp-remove]').forEach(button=>button.onclick=()=>{const current=readCompTiers();current.splice(Number(button.dataset.compRemove),1);renderCompTiers(current)});
}
function readCompTiers(){
 return [...document.querySelectorAll('[data-comp-threshold]')].map((input,index)=>({threshold:input.value===''?'':Number(input.value),ratePct:document.querySelector('[data-comp-rate="'+index+'"]')?.value===''?'':Number(document.querySelector('[data-comp-rate="'+index+'"]')?.value)}));
}
function renderCompForm(){
 const select=$('compSeller'),previous=select.value;
 select.innerHTML='<option value="">Seleccionar vendedor</option>'+sellers.map(s=>'<option value="'+safe(s.uid)+'">'+safe(s.displayName||s.email||s.uid)+(s.active===true?'':' · desactivado')+'</option>').join('');
 const next=sellers.some(s=>s.uid===previous)?previous:(sellers.some(s=>s.uid===selectedSellerId)?selectedSellerId:'');
 select.value=next;
 const policy=compensationBySeller[next];
 $('compBaseSalary').value=policy?String(policy.monthlyBaseSalary??''):'';
 renderCompTiers(policy?.tiers?.length?policy.tiers:[{threshold:0,ratePct:''}]);
 $('compStatus').textContent=next?(policy?'Condiciones cargadas. La escala aplica por tramos mensuales.':'Aún no hay condiciones guardadas para este vendedor.'):'Selecciona un vendedor para definir sus condiciones.';
}
function commissionBreakdown(salesTotal,tiers){
 const sorted=tiers.slice().sort((a,b)=>a.threshold-b.threshold);let total=0;const pieces=[];
 sorted.forEach((tier,index)=>{
  const next=sorted[index+1],upper=next?Math.min(salesTotal,next.threshold):salesTotal;
  const segment=Math.max(0,upper-tier.threshold),amount=segment*tier.ratePct/100;
  total+=amount;
  if(segment>0)pieces.push(money(segment)+' × '+tier.ratePct.toLocaleString('es-CL')+'% = '+money(amount));
 });
 const reached=sorted.filter(t=>salesTotal>=t.threshold).at(-1)||sorted[0];
 const next=sorted.find(t=>t.threshold>salesTotal);
 const targetLabel='Meta vigente '+money(reached.threshold)+' · '+reached.ratePct.toLocaleString('es-CL')+'% sobre el excedente'+(next?' · próxima '+money(next.threshold):' · último tramo');
 return {total:Math.round(total),effective:salesTotal>0?Math.round(total)/salesTotal*100:0,targetLabel,breakdown:pieces.length?pieces.join(' · '):'Sin comisión variable por ventas en este mes.'};
}
function renderCompResults(){
 const month=$('commissionMonth').value;
 const monthSales=sales.filter(s=>dateKey(s.date||s.fecha||s.occurredAt).slice(0,7)===month),totals=new Map();
 monthSales.forEach(s=>{const uid=String(s.sellerUid||'');if(uid)totals.set(uid,(totals.get(uid)||0)+(Number(s.total)||0))});
 const rows=sellers.map(s=>{
  const policy=compensationBySeller[s.uid],salesTotal=totals.get(s.uid)||0;
  if(!policy||!Array.isArray(policy.tiers)||!policy.tiers.length)return '<tr><td>'+safe(s.displayName||s.email||s.uid)+'</td><td>'+money(salesTotal)+'</td><td colspan="5">Falta configurar sueldo base y metas.</td></tr>';
  const calc=commissionBreakdown(salesTotal,policy.tiers),base=Number(policy.monthlyBaseSalary)||0;
  return '<tr><td>'+safe(s.displayName||s.email||s.uid)+'</td><td>'+money(salesTotal)+'</td><td>'+safe(calc.targetLabel)+'<details><summary>Ver cálculo por tramo</summary>'+safe(calc.breakdown)+'</details></td><td>'+calc.effective.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})+'%</td><td>'+money(calc.total)+'</td><td>'+money(base)+'</td><td>'+money(calc.total+base)+'</td></tr>';
 });
 $('compResults').innerHTML=rows.join('')||'<tr><td colspan="7">Aún no hay vendedores registrados.</td></tr>';
}
async function saveCompensation(){
 const uid=$('compSeller').value,baseRaw=$('compBaseSalary').value;
 if(!owner||!uid){$('compStatus').textContent='Selecciona un vendedor.';return}
 if(navigator.onLine===false){$('compStatus').textContent='Conéctate a internet para guardar las condiciones.';return}
 const base=Number(baseRaw),tiers=readCompTiers();
 if(baseRaw===''||!Number.isInteger(base)||base<0){$('compStatus').textContent='Ingresa un sueldo base en pesos enteros; puede ser cero si corresponde.';return}
 if(!tiers.length||tiers.some(t=>t.threshold===''||t.ratePct===''||!Number.isFinite(t.threshold)||!Number.isFinite(t.ratePct)||!Number.isInteger(t.threshold)||t.threshold<0||t.ratePct<0||t.ratePct>100)){
  $('compStatus').textContent='Completa cada meta y porcentaje entre 0% y 100%.';return
 }
 tiers.sort((a,b)=>a.threshold-b.threshold);
 if(tiers[0].threshold!==0||tiers.some((t,i)=>i>0&&t.threshold===tiers[i-1].threshold)){
  $('compStatus').textContent='La primera meta debe comenzar en $0 y las siguientes deben ser distintas.';return
 }
 const button=$('compSave');button.disabled=true;$('compStatus').textContent='Guardando condiciones…';
 try{
  const policy={sellerUid:uid,monthlyBaseSalary:Math.round(base),tiers,updatedBy:owner.uid,updatedAt:new Date().toISOString()};
  await setDoc(doc(db,'orgs',ORG,'sellerCompensation',uid),policy);
  compensationBySeller[uid]=policy;$('compStatus').textContent='Condiciones guardadas. El cálculo usa venta mensual total del vendedor y aplica cada porcentaje solo al tramo sobre su meta.';
  renderCompResults();
 }catch(error){console.error(error);$('compStatus').textContent=error.message||'No se pudieron guardar las condiciones.'}
 finally{button.disabled=false}
}
function render(){
 const date=$('adminDate').value,filteredSales=chosenSales(),filteredVisits=chosenVisits(),filteredCash=chosenCash();
 $('statSales').textContent=String(filteredSales.length);
 $('statTotal').textContent=money(filteredSales.reduce((n,s)=>n+Number(s.total||0),0));
 $('statCash').textContent=money(filteredSales.filter(s=>s.paymentStatus!=='pending'&&s.paymentMethod!=='pending').reduce((n,s)=>n+Number(s.total||0),0)+filteredCash.filter(x=>x.sourceType==='payment'||x.type==='payment').reduce((n,x)=>n+Number(x.amount??x.monto??x.total??0),0));
 $('statVisits').textContent=String(filteredVisits.length);
 renderPeriodReport();renderCompForm();renderCompResults();
 $('adminCount').textContent=sellers.length+' vendedor'+(sellers.length===1?'':'es')+' · '+date;
 $('adminSellers').innerHTML=sellers.length?sellers.map(s=>{
  const selected=s.uid===selectedSellerId,active=s.active===true;
  const daySales=sales.filter(x=>x.sellerUid===s.uid&&rowDate(x,'sales')===date),session=sessionFor(s.uid);
  return '<article class="admin-row" style="background:'+(selected?'#e8f1ff':'white')+'"><button type="button" style="text-align:left;background:transparent;border:0;padding:0;width:100%;font:inherit" data-seller="'+safe(s.uid)+'"><strong>'+safe(s.displayName||s.email||s.uid)+(active?'':' · desactivado')+'</strong><small>'+daySales.length+' ventas · '+money(daySales.reduce((n,x)=>n+Number(x.total||0),0))+' · '+(session?.status==='open'?'Jornada abierta':session?.status==='closed'?'Jornada cerrada':'Sin jornada registrada')+'</small></button><button type="button" class="admin-btn secondary" style="margin-bottom:0" data-seller-toggle="'+safe(s.uid)+'">'+(active?'Desactivar acceso':'Activar perfil')+'</button></article>'
 }).join(''):'<p class="admin-muted">Aún no hay perfiles de vendedor registrados.</p>';
 document.querySelectorAll('[data-seller]').forEach(b=>b.onclick=()=>{selectedSellerId=b.dataset.seller;render()});
 document.querySelectorAll('[data-seller-toggle]').forEach(b=>b.onclick=()=>toggleSeller(b.dataset.seller));
 const seller=sellers.find(s=>s.uid===selectedSellerId),session=seller?sessionFor(seller.uid):null;
 $('adminDetailTitle').textContent=seller?'Detalle de '+(seller.displayName||seller.email||'vendedor'):'Detalle diario · todos los vendedores';
 $('detailOpened').textContent=time(session?.openedAtLocal||session?.openedAt);
 $('detailFirstSale').textContent=time(session?.firstSaleAtLocal||session?.firstSaleAt);
 $('detailClosed').textContent=time(session?.closedAtLocal||session?.closedAt);
 const detailSales=seller?filteredSales:filteredSales;
 $('detailSales').textContent=String(detailSales.length);
 $('adminCash').innerHTML=filteredCash.map(x=>'<article class="admin-row"><strong>'+safe(x.sourceType==='expense'||x.type==='expense'?'Gasto':'Abono / movimiento')+' · '+money(x.amount??x.monto??x.total)+'</strong><small>'+safe(x.clientName||x.cliente||x.description||x.descripcion||'')+' · '+safe(time(x.createdAt||x.fecha))+' · '+safe(x.paymentMethod||x.formaPago||'')+'</small></article>').join('')||'<p class="admin-muted">Sin movimientos de caja en esta fecha.</p>';
 $('adminSales').innerHTML=filteredSales.map(s=>'<article class="admin-row"><strong>'+safe(s.cliente||s.clientName||'Cliente')+' · '+money(s.total)+'</strong><small>'+safe(s.folio||s.id)+' · '+safe(time(s.occurredAt||s.createdAt||s.fecha))+' · '+safe(s.paymentMethod||s.formaPago||'')+' · '+safe(sellerLabel(s.sellerUid)||s.sellerName||'')+'</small></article>').join('')||'<p class="admin-muted">Sin ventas en esta fecha.</p>';
 $('adminVisits').innerHTML=filteredVisits.map(v=>{const client=clients.find(c=>String(c.id)===String(v.clientId));return '<article class="admin-row"><strong>'+safe(v.clientName||v.cliente||client?.name||v.clientId||'Cliente')+' · '+safe(v.status||'visitado')+'</strong><small>'+safe(v.routeWeek||'')+' '+safe(v.routeDay||'')+' · '+safe(sellerLabel(v.sellerUid))+'</small></article>'}).join('')||'<p class="admin-muted">Sin visitas en esta fecha.</p>';
}
async function refresh(){
 if(!owner||loading)return;loading=true;status('Actualizando información de vendedores…');
 try{
  const [ms,ss,vs,cs,ks,cl,comp]=await Promise.all([
   getDocs(collection(db,'orgs',ORG,'members')),
   getDocs(collection(db,'orgs',ORG,'sessions')),
   getDocs(collection(db,'orgs',ORG,'sales')),
   getDocs(collection(db,'orgs',ORG,'visits')),
   getDocs(collection(db,'orgs',ORG,'cashMovements')),
   getDocs(collection(db,'orgs',ORG,'clients')),
   getDocs(collection(db,'orgs',ORG,'sellerCompensation'))
  ]);
  sellers=ms.docs.map(d=>({uid:d.id,...d.data()})).filter(x=>x.role==='seller');
  compensationBySeller=Object.fromEntries(comp.docs.map(d=>[d.id,d.data()]));
  sessions=ss.docs.map(d=>({id:d.id,...d.data()}));sales=vs.docs.map(d=>({id:d.id,...d.data()}));visits=cs.docs.map(d=>({id:d.id,...d.data()}));cash=ks.docs.map(d=>({id:d.id,...d.data()}));clients=cl.docs.map(d=>({id:d.id,...d.data()}));
  if(selectedSellerId&&!sellers.some(s=>s.uid===selectedSellerId))selectedSellerId=null;
  if(!selectedSellerId&&sellers.length)selectedSellerId=sellers[0].uid;
  $('adminOwnerName').textContent=owner.displayName||owner.email||'Propietario';
  render();status('Datos de vendedores actualizados.','ok');
 }catch(error){console.error(error);status(error.message||'No se pudieron consultar los movimientos.','error')}
 finally{loading=false}
}
async function verify(user){
 if(!user){owner=null;$('adminApp').classList.add('admin-hidden');$('adminLogin').classList.remove('admin-hidden');status('Ingresa con la cuenta propietaria.');return}
 const snap=await getDoc(doc(db,'orgs',ORG,'members',user.uid)),data=snap.exists()?snap.data():null;
 if(!data||data.active!==true||data.role!=='owner'){owner=null;await signOut(auth);$('adminApp').classList.add('admin-hidden');$('adminLogin').classList.remove('admin-hidden');status('Esta cuenta no tiene permisos de propietario.','error');return}
 owner={uid:user.uid,email:user.email||'',...data};$('adminLogin').classList.add('admin-hidden');$('adminApp').classList.remove('admin-hidden');$('adminDate').value=localDate();$('reportReference').value=localDate();$('commissionMonth').value=localDate().slice(0,7);await refresh();await refreshCatalogPrepState();
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
  await refreshCatalogPrepState();
 }catch(error){
  console.error(error);label.textContent=error.message||'No se pudo preparar el catálogo.';
  button.disabled=!$('catalogBackupConfirm').checked;button.textContent='Reintentar preparación';
 }
}
async function saveSellerProfile(){
 const button=$('sellerSaveProfile'),uid=$('sellerUid').value.trim(),displayName=$('sellerDisplayName').value.trim(),label=$('sellerProfileStatus');
 if(!owner){label.textContent='Inicia sesión como propietario.';return}
 if(navigator.onLine===false){label.textContent='Conéctate a internet para guardar el perfil.';return}
 if(!uid||uid.includes('/')||uid.length<10||!displayName){label.textContent='Revisa el UID y escribe el nombre visible del vendedor.';return}
 if(uid===owner.uid){label.textContent='No puedes registrar tu cuenta propietaria como vendedor.';return}
 button.disabled=true;label.textContent='Guardando perfil…';
 try{
  const ref=doc(db,'orgs',ORG,'members',uid),existing=await getDoc(ref);
  if(existing.exists()&&existing.data().role!=='seller')throw new Error('Ese UID ya pertenece a un perfil que no es vendedor. No se modificó.');
  await setDoc(ref,{role:'seller',active:true,displayName,provisionedBy:owner.uid,updatedAt:new Date().toISOString()},{merge:true});
  $('sellerUid').value='';$('sellerDisplayName').value='';
  label.textContent=existing.exists()?'Perfil vendedor activado y actualizado.':'Perfil vendedor asociado. La cuenta de acceso debe existir en Firebase Authentication.';
  selectedSellerId=uid;await refresh();
 }catch(error){console.error(error);label.textContent=error.message||'No se pudo guardar el perfil.'}
 finally{button.disabled=false}
}
async function toggleSeller(uid){
 if(!owner||navigator.onLine===false){status('Necesitas la cuenta propietaria y conexión para cambiar el acceso.','error');return}
 const seller=sellers.find(item=>item.uid===uid);if(!seller)return;
 const nextActive=seller.active!==true;
 if(!nextActive&&!window.confirm('¿Desactivar el acceso de '+(seller.displayName||seller.email||uid)+'?'))return;
 try{
  await updateDoc(doc(db,'orgs',ORG,'members',uid),{active:nextActive,updatedAt:new Date().toISOString()});
  status(nextActive?'Perfil vendedor activado.':'Acceso vendedor desactivado.','ok');await refresh();
 }catch(error){console.error(error);status(error.message||'No se pudo cambiar el acceso.','error')}
}
async function logout(){await signOut(auth);owner=null;sellers=[];sessions=[];sales=[];visits=[];cash=[]}
$('adminLoginButton').onclick=login;$('adminLogout').onclick=logout;$('adminDate').onchange=render;$('reportPeriod').onchange=render;$('reportReference').onchange=render;$('commissionMonth').onchange=renderCompResults;$('compSeller').onchange=renderCompForm;$('compAddTier').onclick=()=>{const tiers=readCompTiers();tiers.push({threshold:'',ratePct:''});renderCompTiers(tiers)};$('compSave').onclick=saveCompensation;$('sellerSaveProfile').onclick=saveSellerProfile;
$('catalogBackupConfirm').onchange=refreshCatalogPrepState;
$('catalogPrepareButton').onclick=prepareCatalog;
onAuthStateChanged(auth,user=>verify(user).catch(error=>{console.error(error);status('No se pudo verificar la cuenta.','error')}));
