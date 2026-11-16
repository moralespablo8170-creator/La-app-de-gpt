import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import {
  getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc,
  runTransaction, serverTimestamp, updateDoc, increment
} from 'firebase/firestore';

// App del vendedor con el formato de la simulación: pestañas "Mi ruta" y "Clientes",
// jornada con estado visible, carrito con bandeja y avisos que siempre se ven.
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let db;
try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(_){db=getFirestore(app)}
const ORG=ORG_ID;
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const $=id=>document.getElementById(id);
let profile=null,clients=[],products=[],sales=[],visits=[],selectedClient=null,cart=[],session=null,unsubs=[],showTray=true,currentTab='route';
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const prefix=()=>profile?'zipperSeller_'+profile.uid+'_':'zipperSeller_guest_';
const cacheRead=name=>{try{const v=JSON.parse(localStorage.getItem(prefix()+name)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const cacheWrite=(name,value)=>{try{localStorage.setItem(prefix()+name,JSON.stringify(value))}catch(error){console.error(error)}};
const queueRead=()=>{try{const v=JSON.parse(localStorage.getItem(prefix()+'pendingSales')||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const queueWrite=value=>{try{localStorage.setItem(prefix()+'pendingSales',JSON.stringify(value))}catch(error){console.error(error)}};
const sessionId=()=>profile.uid+'_'+localDate();
const isPermission=e=>String(e?.code||'').includes('permission-denied');

// Aviso flotante sobre la barra inferior: siempre visible, sin importar dónde esté la pantalla.
let toastTimer=null;
function status(message,state=''){
 const login=$('sellerLoginStatus');if(login&&!profile){login.textContent=message;login.className='login-status'+(state?' '+state:'')}
 const el=$('sellerStatus');if(!el||!profile)return;
 el.textContent=message;el.className='toast'+(state?' '+state:'');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('fade'),state==='error'?7000:3500);
}
function clearSellerLocalData(uid){const keyPrefix='zipperSeller_'+uid+'_';Object.keys(localStorage).filter(key=>key.startsWith(keyPrefix)).forEach(key=>localStorage.removeItem(key))}
function showApp(on){$('sellerLogin').classList.toggle('hide',on);$('sellerApp').classList.toggle('hide',!on);$('sellerNav').classList.toggle('hide',!on);$('sellerLogout').classList.toggle('hide',!on)}
function lockRevokedSeller(){
 const uid=profile?.uid||auth.currentUser?.uid;
 unsubs.forEach(fn=>{try{fn()}catch(_){}});unsubs=[];
 if(uid)clearSellerLocalData(uid);
 profile=null;clients=[];products=[];sales=[];visits=[];selectedClient=null;cart=[];session=null;
 showApp(false);$('sellerLoginButton').disabled=false;
 status('El dueño desactivó este perfil. La sesión se cerró.','error');
 signOut(auth).catch(error=>console.warn('No se pudo completar el cierre de sesión tras desactivar el perfil.',error));
}
function safeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(value){return '$'+Math.round(Number(value)||0).toLocaleString('es-CL')}
const norm=s=>String(s||'').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();

// ===== Ruta =====
function routeFor(client,week){return client?.sellerRoutes?.[profile.uid]?.[week]||null}
function selectedRoute(){return {week:$('sellerWeek').value||'A',day:$('sellerDay').value||''}}
function routeClients(){const {week,day}=selectedRoute();return clients.filter(c=>c.active!==false&&routeFor(c,week)?.day===day).sort((a,b)=>(Number(routeFor(a,week)?.position)||999999)-(Number(routeFor(b,week)?.position)||999999)||String(a.name).localeCompare(String(b.name),'es'))}
const todaySales=()=>sales.filter(s=>String(s.fecha||s.date||'').slice(0,10)===localDate());
const todayVisits=()=>visits.filter(v=>String(v.date||'').slice(0,10)===localDate());
function attendedState(clientId){const id=String(clientId);if(todaySales().some(s=>String(s.clienteId)===id)||queueRead().some(s=>String(s.clienteId)===id))return 'sale';if(todayVisits().some(v=>String(v.clientId)===id))return 'visited';return ''}
const sessionOpen=()=>!!session&&session.status==='open'&&!session.closedAt;
function renderRouteDays(){const week=$('sellerWeek').value||'A',select=$('sellerDay'),current=select.value;const count=d=>clients.filter(c=>c.active!==false&&routeFor(c,week)?.day===d).length;select.innerHTML=DAYS.map(d=>'<option value="'+d+'">'+d+(count(d)?' ('+count(d)+')':'')+'</option>').join('');if(DAYS.includes(current))select.value=current;else{const withClients=DAYS.filter(count);const today=DAYS[(new Date().getDay()+6)%7];select.value=withClients.includes(today)?today:(withClients[0]||today||'Lunes')}}
function renderSession(){
 const open=sessionOpen(),closed=!!session&&(session.status==='closed'||!!session.closedAt);
 $('state').textContent=open?'Abierta':closed?'Cerrada':'Sin iniciar';
 $('count').textContent=String(todaySales().length+queueRead().length);
 $('sessionInfo').textContent=open?'Jornada de Semana '+session.routeWeek+' · '+session.routeDay+(session.openedAtLocal?' · desde las '+new Date(session.openedAtLocal).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''):closed?'Jornada cerrada hoy. Puedes volver a abrirla si necesitas seguir.':'';
 $('sellerStart').disabled=open;$('sellerStart').textContent=closed?'Reabrir jornada':'Iniciar jornada';$('sellerClose').disabled=!open;
 $('routeHint').classList.toggle('hide',open);
}
function renderClients(){
 const {week}=selectedRoute(),open=sessionOpen(),all=routeClients(),pending=all.filter(c=>!attendedState(c.id));
 $('routeSummary').textContent=(all.length-pending.length)+' atendidos · '+pending.length+' pendientes';
 $('sellerClients').innerHTML=pending.length?pending.map((c,i)=>'<div class="line"><strong>'+(i+1)+'. '+safeText(c.name)+'</strong><small>'+safeText(c.address||'Sin dirección')+(c.phone?' · '+safeText(c.phone):'')+'</small><span class="badge">Pendiente</span><div class="actions"><button class="secondary" type="button" data-visit="'+safeText(c.id)+'"'+(open?'':' disabled')+'>Visitado</button><button type="button" data-sale="'+safeText(c.id)+'"'+(open?'':' disabled')+'>Pedido</button></div><div class="actions"><button class="mini" type="button" data-up="'+safeText(c.id)+'"'+(i===0?' disabled':'')+'>↑ Subir</button><button class="mini" type="button" data-down="'+safeText(c.id)+'"'+(i===pending.length-1?' disabled':'')+'>↓ Bajar</button><button class="mini" type="button" data-move="'+safeText(c.id)+'">📅 Cambiar día</button></div></div>').join(''):'<p class="muted">'+(all.length?'🎉 Atendiste a todos los clientes de este día.':'Aún no tienes clientes este día. Agrégalos con "＋ Nuevo cliente en mi ruta".')+'</p>';
}
function renderAttended(){
 const {week,day}=selectedRoute();
 const ids=[...new Set([...todaySales().map(s=>String(s.clienteId)),...queueRead().map(s=>String(s.clienteId)),...todayVisits().map(v=>String(v.clientId))])];
 const rows=ids.map(id=>clients.find(c=>String(c.id)===id)).filter(Boolean);
 $('attended').innerHTML=rows.length?rows.map(c=>{const st=attendedState(c.id);return '<div class="line"><strong>'+safeText(c.name)+'</strong><span class="client-status '+(st==='sale'?'ok':'warn')+'">'+(st==='sale'?'✓ Venta registrada':'● Visitado sin venta')+'</span><div class="actions"><button class="secondary" type="button" data-reopen="'+safeText(c.id)+'">Atender nuevamente</button></div></div>'}).join(''):'<p class="muted">Todavía no hay clientes atendidos hoy.</p>';
 const q=norm($('clientSearch').value);
 const list=clients.filter(c=>c.active!==false&&(!q||norm(c.name+' '+c.address).includes(q))).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es')).slice(0,q?40:12);
 $('allClients').innerHTML=list.map(c=>{const r=routeFor(c,'A')||routeFor(c,'B');return '<div class="line"><strong>'+safeText(c.name)+'</strong><small>'+safeText(c.address||'')+(r?' · '+safeText(r.day):'')+'</small><div class="actions"><button class="secondary" type="button" data-reopen="'+safeText(c.id)+'">Abrir pedido</button></div></div>'}).join('')||'<p class="muted">Sin resultados.</p>';
}
function availableStock(p){const inCart=cart.filter(i=>String(i.productId)===String(p.id)).reduce((n,i)=>n+i.qty,0);return Math.max(0,Number(p.stock||0)-inCart)}
const sellable=()=>products.filter(p=>p&&p.active!==false&&p.id!=null&&String(p.name||'').trim()).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));
function renderProducts(){
 const sel=$('sellerProduct'),cur=sel.value,q=norm($('productSearch').value),list=sellable().filter(p=>!q||norm(p.name).includes(q));
 sel.innerHTML=list.length?list.map(p=>'<option value="'+safeText(p.id)+'">'+safeText(p.name)+' · '+money(p.price)+'</option>').join(''):'<option value="">'+(products.length?'Sin coincidencias':'Inventario aún no disponible')+'</option>';
 if(list.some(p=>String(p.id)===cur))sel.value=cur;
 const p=products.find(x=>String(x.id)===sel.value),left=p?availableStock(p):0;
 $('stockInfo').textContent='Stock disponible: '+left+' unidades';$('stockInfo').classList.toggle('empty',left===0);
 const iq=norm($('inventorySearch').value);
 $('sellerInventory').innerHTML=sellable().filter(p=>!iq||norm(p.name).includes(iq)).map(p=>'<div class="product"><span>'+safeText(p.name)+'</span><b style="color:'+(Number(p.stock||0)>0?'#166534':'#b91c1c')+'">'+Number(p.stock||0)+' und · '+money(p.price)+'</b></div>').join('')||'<p class="muted">Inventario aún no disponible. Conéctate a internet para cargarlo la primera vez.</p>';
}
function renderCart(){
 const open=sessionOpen();
 $('chosen').textContent=selectedClient?'Cliente: '+selectedClient.name:'Selecciona un cliente desde Mi ruta (botón "Pedido").';
 $('sellerAddItem').disabled=!open||!selectedClient;
 $('trayToggle').textContent=showTray?'Ocultar bandeja':'Ver bandeja ('+cart.reduce((n,i)=>n+i.qty,0)+')';$('sellerCart').classList.toggle('hide',!showTray);
 $('sellerCart').innerHTML=cart.length?cart.map((item,i)=>{const p=products.find(x=>String(x.id)===String(item.productId));return '<div class="line"><strong>📦 '+safeText(item.name)+'</strong><small>'+item.qty+' × '+money(item.price)+' = '+money(item.qty*item.price)+(p?' · Stock disponible: '+availableStock(p):'')+'</small><div class="actions"><button class="secondary" type="button" data-minus="'+i+'">−</button><span class="qty">'+item.qty+'</span><button class="secondary" type="button" data-plus="'+i+'"'+(p&&availableStock(p)<=0?' disabled':'')+'>＋</button><button class="secondary" type="button" data-remove="'+i+'">Eliminar</button></div></div>'}).join(''):'<p class="muted">La bandeja está vacía.</p>';
 $('sellerSaleTotal').textContent=money(cart.reduce((n,i)=>n+i.qty*i.price,0));
 $('sellerSaveSale').disabled=!open||!selectedClient||!cart.length;
}
function renderSales(){
 const pending=queueRead(),today=todaySales().sort((a,b)=>String(b.occurredAt||'').localeCompare(String(a.occurredAt||'')));
 $('sellerSalesToday').innerHTML=[...pending.map(s=>({...s,_pending:true})),...today.filter(s=>!pending.some(p=>String(p.id)===String(s.id)))].map(s=>'<div class="line"><strong>#'+safeText(s.folio||'—')+' · '+safeText(s.cliente)+'</strong><small>'+money(s.total)+' · '+(s.paymentMethod==='transfer'?'Transferencia':'Efectivo')+' · '+(s._pending?'⏳ Pendiente de enviar':'✓ Guardada en Firebase')+'</small></div>').join('')||'<p class="muted">Todavía no hay ventas hoy.</p>';
}
function tab(name){currentTab=name;$('routeTab').classList.toggle('hide',name!=='route');$('saleTab').classList.toggle('hide',name!=='sale');document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name))}
function render(){if(!profile)return;$('sellerWelcome').textContent=(profile.displayName||profile.email||'Vendedor')+' · '+(navigator.onLine?'en línea':'sin internet');renderSession();renderClients();renderAttended();renderProducts();renderCart();renderSales()}

// ===== Ingreso =====
async function requirePreparedSellerMode(){
 const snap=await getDoc(doc(db,'orgs',ORG,'settings','sellerMode'));
 const mode=snap.exists()?snap.data():null;
 if(!mode||mode.enabled!==true||mode.catalogVersion!==1)throw new Error('El acceso de vendedores aún no está activo. Pide al dueño que lo encienda en Control de vendedores.');
}
async function signIn(){
 const button=$('sellerLoginButton');button.disabled=true;status('Verificando cuenta…');
 try{
  await setPersistence(auth,browserLocalPersistence);
  const result=await signInWithEmailAndPassword(auth,$('sellerEmail').value.trim(),$('sellerPassword').value);
  const member=await getDoc(doc(db,'orgs',ORG,'members',result.user.uid));
  const data=member.exists()?member.data():null;
  if(!data||data.active!==true||data.role!=='seller'){await signOut(auth);throw new Error('Esta cuenta no tiene un perfil de vendedor activo. Pide al dueño que revise su acceso.')}
  await requirePreparedSellerMode();
  profile={uid:result.user.uid,email:result.user.email||'',...data};
  $('sellerPassword').value='';
  await activate();
 }catch(error){status(loginError(error),'error');button.disabled=false}
}
function loginError(error){
 const code=String(error?.code||'');
 if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'Correo o clave incorrectos, o la cuenta aún no existe. Escribe el correo y la clave tal cual te los entregó el dueño. Si no recuerdas la clave, toca "¿Olvidaste tu clave?".';
 if(code.includes('invalid-email'))return 'El correo no es válido. Revísalo.';
 if(code.includes('too-many-requests'))return 'Demasiados intentos. Espera unos minutos o cambia la clave con "¿Olvidaste tu clave?".';
 if(code.includes('network-request-failed'))return 'Sin conexión a internet. Conéctate e intenta de nuevo.';
 if(code.includes('user-disabled'))return 'Esta cuenta está deshabilitada. Habla con el dueño.';
 if(code.includes('permission-denied'))return 'Firebase rechazó el acceso. El dueño debe revisar que tu perfil esté activo y que el acceso de vendedores esté encendido.';
 return error?.message||'No se pudo iniciar sesión.';
}
async function resetPassword(){
 const email=$('sellerEmail').value.trim();
 if(!email){status('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu clave?".','error');$('sellerEmail').focus();return}
 try{await sendPasswordResetEmail(auth,email);status('Te enviamos un correo a '+email+' para crear una clave nueva. Revisa también la carpeta de spam.','ok')}
 catch(error){status(loginError(error),'error')}
}
async function readSession(){
 // Leer una jornada que aún no existe puede ser rechazado por las reglas: se trata como "sin jornada".
 try{const snap=await getDoc(doc(db,'orgs',ORG,'sessions',sessionId()));return snap.exists()?{id:snap.id,...snap.data()}:null}
 catch(error){if(!isPermission(error))console.warn('Jornada:',error);return null}
}
async function activate(){
 showApp(true);tab('route');
 clients=cacheRead('clients');products=cacheRead('products');sales=cacheRead('sales');visits=cacheRead('visits');
 const cached=JSON.parse(localStorage.getItem(prefix()+'session')||'null');session=cached&&cached.id===sessionId()?cached:null;
 renderRouteDays();
 const remote=await readSession();if(remote)session=remote;
 if(session?.routeWeek){$('sellerWeek').value=session.routeWeek;renderRouteDays();if(session.routeDay)$('sellerDay').value=session.routeDay}
 render();status(navigator.onLine?'Bienvenido, '+(profile.displayName||'vendedor')+'. Cargando tu ruta…':'Sin conexión · mostrando lo guardado en este teléfono.',navigator.onLine?'':'warn');
 watchCloud();if(navigator.onLine)await refreshFromServer();await flushPendingSales();render();
}
function saveSessionLocal(){try{localStorage.setItem(prefix()+'session',JSON.stringify(session))}catch(_){}}
function watchCloud(){
 unsubs.forEach(fn=>{try{fn()}catch(_){}});unsubs=[];
 unsubs.push(onSnapshot(doc(db,'orgs',ORG,'members',profile.uid),snap=>{const m=snap.exists()?snap.data():null;if(!m||m.active!==true||m.role!=='seller')lockRevokedSeller()},error=>console.warn('No se pudo revisar el estado del perfil vendedor.',error)));
 const watch=(q,kind)=>unsubs.push(onSnapshot(q,snap=>{const rows=snap.docs.map(d=>({id:d.id,...d.data()}));if(kind==='clients')clients=rows;else if(kind==='products')products=rows;else if(kind==='sales')sales=rows;else if(kind==='visits')visits=rows;cacheWrite(kind,rows);if(kind==='clients')renderRouteDays();render()},error=>{console.error(error);if(kind!=='visits')status('No se pudo actualizar '+kind+'. Los datos guardados en este teléfono siguen disponibles.','warn')}));
 watch(query(collection(db,'orgs',ORG,'clients'),where('assignedSellerUids','array-contains',profile.uid)),'clients');
 watch(query(collection(db,'orgs',ORG,'products'),where('sellerVisible','==',true)),'products');
 watch(query(collection(db,'orgs',ORG,'sales'),where('sellerUid','==',profile.uid)),'sales');
 watch(query(collection(db,'orgs',ORG,'visits'),where('sellerUid','==',profile.uid),where('date','==',localDate())),'visits');
}
async function refreshFromServer(){
 try{
  const [cs,ps,ss]=await Promise.all([
   getDocs(query(collection(db,'orgs',ORG,'clients'),where('assignedSellerUids','array-contains',profile.uid))),
   getDocs(query(collection(db,'orgs',ORG,'products'),where('sellerVisible','==',true))),
   getDocs(query(collection(db,'orgs',ORG,'sales'),where('sellerUid','==',profile.uid)))
  ]);
  clients=cs.docs.map(d=>({id:d.id,...d.data()}));products=ps.docs.map(d=>({id:d.id,...d.data()}));sales=ss.docs.map(d=>({id:d.id,...d.data()}));
  cacheWrite('clients',clients);cacheWrite('products',products);cacheWrite('sales',sales);renderRouteDays();render();status('Firebase al día · ruta cargada.','ok');
 }catch(error){console.warn(error);status(clients.length||products.length?'Sin conexión estable · se muestran datos guardados; los cambios se enviarán al reconectar.':'No se pudo cargar la ruta. Revisa internet.','warn')}
}

// ===== Jornada =====
async function startSession(){
 const {week,day}=selectedRoute();if(!day){status('Elige semana y día antes de iniciar la jornada.','error');return}
 const button=$('sellerStart');button.disabled=true;
 const now=new Date().toISOString(),prev=session||{};
 const row={id:sessionId(),sellerUid:profile.uid,routeWeek:week,routeDay:day,status:'open',openedAt:prev.openedAt||serverTimestamp(),openedAtLocal:prev.openedAtLocal||now,closedAt:null,closedAtLocal:null,firstSaleAt:prev.firstSaleAt||null,firstSaleAtLocal:prev.firstSaleAtLocal||null,salesCount:Number(prev.salesCount||0),updatedAt:serverTimestamp()};
 session={...row,openedAt:row.openedAtLocal};saveSessionLocal();render();
 status('✅ Jornada iniciada · Semana '+week+' · '+day+'. Ya puedes marcar visitas y tomar pedidos.','ok');
 try{await setDoc(doc(db,'orgs',ORG,'sessions',row.id),row,{merge:true})}
 catch(error){console.error(error);session=null;saveSessionLocal();render();status('No se pudo iniciar la jornada en Firebase: '+(isPermission(error)?'permiso denegado. Avisa al dueño para que revise tu acceso.':(error.message||'')),'error')}
 finally{button.disabled=sessionOpen()}
}
async function closeSession(){
 if(!session)return;
 const pending=routeClients().filter(c=>!attendedState(c.id));
 if(pending.length&&!window.confirm('Quedan '+pending.length+' clientes sin atender en esta ruta. ¿Cerrar la jornada igual?'))return;
 const now=new Date().toISOString();
 session={...session,status:'closed',closedAt:now,closedAtLocal:now};saveSessionLocal();render();
 status('Jornada cerrada · '+todaySales().length+' ventas hoy.','ok');
 try{await setDoc(doc(db,'orgs',ORG,'sessions',session.id),{status:'closed',closedAt:serverTimestamp(),closedAtLocal:now,updatedAt:serverTimestamp()},{merge:true})}
 catch(error){status('No se pudo cerrar la jornada en Firebase: '+(error.message||''),'error')}
}
async function markVisited(clientId){
 const client=clients.find(c=>String(c.id)===String(clientId));if(!client)return;
 if(!sessionOpen()){status('Inicia la jornada primero.','error');return}
 const {week,day}=selectedRoute(),date=localDate(),id=profile.uid+'_'+date+'_'+client.id;
 const row={id,sellerUid:profile.uid,clientId:String(client.id),date,status:'visited',routeWeek:week,routeDay:day,visitedAt:serverTimestamp()};
 visits=[...visits.filter(v=>v.id!==id),{...row,visitedAt:new Date().toISOString()}];cacheWrite('visits',visits);render();
 status('👣 '+client.name+' marcado como visitado sin venta.','ok');
 try{await setDoc(doc(db,'orgs',ORG,'visits',id),row,{merge:true})}
 catch(error){status('No se pudo guardar la visita: '+(error.message||''),'error')}
}

// ===== Clientes y ruta propia =====
function newClientId(){return 'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function nextPosition(week,day){return clients.filter(c=>routeFor(c,week)?.day===day).reduce((m,c)=>Math.max(m,Number(routeFor(c,week)?.position)||0),0)+1}
function cleanPhone(v){let d=String(v||'').replace(/\D/g,'');if(d==='569')return '';if(d.length===8)d='569'+d;if(d.length===9&&d.startsWith('9'))d='56'+d;return d}
function toggleNewClient(show){const box=$('sellerNewClient');box.classList.toggle('hide',!show);$('sellerNewClientOpen').classList.toggle('hide',show);if(show){const {week,day}=selectedRoute();$('newClientWeek').value=week;$('newClientDay').innerHTML=DAYS.map(d=>'<option>'+d+'</option>').join('');$('newClientDay').value=day||'Lunes';$('newClientMsg').textContent='';box.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('newClientName').focus(),300)}}
async function saveNewClient(){
 const name=$('newClientName').value.trim(),address=$('newClientAddress').value.trim(),phone=cleanPhone($('newClientPhone').value),week=$('newClientWeek').value||'A',day=$('newClientDay').value,msg=$('newClientMsg');
 if(name.length<2){msg.textContent='Escribe el nombre del local o cliente.';$('newClientName').focus();return}
 if(address.length<3){msg.textContent='Escribe la dirección.';$('newClientAddress').focus();return}
 if(phone&&!/^569\d{8}$/.test(phone)){msg.textContent='Teléfono incompleto: 8 dígitos después de 569 (o déjalo vacío).';$('newClientPhone').focus();return}
 if(clients.some(c=>norm(c.name)===norm(name)&&norm(c.address)===norm(address))){msg.textContent='Ya tienes un cliente con ese nombre y dirección.';return}
 const id=newClientId(),now=new Date().toISOString();
 const row={id,name,address,phone,rut:$('newClientRut').value.trim().toUpperCase(),razonSocial:'',comuna:$('newClientComuna').value.trim(),observations:$('newClientNotes').value.trim(),sendInvoice:false,active:true,assignedSellerUids:[profile.uid],sellerRoutes:{[profile.uid]:{[week]:{day,position:nextPosition(week,day)}}},createdBySeller:profile.uid,createdBySellerName:profile.displayName||profile.email||'',createdAt:now,updatedAt:now};
 $('newClientSave').disabled=true;
 try{
  const pending=setDoc(doc(db,'orgs',ORG,'clients',id),row);
  clients=[...clients,row];cacheWrite('clients',clients);
  ['newClientName','newClientAddress','newClientRut','newClientComuna','newClientNotes'].forEach(k=>$(k).value='');$('newClientPhone').value='569 ';
  $('sellerWeek').value=week;renderRouteDays();$('sellerDay').value=day;toggleNewClient(false);render();
  status('✅ '+name+' agregado a tu ruta ('+week+' · '+day+').','ok');
  if(navigator.onLine)await pending;
 }catch(error){status('No se pudo crear el cliente: '+(error.message||''),'error')}
 finally{$('newClientSave').disabled=false}
}
async function saveRoutes(changes){
 for(const {client,week,route} of changes){const mine={...(client.sellerRoutes?.[profile.uid]||{})};if(route)mine[week]=route;else delete mine[week];client.sellerRoutes={...(client.sellerRoutes||{}),[profile.uid]:mine}}
 cacheWrite('clients',clients);renderRouteDays();render();
 try{await Promise.all(changes.map(({client})=>updateDoc(doc(db,'orgs',ORG,'clients',String(client.id)),{[`sellerRoutes.${profile.uid}`]:client.sellerRoutes[profile.uid]})))}
 catch(error){status('No se pudo guardar el orden: '+(error.message||''),'error')}
}
function moveClient(id,dir){
 const {week}=selectedRoute(),rows=routeClients(),i=rows.findIndex(c=>String(c.id)===String(id));
 let j=i+dir;while(j>=0&&j<rows.length&&attendedState(rows[j].id))j+=dir; // salta los ya atendidos (no se ven en la lista)
 if(i<0||j<0||j>=rows.length)return;
 [rows[i],rows[j]]=[rows[j],rows[i]];
 saveRoutes(rows.map((c,k)=>({client:c,week,route:{...routeFor(c,week),position:k+1}})).filter(x=>Number(routeFor(x.client,week)?.position)!==x.route.position));
}
function changeClientDay(id){
 const client=clients.find(c=>String(c.id)===String(id));if(!client)return;const {week}=selectedRoute(),cur=routeFor(client,week);
 const answer=window.prompt('¿Qué día visitas a '+client.name+'? Escribe: '+DAYS.join(', ')+'.\nDéjalo vacío para quitarlo de la Semana '+week+'.',cur?.day||'');
 if(answer===null)return;
 const day=DAYS.find(d=>norm(d)===norm(answer));
 if(answer.trim()&&!day){status('Día no reconocido. Escribe por ejemplo: Martes.','error');return}
 saveRoutes([{client,week,route:day?{day,position:nextPosition(week,day)}:null}]);
 status(day?client.name+' pasa al '+day+'.':client.name+' se quitó de la Semana '+week+'.','ok');
}

// ===== Pedido =====
function openOrder(id){
 if(!sessionOpen()){status('Inicia la jornada primero (pestaña Mi ruta).','error');tab('route');return}
 const next=clients.find(c=>String(c.id)===String(id))||null;
 if(next&&selectedClient&&String(selectedClient.id)!==String(next.id)&&cart.length&&!window.confirm('Tienes productos en el carrito de '+selectedClient.name+'. ¿Descartarlos y atender a '+next.name+'?'))return;
 if(!selectedClient||String(selectedClient?.id)!==String(next?.id))cart=[];
 selectedClient=next;$('sellerQuantity').value='';$('productSearch').value='';tab('sale');render();
 $('cartCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function addItem(){
 if(!sessionOpen()){status('Inicia la jornada primero.','error');return}
 if(!selectedClient){status('Elige un cliente primero.','error');return}
 const p=products.find(x=>String(x.id)===String($('sellerProduct').value)),qty=Math.floor(Number($('sellerQuantity').value));
 if(!p){status('Selecciona un producto.','error');return}
 if(!Number.isInteger(qty)||qty<1){status('Ingresa una cantidad válida.','error');$('sellerQuantity').focus();return}
 if(qty>availableStock(p)){status('Stock insuficiente. Disponibles: '+availableStock(p)+' unidades.','error');return}
 const existing=cart.find(x=>String(x.productId)===String(p.id));
 if(existing)existing.qty+=qty;else cart.push({productId:String(p.id),baseProductId:String(p.id),name:String(p.name),qty,price:Number(p.price||0)});
 $('productSearch').value='';$('sellerQuantity').value='';renderProducts();renderCart();status('➕ '+qty+' × '+p.name+' agregado.','ok');$('productSearch').focus();
}
function cartClick(e){
 const b=e.target.closest('button');if(!b)return;const d=b.dataset,idx=Number(d.plus??d.minus??d.remove);if(!cart[idx])return;const item=cart[idx],p=products.find(x=>String(x.id)===String(item.productId));
 if(d.plus!==undefined){if(p&&availableStock(p)<=0){status('Stock insuficiente.','error');return}item.qty++}
 else if(d.minus!==undefined){if(item.qty===1){if(!window.confirm('¿Eliminar '+item.name+' del pedido?'))return;cart.splice(idx,1)}else item.qty--}
 else if(d.remove!==undefined){if(!window.confirm('¿Eliminar '+item.name+' del pedido?'))return;cart.splice(idx,1)}
 renderProducts();renderCart();
}
// Transacción: descuenta stock y guarda la venta. No lee documentos que aún no existen
// (las reglas rechazan leer una venta o jornada nueva), así funciona con las reglas publicadas.
async function commitSale(sale){
 const deductions={};sale.items.forEach(i=>{const k=String(i.baseProductId||i.productId);deductions[k]=(deductions[k]||0)+Number(i.qty)});
 const saleRef=doc(db,'orgs',ORG,'sales',String(sale.id)),sessionRef=doc(db,'orgs',ORG,'sessions',profile.uid+'_'+String(sale.fecha||localDate()).slice(0,10));
 const productRefs=Object.keys(deductions).map(id=>doc(db,'orgs',ORG,'products',id));
 await runTransaction(db,async tx=>{
  const snaps=[];for(const ref of productRefs)snaps.push(await tx.get(ref));
  snaps.forEach((snap,i)=>{if(!snap.exists())throw new Error('Un producto ya no está en el catálogo. La venta no se guardó.');const qty=deductions[productRefs[i].id],stock=Number(snap.data().stock||0);if(stock<qty)throw new Error('Stock insuficiente de '+(snap.data().name||'un producto')+': quedan '+stock+'.')});
  snaps.forEach((snap,i)=>tx.update(productRefs[i],{stock:Number(snap.data().stock||0)-deductions[productRefs[i].id],lastSellerSaleId:String(sale.id)}));
  tx.set(saleRef,{...sale,stockDeductions:deductions,createdAt:serverTimestamp()});
  const s=session&&session.id===sessionRef.id?session:{};
  tx.set(sessionRef,{id:sessionRef.id,sellerUid:profile.uid,status:s.status||'open',routeWeek:s.routeWeek||sale.routeWeek,routeDay:s.routeDay||sale.routeDay,firstSaleAtLocal:s.firstSaleAtLocal||sale.occurredAt,salesCount:increment(1),lastSaleAt:serverTimestamp(),lastSaleAtLocal:sale.occurredAt,updatedAt:serverTimestamp()},{merge:true});
 });
 if(session&&session.id===sessionRef.id){session={...session,firstSaleAtLocal:session.firstSaleAtLocal||sale.occurredAt,salesCount:Number(session.salesCount||0)+1};saveSessionLocal()}
}
function applyLocalSale(sale){
 sales=[sale,...sales.filter(s=>String(s.id)!==String(sale.id))];cacheWrite('sales',sales);
 const deductions={};sale.items.forEach(i=>{const k=String(i.baseProductId);deductions[k]=(deductions[k]||0)+i.qty});
 products=products.map(p=>({...p,stock:Math.max(0,Number(p.stock||0)-(deductions[p.id]||0))}));cacheWrite('products',products);
}
async function saveSale(){
 if(!sessionOpen()){status('Inicia la jornada antes de registrar una venta.','error');return}
 if(!selectedClient||!cart.length){status('Elige un cliente y agrega productos.','error');return}
 const paymentMethod=$('sellerPayment').value;if(!['cash','transfer'].includes(paymentMethod)){status('Solo efectivo o transferencia.','error');return}
 const client=selectedClient,total=cart.reduce((n,i)=>n+i.qty*i.price,0);
 // La venta se registra en la ruta donde está el cliente (las reglas lo exigen).
 const week=routeFor(client,session.routeWeek)?session.routeWeek:(routeFor(client,'A')?'A':'B'),day=routeFor(client,week)?.day||session.routeDay;
 if(!routeFor(client,week)){status(client.name+' no está en tu ruta. Agrégalo a un día con "Cambiar día" antes de venderle.','error');return}
 const sale={id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2),folio:Math.max(0,...sales.map(s=>Number(s.folio)||0),...queueRead().map(s=>Number(s.folio)||0))+1,fecha:localDate(),date:localDate(),occurredAt:new Date().toISOString(),clienteId:String(client.id),cliente:client.name,clientZone:String(client.comuna||client.zone||'').trim(),ruta:client.route||'',routeWeek:week,routeDay:day,items:cart.map(i=>({productId:i.productId,baseProductId:i.baseProductId,desc:i.name,qty:i.qty,price:i.price})),total,paymentMethod,paymentStatus:'paid',collectionStatus:'awaiting_delivery',sellerUid:profile.uid};
 const button=$('sellerSaveSale');button.disabled=true;button.textContent='Guardando…';
 status(navigator.onLine?'Guardando venta…':'Sin internet · guardando la venta en este teléfono.','warn');
 const finish=msg=>{cart=[];selectedClient=null;tab('route');render();status(msg,'ok');window.scrollTo({top:0,behavior:'smooth'})};
 try{
  if(!navigator.onLine)throw Object.assign(new Error('offline'),{code:'unavailable'});
  await commitSale(sale);applyLocalSale(sale);
  const vId=profile.uid+'_'+localDate()+'_'+client.id;
  setDoc(doc(db,'orgs',ORG,'visits',vId),{id:vId,sellerUid:profile.uid,clientId:String(client.id),date:localDate(),status:'sale',saleId:sale.id,routeWeek:week,routeDay:day,visitedAt:serverTimestamp()},{merge:true}).catch(e=>console.warn('Visita:',e));
  finish('✅ Venta #'+sale.folio+' guardada · '+client.name+' · '+money(total)+'.');
 }catch(error){
  console.error(error);
  if(['unavailable','deadline-exceeded','aborted','cancelled'].includes(error.code)||!navigator.onLine){
   const q=queueRead();if(!q.some(item=>String(item.id)===String(sale.id)))q.push(sale);queueWrite(q);applyLocalSale(sale);
   finish('📱 Venta #'+sale.folio+' guardada en el teléfono. Se enviará a Firebase al volver la señal.');
  }else status('No se guardó la venta: '+(isPermission(error)?'Firebase rechazó el permiso. Avisa al dueño (puede faltar publicar las reglas).':(error.message||'revisa la conexión o el stock.')),'error');
 }finally{button.textContent='Guardar venta';renderCart()}
}
async function flushPendingSales(){
 if(!profile||!navigator.onLine)return;
 let queue=queueRead();if(!queue.length)return;
 status('Enviando '+queue.length+' ventas pendientes…','warn');
 for(const sale of queue){
  try{await commitSale(sale);queue=queue.filter(item=>String(item.id)!==String(sale.id));queueWrite(queue)}
  catch(error){
   // Si la venta ya había llegado a Firebase, reescribirla se rechaza: se confirma y se saca de pendientes.
   if(isPermission(error)){await refreshFromServer();if(sales.some(s=>String(s.id)===String(sale.id))){queue=queue.filter(item=>String(item.id)!==String(sale.id));queueWrite(queue);continue}}
   status('Una venta quedó pendiente: '+(error.message||'no se pudo confirmar el stock.'),'error');render();return}
 }
 await refreshFromServer();status('Firebase al día · ventas pendientes enviadas.','ok')
}
async function logout(){if(cart.length&&!window.confirm('Tienes un pedido sin guardar. ¿Salir igual?'))return;unsubs.forEach(fn=>{try{fn()}catch(_){}});unsubs=[];await signOut(auth);profile=null;session=null;cart=[];selectedClient=null;showApp(false);$('sellerLoginButton').disabled=false;status('Sesión cerrada.')}

function wire(){
 $('sellerLoginButton').onclick=signIn;$('sellerForgot').onclick=resetPassword;$('sellerPassword').onkeydown=e=>{if(e.key==='Enter')signIn()};
 $('sellerLogout').onclick=logout;$('sellerStart').onclick=startSession;$('sellerClose').onclick=closeSession;
 $('sellerAddItem').onclick=addItem;$('sellerSaveSale').onclick=saveSale;$('sellerCart').onclick=cartClick;
 $('trayToggle').onclick=()=>{showTray=!showTray;renderCart()};
 $('sellerWeek').onchange=()=>{renderRouteDays();render()};$('sellerDay').onchange=render;
 $('productSearch').oninput=renderProducts;$('sellerProduct').onchange=renderProducts;$('inventorySearch').oninput=renderProducts;$('clientSearch').oninput=renderAttended;
 $('sellerNewClientOpen').onclick=()=>toggleNewClient(true);$('newClientCancel').onclick=()=>toggleNewClient(false);$('newClientSave').onclick=saveNewClient;
 $('sellerClients').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;if(d.visit)markVisited(d.visit);else if(d.sale)openOrder(d.sale);else if(d.up)moveClient(d.up,-1);else if(d.down)moveClient(d.down,1);else if(d.move)changeClientDay(d.move)};
 $('attended').onclick=$('allClients').onclick=e=>{const b=e.target.closest('[data-reopen]');if(b)openOrder(b.dataset.reopen)};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.tab);window.scrollTo({top:0})});
 window.addEventListener('online',async()=>{status('Conexión recuperada · sincronizando…','warn');await flushPendingSales();if(navigator.onLine)await refreshFromServer();render()});
 window.addEventListener('offline',()=>{status('Sin internet · los cambios quedarán pendientes.','warn');render()});
}
wire();
onAuthStateChanged(auth,async user=>{
 if(!user){if(!profile)status('Ingresa con tu correo y clave.');return}
 if(profile)return;
 try{
  const snap=await getDoc(doc(db,'orgs',ORG,'members',user.uid));
  if(!snap.exists()||snap.data().active!==true||snap.data().role!=='seller'){await signOut(auth);status('Esta cuenta no tiene un perfil de vendedor activo.','error');return}
  await requirePreparedSellerMode();
  profile={uid:user.uid,email:user.email||'',...snap.data()};
  await activate();
 }catch(error){status(error.message||'No se pudo validar el perfil vendedor.','error');await signOut(auth)}
});
