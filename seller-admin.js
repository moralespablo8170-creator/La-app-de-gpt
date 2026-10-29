import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

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
let owner=null,sellers=[],sessions=[],sales=[],visits=[],cash=[],selectedSellerId=null,loading=false;
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
function render(){
 const date=$('adminDate').value,filteredSales=chosenSales(),filteredVisits=chosenVisits(),filteredCash=chosenCash();
 $('statSales').textContent=String(filteredSales.length);
 $('statTotal').textContent=money(filteredSales.reduce((n,s)=>n+Number(s.total||0),0));
 $('statCash').textContent=money(filteredCash.filter(x=>x.sourceType!=='expense'&&x.type!=='expense').reduce((n,x)=>n+Number(x.amount??x.monto??x.total??0),0));
 $('statVisits').textContent=String(filteredVisits.length);
 $('adminCount').textContent=sellers.length+' vendedor'+(sellers.length===1?'':'es')+' · '+date;
 $('adminSellers').innerHTML=sellers.length?sellers.map(s=>{
  const selected=s.uid===selectedSellerId,active=s.active===true;
  const daySales=sales.filter(x=>x.sellerUid===s.uid&&rowDate(x,'sales')===date),session=sessionFor(s.uid);
  return '<button class="admin-row" style="text-align:left;background:'+(selected?'#e8f1ff':'white')+';width:100%;font:inherit" data-seller="'+safe(s.uid)+'"><strong>'+safe(s.displayName||s.email||s.uid)+(active?'':' · desactivado')+'</strong><small>'+daySales.length+' ventas · '+money(daySales.reduce((n,x)=>n+Number(x.total||0),0))+' · '+(session?.status==='open'?'Jornada abierta':session?.status==='closed'?'Jornada cerrada':'Sin jornada registrada')+'</small></button>'
 }).join(''):'<p class="admin-muted">Aún no hay perfiles de vendedor registrados.</p>';
 document.querySelectorAll('[data-seller]').forEach(b=>b.onclick=()=>{selectedSellerId=b.dataset.seller;render()});
 const seller=sellers.find(s=>s.uid===selectedSellerId),session=seller?sessionFor(seller.uid):null;
 $('adminDetailTitle').textContent=seller?'Detalle de '+(seller.displayName||seller.email||'vendedor'):'Detalle diario · todos los vendedores';
 $('detailOpened').textContent=time(session?.openedAt);
 $('detailFirstSale').textContent=time(session?.firstSaleAt);
 $('detailClosed').textContent=time(session?.closedAt);
 const detailSales=seller?filteredSales:filteredSales;
 $('detailSales').textContent=String(detailSales.length);
 $('adminCash').innerHTML=filteredCash.map(x=>'<article class="admin-row"><strong>'+safe(x.sourceType==='expense'||x.type==='expense'?'Gasto':'Abono / movimiento')+' · '+money(x.amount??x.monto??x.total)+'</strong><small>'+safe(x.clientName||x.cliente||x.description||x.descripcion||'')+' · '+safe(time(x.createdAt||x.fecha))+' · '+safe(x.paymentMethod||x.formaPago||'')+'</small></article>').join('')||'<p class="admin-muted">Sin movimientos de caja en esta fecha.</p>';
 $('adminSales').innerHTML=filteredSales.map(s=>'<article class="admin-row"><strong>'+safe(s.cliente||s.clientName||'Cliente')+' · '+money(s.total)+'</strong><small>'+safe(s.folio||s.id)+' · '+safe(time(s.createdAt||s.fecha))+' · '+safe(s.paymentMethod||s.formaPago||'')+' · '+safe(s.sellerName||s.sellerUid||'')+'</small></article>').join('')||'<p class="admin-muted">Sin ventas en esta fecha.</p>';
 $('adminVisits').innerHTML=filteredVisits.map(v=>'<article class="admin-row"><strong>'+safe(v.clientName||v.cliente||v.clientId||'Cliente')+' · '+safe(v.status||'visitado')+'</strong><small>'+safe(v.routeWeek||'')+' '+safe(v.routeDay||'')+' · '+safe(v.sellerUid||'')+'</small></article>').join('')||'<p class="admin-muted">Sin visitas en esta fecha.</p>';
}
async function refresh(){
 if(!owner||loading)return;loading=true;status('Actualizando información de vendedores…');
 try{
  const [ms,ss,vs,cs,ks]=await Promise.all([
   getDocs(collection(db,'orgs',ORG,'members')),
   getDocs(collection(db,'orgs',ORG,'sessions')),
   getDocs(collection(db,'orgs',ORG,'sales')),
   getDocs(collection(db,'orgs',ORG,'visits')),
   getDocs(collection(db,'orgs',ORG,'cashMovements'))
  ]);
  sellers=ms.docs.map(d=>({uid:d.id,...d.data()})).filter(x=>x.role==='seller');
  sessions=ss.docs.map(d=>({id:d.id,...d.data()}));sales=vs.docs.map(d=>({id:d.id,...d.data()}));visits=cs.docs.map(d=>({id:d.id,...d.data()}));cash=ks.docs.map(d=>({id:d.id,...d.data()}));
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
 owner={uid:user.uid,email:user.email||'',...data};$('adminLogin').classList.add('admin-hidden');$('adminApp').classList.remove('admin-hidden');$('adminDate').value=localDate();await refresh();
}
async function login(){
 const b=$('adminLoginButton');b.disabled=true;status('Verificando cuenta propietaria…');
 try{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,$('adminEmail').value.trim(),$('adminPassword').value);$('adminPassword').value=''}
 catch(error){status(error.message||'No se pudo iniciar sesión.','error')}
 finally{b.disabled=false}
}
async function logout(){await signOut(auth);owner=null;sellers=[];sessions=[];sales=[];visits=[];cash=[]}
$('adminLoginButton').onclick=login;$('adminLogout').onclick=logout;$('adminDate').onchange=render;
onAuthStateChanged(auth,user=>verify(user).catch(error=>{console.error(error);status('No se pudo verificar la cuenta.','error')}));
