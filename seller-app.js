import { initializeApp } from 'firebase/app';
import {
  getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc,
  runTransaction, serverTimestamp
} from 'firebase/firestore';

const config={
  apiKey:'AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF4',
  authDomain:'zipper-a12f1.firebaseapp.com',
  projectId:'zipper-a12f1',
  storageBucket:'zipper-a12f1.firebasestorage.app',
  messagingSenderId:'729619217486',
  appId:'1:729619217486:web:6350b05ead8ecd70c1171f',
  measurementId:'G-KX0HXC2Z54'
};
const app=initializeApp(config);
const auth=getAuth(app);
let db;
try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(_){db=getFirestore(app)}
const ORG='zipper-a12f1';
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const $=id=>document.getElementById(id);
let profile=null,clients=[],products=[],sales=[],selectedClient=null,cart=[],session=null,unsubs=[],loading=false,currentDebt=null,debtLoading=false,debtClientId='',paymentSaving=false;
const localDate=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const prefix=()=>profile?'zipperSeller_'+profile.uid+'_':'zipperSeller_guest_';
const cacheRead=name=>{try{const v=JSON.parse(localStorage.getItem(prefix()+name)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const cacheWrite=(name,value)=>{try{localStorage.setItem(prefix()+name,JSON.stringify(value))}catch(error){console.error(error)}};
const queueRead=()=>{try{const v=JSON.parse(localStorage.getItem(prefix()+'pendingSales')||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const queueWrite=value=>{try{localStorage.setItem(prefix()+'pendingSales',JSON.stringify(value))}catch(error){console.error(error)}};
function status(message,state=''){const el=$('sellerStatus');if(!el)return;el.textContent=message;el.className='seller-status'+(state?' '+state:'')}
function safeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(value){return '$'+Math.round(Number(value)||0).toLocaleString('es-CL')}
function routeFor(client,week){return client?.sellerRoutes?.[profile.uid]?.[week]||null}
function routeDays(week){return [...new Set(clients.map(c=>routeFor(c,week)?.day).filter(day=>DAYS.includes(day)))].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b))}
function selectedRoute(){return {week:$('sellerWeek').value||'A',day:$('sellerDay').value||''}}
function filteredClients(){const {week,day}=selectedRoute(),q=String($('sellerSearch').value||'').trim().toLocaleLowerCase('es');return clients.filter(c=>{const r=routeFor(c,week);return c.active!==false&&r&&r.day===day&&(!q||String(c.name||'').toLocaleLowerCase('es').includes(q)||String(c.address||'').toLocaleLowerCase('es').includes(q))}).sort((a,b)=>(Number(routeFor(a,week)?.position)||999999)-(Number(routeFor(b,week)?.position)||999999)||String(a.name).localeCompare(String(b.name),'es'))}
function renderRouteDays(){const week=$('sellerWeek').value||'A',days=routeDays(week),select=$('sellerDay'),current=select.value;select.innerHTML='<option value="">Seleccionar día</option>'+days.map(d=>'<option>'+safeText(d)+'</option>').join('');if(days.includes(current))select.value=current;else if(days.length===1)select.value=days[0]}
function renderClients(){const rows=filteredClients();$('sellerClientCount').textContent=String(rows.length);$('sellerClients').innerHTML=rows.length?rows.map((c,i)=>'<article class="seller-row"><strong>'+(i+1)+'. '+safeText(c.name)+'</strong><small>'+safeText(c.address||'Sin dirección')+' · '+safeText(c.phone||'Sin teléfono')+'</small><div class="seller-actions"><button class="seller-btn secondary" type="button" data-visit="'+safeText(c.id)+'">Marcar visitado</button><button class="seller-btn secondary" type="button" data-payment-select="'+safeText(c.id)+'">Abonar</button><button class="seller-btn" type="button" data-select="'+safeText(c.id)+'">Vender</button></div></article>').join(''):'<p class="seller-muted">No hay clientes asignados para esta semana y día.</p>';document.querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>markVisited(b.dataset.visit));document.querySelectorAll('[data-select],[data-payment-select]').forEach(b=>b.onclick=()=>selectClient(b.dataset.select||b.dataset.paymentSelect))}
function renderProducts(){const available=products.filter(p=>p&&p.active!==false&&p.id!=null&&String(p.name||'').trim());$('sellerProduct').innerHTML='<option value="">Seleccionar producto</option>'+available.map(p=>'<option value="'+safeText(p.id)+'">'+safeText(p.name)+' · '+money(p.price)+' · stock '+Number(p.stock||0)+'</option>').join('');$('sellerInventory').innerHTML=available.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'es')).map(p=>'<div class="seller-product"><strong>'+safeText(p.name)+'</strong><span>Stock: '+Number(p.stock||0)+' · '+money(p.price)+'</span></div>').join('')||'<p class="seller-muted">Inventario aún no disponible. Conéctate a internet para cargarlo la primera vez.</p>'}
function balanceCacheRead(){try{const v=JSON.parse(localStorage.getItem(prefix()+'clientBalances')||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(_){return {}}}
function pendingPaymentId(clientId){const key=prefix()+'pendingPayment_'+String(clientId);let id=localStorage.getItem(key);if(!id){id='payment_'+profile.uid+'_'+(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random());try{localStorage.setItem(key,id)}catch(error){console.error(error)}}return id}
function clearPendingPaymentId(clientId){try{localStorage.removeItem(prefix()+'pendingPayment_'+String(clientId))}catch(error){console.error(error)}}
function balanceCacheWrite(clientId,balance){const v=balanceCacheRead();v[String(clientId)]={balance:Number(balance)||0,updatedAt:new Date().toISOString()};try{localStorage.setItem(prefix()+'clientBalances',JSON.stringify(v))}catch(error){console.error(error)}}
function renderDebt(){
 const label=$('sellerDebtStatus'),button=$('sellerSavePayment'),input=$('sellerPaymentAmount');
 if(!label||!button)return;
 const active=!!session&&!session.closedAt&&session.status!=='closed';
 if(!selectedClient){label.textContent='Selecciona un cliente de tu ruta para consultar su saldo.';button.disabled=true;return}
 if(debtClientId!==String(selectedClient.id)){label.textContent='Consultando saldo del cliente…';button.disabled=true;return}
 if(debtLoading){label.textContent='Consultando el saldo actualizado en Firebase…';button.disabled=true;return}
 if(currentDebt==null){label.textContent=navigator.onLine?'No se pudo confirmar el saldo. Intenta actualizar con internet.':'Sin conexión: el saldo no está disponible para confirmar un abono.';button.disabled=true;return}
 label.textContent=(navigator.onLine?'Saldo pendiente en Firebase: ':'Último saldo guardado: ')+money(currentDebt)+(navigator.onLine?'':'. Conéctate para registrar el abono.');
 button.disabled=!navigator.onLine||!active||currentDebt<1||paymentSaving;
 if(input&&currentDebt>0)input.max=String(currentDebt);
}
async function loadSelectedDebt(){
 if(!selectedClient){currentDebt=null;debtClientId='';renderDebt();return}
 const clientId=String(selectedClient.id);debtClientId=clientId;
 const cached=balanceCacheRead()[clientId];
 currentDebt=cached?Number(cached.balance):null;
 if(navigator.onLine===false){debtLoading=false;renderDebt();return}
 debtLoading=true;renderDebt();
 try{
  const [ledgerSnap,balanceSnap]=await Promise.all([
   getDoc(doc(db,'orgs',ORG,'settings','debtLedger')),
   getDoc(doc(db,'orgs',ORG,'clientBalances',clientId))
  ]);
  if(!selectedClient||String(selectedClient.id)!==clientId)return;
  if(!ledgerSnap.exists()||ledgerSnap.data().ready!==true)throw new Error('El saldo compartido está actualizándose. Intenta nuevamente en unos segundos.');
  if(!balanceSnap.exists())throw new Error('El dueño todavía no ha preparado el saldo de este cliente.');
  const fresh=Number(balanceSnap.data().balance);
  if(!Number.isFinite(fresh)||fresh<0)throw new Error('El saldo recibido no es válido.');
  currentDebt=fresh;balanceCacheWrite(clientId,fresh);
 }catch(error){if(selectedClient&&String(selectedClient.id)===clientId){currentDebt=null;status(error.message||'No se pudo consultar el saldo del cliente.','warn')}}
 finally{debtLoading=false;renderDebt()}
}
async function savePayment(){
 if(!selectedClient||!session||session.status==='closed'){status('Selecciona un cliente e inicia la jornada antes de registrar un abono.','error');return}
 if(navigator.onLine===false){status('El abono necesita internet para validar el saldo y quedar confirmado.','warn');return}
 const amount=Math.floor(Number($('sellerPaymentAmount').value));
 if(!Number.isFinite(amount)||amount<1){status('Ingresa un monto válido en pesos.','error');return}
 const client=selectedClient,clientId=String(client.id),button=$('sellerSavePayment');
 if(debtClientId!==clientId||currentDebt==null){await loadSelectedDebt();if(!selectedClient||String(selectedClient.id)!==clientId||currentDebt==null)return}
 if(amount>currentDebt){status('El monto supera el saldo pendiente de '+money(currentDebt)+'.','error');return}
 const movementId=pendingPaymentId(clientId);
 const movementRef=doc(db,'orgs',ORG,'cashMovements',movementId);
 const balanceRef=doc(db,'orgs',ORG,'clientBalances',clientId);
 const ledgerRef=doc(db,'orgs',ORG,'settings','debtLedger');
 const method=$('sellerPaymentMethod').value;
 paymentSaving=true;renderDebt();status('Validando saldo y guardando el abono en Firebase…','warn');
 try{
  const result=await runTransaction(db,async tx=>{
   const [ledgerSnap,balanceSnap]=await Promise.all([tx.get(ledgerRef),tx.get(balanceRef)]);
   if(!ledgerSnap.exists()||ledgerSnap.data().ready!==true)throw new Error('Los saldos están en actualización. Espera y vuelve a consultar.');
   if(!balanceSnap.exists())throw new Error('No hay saldo preparado para este cliente.');
   const current=Math.max(0,Math.round(Number(balanceSnap.data().balance)||0));
   if(balanceSnap.data().lastPaymentId===movementId)return {already:true,balance:current};
   if(amount>current)throw new Error('El saldo cambió. El saldo actual es '+money(current)+'.');
   const next=current-amount;
   const payment={id:movementId,sourceType:'payment',origin:'seller',clientId,clienteId:clientId,cliente:String(client.name||''),amount,paymentMethod:method,date:localDate(),sellerUid:profile.uid,sellerName:String(profile.displayName||profile.email||''),createdAt:serverTimestamp()};
   tx.set(balanceRef,{clientId,balance:next,updatedAt:serverTimestamp(),lastPaymentId:movementId,lastPaymentSellerUid:profile.uid});
   tx.set(movementRef,payment);
   return {already:false,balance:next};
  });
  currentDebt=result.balance;balanceCacheWrite(clientId,result.balance);clearPendingPaymentId(clientId);$('sellerPaymentAmount').value='';
  status(result.already?'El abono ya estaba confirmado. Saldo pendiente: '+money(result.balance)+'.':'Abono de '+money(amount)+' registrado. Saldo pendiente: '+money(result.balance)+'.','ok');
 }catch(error){if(!['unavailable','deadline-exceeded','unknown'].includes(error.code))clearPendingPaymentId(clientId);status('No se confirmó el abono: '+(error.message||'revisa la conexión y vuelve a consultar el saldo.'),'error');if(selectedClient&&String(selectedClient.id)===clientId)await loadSelectedDebt()}
 finally{paymentSaving=false;button.disabled=false;renderDebt()}
}
function renderCart(){const total=cart.reduce((n,item)=>n+item.qty*item.price,0);$('sellerCart').innerHTML=cart.length?cart.map((item,i)=>'<div class="seller-row"><strong>'+safeText(item.name)+' × '+item.qty+'</strong><small>'+money(item.price)+' c/u · '+money(item.qty*item.price)+'</small><button class="seller-btn secondary" type="button" data-remove="'+i+'">Quitar</button></div>').join(''):'<p class="seller-muted">Carrito vacío.</p>';document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart()});$('sellerSaleTotal').textContent=money(total)}
function renderSales(){const today=sales.filter(s=>String(s.fecha||'').slice(0,10)===localDate()).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));const pending=queueRead();$('sellerSalesToday').innerHTML=[...pending.map(s=>({...s,_pending:true})),...today].map(s=>'<article class="seller-row"><strong>#'+safeText(s.folio||'pendiente')+' · '+safeText(s.cliente)+'</strong><small>'+safeText(s.fecha||localDate())+' · '+money(s.total)+' · '+(s._pending?'Pendiente de sincronizar':'Guardada en Firebase')+'</small></article>').join('')||'<p class="seller-muted">Todavía no hay ventas hoy.</p>'}
function renderSession(){const active=!!session&&!session.closedAt;$('sellerSessionLabel').textContent=active?'Jornada abierta · Semana '+session.routeWeek+' · '+session.routeDay:'Jornada cerrada';$('sellerStart').classList.toggle('seller-hidden',active);$('sellerClose').classList.toggle('seller-hidden',!active);$('sellerSaveSale').disabled=!active||!selectedClient;$('sellerAddItem').disabled=!active;renderDebt()}
function render(){if(!profile)return;renderRouteDays();renderClients();renderProducts();renderCart();renderSales();renderSession();$('sellerSelectedClient').textContent=selectedClient?'Cliente: '+selectedClient.name:'Selecciona un cliente de la ruta.';renderDebt()}
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
 }catch(error){status(error.message||'No se pudo iniciar sesión.');button.disabled=false}
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
function selectClient(id){selectedClient=clients.find(c=>String(c.id)===String(id))||null;cart=[];currentDebt=null;debtClientId=selectedClient?String(selectedClient.id):'';renderCart();renderSession();loadSelectedDebt()}
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
 const paymentMethod=$('sellerPayment').value,total=cart.reduce((n,i)=>n+i.qty*i.price,0),{week,day}=selectedRoute();
 const sale={id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),folio:Math.max(0,...sales.map(s=>Number(s.folio)||0))+1,fecha:localDate(),date:localDate(),occurredAt:new Date().toISOString(),clienteId:String(selectedClient.id),cliente:selectedClient.name,clientZone:String(selectedClient.comuna||selectedClient.zone||'').trim(),ruta:selectedClient.route||'',routeWeek:week,routeDay:day,items:cart.map(i=>({productId:i.productId,baseProductId:i.baseProductId,desc:i.name,qty:i.qty,price:i.price})),total,paymentMethod,paymentStatus:paymentMethod==='pending'?'pending':'paid',sellerUid:profile.uid};
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
 $('sellerLoginButton').onclick=signIn;$('sellerLogout').onclick=logout;$('sellerStart').onclick=startSession;$('sellerClose').onclick=closeSession;$('sellerAddItem').onclick=addItem;$('sellerSaveSale').onclick=saveSale;$('sellerSavePayment').onclick=savePayment;
 $('sellerWeek').onchange=()=>{renderRouteDays();renderClients()};$('sellerDay').onchange=renderClients;$('sellerSearch').oninput=renderClients;
 window.addEventListener('online',async()=>{status('Conexión recuperada · sincronizando…','warn');await flushPendingSales();if(navigator.onLine)await refreshFromServer();if(selectedClient)await loadSelectedDebt()});
 window.addEventListener('offline',()=>{status('Sin internet · ventas pendientes quedan en cola; los abonos requieren conexión.','warn');renderDebt()});
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
