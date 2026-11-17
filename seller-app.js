import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import {
  getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc,
  runTransaction, serverTimestamp, updateDoc, increment, deleteDoc
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
let profile=null,clients=[],products=[],sales=[],visits=[],selectedClient=null,cart=[],session=null,unsubs=[],showTray=false,currentTab='route';
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
const todayQueue=()=>queueRead().filter(s=>String(s.fecha||s.date||'').slice(0,10)===localDate());
// Horario: la jornada se puede abrir hasta las 19:00; a las 18:50 se avisa y a las 19:00 se cierra sola.
const CLOSE_HOUR=19;
const afterHours=()=>new Date().getHours()>=CLOSE_HOUR;
const closedToday=()=>!!session&&session.id===sessionId()&&(session.status==='closed'||!!session.closedAt);
function attendedState(clientId){const id=String(clientId);if(todaySales().some(s=>String(s.clienteId)===id)||todayQueue().some(s=>String(s.clienteId)===id))return 'sale';if(todayVisits().some(v=>String(v.clientId)===id))return 'visited';return ''}
const sessionOpen=()=>!!session&&session.id===sessionId()&&session.status==='open'&&!session.closedAt&&!afterHours();
function renderRouteDays(){const week=$('sellerWeek').value||'A',select=$('sellerDay'),current=select.value;const count=d=>clients.filter(c=>c.active!==false&&routeFor(c,week)?.day===d).length;select.innerHTML=DAYS.map(d=>'<option value="'+d+'">'+d+(count(d)?' ('+count(d)+')':'')+'</option>').join('');if(DAYS.includes(current))select.value=current;else{const withClients=DAYS.filter(count);const today=DAYS[(new Date().getDay()+6)%7];select.value=withClients.includes(today)?today:(withClients[0]||today||'Lunes')}}
let changingRoute=false;
function renderSession(){
 const open=sessionOpen(),closed=closedToday();
 if(open&&!changingRoute){if(session.routeWeek&&$('sellerWeek').value!==session.routeWeek){$('sellerWeek').value=session.routeWeek;renderRouteDays()}if(session.routeDay&&$('sellerDay').value!==session.routeDay&&[...$('sellerDay').options].some(o=>o.value===session.routeDay))$('sellerDay').value=session.routeDay}
 $('state').textContent=open?'Abierta':closed?'Cerrada':'Sin iniciar';
 $('count').textContent=String(todaySales().length+todayQueue().filter(q=>!todaySales().some(x=>String(x.id)===String(q.id))).length);
 $('sessionInfo').textContent=afterHours()&&!open?'⏰ Después de las '+CLOSE_HOUR+':00 no se toman pedidos. Mañana puedes comenzar una nueva ruta.':closed?'✅ Jornada de hoy cerrada. Mañana puedes comenzar una nueva ruta.':open?'Jornada abierta desde las '+(session.openedAtLocal?new Date(session.openedAtLocal).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'—')+'. Elige el día que quieres ver.':closed?'Jornada cerrada hoy. Puedes volver a abrirla si necesitas seguir.':'Al comenzar la ruta se inicia tu jornada (hora de entrada).';
 $('sellerStart').classList.toggle('hide',open);$('sellerStart').textContent=closed?'Jornada cerrada · vuelve mañana':afterHours()?'Fuera de horario · vuelve mañana':'Comenzar ruta';$('sellerStart').disabled=closed||afterHours();$('sellerClose').disabled=!open;
 $('routeHint').classList.toggle('hide',open);
 $('routeSetup').classList.toggle('hide',open&&!changingRoute);
 $('activeRouteBox').classList.toggle('hide',!open);
 const {week,day}=selectedRoute();$('activeRouteLabel').textContent='Semana '+week+' · '+(day||'—');
 $('otherRoute').textContent=changingRoute?'Listo':'Cambiar ruta';
 $('routeBannerText').textContent=open?'Semana '+week+' · '+(day||'—')+' · jornada abierta':'Elige semana y día · comienza tu jornada';
}
let visitedMode=false;
const clientSalesToday=id=>[...todaySales(),...todayQueue().filter(q=>!todaySales().some(x=>String(x.id)===String(q.id)))].filter(s=>String(s.clienteId)===String(id));
const clientSalesAll=id=>[...queueRead(),...sales.filter(x=>!queueRead().some(q=>String(q.id)===String(x.id)))].filter(s=>String(s.clienteId)===String(id)).sort((a,b)=>String(b.occurredAt||b.fecha||'').localeCompare(String(a.occurredAt||a.fecha||'')));
function routeFilter(list){const qn=norm($('routeName')?.value||''),qa=norm($('routeAddress')?.value||'');return list.filter(c=>(!qn||norm(c.name).includes(qn))&&(!qa||norm(c.address).includes(qa)))}
function routeLabelOf(c){const w=routeFor(c,'A')?'A':routeFor(c,'B')?'B':'';return w?'Semana '+w+' · '+routeFor(c,w).day:'Sin día en mi ruta'}
function pendingRow(c,i,total,open){
 return '<article class="route-client"><div><strong>'+(i+1)+'. '+safeText(c.name)+'</strong><span>'+safeText(c.address||'Sin dirección')+'</span><span>'+safeText(routeLabelOf(c))+'</span></div>'+
  '<div class="actions-small"><button class="primary select-client" type="button" data-sale="'+safeText(c.id)+'"'+(open?'':' disabled')+'>🛒 Vender</button><button class="secondary mark-visited" type="button" data-visit="'+safeText(c.id)+'"'+(open?'':' disabled')+'>Visitado</button></div><div class="route-mini"><button class="secondary" type="button" data-up="'+safeText(c.id)+'"'+(i===0?' disabled':'')+'>↑ Subir</button><button class="secondary" type="button" data-down="'+safeText(c.id)+'"'+(i===total-1?' disabled':'')+'>↓ Bajar</button><button class="secondary" type="button" data-move="'+safeText(c.id)+'">📅 Cambiar día</button></div></article>';
}
// Visitados: igual que la app del dueño (sin las funciones de administrador como anular).
function visitedRow(c){
 const list=clientSalesToday(c.id),total=list.reduce((a,x)=>a+Number(x.total||0),0);
 return '<article class="route-client visited-row"><div><strong>'+safeText(c.name)+'</strong><span>'+safeText(c.address||'Sin dirección')+'</span><span>'+safeText(routeLabelOf(c))+'</span></div><div class="actions-small"><span class="sale-status-badge '+(list.length?'has-sale':'no-sale')+'">'+(list.length?'VENTA · '+money(total):'VISITADO · SIN VENTA')+'</span>'+
  '<button class="primary review-visited" data-review="'+safeText(c.id)+'" type="button">Revisar</button><button class="primary edit-visited-sale" data-reopen="'+safeText(c.id)+'" type="button">Agregar venta</button>'+
  '<button class="secondary reprint-last" data-resend="'+safeText(c.id)+'" type="button"'+(list.length?'':' disabled')+'>Reenviar último</button><button class="ghost view-client-sales" data-history="'+safeText(c.id)+'" type="button">Ventas anteriores</button></div></article>';
}
function attendedClients(){const ids=[...new Set([...todaySales().map(s=>String(s.clienteId)),...todayQueue().map(s=>String(s.clienteId)),...todayVisits().map(v=>String(v.clientId))])];return ids.map(id=>clients.find(c=>String(c.id)===id)).filter(Boolean)}
function renderClients(){
 const open=sessionOpen(),all=routeClients(),pending=all.filter(c=>!attendedState(c.id)),done=all.length-pending.length,visited=attendedClients();
 $('routeSummary').textContent=pending.length+' por atender · '+done+' atendidos';
 $('visitedBack').classList.toggle('hide',!visitedMode);
 if(!visitedMode)$('visitedSales').classList.add('hide');
 if(visitedMode){const rows=routeFilter(visited);$('sellerClients').innerHTML=rows.length?rows.map(visitedRow).join(''):'<p class="muted">Todavía no hay clientes visitados hoy.</p>';return}
 const rows=routeFilter(pending);
 $('sellerClients').innerHTML=rows.length?rows.map((c,i)=>pendingRow(c,i,rows.length,open)).join(''):'<p class="muted">'+(pending.length?'Sin resultados para la búsqueda.':all.length?'🎉 Atendiste a todos los clientes de este día. Toca <b>Visitados</b> para verlos.':'Aún no tienes clientes este día. Agrégalos con "＋ Nuevo cliente en mi ruta".')+'</p>';
}
function renderAttended(){
 $('attendedCount').textContent=String(attendedClients().length);
 const b=$('dailyRouteBox');if(!b)return;
 const s0=sessionOpen()?session:null,{week,day}=selectedRoute();
 const away=!!s0&&(s0.routeWeek!==week||s0.routeDay!==day);
 b.classList.toggle('hide',!away);
 if(away){$('dailyRouteText').textContent='Ruta inicial de hoy: Semana '+s0.routeWeek+' · '+s0.routeDay;$('returnDailyRoute').textContent='Semana '+s0.routeWeek+' · '+s0.routeDay}
}
function saleDetailHTML(x){return '<div class="sales-row"><strong>#'+safeText(x.folio||'—')+' · '+safeText(String(x.fecha||'').slice(0,10))+' · '+money(x.total)+'</strong><small>'+(x.paymentMethod==='transfer'?'Transferencia':'Efectivo')+' · '+(x.collectionStatus==='collected'?'✓ Entregado y pagado':'⏳ Por entregar')+'</small><small>'+(x.items||[]).map(i=>safeText(i.qty+' × '+i.desc+(i.promotion?' (oferta)':'')+' — '+money(i.qty*i.price))).join('<br>')+'</small><div class="actions"><button class="wa wide" type="button" data-wa="'+safeText(x.id)+'">📲 Enviar por WhatsApp</button></div></div>'}
function showClientSales(id,todayOnly){
 const c=clients.find(x=>String(x.id)===String(id));if(!c)return;
 const list=todayOnly?clientSalesToday(id):clientSalesAll(id).slice(0,15);
 const box=$('visitedSales');box.classList.remove('hide');
 box.innerHTML='<h2>'+(todayOnly?'🔎 Revisión de hoy':'🧾 Ventas anteriores')+' · '+safeText(c.name)+'</h2>'+(list.length?list.map(saleDetailHTML).join(''):'<p class="muted">'+(todayOnly?'Visitado sin venta hoy.':'Este cliente aún no tiene ventas tuyas registradas.')+'</p>')+'<button class="secondary wide" type="button" data-closesales="1">Cerrar</button>';
 box.scrollIntoView({behavior:'smooth',block:'start'});
}
// ===== Precios y búsqueda como en la app del dueño =====
function searchScore(text,q){const t=norm(text),x=norm(q);if(!x)return 99;if(t===x)return 0;if(t.startsWith(x))return 1;const words=t.split(/[^a-z0-9]+/).filter(Boolean);if(words.some(w=>w.startsWith(x)))return 2;if(t.includes(x))return 3;return 99}
const promoGroup=p=>p?.variantKey==='bigtime-ultra'?'bigtime-ultra':null;
function effectivePrice(p,qty){let price=Number(p.price)||0,applied=null;const g=promoGroup(p);let q=qty;if(g)q=cart.reduce((a,i)=>{const x=productOf(i.productId);return a+(x&&promoGroup(x)===g?i.qty:0)},0);(Array.isArray(p.promotions)?p.promotions:[]).slice().sort((a,b)=>Number(b.minQty)-Number(a.minQty)).some(pr=>{if(q>=Number(pr.minQty)&&Number(pr.price)>=0){price=Number(pr.price);applied=pr;return true}return false});return {price,applied}}
const productOf=id=>products.find(p=>String(p.id)===String(id));
function availableStock(p){const inCart=cart.filter(i=>String(i.productId)===String(p.id)).reduce((n,i)=>n+i.qty,0);return Math.max(0,Number(p.stock||0)-inCart)}
function stockBadge(n){n=Math.max(0,Number(n)||0);return n===0?'<b class="stock-badge stock-zero">0 · SIN STOCK</b>':n<=5?'<b class="stock-badge stock-low">'+n+' · STOCK BAJO</b>':'<b class="stock-badge stock-ok">'+n+' · STOCK OK</b>'}
const colorDot=p=>'<span class="dot"'+(p?.barColorHex||COLORS[p?.barColor]?' style="background:'+(p.barColorHex||COLORS[p.barColor])+'"':'')+'></span>';
const dot=p=>window.zipperProductPhotos?window.zipperProductPhotos.thumb(p,colorDot(p)):colorDot(p);
const COLORS={verde:'#22c55e',celeste:'#38bdf8',morado:'#7c3aed',menta:'#9ae6b4',cafe:'#8b5e3c',gris:'#808080',negro:'#111827',rosado:'#ec4899',naranja:'#f97316',amarillo:'#facc15',azul:'#2563eb',rojo:'#ef4444'};
const isRemedy=p=>norm(p?.category).includes('remedio');
const sellable=()=>products.filter(p=>p&&p.active!==false&&p.id!=null&&String(p.name||'').trim()&&!isRemedy(p)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));
function cartTotal(){return cart.reduce((n,i)=>{const p=productOf(i.productId);return n+i.qty*(p?effectivePrice(p,i.qty).price:i.price)},0)}
function suggestedFor(client){
 const list=sales.filter(s=>String(s.clienteId)===String(client.id)).sort((a,b)=>String(b.occurredAt||b.fecha||'').localeCompare(String(a.occurredAt||a.fecha||''))).slice(0,4);
 if(!list.length)return [];const map=new Map();
 list.forEach(s=>{const seen=new Set();(s.items||[]).forEach(i=>{const p=productOf(i.productId)||productOf(i.baseProductId);if(!p||isRemedy(p))return;const k=String(p.id);if(!map.has(k))map.set(k,{p,times:0,qty:0});const e=map.get(k);e.qty+=Number(i.qty)||0;if(!seen.has(k)){e.times++;seen.add(k)}})});
 const min=list.length>=2?2:1;return [...map.values()].filter(e=>e.times>=min).map(e=>({p:e.p,times:e.times,qty:Math.max(1,Math.round(e.qty/e.times)),of:list.length})).slice(0,10);
}
function renderSale(){
 const has=!!selectedClient;$('saleEmpty').classList.toggle('hide',has);$('saleCard').classList.toggle('hide',!has);
 if(!has)return;
 const c=selectedClient,r=routeFor(c,'A')||routeFor(c,'B');
 $('cartClientName').textContent=c.name;$('cartClientMeta').textContent=(c.address||'Sin dirección')+(r?' · '+(routeFor(c,'A')?'Sem A':'Sem B')+' · '+r.day:'');
 // Lo que suele llevar
 const sug=suggestedFor(c),box=$('cartSuggested');box.classList.toggle('hide',!sug.length);
 box.innerHTML=sug.length?'<h3>🔁 Lo que suele llevar</h3>'+sug.map((x,i)=>{const inCart=cart.some(k=>String(k.productId)===String(x.p.id)),st=availableStock(x.p);return '<div class="sug-row"><div><strong>'+safeText(x.p.name)+'</strong><small>Lleva ~'+x.qty+' · en '+x.times+' de '+x.of+' compras · stock '+Number(x.p.stock||0)+'</small></div>'+(inCart?'<span class="badge ok">✓ En carrito</span>':st<=0?'<span class="badge warn">Sin stock</span>':'<button type="button" class="sug-add" data-sug="'+i+'">+ '+Math.min(x.qty,st)+'</button>')+'</div>'}).join('')+'<button type="button" id="sugAll" class="full" style="margin-top:8px;background:#7c3aed">＋ Agregar todo lo sugerido</button>':'';
 box.querySelectorAll('[data-sug]').forEach(b=>b.onclick=()=>{const x=sug[Number(b.dataset.sug)];addToCart(x.p,Math.min(x.qty,availableStock(x.p)))});
 if($('sugAll'))$('sugAll').onclick=()=>{let n=0;sug.forEach(x=>{if(cart.some(k=>String(k.productId)===String(x.p.id)))return;const q=Math.min(x.qty,availableStock(x.p));if(q>0&&addToCart(x.p,q,true))n++});renderSale();status(n?'➕ '+n+' productos sugeridos agregados. Revisa la bandeja.':'Nada nuevo para agregar.','ok')};
 // categorías y sugerencias de búsqueda
 const cat=$('cartCategory'),cur=cat.value,cats=[...new Set(sellable().map(p=>p.category||'Otros'))].sort((a,b)=>a.localeCompare(b,'es'));
 cat.innerHTML='<option value="">Todas las categorías</option>'+cats.map(x=>'<option value="'+safeText(x)+'">'+safeText(x)+'</option>').join('');if(cats.includes(cur))cat.value=cur;
 const q=$('cartSearchName').value.trim(),catv=cat.value;
 const list=(q.length>=2||catv)?sellable().filter(p=>(!catv||(p.category||'Otros')===catv)&&(!q||searchScore(p.name,q)<99)).sort((a,b)=>searchScore(a.name,q)-searchScore(b.name,q)||String(a.name).localeCompare(String(b.name),'es')).slice(0,q?10:40):[];
 $('productSuggestions').innerHTML=draftId?'':list.map(p=>'<button type="button" class="suggestion" data-pick="'+safeText(p.id)+'">'+dot(p)+'<span><strong>'+safeText(p.name)+'</strong><small>'+money(p.price)+((p.promotions||[]).length?' <span class="offer">OFERTA</span>':'')+'</small>'+stockBadge(availableStock(p))+'</span></button>').join('')||(q.length>=2?'<p class="muted">Sin coincidencias.</p>':'');
 const d=draftId?productOf(draftId):null;
 $('productDraft').innerHTML=d?'<div class="draft-product"><div style="display:flex;gap:10px;align-items:center">'+dot(d)+'<div><strong>'+safeText(d.name)+'</strong><small>'+money(d.price)+' · Stock: '+stockBadge(availableStock(d))+((d.promotions||[]).length?' · Oferta: '+d.promotions.map(pr=>'desde '+pr.minQty+' a '+money(pr.price)).join(', '):'')+'</small></div></div><div class="draft-controls"><input id="draftQty" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Cantidad" value="'+safeText(draftQty)+'"><button id="assignDraft" class="primary" type="button"'+(Number(draftQty)>=1?'':' disabled')+'>Asignar</button><button id="cancelDraft" class="secondary" type="button">✕</button></div></div>':'';
 // bandeja
 const units=cart.reduce((a,i)=>a+i.qty,0);
 $('cartUnits').textContent=String(units);
 $('chosenProducts').innerHTML=cart.length?cart.map(i=>{const p=productOf(i.productId),ep=p?effectivePrice(p,i.qty):{price:i.price};const promos=p&&Array.isArray(p.promotions)?p.promotions.filter(pr=>Number(pr.minQty)>1):[];const g=p&&promoGroup(p);const groupQty=g?cart.reduce((a,k)=>{const x=productOf(k.productId);return a+(x&&promoGroup(x)===g?k.qty:0)},0):i.qty;const next=!ep.applied&&promos.length?promos.slice().sort((a,b)=>a.minQty-b.minQty).find(pr=>groupQty<Number(pr.minQty)):null;
   return '<div class="chosen-line"><div>'+(p?dot(p):'')+'<div style="display:flex;flex-direction:column;gap:3px;min-width:0"><strong>'+safeText(i.name)+'</strong><span>'+i.qty+' × '+(ep.applied?'<s>'+money(p.price)+'</s> <b class="offer-line">'+money(ep.price)+'</b> <span class="offer">OFERTA</span>':money(ep.price))+' = <b>'+money(i.qty*ep.price)+'</b></span>'+(next?'<span class="offer-hint">🏷️ Oferta: llevando '+next.minQty+(g?' (sumando colores)':'')+' quedan a '+money(next.price)+' c/u · faltan '+(Number(next.minQty)-groupQty)+'</span>':'')+(p?'<span>Stock disponible: '+stockBadge(availableStock(p))+'</span>':'')+'</div></div><div class="chosen-actions"><button class="qty-btn" type="button" data-minus="'+safeText(i.productId)+'">−</button><b>'+i.qty+'</b><button class="qty-btn" type="button" data-plus="'+safeText(i.productId)+'">＋</button><button class="delete-line" type="button" data-del="'+safeText(i.productId)+'">✕</button></div></div>'}).join(''):'<p class="muted">Todavía no hay productos. Búscalos arriba por nombre.</p>';
 $('cartTotal').textContent=money(cartTotal());
 const canSave=sessionOpen()&&cart.length>0;$('saveOnly').disabled=!canSave;$('saveAndWhatsApp').disabled=!canSave;$('saveSummary').textContent=!sessionOpen()?'Inicia la jornada para poder guardar.':!cart.length?'Agrega productos para guardar.':'Queda anotado para que quien entrega sepa cómo cobrar.';
}
function renderInventory(){
 if(!$('inventorySearch'))return;const iq=norm($('inventorySearch').value);
 $('sellerInventory').innerHTML=sellable().filter(p=>!iq||norm(p.name).includes(iq)).map(p=>'<div class="product"><span>'+safeText(p.name)+'</span><b style="color:'+(Number(p.stock||0)>0?'#166534':'#b91c1c')+'">'+Number(p.stock||0)+' und · '+money(p.price)+'</b></div>').join('')||'<p class="muted">Inventario aún no disponible. Conéctate a internet para cargarlo la primera vez.</p>';
}
function renderSales(){
 const pending=queueRead(),today=todaySales().sort((a,b)=>String(b.occurredAt||'').localeCompare(String(a.occurredAt||'')));
 const rows=[...pending.map(s=>({...s,_pending:true})),...today.filter(s=>!pending.some(p=>String(p.id)===String(s.id)))];
 $('sellerSalesToday').innerHTML=rows.map(s=>'<div class="sales-row"><strong>#'+safeText(s.folio||'—')+' · '+safeText(s.cliente)+'</strong><small>'+money(s.total)+' · '+(s.paymentMethod==='transfer'?'Transferencia':'Efectivo')+' · '+(s._pending?'⏳ Pendiente de enviar':'✓ Guardada en Firebase')+'</small><div class="actions"><button class="wa wide" type="button" data-wa="'+safeText(s.id)+'">📲 Enviar por WhatsApp</button></div></div>').join('')||'<p class="muted">Todavía no hay ventas hoy.</p>';
}
// ===== Clientes (como en la app del dueño, sin funciones de administración) =====
const DAY3={Lunes:'Lun',Martes:'Mar','Miércoles':'Mié',Jueves:'Jue',Viernes:'Vie','Sábado':'Sáb'};
function routeList(w,day){return clients.filter(x=>x.active!==false&&routeFor(x,w)?.day===day).sort((a,b)=>(Number(routeFor(a,w)?.position)||999999)-(Number(routeFor(b,w)?.position)||999999))}
// Igual que la app del dueño: Semana A en azul y Semana B en naranja.
function clientRouteChips(c){const chips=['A','B'].map(w=>{const r=routeFor(c,w);if(!r)return '';const list=routeList(w,r.day);return '<span class="route-chip week-'+w+'">Sem '+w+' · '+(DAY3[r.day]||r.day)+' · <b>N° '+(list.findIndex(x=>String(x.id)===String(c.id))+1)+'</b><small> de '+list.length+'</small></span>'}).join('');return '<span class="route-chips">'+(chips||'<span class="route-chip no-route">Sin día en mi ruta</span>')+'</span>'}
function renderRouteCounts(){
 const box=$('routeCounts');if(!box)return;const days=DAYS.filter(d=>d!=='Sábado'||clients.some(c=>['A','B'].some(w=>routeFor(c,w)?.day==='Sábado')));
 const fw=$('filterWeek').value,fd=$('filterDay').value;
 let html='<div class="route-counts-head"><strong>📍 Clientes por día de ruta</strong><span>Toca un día para ver su orden</span></div><div class="route-counts-table" style="grid-template-columns:auto repeat('+days.length+',minmax(0,1fr))"><span></span>'+days.map(d=>'<span class="rc-day">'+(DAY3[d]||d)+'</span>').join('');
 ['A','B'].forEach(w=>{const tot=clients.filter(c=>c.active!==false&&routeFor(c,w)).length;html+='<span class="rc-week week-'+w+'">Sem '+w+'<small>'+tot+'</small></span>'+days.map(d=>{const n=routeList(w,d).length;return '<button type="button" class="rc-cell week-'+w+(n?'':' empty')+(fw===w&&fd===d?' active':'')+'" data-week="'+w+'" data-day="'+d+'">'+n+'</button>'}).join('')});
 box.innerHTML=html+'</div>';
}
function renderClientsTab(){
 const qn=norm($('clientSearchName').value),qa=norm($('clientSearchAddress').value),fw=$('filterWeek').value,fd=$('filterDay').value;
 renderRouteCounts();
 let list=clients.filter(c=>(!qn||norm(c.name).includes(qn))&&(!qa||norm(c.address).includes(qa))&&(!fw||routeFor(c,fw))&&(!fd||['A','B'].some(w=>(!fw||w===fw)&&routeFor(c,w)?.day===fd)));
 if(fw&&fd)list=routeList(fw,fd).filter(c=>list.includes(c));else list.sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));
 $('clientsCount').textContent=String(clients.length);
 $('clientsList').innerHTML=list.length?list.map((c,i)=>'<article class="client-row no-number"><div class="client-details"><strong>'+(fw&&fd?(i+1)+'. ':'')+safeText(c.name)+(c.active===false?' · inactivo':'')+'</strong>'+clientRouteChips(c)+'<span>'+safeText(c.address||'')+'</span><span>Tel: '+safeText(c.phone||'Sin teléfono')+' · RUT: '+safeText(c.rut||'Sin RUT')+'</span>'+((!c.rut||!c.phone||!c.razonSocial||!c.comuna)?'<span class="client-status warn">⚠ Faltan datos: edítalo</span>':'')+'</div><div class="actions-small"><button class="secondary edit-client" type="button" data-edit="'+safeText(c.id)+'">Editar</button><button class="primary client-sale" type="button" data-reopen="'+safeText(c.id)+'">Vender</button></div></article>').join(''):'<p class="muted">'+(clients.length?'Sin resultados.':'Aún no tienes clientes. Crea el primero con "＋ Nuevo cliente".')+'</p>';
}
const TITLES={route:'Inicio',sale:'Vender',clients:'Clientes'};
function tab(name){currentTab=name;['route','sale','clients'].forEach(t=>$(t+'Tab').classList.toggle('hide',t!==name));$('catalogTab')?.classList.add('hide');$('vcTabBtn')?.classList.remove('active');document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name||(name==='sale'&&b.dataset.tab==='route')));$('pageTitle').textContent=TITLES[name]||'Zipper Vendedor'}
function render(){if(!profile)return;$('sellerWelcome').textContent=(profile.displayName||profile.email||'Vendedor')+' · '+(navigator.onLine?'en línea':'sin internet');renderSession();renderClients();renderAttended();renderSale();renderInventory();renderSales();renderClientsTab()}

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
 if(closedToday()){status('La jornada de hoy ya se cerró. Mañana puedes comenzar una nueva ruta.','error');return}
 if(afterHours()){status('Después de las '+CLOSE_HOUR+':00 no se puede abrir la jornada. Vuelve mañana.','error');return}
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
async function closeSession(auto){
 if(!session)return;
 const pending=routeClients().filter(c=>!attendedState(c.id));
 if(auto!==true&&!window.confirm((pending.length?'Quedan '+pending.length+' clientes sin atender en esta ruta.\n\n':'')+'Al cerrar la jornada no podrás volver a abrirla hasta mañana. ¿Cerrar igual?'))return;
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
let editingClientId=null;
function fillDays(sel,value){sel.innerHTML='<option value="">— No visito —</option>'+DAYS.map(d=>'<option>'+d+'</option>').join('');sel.value=value||''}
function openClientEditor(id,preset){
 const c=id?clients.find(x=>String(x.id)===String(id)):null;editingClientId=c?c.id:null;
 tab('clients');$('clientEditor').classList.remove('hide');$('newClientButton').classList.add('hide');
 $('clientFormTitle').textContent=c?'Editar cliente':'Nuevo cliente';
 $('cfName').value=c?.name||'';$('cfAddress').value=c?.address||'';$('cfPhone').value=(()=>{const d=String(c?.phone||'').replace(/\D/g,'');return d.length>=8?d.slice(-8).replace(/(\d{4})(\d{4})/,'$1 $2'):''})();$('cfRut').value=c?.rut||'';$('cfBusiness').value=c?.razonSocial||'';$('cfComuna').value=c?.comuna||'';$('cfNotes').value=c?.observations||'';document.querySelectorAll('#clientEditor .field-error').forEach(x=>x.classList.remove('field-error'));
 const a=c?routeFor(c,'A'):(preset?.week==='A'?{day:preset.day}:null),b=c?routeFor(c,'B'):(preset?.week==='B'?{day:preset.day}:null);
 fillDays($('cfDayA'),a?.day);fillDays($('cfDayB'),b?.day);$('cfPosA').value=a?.position&&a.position<999999?a.position:'';$('cfPosB').value=b?.position&&b.position<999999?b.position:'';
 $('cfMsg').textContent='';$('clientEditor').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('cfName').focus(),300);
}
function closeClientEditor(){editingClientId=null;$('clientEditor').classList.add('hide');$('newClientButton').classList.remove('hide');window.scrollTo({top:0})}
// Coloca al cliente en la posición pedida y corre a los demás de ese día.
function placeInRoute(week,client,day,pos){
 const others=clients.filter(x=>String(x.id)!==String(client.id)&&routeFor(x,week)?.day===day).sort((a,b)=>(Number(routeFor(a,week)?.position)||999999)-(Number(routeFor(b,week)?.position)||999999));
 const at=pos&&pos>=1?Math.min(pos,others.length+1):others.length+1;others.splice(at-1,0,client);
 return others.map((x,k)=>({client:x,week,route:{day,position:k+1}})).filter(x=>x.client===client||Number(routeFor(x.client,week)?.position)!==x.route.position);
}
// RUT chileno: cuerpo + dígito verificador (módulo 11).
function rutCheck(v){const r=String(v||'').toUpperCase().replace(/[^0-9K]/g,'');if(r.length<8||r.length>9)return null;const body=r.slice(0,-1),dv=r.slice(-1);if(!/^\d+$/.test(body))return null;let sum=0,m=2;for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*m;m=m===7?2:m+1}const res=11-(sum%11),ok=res===11?'0':res===10?'K':String(res);return ok===dv?body.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+dv:null}
function fieldError(id,text){const msg=$('cfMsg');document.querySelectorAll('#clientEditor .field-error').forEach(x=>x.classList.remove('field-error'));msg.textContent='⚠ '+text;const el=$(id);if(el){el.classList.add('field-error');el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus(),250)}status(text,'error')}
async function saveClientForm(){
 const name=$('cfName').value.trim(),address=$('cfAddress').value.trim(),digits=$('cfPhone').value.replace(/\D/g,''),msg=$('cfMsg');
 if(name.length<2)return fieldError('cfName','Falta el nombre del local o cliente.');
 if(address.length<3)return fieldError('cfAddress','Falta la dirección.');
 if(digits.length!==8)return fieldError('cfPhone','El teléfono debe tener exactamente 8 dígitos después de +56 9 (tiene '+digits.length+').');
 const phone='569'+digits;
 const rut=rutCheck($('cfRut').value);
 if(!$('cfRut').value.trim())return fieldError('cfRut','Falta el RUT.');
 if(!rut)return fieldError('cfRut','El RUT no es válido: revisa los números y el dígito verificador (ej: 12.345.678-5).');
 if($('cfComuna').value.trim().length<3)return fieldError('cfComuna','Falta la comuna.');
 if($('cfBusiness').value.trim().length<3)return fieldError('cfBusiness','Falta la razón social (para la factura).');
 msg.textContent='';document.querySelectorAll('#clientEditor .field-error').forEach(x=>x.classList.remove('field-error'));
 const dayA=$('cfDayA').value,dayB=$('cfDayB').value;
 if(!dayA&&!dayB)return fieldError('cfDayA','Elige al menos un día de visita (Semana A o B) para que quede en tu ruta.');
 const existing=editingClientId?clients.find(x=>String(x.id)===String(editingClientId)):null;
 if(clients.some(c=>c!==existing&&norm(c.name)===norm(name)&&norm(c.address)===norm(address))){msg.textContent='Ya tienes un cliente con ese nombre y dirección.';return}
 const data={name,address,phone,rut,razonSocial:$('cfBusiness').value.trim(),comuna:$('cfComuna').value.trim(),observations:$('cfNotes').value.trim(),sendInvoice:true};
 $('cfSave').disabled=true;
 try{
  let client=existing;
  if(!client){
   const id=newClientId(),now=new Date().toISOString();
   client={id,...data,active:true,assignedSellerUids:[profile.uid],sellerRoutes:{[profile.uid]:{}},createdBySeller:profile.uid,createdBySellerName:profile.displayName||profile.email||'',createdAt:now,updatedAt:now};
   clients=[...clients,client];
  }else Object.assign(client,data);
  // ruta propia (A y B)
  const mine={};const changes=[];
  [['A',dayA,Number($('cfPosA').value)],['B',dayB,Number($('cfPosB').value)]].forEach(([w,day,pos])=>{if(day){const ch=placeInRoute(w,client,day,pos);ch.forEach(x=>{if(x.client===client)mine[w]=x.route;else changes.push(x)})}});
  client.sellerRoutes={...(client.sellerRoutes||{}),[profile.uid]:mine};
  const ref=doc(db,'orgs',ORG,'clients',String(client.id));
  const write=existing?updateDoc(ref,{...data,[`sellerRoutes.${profile.uid}`]:mine}):setDoc(ref,client);
  cacheWrite('clients',clients);closeClientEditor();
  if(dayA||dayB){const w=dayA?'A':'B';$('sellerWeek').value=w;renderRouteDays();$('sellerDay').value=dayA||dayB}
  render();status('✅ '+name+(existing?' actualizado.':' agregado a tu ruta.'),'ok');
  if(changes.length)saveRoutes(changes);
  if(navigator.onLine)await write;
 }catch(error){status('No se pudo guardar el cliente: '+(isPermission(error)?'Firebase rechazó el permiso.':(error.message||'')),'error')}
 finally{$('cfSave').disabled=false}
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
let draftId='',draftQty='';
function openOrder(id){
 if(afterHours()){status('Después de las '+CLOSE_HOUR+':00 no se toman pedidos. Vuelve mañana.','error');return}
 if(!sessionOpen()){status('Inicia la jornada primero (en Inicio).','error');tab('route');return}
 const next=clients.find(c=>String(c.id)===String(id))||null;if(!next)return;
 if(selectedClient&&String(selectedClient.id)!==String(next.id)&&cart.length&&!window.confirm('Tienes productos en el carrito de '+selectedClient.name+'. ¿Descartarlos y atender a '+next.name+'?'))return;
 if(!selectedClient||String(selectedClient.id)!==String(next.id))cart=[];
 selectedClient=next;draftId='';draftQty='';$('cartSearchName').value='';$('cartCategory').value='';tab('sale');render();window.scrollTo({top:0});
}
function addToCart(p,qty,silent){
 if(!p||qty<1)return false;
 if(qty>availableStock(p)){status('Stock insuficiente de '+p.name+'. Disponibles: '+availableStock(p)+'.','error');return false}
 const e=cart.find(x=>String(x.productId)===String(p.id));
 if(e)e.qty+=qty;else cart.push({productId:String(p.id),baseProductId:String(p.baseProductId||p.id),name:String(p.name),qty,price:Number(p.price||0)});
 if(!silent){renderSale();status('➕ '+qty+' × '+p.name+' en la bandeja.','ok')}
 return true;
}
function changeQty(id,delta){
 const i=cart.find(x=>String(x.productId)===String(id));if(!i)return;const p=productOf(id);
 if(delta>0&&p&&availableStock(p)<=0){status('Stock insuficiente.','error');return}
 i.qty+=delta;if(i.qty<=0){if(!window.confirm('¿Eliminar '+i.name+' del carrito?')){i.qty=1}else cart=cart.filter(x=>x!==i)}
 renderSale();
}
function saleClick(e){
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.pick){draftId=d.pick;draftQty='';renderSale();setTimeout(()=>{$('draftQty')?.focus()},0);return}
 if(b.id==='assignDraft'){const p=productOf(draftId),q=Math.floor(Number($('draftQty').value)||0);if(addToCart(p,q)){draftId='';draftQty='';$('cartSearchName').value='';renderSale();$('cartSearchName').focus()}return}
 if(b.id==='cancelDraft'){draftId='';draftQty='';renderSale();return}
 if(d.plus)changeQty(d.plus,1);else if(d.minus)changeQty(d.minus,-1);else if(d.del){const i=cart.find(x=>String(x.productId)===String(d.del));if(i&&window.confirm('¿Eliminar '+i.name+' del carrito?')){cart=cart.filter(x=>x!==i);renderSale()}}
}
function closeCart(){if(cart.length&&!window.confirm('¿Descartar el pedido de '+selectedClient.name+'?'))return;selectedClient=null;cart=[];draftId='';tab('route');render()}
async function visitedNoSale(){if(!selectedClient)return;if(cart.length&&!window.confirm('¿Marcar como visitado sin venta y descartar el carrito?'))return;const id=selectedClient.id;selectedClient=null;cart=[];await markVisited(id);tab('route');render()}
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
function openSaveOptions_old(){
 if(!sessionOpen()){status('Inicia la jornada antes de registrar una venta.','error');return}
 if(!selectedClient||!cart.length){status('Agrega productos a la bandeja.','error');return}
 $('saveSummary').textContent=selectedClient.name+' · '+cart.reduce((a,i)=>a+i.qty,0)+' unidades · Total '+money(cartTotal());
 $('sellerPayment').value='';document.querySelectorAll('.pay-opt').forEach(b=>b.classList.remove('on'));$('saveOnly').disabled=true;$('saveAndWhatsApp').disabled=true;
 $('saveOptions').classList.remove('hide');
}
function closeSaveOptions(){}
function waPhone(c){let d=String(c?.phone||'').replace(/\D/g,'');if(d.length===8)d='569'+d;if(d.length===9&&d.startsWith('9'))d='56'+d;return /^569\d{8}$/.test(d)?d:''}
function saleText(s){return ['*Distribuidora Zipper*','Comprobante #'+s.folio+' · '+s.fecha,'Cliente: '+s.cliente,'',...(s.items||[]).map(i=>'• '+i.qty+' x '+i.desc+(i.promotion?' (oferta)':'')+' — '+money(Math.round(i.qty*i.price))),'','*TOTAL: '+money(s.total)+'*','Pago: '+(s.paymentMethod==='transfer'?'Transferencia':'Efectivo')+' (al entregar)','','¡Gracias por su compra!'].join('\n')}
function sendWhatsApp(s){const c=clients.find(x=>String(x.id)===String(s.clienteId));const url='https://wa.me/'+waPhone(c)+'?text='+encodeURIComponent(saleText(s));const w=window.open(url,'_blank');if(!w)location.href=url}
async function saveSale(withWhatsApp){
 if(afterHours()){status('Son más de las '+CLOSE_HOUR+':00: ya no se reciben pedidos hasta mañana.','error');return}
 if(!sessionOpen()||!selectedClient||!cart.length){closeSaveOptions();return}
 const paymentMethod=$('sellerPayment').value;if(!['cash','transfer'].includes(paymentMethod)){status('Elige si el cliente paga en efectivo o transferencia.','error');document.querySelector('.pay-box')?.scrollIntoView({behavior:'smooth',block:'center'});return}
 const client=selectedClient;
 const week=routeFor(client,session.routeWeek)?session.routeWeek:(routeFor(client,'A')?'A':'B'),day=routeFor(client,week)?.day;
 if(!day){closeSaveOptions();status(client.name+' no tiene día en tu ruta. Edítalo en Clientes y elige un día antes de venderle.','error');return}
 const items=cart.map(i=>{const p=productOf(i.productId),ep=p?effectivePrice(p,i.qty):{price:i.price};return {productId:i.productId,baseProductId:i.baseProductId,desc:i.name,qty:i.qty,price:ep.price,...(ep.applied?{promotion:true}:{})}});
 const total=items.reduce((a,i)=>a+i.qty*i.price,0);
 const sale={id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2),folio:Math.max(0,...sales.map(s=>Number(s.folio)||0),...queueRead().map(s=>Number(s.folio)||0))+1,fecha:localDate(),date:localDate(),occurredAt:new Date().toISOString(),clienteId:String(client.id),cliente:client.name,clientZone:String(client.comuna||client.zone||'').trim(),ruta:client.route||'',routeWeek:week,routeDay:day,items,total,paymentMethod,paymentStatus:'paid',collectionStatus:'awaiting_delivery',sellerUid:profile.uid};
 closeSaveOptions();
 // WhatsApp se abre en el mismo toque (si no, el teléfono lo bloquea).
 if(withWhatsApp)sendWhatsApp(sale);
 status(navigator.onLine?'Guardando venta…':'Sin internet · guardando la venta en este teléfono.','warn');
 const finish=msg=>{cart=[];selectedClient=null;draftId='';$('sellerPayment').value='';document.querySelectorAll('.pay-opt').forEach(x=>x.classList.remove('on'));tab('route');render();status(msg,'ok');window.scrollTo({top:0,behavior:'smooth'})};
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
  }else status('No se guardó la venta: '+(isPermission(error)?'Firebase rechazó el permiso. Avisa al dueño.':(error.message||'revisa la conexión o el stock.')),'error');
 }
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
 $('otherRoute').onclick=()=>{changingRoute=!changingRoute;render();if(changingRoute)$('routeSetup').scrollIntoView({behavior:'smooth',block:'start'})};
 $('visitedButton').onclick=()=>{visitedMode=!visitedMode;renderClients()};
 $('sellerWeek').onchange=()=>{renderRouteDays();render()};$('sellerDay').onchange=render;
 $('sellerClients').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;if(d.review)return showClientSales(d.review,true);if(d.history)return showClientSales(d.history,false);if(d.resend){const x=clientSalesToday(d.resend).sort((a,b)=>String(b.occurredAt||'').localeCompare(String(a.occurredAt||'')))[0];if(x)sendWhatsApp(x);return}if(d.reopen)return openOrder(d.reopen);if(d.visit)markVisited(d.visit);else if(d.sale)openOrder(d.sale);else if(d.up)moveClient(d.up,-1);else if(d.down)moveClient(d.down,1);else if(d.move)changeClientDay(d.move)};
 $('visitedSales').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.closesales){$('visitedSales').classList.add('hide');return}if(b.dataset.wa){const x=[...queueRead(),...sales].find(y=>String(y.id)===String(b.dataset.wa));if(x)sendWhatsApp(x)}};
 $('routeName').oninput=renderClients;$('routeAddress').oninput=renderClients;
 $('visitedBackBtn').onclick=()=>{visitedMode=false;renderClients();$('activeRouteBox').scrollIntoView({behavior:'smooth',block:'start'})};
 $('returnDailyRoute').onclick=()=>{changingRoute=false;if(session){$('sellerWeek').value=session.routeWeek;renderRouteDays();$('sellerDay').value=session.routeDay}render()};
 $('sellerNewClientOpen').onclick=()=>openClientEditor(null,selectedRoute());$('newClientButton').onclick=()=>openClientEditor(null,selectedRoute());
 $('cfPhone').oninput=e=>{const d=e.target.value.replace(/\D/g,'').replace(/^569(?=\d{8})/,'').slice(0,8);e.target.value=d.length>4?d.slice(0,4)+' '+d.slice(4):d};
 $('cfRut').onblur=e=>{const r=rutCheck(e.target.value);if(r)e.target.value=r};
 $('cfSave').onclick=saveClientForm;$('cfCancel').onclick=closeClientEditor;
 $('clientSearchName').oninput=renderClientsTab;$('clientSearchAddress').oninput=renderClientsTab;$('filterWeek').onchange=renderClientsTab;$('filterDay').onchange=renderClientsTab;
 $('routeCounts').onclick=e=>{const b=e.target.closest('.rc-cell');if(!b)return;const same=$('filterWeek').value===b.dataset.week&&$('filterDay').value===b.dataset.day;$('filterWeek').value=same?'':b.dataset.week;$('filterDay').value=same?'':b.dataset.day;renderClientsTab();if(!same)$('clientsList').scrollIntoView({behavior:'smooth',block:'start'})};
 $('clientsList').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit)openClientEditor(b.dataset.edit);else if(b.dataset.reopen)openOrder(b.dataset.reopen)};
 $('saleCard').addEventListener('click',saleClick);
 $('saleCard').addEventListener('input',e=>{if(e.target.id==='draftQty'){draftQty=String(e.target.value||'').replace(/\D/g,'');e.target.value=draftQty;$('assignDraft').disabled=!(Number(draftQty)>=1)}});
 $('saleCard').addEventListener('keydown',e=>{if(e.target.id==='draftQty'&&e.key==='Enter')$('assignDraft')?.click()});
 $('cartSearchName').oninput=()=>{if(draftId&&!draftQty)draftId='';renderSale()};$('cartCategory').onchange=renderSale;
  $('closeCart').onclick=closeCart;$('cartVisitedNoSale').onclick=visitedNoSale;
 document.querySelectorAll('.pay-opt').forEach(b=>b.onclick=()=>{$('sellerPayment').value=b.dataset.pay;document.querySelectorAll('.pay-opt').forEach(x=>x.classList.toggle('on',x===b))});$('saveOnly').onclick=()=>saveSale(false);$('saveAndWhatsApp').onclick=()=>saveSale(true);
 $('sellerSalesToday').onclick=e=>{const b=e.target.closest('[data-wa]');if(!b)return;const s=[...queueRead(),...sales].find(x=>String(x.id)===String(b.dataset.wa));if(s)sendWhatsApp(s)};
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab(b.dataset.tab);window.scrollTo({top:0})});
 window.addEventListener('online',async()=>{status('Conexión recuperada · sincronizando…','warn');await flushPendingSales();if(navigator.onLine)await refreshFromServer();render()});
 window.addEventListener('offline',()=>{status('Sin internet · los cambios quedarán pendientes.','warn');render()});
}
// Reloj de la jornada: revisa cada 30 segundos.
let clockDay=localDate(),warnedDay='';
async function clockTick(){
 if(!profile)return;
 const today=localDate(),d=new Date(),mins=d.getHours()*60+d.getMinutes();
 if(today!==clockDay){
  clockDay=today;selectedClient=null;cart=[];changingRoute=false;
  session=null;try{localStorage.removeItem(prefix()+'session')}catch(_){}
  const remote=await readSession();if(remote)session=remote;
  tab('route');render();status('🌅 Nuevo día: tu ruta se reinició. Toca "Comenzar ruta" para empezar la jornada.','ok');
  return;
 }
 if(mins>=CLOSE_HOUR*60-10&&mins<CLOSE_HOUR*60&&warnedDay!==today&&sessionOpen()){
  warnedDay=today;status('⏰ A las '+CLOSE_HOUR+':00 se cierra la app y no recibe más pedidos hasta mañana. Termina y guarda tus ventas.','warn');
  try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(_){}
  setTimeout(()=>{try{window.alert('⏰ Faltan 10 minutos: a las '+CLOSE_HOUR+':00 se cierra la app y no recibe más pedidos hasta mañana.')}catch(_){}},50);
 }
 if(afterHours()&&session&&session.id===sessionId()&&session.status==='open'&&!session.closedAt){
  await closeSession(true);selectedClient=null;cart=[];tab('route');render();status('🔒 Son las '+CLOSE_HOUR+':00: la jornada se cerró sola. Mañana puedes comenzar una nueva ruta.','warn');
 }
}
setInterval(()=>{clockTick().catch(e=>console.warn(e))},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)clockTick().catch(()=>{})});
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

// ===== Pedidos de mis clientes desde el catálogo web =====
// Los usa la pestaña "📒 Catálogo" (vendedor-catalogo.js) para listar y cargar pedidos en la venta.
const nrmS=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
window.zipperSellerOrders={
 uid:()=>profile?.uid||auth.currentUser?.uid||'',
 clients:()=>clients.filter(c=>c.active!==false),
 async list(){const uid=profile?.uid||auth.currentUser?.uid;if(!uid)return [];const snap=await getDocs(query(collection(db,'pedidosCatalogo'),where('seller','==',uid)));return snap.docs.map(d=>{const x=d.data();let data={};try{data=JSON.parse(x.data||'{}')}catch(_){}return {...data,id:d.id,status:x.status||'nuevo',createdAt:x.createdAt||'',loadedAt:x.loadedAt||''}}).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))},
 async remove(id){await deleteDoc(doc(db,'pedidosCatalogo',String(id)))},
 async load(order,clientId){
  if(!sessionOpen()){status('Inicia la jornada primero (pestaña Mi ruta) para cargar el pedido.','error');tab('route');return false}
  openOrder(clientId);if(!selectedClient||String(selectedClient.id)!==String(clientId))return false;
  cart=[];const missing=[],noStock=[];
  (order.lines||[]).forEach(l=>{
   let p=products.find(x=>String(x.id)===String(l.pid));
   if(l.flavor){const base=p?String(p.baseProductId||p.id):String(l.pid);const f=products.find(x=>String(x.baseProductId||x.id)===base&&nrmS(x.flavor)===nrmS(l.flavor));if(f)p=f}
   if(!p){missing.push(l.name+(l.flavor?' · '+l.flavor:''));return}
   const qty=Number(l.q||0)*(l.box?Number(l.units||1):1);
   if(!addToCart(p,qty,true))noStock.push(p.name);
  });
  renderSale();
  status('🛒 Pedido web #'+(order.code||'')+' cargado. Revisa y guarda la venta.'+(missing.length?' ⚠ No está en el catálogo de la app: '+missing.join(', ')+'.':'')+(noStock.length?' ⚠ Sin stock suficiente: '+noStock.join(', ')+'.':''),missing.length||noStock.length?'error':'ok');
  try{await updateDoc(doc(db,'pedidosCatalogo',String(order.id)),{status:'cargado',loadedAt:new Date().toISOString()})}catch(e){console.warn(e)}
  return true;
 }
};
