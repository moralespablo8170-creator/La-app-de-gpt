import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// App del repartidor: entrega los pedidos que tomaron los vendedores hasta ayer.
// Ve dirección y datos del cliente, cuánto y cómo cobrar, ordena la ruta desde la oficina,
// marca cada pedido entregado y pagado (o rechazado) y lleva su jornada y caja del día.
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let db;try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(_){db=getFirestore(app)}
const ORG=ORG_ID;
const OFFICE_DEFAULT='Quebrada de Aroma 1517, Peñalolén, Santiago, Chile';
const $=id=>document.getElementById(id);
let gps={watch:null,last:null,sentAt:0,sent:null,track:[],error:''},profile=null,clients=new Map(),pending=[],delivered=[],session=null,unsubs=[],office={address:OFFICE_DEFAULT,lat:null,lng:null},order=[],map=null,mapLayer=null,modalSale=null,modalPay='';
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const money=v=>'$'+Math.round(Number(v)||0).toLocaleString('es-CL');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPerm=e=>String(e?.code||'').includes('permission-denied');
const saleDay=s=>String(s.fecha||s.date||s.occurredAt||'').slice(0,10);
const sessionId=()=>profile.uid+'_'+localDate();
const prefix=()=>'zipperDriver_'+(profile?.uid||'x')+'_';
let toastTimer=null;
function status(msg,state=''){
 if(!profile){const l=$('loginStatus');l.textContent=msg;l.className='login-status'+(state?' '+state:'');return}
 const t=$('toast');t.textContent=msg;t.className='toast'+(state?' '+state:'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('fade'),state==='error'?7000:3500);
}
function loginError(e){const c=String(e?.code||'');if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Correo o clave incorrectos, o la cuenta aún no existe. Si no recuerdas la clave, toca "¿Olvidaste tu clave?".';if(c.includes('network'))return 'Sin conexión a internet.';if(c.includes('too-many'))return 'Demasiados intentos. Espera unos minutos.';return e?.message||'No se pudo iniciar sesión.'}

// ===== Ingreso =====
async function signIn(){
 $('loginBtn').disabled=true;status('Verificando cuenta…');
 try{await setPersistence(auth,browserLocalPersistence);const r=await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';await enter(r.user)}
 catch(e){status(loginError(e),'error');$('loginBtn').disabled=false}
}
async function enter(user){
 const snap=await getDoc(doc(db,'orgs',ORG,'members',user.uid));const m=snap.exists()?snap.data():null;
 if(!m||m.active!==true||m.role!=='driver'){await signOut(auth);throw new Error('Esta cuenta no es de repartidor activo. Pide al dueño que revise tu acceso.')}
 profile={uid:user.uid,email:user.email||'',...m};
 $('loginBox').classList.add('hide');$('appBox').classList.remove('hide');$('nav').classList.remove('hide');$('logout').classList.remove('hide');
 try{const o=JSON.parse(localStorage.getItem(prefix()+'office')||'null');if(o)office=o}catch(_){}
 try{const s=JSON.parse(localStorage.getItem(prefix()+'session')||'null');if(s&&s.id===sessionId())session=s}catch(_){}
 try{order=JSON.parse(localStorage.getItem(prefix()+'order_'+localDate())||'[]')}catch(_){order=[]}
 render();status('Hola, '+(profile.displayName||'repartidor')+'. Cargando pedidos…');
 try{const st=await getDoc(doc(db,'orgs',ORG,'settings','delivery'));if(st.exists()&&st.data().officeAddress){const d=st.data();if(d.officeAddress!==office.address)office={address:d.officeAddress,lat:Number(d.officeLat)||null,lng:Number(d.officeLng)||null};localStorage.setItem(prefix()+'office',JSON.stringify(office))}}catch(_){}
 try{const s=await getDoc(doc(db,'orgs',ORG,'driverSessions',sessionId()));if(s.exists())session={id:s.id,...s.data()}}catch(_){}
 watch();
 if(sessionOpen())startGps();
}
function watch(){
 unsubs.forEach(f=>{try{f()}catch(_){}});unsubs=[];
 unsubs.push(onSnapshot(doc(db,'orgs',ORG,'members',profile.uid),s=>{const m=s.exists()?s.data():null;if(!m||m.active!==true||m.role!=='driver'){status('El dueño desactivó este acceso.','error');logout(true)}},()=>{}));
 unsubs.push(onSnapshot(collection(db,'orgs',ORG,'clients'),s=>{clients=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]));render()},e=>status('No se pudieron cargar los clientes: '+(isPerm(e)?'permiso denegado (el dueño debe publicar las reglas nuevas).':e.message),'error')));
 unsubs.push(onSnapshot(query(collection(db,'orgs',ORG,'sales'),where('collectionStatus','==','awaiting_delivery')),s=>{pending=s.docs.map(d=>({id:d.id,...d.data()}));render()},e=>status('No se pudieron cargar los pedidos: '+(isPerm(e)?'permiso denegado (el dueño debe publicar las reglas nuevas).':e.message),'error')));
 unsubs.push(onSnapshot(query(collection(db,'orgs',ORG,'sales'),where('deliveredBy','==',profile.uid)),s=>{delivered=s.docs.map(d=>({id:d.id,...d.data()}));render()},()=>{}));
}

// ===== Pedidos =====
// Se entregan hoy los pedidos tomados hasta ayer; los de hoy quedan para mañana.
const toDeliver=()=>pending.filter(s=>saleDay(s)<localDate());
const deliveredToday=()=>delivered.filter(s=>String(s.deliveredAt||s.collectedAt||'').slice(0,10)===localDate());
const clientOf=s=>clients.get(String(s.clienteId))||{name:s.cliente||'Cliente'};
const fullAddress=c=>[c.address,c.comuna,'Santiago','Chile'].filter(Boolean).join(', ');
const sessionOpen=()=>!!session&&session.status==='open';
function sortedPending(){
 const list=toDeliver(),pos=new Map(order.map((id,i)=>[String(id),i]));
 return list.slice().sort((a,b)=>(pos.has(String(a.id))?pos.get(String(a.id)):9999)-(pos.has(String(b.id))?pos.get(String(b.id)):9999)||saleDay(a).localeCompare(saleDay(b)));
}
function deliveryCard(s,i,kind){
 const c=clientOf(s),pay=s.paymentMethod==='transfer'?'transfer':'cash',phone=String(c.phone||'').replace(/\D/g,'');
 const items=(s.items||[]).map(x=>x.qty+' × '+safe(x.desc)).join(' · ');
 const done=kind==='done',rej=s.collectionStatus==='delivery_rejected';
 return '<div class="delivery'+(done?(rej?' rej':' done'):'')+'"><div class="d-top"><div class="d-num">'+(done?(rej?'✖':'✓'):(i+1))+'</div><div><div class="d-name">'+safe(c.name)+'</div><div class="d-info">📍 '+safe(c.address||'Sin dirección')+(c.comuna?', '+safe(c.comuna):'')+'</div></div><div class="d-amount">'+money(s.total)+'<small><span class="pay-tag pay-'+pay+'">'+(pay==='transfer'?'🏦 Transferencia':'💵 Efectivo')+'</span></small></div></div>'+
  '<div class="d-info">'+(phone?'📞 <a href="tel:+'+safe(phone)+'">'+safe(phone)+'</a> · <a href="https://wa.me/'+safe(phone)+'" target="_blank" rel="noopener">WhatsApp</a> · ':'')+'<a href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(fullAddress(c))+'" target="_blank" rel="noopener">🧭 Cómo llegar</a>'+(c.observations?'<br>📝 '+safe(c.observations):'')+(c.rut?'<br>RUT '+safe(c.rut)+(c.razonSocial?' · '+safe(c.razonSocial):''):'')+'</div>'+
  '<div class="d-items">🧾 Pedido #'+safe(s.folio||'')+' del '+safe(saleDay(s))+'<br>'+items+'</div>'+
  (done?'<div class="d-info">'+(rej?'Rechazado'+(s.deliveryNote?': '+safe(s.deliveryNote):''):'Entregado · pagó con '+(pay==='transfer'?'transferencia':'efectivo')+(s.paymentMethodOriginal&&s.paymentMethodOriginal!==pay?' (cambió)':''))+'</div>'
   :'<div class="actions"><button type="button" data-deliver="'+safe(s.id)+'"'+(sessionOpen()?'':' disabled')+'>✅ Entregado</button><button type="button" class="danger" data-reject="'+safe(s.id)+'"'+(sessionOpen()?'':' disabled')+'>✖ Rechazado</button></div>')+'</div>';
}
function render(){
 if(!profile)return;renderGps();
 $('welcome').textContent=(profile.displayName||'Repartidor')+' · '+(navigator.onLine?'en línea':'sin internet');
 const open=sessionOpen(),closed=session&&session.status==='closed';
 $('state').textContent=open?'Abierta':closed?'Cerrada':'Sin iniciar';
 $('sessionInfo').textContent=session?.openedAtLocal?'Inicio '+new Date(session.openedAtLocal).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+(session.closedAtLocal?' · Término '+new Date(session.closedAtLocal).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''):'';
 $('startBtn').disabled=open;$('startBtn').textContent=closed?'Reabrir jornada':'Iniciar jornada';$('closeBtn').disabled=!open;$('routeHint').classList.toggle('hide',open);
 const list=sortedPending(),today=deliveredToday();
 $('deliveredCount').textContent=String(today.filter(s=>s.collectionStatus==='collected').length);
 $('routeSummary').textContent=list.length+' por entregar · Total por cobrar '+money(list.reduce((a,s)=>a+Number(s.total||0),0))+' · Parte desde '+office.address.split(',').slice(0,2).join(',');
 $('deliveries').innerHTML=(list.length?list.map((s,i)=>deliveryCard(s,i,'')).join(''):'<p class="muted">🎉 No quedan pedidos por entregar. Revisa la pestaña Entregados para cuadrar la caja.</p>');
 const ok=today.filter(s=>s.collectionStatus==='collected'),cash=ok.filter(s=>s.paymentMethod!=='transfer').reduce((a,s)=>a+Number(s.total||0),0),tr=ok.filter(s=>s.paymentMethod==='transfer').reduce((a,s)=>a+Number(s.total||0),0);
 $('cashTotal').textContent=money(cash);$('transferTotal').textContent=money(tr);$('rejectedCount').textContent=String(today.filter(s=>s.collectionStatus==='delivery_rejected').length);
 $('cashList').innerHTML=today.length?today.map(s=>deliveryCard(s,0,'done')).join(''):'<p class="muted">Aún no hay entregas hoy.</p>';
 $('doneTabCount').textContent=today.length?' ('+today.length+')':'';
}

// ===== GPS: mientras la jornada está abierta y la app abierta, comparte la ubicación con el dueño =====
function startGps(){
 if(gps.watch!=null||!('geolocation' in navigator))return;
 try{const t=JSON.parse(localStorage.getItem(prefix()+'track_'+localDate())||'[]');if(Array.isArray(t))gps.track=t}catch(_){}
 gps.watch=navigator.geolocation.watchPosition(p=>{gps.error='';gps.last={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy||0),t:new Date().toISOString()};sendGps(false);renderGps()},
  e=>{gps.error=e.code===1?'Permiso de ubicación denegado: actívalo en el teléfono para que el dueño vea dónde estás.':'No se pudo obtener la ubicación.';renderGps()},
  {enableHighAccuracy:true,maximumAge:30000,timeout:30000});
}
function stopGps(){if(gps.watch!=null){navigator.geolocation.clearWatch(gps.watch);gps.watch=null}renderGps()}
async function sendGps(force){
 const p=gps.last;if(!p||!sessionOpen())return;
 const moved=gps.sent?dist(gps.sent,p)*1000:Infinity;
 if(!force&&Date.now()-gps.sentAt<120000&&moved<150)return; // cada 2 minutos o al moverse 150 m
 gps.sentAt=Date.now();gps.sent=p;
 gps.track=[...gps.track,{lat:p.lat,lng:p.lng,t:p.t}].slice(-400);
 try{localStorage.setItem(prefix()+'track_'+localDate(),JSON.stringify(gps.track))}catch(_){}
 try{await setDoc(doc(db,'orgs',ORG,'driverSessions',sessionId()),{id:sessionId(),driverUid:profile.uid,lastLat:p.lat,lastLng:p.lng,lastAccuracy:p.acc,lastLocAt:p.t,track:gps.track,updatedAt:serverTimestamp()},{merge:true})}catch(e){console.warn('GPS:',e)}
}
function renderGps(){const el=$('gpsStatus');if(!el)return;el.textContent=gps.error?'⚠️ '+gps.error:gps.watch==null?'📍 La ubicación se comparte con el dueño mientras la jornada está abierta.':gps.last?'📍 Ubicación compartida · '+new Date(gps.last.t).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+' (precisión '+gps.last.acc+' m). Mantén la app abierta.':'📍 Buscando ubicación…';el.className='muted'+(gps.error?' gps-warn':'')}

// ===== Jornada =====
async function saveSession(extra){
 const today=deliveredToday(),ok=today.filter(s=>s.collectionStatus==='collected');
 const row={id:sessionId(),driverUid:profile.uid,status:session?.status||'open',openedAt:session?.openedAt||serverTimestamp(),openedAtLocal:session?.openedAtLocal||new Date().toISOString(),closedAt:session?.closedAt??null,closedAtLocal:session?.closedAtLocal??null,delivered:ok.length,rejected:today.length-ok.length,cashTotal:ok.filter(s=>s.paymentMethod!=='transfer').reduce((a,s)=>a+Number(s.total||0),0),transferTotal:ok.filter(s=>s.paymentMethod==='transfer').reduce((a,s)=>a+Number(s.total||0),0),updatedAt:serverTimestamp(),...extra};
 session={...row,openedAt:row.openedAtLocal};localStorage.setItem(prefix()+'session',JSON.stringify(session));render();
 await setDoc(doc(db,'orgs',ORG,'driverSessions',row.id),row,{merge:true});
}
async function startSession(){
 try{const p=saveSession({status:'open',closedAt:null,closedAtLocal:null});startGps();status('✅ Jornada iniciada. '+toDeliver().length+' pedidos por entregar.','ok');await p;sendGps(true)}
 catch(e){status('No se pudo guardar la jornada: '+(isPerm(e)?'permiso denegado (faltan reglas nuevas).':e.message),'error')}
}
async function closeSession(){
 const left=toDeliver().length;if(!confirm(left?'Quedan '+left+' pedidos sin entregar. ¿Estás seguro que quieres cerrar la jornada igual?':'¿Estás seguro que quieres cerrar la jornada?'))return;
 const now=new Date().toISOString();
 try{await sendGps(true);stopGps();const p=saveSession({status:'closed',closedAt:serverTimestamp(),closedAtLocal:now});status('Jornada cerrada. Efectivo a rendir: '+$('cashTotal').textContent,'ok');await p}
 catch(e){status('No se pudo cerrar la jornada: '+e.message,'error')}
}

// ===== Entregar / rechazar =====
function openDeliver(id){
 const s=pending.find(x=>String(x.id)===String(id));if(!s)return;modalSale=s;modalPay='';
 $('dmTitle').textContent=clientOf(s).name;$('dmAmount').textContent='Cobrar '+money(s.total)+' · el vendedor anotó: '+(s.paymentMethod==='transfer'?'Transferencia':'Efectivo');
 document.querySelectorAll('#deliverModal .pay-opt').forEach(b=>b.classList.remove('on'));$('dmConfirm').disabled=true;$('dmNote').textContent='Si el cliente paga distinto, elige cómo pagó realmente.';
 $('deliverModal').classList.remove('hide');
}
async function confirmDeliver(){
 const s=modalSale;if(!s||!modalPay)return;$('deliverModal').classList.add('hide');
 const now=new Date().toISOString(),data={...(gps.last?{deliveredLat:gps.last.lat,deliveredLng:gps.last.lng}:{}),collectionStatus:'collected',collectedAt:now,deliveredAt:now,deliveredBy:profile.uid,deliveredByName:profile.displayName||profile.email||'Repartidor',paymentMethod:modalPay};
 if(modalPay!==(s.paymentMethod==='transfer'?'transfer':'cash'))data.paymentMethodOriginal=s.paymentMethod||'cash';
 await applyUpdate(s,data,'✅ '+clientOf(s).name+' entregado · '+money(s.total)+' en '+(modalPay==='transfer'?'transferencia':'efectivo')+'.');
}
async function reject(id){
 const s=pending.find(x=>String(x.id)===String(id));if(!s)return;
 const note=prompt('¿Por qué se rechazó el pedido de '+clientOf(s).name+'? (cerrado, no tenía dinero, no lo pidió…)','');if(note===null)return;
 const now=new Date().toISOString();
 await applyUpdate(s,{...(gps.last?{deliveredLat:gps.last.lat,deliveredLng:gps.last.lng}:{}),collectionStatus:'delivery_rejected',deliveredAt:now,deliveredBy:profile.uid,deliveredByName:profile.displayName||profile.email||'Repartidor',deliveryNote:String(note).slice(0,200),paymentMethod:s.paymentMethod==='transfer'?'transfer':'cash'},'✖ Pedido de '+clientOf(s).name+' marcado como rechazado. El dueño lo revisa en su caja.');
}
async function applyUpdate(s,data,msg){
 // Se refleja al tiro en pantalla; si no hay señal, Firebase lo envía al reconectar.
 pending=pending.filter(x=>x.id!==s.id);delivered=[{...s,...data},...delivered.filter(x=>x.id!==s.id)];render();status(navigator.onLine?msg:msg+' (se enviará al volver la señal)','ok');
 try{const p=updateDoc(doc(db,'orgs',ORG,'sales',String(s.id)),data);if(navigator.onLine)await p;saveSession({}).catch(()=>{})}
 catch(e){status('No se pudo guardar: '+(isPerm(e)?'permiso denegado (faltan reglas nuevas).':e.message),'error');pending=[s,...pending];delivered=delivered.filter(x=>x.id!==s.id);render()}
}

// ===== Ruta: ubicar direcciones y ordenar desde la oficina =====
const geoKey='zipperGeoCache';
const geoCache=()=>{try{return JSON.parse(localStorage.getItem(geoKey)||'{}')}catch(_){return {}}};
async function geocode(address){
 const cache=geoCache();if(cache[address])return cache[address];
 const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q='+encodeURIComponent(address);
 const r=await fetch(url,{headers:{'Accept-Language':'es'}});const j=await r.json();
 const hit=j&&j[0]?{lat:Number(j[0].lat),lng:Number(j[0].lon)}:null;
 cache[address]=hit;try{localStorage.setItem(geoKey,JSON.stringify(cache))}catch(_){}
 return hit;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dist=(a,b)=>{const R=6371,dLa=(b.lat-a.lat)*Math.PI/180,dLo=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLa/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
function bestOrder(start,points){
 // Vecino más cercano y luego mejora 2-opt: recorrido corto sin volver sobre los pasos.
 const left=points.slice(),route=[];let cur=start;
 while(left.length){let k=0;left.forEach((p,i)=>{if(dist(cur,p)<dist(cur,left[k]))k=i});cur=left.splice(k,1)[0];route.push(cur)}
 const len=r=>r.reduce((a,p,i)=>a+dist(i?r[i-1]:start,p),0);let improved=true;
 while(improved){improved=false;for(let i=0;i<route.length-1;i++)for(let j=i+1;j<route.length;j++){const n=route.slice(0,i).concat(route.slice(i,j+1).reverse(),route.slice(j+1));if(len(n)+1e-9<len(route)){route.splice(0,route.length,...n);improved=true}}}
 return route;
}
async function orderRoute(){
 const list=toDeliver();if(!list.length){status('No hay pedidos para ordenar.');return}
 $('orderBtn').disabled=true;$('geoStatus').textContent='Ubicando direcciones en el mapa…';
 try{
  if(!office.lat){const o=await geocode(office.address);if(o){office={...office,...o};localStorage.setItem(prefix()+'office',JSON.stringify(office))}}
  if(!office.lat)throw new Error('No encontré la dirección de la oficina en el mapa.');
  const pts=[],missing=[];
  for(const s of list){const c=clientOf(s),addr=fullAddress(c),cached=geoCache()[addr];let g=cached;if(g===undefined){g=await geocode(addr).catch(()=>null);await sleep(1100)}if(g)pts.push({...g,id:String(s.id),name:c.name});else missing.push(c.name);$('geoStatus').textContent='Ubicando direcciones… '+(pts.length+missing.length)+' de '+list.length}
  const route=bestOrder({lat:office.lat,lng:office.lng},pts);
  order=[...route.map(p=>p.id),...list.filter(s=>!route.some(p=>p.id===String(s.id))).map(s=>String(s.id))];
  localStorage.setItem(prefix()+'order_'+localDate(),JSON.stringify(order));
  drawMap(route);render();
  const km=route.reduce((a,p,i)=>a+dist(i?route[i-1]:office,p),0);
  $('geoStatus').textContent='Ruta ordenada desde la oficina · ~'+km.toFixed(1)+' km en línea recta'+(missing.length?' · Sin ubicar (van al final): '+missing.join(', '):'');
  status('🧭 Ruta ordenada. Sigue los números de arriba hacia abajo.','ok');
 }catch(e){$('geoStatus').textContent='No se pudo ordenar: '+(e.message||e)+'. Revisa internet.'}
 finally{$('orderBtn').disabled=false}
}
function drawMap(route){
 if(typeof L==='undefined'){$('geoStatus').textContent+=' (el mapa no cargó)';return}
 $('map').classList.remove('hide');
 if(!map){map=L.map('map');L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map)}
 if(mapLayer)mapLayer.remove();mapLayer=L.layerGroup().addTo(map);
 const home=[office.lat,office.lng];L.marker(home,{icon:L.divIcon({className:'home',html:'🏠',iconSize:[28,28]})}).addTo(mapLayer).bindPopup('Oficina');
 route.forEach((p,i)=>L.marker([p.lat,p.lng],{icon:L.divIcon({className:'num',html:String(i+1),iconSize:[28,28]})}).addTo(mapLayer).bindPopup((i+1)+'. '+safe(p.name)));
 L.polyline([home,...route.map(p=>[p.lat,p.lng])],{color:'#1265e8',weight:4,opacity:.7}).addTo(mapLayer);
 map.fitBounds(L.latLngBounds([home,...route.map(p=>[p.lat,p.lng])]).pad(.15));
 setTimeout(()=>map.invalidateSize(),100);
}
function openGoogleMaps(){
 const list=sortedPending();if(!list.length){status('No hay pedidos por entregar.');return}
 // Google Maps acepta hasta 9 paradas intermedias por enlace: se abre el primer tramo.
 const stops=list.slice(0,10).map(s=>fullAddress(clientOf(s)));
 const url='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(office.address)+'&destination='+encodeURIComponent(stops[stops.length-1])+(stops.length>1?'&waypoints='+encodeURIComponent(stops.slice(0,-1).join('|')):'');
 window.open(url,'_blank');
 if(list.length>10)status('Google Maps abre las primeras 10 entregas. Al terminarlas vuelve a tocar el botón.','warn');
}

async function logout(forced){unsubs.forEach(f=>{try{f()}catch(_){}});unsubs=[];await signOut(auth).catch(()=>{});profile=null;$('appBox').classList.add('hide');$('nav').classList.add('hide');$('logout').classList.add('hide');$('loginBox').classList.remove('hide');$('loginBtn').disabled=false;if(!forced)status('Sesión cerrada.')}
function tab(n){$('tabDay').classList.toggle('hide',n!=='day');$('tabCash').classList.toggle('hide',n!=='cash');document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===n));window.scrollTo({top:0})}

$('loginBtn').onclick=signIn;$('password').onkeydown=e=>{if(e.key==='Enter')signIn()};
$('forgot').onclick=async()=>{const e=$('email').value.trim();if(!e){status('Escribe tu correo arriba.','error');return}try{await sendPasswordResetEmail(auth,e);status('Te enviamos un correo para crear una clave nueva.','ok')}catch(x){status(loginError(x),'error')}};
$('logout').onclick=()=>logout(false);$('startBtn').onclick=startSession;$('closeBtn').onclick=closeSession;
$('orderBtn').onclick=orderRoute;$('gmapsBtn').onclick=openGoogleMaps;
$('deliveries').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.deliver)openDeliver(b.dataset.deliver);else if(b.dataset.reject)reject(b.dataset.reject)};
document.querySelectorAll('#deliverModal .pay-opt').forEach(b=>b.onclick=()=>{modalPay=b.dataset.pay;document.querySelectorAll('#deliverModal .pay-opt').forEach(x=>x.classList.toggle('on',x===b));$('dmConfirm').disabled=false});
$('dmConfirm').onclick=confirmDeliver;$('dmCancel').onclick=()=>$('deliverModal').classList.add('hide');
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
addEventListener('online',()=>{status('Conexión recuperada.','ok');render()});addEventListener('offline',()=>{status('Sin internet · las entregas se envían al volver la señal.','warn');render()});
onAuthStateChanged(auth,async user=>{if(!user){if(!profile)status('Ingresa con tu correo y clave.');return}if(profile)return;try{await enter(user)}catch(e){status(e.message,'error')}});
