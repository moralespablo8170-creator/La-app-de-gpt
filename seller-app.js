import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import {
  getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc,
  runTransaction, serverTimestamp, updateDoc
} from 'firebase/firestore';

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let db;
try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(_){db=getFirestore(app)}
const ORG=ORG_ID;
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const $=id=>document.getElementById(id);
let profile=null,clients=[],products=[],sales=[],selectedClient=null,cart=[],session=null,unsubs=[],loading=false;
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const prefix=()=>profile?'zipperSeller_'+profile.uid+'_':'zipperSeller_guest_';
const cacheRead=name=>{try{const v=JSON.parse(localStorage.getItem(prefix()+name)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const cacheWrite=(name,value)=>{try{localStorage.setItem(prefix()+name,JSON.stringify(value))}catch(error){console.error(error)}};
const queueRead=()=>{try{const v=JSON.parse(localStorage.getItem(prefix()+'pendingSales')||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const queueWrite=value=>{try{localStorage.setItem(prefix()+'pendingSales',JSON.stringify(value))}catch(error){console.error(error)}};
function status(message,state=''){const el=$('sellerStatus');if(!el)return;el.textContent=message;el.className='seller-status'+(state?' '+state:'')}
function clearSellerLocalData(uid){const keyPrefix='zipperSeller_'+uid+'_';Object.keys(localStorage).filter(key=>key.startsWith(keyPrefix)).forEach(key=>localStorage.removeItem(key))}
function lockRevokedSeller(){
 const uid=profile?.uid||auth.currentUser?.uid;
 unsubs.forEach(fn=>{try{fn()}catch(_){}});unsubs=[];
 if(uid)clearSellerLocalData(uid);
 profile=null;clients=[];products=[];sales=[];selectedClient=null;cart=[];session=null;
 $('sellerApp').classList.add('seller-hidden');$('sellerLogin').classList.remove('seller-hidden');$('sellerLoginButton').disabled=false;
 status('El dueño desactivó este perfil. La sesión se cerró y la app dejó de mostrar los datos del vendedor.','error');
 signOut(auth).catch(error=>console.warn('No se pudo completar el cierre de sesión tras desactivar el perfil.',error));
}
function safeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(value){return '$'+Math.round(Number(value)||0).toLocaleString('es-CL')}
function routeFor(client,week){return client?.sellerRoutes?.[profile.uid]?.[week]||null}
function routeDays(week){return [...new Set(clients.map(c=>routeFor(c,week)?.day).filter(day=>DAYS.includes(day)))].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b))}
function selectedRoute(){return {week:$('sellerWeek').value||'A',day:$('sellerDay').value||''}}
function filteredClients(){const {week,day}=selectedRoute(),q=String($('sellerSearch').value||'').trim().toLocaleLowerCase('es');return clients.filter(c=>{const r=routeFor(c,week);return c.active!==false&&r&&r.day===day&&(!q||String(c.name||'').toLocaleLowerCase('es').includes(q)||String(c.address||'').toLocaleLowerCase('es').includes(q))}).sort((a,b)=>(Number(routeFor(a,week)?.position)||999999)-(Number(routeFor(b,week)?.position)||999999)||String(a.name).localeCompare(String(b.name),'es'))}
function renderRouteDays(){const week=$('sellerWeek').value||'A',withClients=routeDays(week),select=$('sellerDay'),current=select.value;const count=d=>clients.filter(c=>c.active!==false&&routeFor(c,week)?.day===d).length;select.innerHTML='<option value="">Seleccionar día</option>'+DAYS.map(d=>'<option value="'+d+'">'+d+(count(d)?' ('+count(d)+')':'')+'</option>').join('');if(DAYS.includes(current))select.value=current;else if(withClients.length===1)select.value=withClients[0]}
function renderClients(){const rows=filteredClients();$('sellerClientCount').textContent=String(rows.length);$('sellerClients').innerHTML=rows.length?rows.map((c,i)=>'<article class="seller-row"><strong>'+(i+1)+'. '+safeText(c.name)+'</strong><small>'+safeText(c.address||'Sin dirección')+' · '+safeText(c.phone||'Sin teléfono')+'</small><div class="seller-actions"><button class="seller-btn secondary" type="button" data-visit="'+safeText(c.id)+'">Marcar visitado</button><button class="seller-btn" type="button" data-select="'+safeText(c.id)+'">Vender</button></div><div class="seller-actions seller-route-tools"><button class="seller-mini" type="button" data-up="'+safeText(c.id)+'"'+(i===0?' disabled':'')+'>↑ Subir</button><button class="seller-mini" type="button" data-down="'+safeText(c.id)+'"'+(i===rows.length-1?' disabled':'')+'>↓ Bajar</button><button class="seller-mini" type="button" data-move="'+safeText(c.id)+'">📅 Cambiar día</button></div></article>').join(''):'<p class="seller-muted">'+($('sellerDay').value?'Aún no tienes clientes este día. Agrégalos con "＋ Nuevo cliente".':'Elige el día para ver o armar tu ruta.')+'</p>';document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>moveClient(b.dataset.up,-1));document.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>moveClient(b.dataset.down,1));document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>changeClientDay(b.dataset.move));document.querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>markVisited(b.dataset.visit));document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectClient(b.dataset.select))}
function renderProducts(){const available=products.filter(p=>p&&p.active!==false&&p.id!=null&&String(p.name||'').trim());$('sellerProduct').innerHTML='<option value="">Seleccionar producto</option>'+available.map(p=>'<option value="'+safeText(p.id)+'">'+safeText(p.name)+' · '+money(p.price)+' · stock '+Number(p.stock||0)+'</option>').join('');$('sellerInventory').innerHTML=available.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'es')).map(p=>'<div class="seller-product"><strong>'+safeText(p.name)+'</strong><span>Stock: '+Number(p.stock||0)+' · '+money(p.price)+'</span></div>').join('')||'<p class="seller-muted">Inventario aún no disponible. Conéctate a internet para cargarlo la primera vez.</p>'}
function renderCart(){const total=cart.reduce((n,item)=>n+item.qty*item.price,0);$('sellerCart').innerHTML=cart.length?cart.map((item,i)=>'<div class="seller-row"><strong>'+safeText(item.name)+' × '+item.qty+'</strong><small>'+money(item.price)+' c/u · '+money(item.qty*item.price)+'</small><button class="seller-btn secondary" type="button" data-remove="'+i+'">Quitar</button></div>').join(''):'<p class="seller-muted">Carrito vacío.</p>';document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart()});$('sellerSaleTotal').textContent=money(total)}
function renderSales(){const today=sales.filter(s=>String(s.fecha||'').slice(0,10)===localDate()).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));const pending=queueRead();$('sellerSalesToday').innerHTML=[...pending.map(s=>({...s,_pending:true})),...today].map(s=>'<article class="seller-row"><strong>#'+safeText(s.folio||'pendiente')+' · '+safeText(s.cliente)+'</strong><small>'+safeText(s.fecha||localDate())+' · '+money(s.total)+' · '+(s._pending?'Pendiente de sincronizar':'Guardada en Firebase')+'</small></article>').join('')||'<p class="seller-muted">Todavía no hay ventas hoy.</p>'}
function renderSession(){const active=!!session&&!session.closedAt;$('sellerSessionLabel').textContent=active?'Jornada abierta · Semana '+session.routeWeek+' · '+session.routeDay:'Jornada cerrada';$('sellerStart').classList.toggle('seller-hidden',active);$('sellerClose').classList.toggle('seller-hidden',!active);$('sellerSaveSale').disabled=!active||!selectedClient;$('sellerAddItem').disabled=!active}
function render(){if(!profile)return;renderRouteDays();renderClients();renderProducts();renderCart();renderSales();renderSession();$('sellerSelectedClient').textContent=selectedClient?'Cliente: '+selectedClient.name:'Selecciona un cliente de la ruta.'}
async function requirePreparedSellerMode(){
 const snap=await getDoc(doc(db,'orgs',ORG,'settings','sellerMode'));
 const mode=snap.exists()?snap.data():null;
 if(!mode||mode.enabled!==true||mode.catalogVersion!==1){
  throw new Error('El acceso de vendedores aún no está preparado. El dueño debe proteger costos y catálogo antes de habilitar cuentas.');
 }
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
// Mensajes claros para los errores de Firebase al ingresar.
function loginError(error){
 const code=String(error?.code||'');
 if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'Correo o clave incorrectos, o la cuenta aún no existe. Revisa que escribas el correo y la clave tal cual te los entregó el dueño. Si no recuerdas la clave, toca "¿Olvidaste tu clave?".';
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
async function activate(){
 $('sellerLogin').classList.add('seller-hidden');$('sellerApp').classList.remove('seller-hidden');$('sellerWelcome').textContent=profile.displayName||profile.email||'Vendedor';
 clients=cacheRead('clients');products=cacheRead('products');sales=cacheRead('sales');
 const routeSessionId=profile.uid+'_'+localDate();
 try{const snap=await getDoc(doc(db,'orgs',ORG,'sessions',routeSessionId));session=snap.exists()?{id:snap.id,...snap.data()}:null}catch(_){session=null}
 render();status(navigator.onLine?'Conectando y cargando tu ruta…':'Sin conexión · mostrando lo que quedó guardado en este teléfono.',navigator.onLine?'':'warn');
 watchCloud();if(navigator.onLine)await refreshFromServer();await flushPendingSales();render();
}
function watchCloud(){
 unsubs.forEach(fn=>{try{fn()}catch(_){}});unsubs=[];
 unsubs.push(onSnapshot(doc(db,'orgs',ORG,'members',profile.uid),snap=>{
  const member=snap.exists()?snap.data():null;
  if(!member||member.active!==true||member.role!=='seller')lockRevokedSeller();
 },error=>{console.warn('No se pudo revisar el estado del perfil vendedor.',error)}));
 const watch=(q,kind)=>unsubs.push(onSnapshot(q,snap=>{const rows=snap.docs.map(d=>({id:d.id,...d.data()}));if(kind==='clients')clients=rows;else if(kind==='products')products=rows;else if(kind==='sales')sales=rows;cacheWrite(kind,rows);render();if(!snap.metadata.hasPendingWrites)status('Datos de ruta actualizados.', 'ok')},error=>{console.error(error);status('No se pudo actualizar '+kind+'. Los datos guardados en este teléfono siguen disponibles.','warn')}));
 watch(query(collection(db,'orgs',ORG,'clients'),where('assignedSellerUids','array-contains',profile.uid)),'clients');
 watch(query(collection(db,'orgs',ORG,'products'),where('sellerVisible','==',true)),'products');
 watch(query(collection(db,'orgs',ORG,'sales'),where('sellerUid','==',profile.uid)),'sales');
 const sid=profile.uid+'_'+localDate();
 unsubs.push(onSnapshot(doc(db,'orgs',ORG,'sessions',sid),snap=>{session=snap.exists()?{id:snap.id,...snap.data()}:null;renderSession()},()=>{}));
}
async function refreshFromServer(){
 try{
  const [cs,ps,ss]=await Promise.all([
   getDocs(query(collection(db,'orgs',ORG,'clients'),where('assignedSellerUids','array-contains',profile.uid))),
   getDocs(query(collection(db,'orgs',ORG,'products'),where('sellerVisible','==',true))),
   getDocs(query(collection(db,'orgs',ORG,'sales'),where('sellerUid','==',profile.uid)))
  ]);
  clients=cs.docs.map(d=>({id:d.id,...d.data()}));products=ps.docs.map(d=>({id:d.id,...d.data()}));sales=ss.docs.map(d=>({id:d.id,...d.data()}));
  cacheWrite('clients',clients);cacheWrite('products',products);cacheWrite('sales',sales);render();status('Firebase al día · ruta cargada.','ok');
 }catch(error){console.warn(error);if(!clients.length&&!products.length)status('No se pudo cargar la ruta. Revisa internet o pide al dueño que confirme las asignaciones.','warn');else status('Sin conexión estable · se muestran datos guardados; los cambios se enviarán al reconectar.','warn')}
}
async function startSession(){
 const {week,day}=selectedRoute();if(!day){status('Elige semana y día antes de iniciar la jornada.','error');return}
 const id=profile.uid+'_'+localDate(),ref=doc(db,'orgs',ORG,'sessions',id);
 try{
  const snap=await getDoc(ref);
  if(snap.exists()&&snap.data().status==='open'){session={id,...snap.data()};status('La jornada de hoy ya estaba abierta.','ok')}
  else{const existing=snap.exists()?snap.data():{};const row={id,sellerUid:profile.uid,routeWeek:week,routeDay:day,status:'open',openedAt:existing.openedAt||serverTimestamp(),openedAtLocal:existing.openedAtLocal||new Date().toISOString(),closedAt:null,closedAtLocal:null,firstSaleAt:existing.firstSaleAt||null,firstSaleAtLocal:existing.firstSaleAtLocal||null,salesCount:Number(existing.salesCount||0)};await setDoc(ref,row,{merge:true});session=row;status(navigator.onLine?'Jornada iniciada.':'Jornada guardada en este teléfono; se enviará al reconectar.','ok')}
  render();
 }catch(error){status('No se pudo iniciar la jornada: '+(error.message||''),'error')}
}
async function closeSession(){
 if(!session)return;
 try{await setDoc(doc(db,'orgs',ORG,'sessions',session.id),{status:'closed',closedAt:serverTimestamp(),closedAtLocal:new Date().toISOString(),updatedAt:serverTimestamp()},{merge:true});session={...session,status:'closed',closedAt:new Date().toISOString()};renderSession();status(navigator.onLine?'Jornada cerrada.':'Cierre guardado pendiente de conexión.','ok')}
 catch(error){status('No se pudo cerrar la jornada: '+(error.message||''),'error')}
}
async function markVisited(clientId){
 const client=clients.find(c=>String(c.id)===String(clientId));if(!client)return;
 const {week,day}=selectedRoute(),date=localDate(),id=profile.uid+'_'+date+'_'+client.id;
 try{await setDoc(doc(db,'orgs',ORG,'visits',id),{id,sellerUid:profile.uid,clientId:String(client.id),date,status:'visited',routeWeek:week,routeDay:day,visitedAt:serverTimestamp()},{merge:true});status(navigator.onLine?'Visita guardada.':'Visita guardada pendiente de conexión.','ok')}
 catch(error){status('No se pudo guardar la visita: '+(error.message||''),'error')}
}
// ===== El vendedor crea clientes y arma su ruta =====
function newClientId(){return 'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function nextPosition(week,day){return clients.filter(c=>routeFor(c,week)?.day===day).reduce((m,c)=>Math.max(m,Number(routeFor(c,week)?.position)||0),0)+1}
function cleanPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.length===8)d='569'+d;if(d.length===9&&d.startsWith('9'))d='56'+d;return d}
function toggleNewClient(show){const box=$('sellerNewClient');if(!box)return;box.classList.toggle('seller-hidden',!show);if(show){const {week,day}=selectedRoute();$('newClientWeek').value=week;$('newClientDay').innerHTML=DAYS.map(d=>'<option>'+d+'</option>').join('');$('newClientDay').value=day||'Lunes';$('newClientMsg').textContent='';box.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('newClientName').focus(),300)}}
async function saveNewClient(){
 const name=$('newClientName').value.trim(),address=$('newClientAddress').value.trim(),phone=cleanPhone($('newClientPhone').value),week=$('newClientWeek').value||'A',day=$('newClientDay').value,msg=$('newClientMsg');
 if(name.length<2){msg.textContent='Escribe el nombre del local o cliente.';$('newClientName').focus();return}
 if(address.length<3){msg.textContent='Escribe la dirección.';$('newClientAddress').focus();return}
 if(phone&&!/^569\d{8}$/.test(phone)){msg.textContent='Teléfono incompleto: 8 dígitos después de 569 (o déjalo vacío).';$('newClientPhone').focus();return}
 const n=s=>String(s||'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
 if(clients.some(c=>n(c.name)===n(name)&&n(c.address)===n(address))){msg.textContent='Ya tienes un cliente con ese nombre y dirección.';return}
 const id=newClientId(),now=new Date().toISOString();
 const row={id,name,address,phone,rut:$('newClientRut').value.trim().toUpperCase(),razonSocial:'',comuna:$('newClientComuna').value.trim(),observations:$('newClientNotes').value.trim(),sendInvoice:false,active:true,assignedSellerUids:[profile.uid],sellerRoutes:{[profile.uid]:{[week]:{day,position:nextPosition(week,day)}}},createdBySeller:profile.uid,createdBySellerName:profile.displayName||profile.email||'',createdAt:now,updatedAt:now};
 $('newClientSave').disabled=true;
 try{
  const pending=setDoc(doc(db,'orgs',ORG,'clients',id),row);
  clients=[...clients,row];cacheWrite('clients',clients);
  ['newClientName','newClientAddress','newClientPhone','newClientRut','newClientComuna','newClientNotes'].forEach(k=>$(k).value='');
  $('newClientPhone').value='569 ';
  $('sellerWeek').value=week;renderRouteDays();$('sellerDay').value=day;toggleNewClient(false);render();
  status(navigator.onLine?'Cliente '+name+' agregado a tu ruta ('+week+' · '+day+').':'Cliente guardado en el teléfono; se enviará al reconectar.','ok');
  if(navigator.onLine)await pending;
 }catch(error){status('No se pudo crear el cliente: '+(error.message||''),'error')}
 finally{$('newClientSave').disabled=false}
}
async function saveRoutes(changes){
 // changes: [{client, route}] — solo cambia la ruta propia del vendedor.
 for(const {client,week,route} of changes){
  const mine={...(client.sellerRoutes?.[profile.uid]||{})};if(route)mine[week]=route;else delete mine[week];
  client.sellerRoutes={...(client.sellerRoutes||{}),[profile.uid]:mine};
 }
 cacheWrite('clients',clients);render();
 try{await Promise.all(changes.map(({client})=>updateDoc(doc(db,'orgs',ORG,'clients',String(client.id)),{[`sellerRoutes.${profile.uid}`]:client.sellerRoutes[profile.uid]})))}
 catch(error){status('No se pudo guardar el orden: '+(error.message||''),'error')}
}
function moveClient(id,dir){
 const {week}=selectedRoute(),rows=filteredClients(),i=rows.findIndex(c=>String(c.id)===String(id)),j=i+dir;
 if(i<0||j<0||j>=rows.length)return;
 [rows[i],rows[j]]=[rows[j],rows[i]];
 saveRoutes(rows.map((c,k)=>({client:c,week,route:{...routeFor(c,week),position:k+1}})).filter(x=>Number(routeFor(x.client,week)?.position)!==x.route.position));
}
function changeClientDay(id){
 const client=clients.find(c=>String(c.id)===String(id));if(!client)return;const {week}=selectedRoute(),cur=routeFor(client,week);
 const answer=window.prompt('¿A qué día pasa '+client.name+'? Escribe: '+DAYS.join(', ')+'.\nDeja vacío para quitarlo de la Semana '+week+'.',cur?.day||'');
 if(answer===null)return;
 const day=DAYS.find(d=>d.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'')===answer.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 if(answer.trim()&&!day){status('Día no reconocido. Escribe por ejemplo: Martes.','error');return}
 saveRoutes([{client,week,route:day?{day,position:nextPosition(week,day)}:null}]);
 status(day?client.name+' pasa al '+day+'.':client.name+' se quitó de la Semana '+week+'.','ok');
}
function selectClient(id){selectedClient=clients.find(c=>String(c.id)===String(id))||null;cart=[];renderCart();renderSession()}
function addItem(){
 const id=$('sellerProduct').value,p=products.find(x=>String(x.id)===String(id)),qty=Math.floor(Number($('sellerQuantity').value));
 if(!p||qty<1){status('Selecciona un producto y una cantidad válida.','error');return}
 const existing=cart.find(x=>String(x.productId)===String(p.id));
 const total=(existing?.qty||0)+qty;if(total>Number(p.stock||0)){status('Stock insuficiente para esa cantidad.','error');return}
 if(existing)existing.qty=total;else cart.push({productId:String(p.id),baseProductId:String(p.id),name:String(p.name),qty,price:Number(p.price||0),purchasePrice:Number(p.pricePurchase||0)});
 renderCart();status('Producto agregado al pedido.');
}
async function commitSale(sale){
 const deductions={};sale.items.forEach(i=>{const k=String(i.baseProductId||i.productId);deductions[k]=(deductions[k]||0)+Number(i.qty)});
 const saleRef=doc(db,'orgs',ORG,'sales',String(sale.id)),sessionRef=doc(db,'orgs',ORG,'sessions',profile.uid+'_'+localDate());
 const productRefs=Object.keys(deductions).map(id=>doc(db,'orgs',ORG,'products',id));
 await runTransaction(db,async tx=>{
  const saleSnap=await tx.get(saleRef);if(saleSnap.exists())return;
  const productSnaps=[];for(const ref of productRefs)productSnaps.push(await tx.get(ref));
  const sessionSnap=await tx.get(sessionRef);
  productSnaps.forEach((snap,index)=>{if(!snap.exists())throw new Error('Falta un producto en Firebase. La venta no se guardó.');const current=snap.data(),qty=deductions[productRefs[index].id];if(Number(current.stock||0)<qty)throw new Error('El stock cambió mientras estabas sin conexión. Revisa el inventario antes de reintentar.');});
  productSnaps.forEach((snap,index)=>{const current=snap.data(),ref=productRefs[index],qty=deductions[ref.id];tx.update(ref,{stock:Number(current.stock||0)-qty,lastSellerSaleId:String(sale.id)})});
  tx.set(saleRef,{...sale,stockDeductions:deductions,createdAt:serverTimestamp()});
  const previous=sessionSnap.exists()?sessionSnap.data():{};
  tx.set(sessionRef,{id:sessionRef.id,sellerUid:profile.uid,status:previous.status||'open',routeWeek:sale.routeWeek,routeDay:sale.routeDay,firstSaleAt:previous.firstSaleAt||serverTimestamp(),firstSaleAtLocal:previous.firstSaleAtLocal||sale.occurredAt||new Date().toISOString(),salesCount:Number(previous.salesCount||0)+1,lastSaleAt:serverTimestamp(),lastSaleAtLocal:sale.occurredAt||new Date().toISOString()},{merge:true});
 });
}
async function saveSale(){
 if(!session||session.status==='closed'){status('Inicia la jornada antes de registrar una venta.','error');return}
 if(!selectedClient||!cart.length){status('Selecciona un cliente y agrega productos.','error');return}
 const paymentMethod=$('sellerPayment').value;if(!['cash','transfer'].includes(paymentMethod)){status('Solo se puede registrar efectivo o transferencia.','error');return}const total=cart.reduce((n,i)=>n+i.qty*i.price,0),{week,day}=selectedRoute();
 const sale={id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),folio:Math.max(0,...sales.map(s=>Number(s.folio)||0))+1,fecha:localDate(),date:localDate(),occurredAt:new Date().toISOString(),clienteId:String(selectedClient.id),cliente:selectedClient.name,clientZone:String(selectedClient.comuna||selectedClient.zone||'').trim(),ruta:selectedClient.route||'',routeWeek:week,routeDay:day,items:cart.map(i=>({productId:i.productId,baseProductId:i.baseProductId,desc:i.name,qty:i.qty,price:i.price})),total,paymentMethod,paymentStatus:'paid',collectionStatus:'awaiting_delivery',sellerUid:profile.uid};
 const button=$('sellerSaveSale');button.disabled=true;status(navigator.onLine?'Guardando venta y descontando el stock…':'Sin internet · guardando la venta en este teléfono para sincronizarla después.','warn');
 try{
  if(navigator.onLine)await commitSale(sale);
  else throw Object.assign(new Error('offline'),{code:'unavailable'});
  sales=[sale,...sales.filter(s=>String(s.id)!==String(sale.id))];cacheWrite('sales',sales);
  const deductions={};sale.items.forEach(i=>{const k=String(i.baseProductId);deductions[k]=(deductions[k]||0)+i.qty});
  products=products.map(p=>({...p,stock:Math.max(0,Number(p.stock||0)-(deductions[p.id]||0))}));cacheWrite('products',products);
  const vId=profile.uid+'_'+localDate()+'_'+selectedClient.id;
  await setDoc(doc(db,'orgs',ORG,'visits',vId),{id:vId,sellerUid:profile.uid,clientId:String(selectedClient.id),date:localDate(),status:'sale',saleId:sale.id,routeWeek:week,routeDay:day,visitedAt:serverTimestamp()},{merge:true});
  cart=[];render();status('Venta guardada en Firebase y stock actualizado.','ok');
 }catch(error){
  if(['unavailable','deadline-exceeded','aborted','failed-precondition','cancelled'].includes(error.code)||!navigator.onLine){
   const q=queueRead();if(!q.some(item=>String(item.id)===String(sale.id)))q.push(sale);queueWrite(q);
   sales=[sale,...sales];cacheWrite('sales',sales);
   const deductions={};sale.items.forEach(i=>{const k=String(i.baseProductId);deductions[k]=(deductions[k]||0)+i.qty});
   products=products.map(p=>({...p,stock:Math.max(0,Number(p.stock||0)-(deductions[p.id]||0))}));cacheWrite('products',products);
   status('Venta guardada en el teléfono; pendiente de confirmar stock y sincronizar con Firebase.','warn');
   cart=[];render();
  }else status('No se guardó la venta: '+(error.message||'Revisa la conexión o el stock.'),'error');
 }finally{button.disabled=false;render()}
}
async function flushPendingSales(){
 if(!profile||!navigator.onLine)return;
 let queue=queueRead();if(!queue.length)return;
 status('Sincronizando ventas pendientes…','warn');
 for(const sale of queue){
  try{await commitSale(sale);queue=queue.filter(item=>String(item.id)!==String(sale.id));queueWrite(queue)}
  catch(error){status('Una venta quedó pendiente: '+(error.message||'no se pudo confirmar el stock.'),'error');return}
 }
 await refreshFromServer();status('Firebase al día · ventas pendientes sincronizadas.','ok')
}
async function logout(){unsubs.forEach(fn=>{try{fn()}catch(_){}});await signOut(auth);profile=null;session=null;$('sellerApp').classList.add('seller-hidden');$('sellerLogin').classList.remove('seller-hidden');status('Sesión cerrada.');}
function wire(){
 $('sellerLoginButton').onclick=signIn;if($('sellerForgot'))$('sellerForgot').onclick=resetPassword;$('sellerLogout').onclick=logout;$('sellerStart').onclick=startSession;$('sellerClose').onclick=closeSession;$('sellerAddItem').onclick=addItem;$('sellerSaveSale').onclick=saveSale;
 $('sellerWeek').onchange=()=>{renderRouteDays();renderClients()};if($('sellerNewClientOpen'))$('sellerNewClientOpen').onclick=()=>toggleNewClient(true);if($('newClientCancel'))$('newClientCancel').onclick=()=>toggleNewClient(false);if($('newClientSave'))$('newClientSave').onclick=saveNewClient;$('sellerDay').onchange=renderClients;$('sellerSearch').oninput=renderClients;
 window.addEventListener('online',async()=>{status('Conexión recuperada · sincronizando…','warn');await flushPendingSales();if(navigator.onLine)await refreshFromServer();});
 window.addEventListener('offline',()=>status('Sin internet · los cambios quedarán pendientes.','warn'));
}
wire();
onAuthStateChanged(auth,async user=>{
 if(!user||profile)return;
 try{
  const snap=await getDoc(doc(db,'orgs',ORG,'members',user.uid));
  if(!snap.exists()||snap.data().active!==true||snap.data().role!=='seller'){await signOut(auth);return}
  await requirePreparedSellerMode();
  profile={uid:user.uid,email:user.email||'',...snap.data()};
  await activate();
 }catch(error){status(error.message||'No se pudo validar el perfil vendedor.','error');await signOut(auth)}
});
