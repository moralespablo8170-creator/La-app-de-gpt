// Firebase connection and owner-only first migration for Distribuidora Zipper.
// The local phone database remains the default. Cloud mode is enabled only after an explicit backup and import.
import { initializeApp } from 'firebase/app';
import { firebaseConfig, ORG_ID } from './firebase-config.js';
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, getDocs, onSnapshot, writeBatch, setDoc, deleteDoc, runTransaction, query, where
} from 'firebase/firestore';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
let db;
let firestorePersistentCache = false;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  });
  firestorePersistentCache = true;
} catch (error) {
  console.warn('Firebase: la caché persistente no está disponible; se usará la cola local de la app.', error);
  db = getFirestore(firebaseApp);
}
const ORG_PATH = ['orgs', ORG_ID];
let activeProfile = null;
let sellerCatalogVersion = Number(localStorage.getItem('zipperSellerCatalogVersion')||0);
let productCostsCache = [];
let unsubs = [];
let refreshing = false;
let applyingCloud = false;
let syncScheduled = false;
let flushingPendingChanges = false;
let lastSyncError = '';
const OUTBOX_KEY = 'zipperFirebaseOutboxV1';

const localArray = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
};
productCostsCache = localArray('zipperProductCostsV1');
function parseArray(raw) {
  try {
    const value=JSON.parse(raw||'[]');
    return Array.isArray(value)?value:[];
  } catch (_) { return []; }
}
function readOutbox() {
  try {
    const value=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'{}');
    return value && typeof value==='object' && !Array.isArray(value)?value:{};
  } catch (_) { return {}; }
}
function saveOutbox(outbox) {
  try { localStorage.setItem(OUTBOX_KEY,JSON.stringify(outbox)); return; }
  catch(error) { console.warn('Firebase: cola pendiente demasiado grande; se guarda sin huellas de contenido.',error); }
  // Out of space: drop the optional fingerprints (rows are then resent in full)
  // but never lose the pending change itself.
  const slim={};
  Object.entries(outbox).forEach(([key,item])=>{const {previousHashes,...rest}=item||{};slim[key]=rest});
  try { localStorage.setItem(OUTBOX_KEY,JSON.stringify(slim)); }
  catch(error) { console.error('Firebase: no se pudo guardar la cola pendiente local.',error); }
}
function pendingCloudCollection(name) {
  const keys=Object.keys(readOutbox());
  if(name==='visits') return keys.some(key=>key.startsWith('zipperVisitados-'));
  const map={
    products:['zipperProductos'],
    clients:['zipperClientes'],
    sales:['zipperComprobantes'],
    cashMovements:['zipperPagos','zipperGastosCaja'],
    settings:['zipperCategorias','zipperCategoriasEliminadas']
  };
  return (map[name]||[]).some(key=>keys.includes(key));
}
function updateSyncIndicator() {
  const indicator=document.getElementById('cloudSyncIndicator');
  const status=document.getElementById('cloudStatus');
  const cloudMode=localStorage.getItem('zipperStorageMode')==='cloud';
  if(!cloudMode) {
    indicator?.classList.add('hidden');
    if(status) status.textContent='Modo local activo · los datos permanecen en este teléfono.';
    return;
  }
  const pending=Object.keys(readOutbox()).length;
  const online=navigator.onLine!==false;
  let message='',state='';
  if(lastSyncError) {
    message='Envío sin confirmar · guardado en el teléfono; reintento pendiente.';
    state='sync-error';
  } else if(!online) {
    message=pending
      ?'Sin conexión · cambios guardados en el teléfono; pendientes de enviar a Firebase.'
      :'Sin conexión · puedes consultar los datos disponibles en este teléfono.';
    state='sync-offline';
  } else if(pending) {
    message=flushingPendingChanges
      ?'Sincronizando cambios pendientes con Firebase…'
      :'Hay cambios guardados en el teléfono pendientes de sincronizar.';
    state='sync-pending';
  } else if(!activeProfile) {
    message='Conectando cuenta con Firebase…';
    state='sync-pending';
  } else {
    message='Firebase al día · cambios sincronizados.';
    state='sync-ok';
  }
  if(indicator) {
    indicator.textContent=message;
    indicator.classList.remove('sync-ok','sync-pending','sync-offline','sync-error');
    if(state==='sync-ok') {
      indicator.classList.add('hidden');
    } else {
      indicator.classList.remove('hidden');
      indicator.classList.add(state);
    }
  }
  if(status) status.textContent=message+(firestorePersistentCache?'':' · cola local de seguridad activa.');
}
function schedulePendingFlush(delay=0) {
  if(syncScheduled) return;
  syncScheduled=true;
  setTimeout(()=>{
    syncScheduled=false;
    flushPendingChanges();
  },delay);
}
// Compact fingerprint (cyrb53) of a row's content. The outbox stores one per row so
// a later flush can tell which rows really changed without keeping a full copy.
function rowFingerprint(row) {
  const text=stableCompareString(row);
  let h1=0xdeadbeef, h2=0x41c6ce57;
  for(let i=0;i<text.length;i++) {
    const ch=text.charCodeAt(i);
    h1=Math.imul(h1^ch,2654435761);
    h2=Math.imul(h2^ch,1597334677);
  }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);
}
function rowFingerprints(rows) {
  const result={};
  rows.forEach(row=>{if(row&&typeof row==='object'&&row.id!=null)result[String(row.id)]=rowFingerprint(row)});
  return result;
}
function enqueueLocalChange(key, previousRaw, currentRaw) {
  // While a backup is being restored the file already carries its own pending queue.
  if(localStorage.getItem('zipperStorageMode')!=='cloud'||applyingCloud||window.zipperRestoringBackup) return;
  const outbox=readOutbox();
  const existing=outbox[key];
  // The baseline is the state before the first unsent change; later edits keep it.
  let entry;
  if(existing) entry={...existing};
  else {
    const previous=parseArray(previousRaw);
    entry={previousIds:previous.map(row=>typeof row==='object'&&row?row.id:row)};
    if(key==='zipperProductos') entry.previousRows=previous;
    else if(!key.startsWith('zipperVisitados-')&&key!=='zipperCategorias'&&key!=='zipperCategoriasEliminadas') entry.previousHashes=rowFingerprints(previous);
  }
  entry.revision=String(Date.now())+'-'+Math.random().toString(36).slice(2);
  outbox[key]=entry;
  saveOutbox(outbox);
  lastSyncError='';
  updateSyncIndicator();
  if(navigator.onLine!==false) schedulePendingFlush();
}
const localCounts = () => ({
  clients:localArray('zipperClientes').length,
  products:localArray('zipperProductos').length,
  sales:localArray('zipperComprobantes').length,
  payments:localArray('zipperPagos').length,
  expenses:localArray('zipperGastosCaja').length
});
const localCount = () => Object.values(localCounts()).reduce((sum,count)=>sum+count,0);
const countsLabel = state => {
  const local=state.localCounts;
  return 'En el teléfono: '+state.localCount+' registros (clientes: '+local.clients+', productos: '+local.products+', ventas: '+local.sales+', abonos/pagos: '+local.payments+', gastos: '+local.expenses+'). En Firebase: '+state.cloudCount+' registros.';
};
const colRef = name => collection(db, ...ORG_PATH, name);
const privateProductFields=['pricePurchase','purchasePrice','cost','costPrice','buyPrice','precioCompra'];
// Los remedios no se venden por vendedores (no se pueden facturar): quedan fuera de su catálogo.
const isRemedyProduct=row=>String(row?.category||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes('remedio');
function publicSellerProduct(row) {
  const clean={...row};
  privateProductFields.forEach(key=>delete clean[key]);
  clean.sellerVisible=!isRemedyProduct(row);
  return clean;
}
function privateProductCost(row) {
  const id=safeId(row.id);
  return {id,pricePurchase:Math.max(0,Number(row.pricePurchase??row.purchasePrice??row.costPrice??row.cost??row.buyPrice??row.precioCompra)||0)};
}
function mergeProductCosts(rows,costRows=productCostsCache) {
  const costs=new Map(costRows.map(row=>[String(row.id),Number(row.pricePurchase)||0]));
  const current=new Map(localArray('zipperProductos').map(row=>[String(row.id),row]));
  return rows.map(row=>{
    const cached=current.get(String(row.id));
    const hasCost=costs.has(String(row.id));
    const pricePurchase=hasCost?costs.get(String(row.id)):Number(row.pricePurchase??row.purchasePrice??cached?.pricePurchase??cached?.purchasePrice)||0;
    return {...row,pricePurchase};
  });
}

const safeId = value => {
  const id = String(value ?? '');
  if (!id || id.includes('/')) throw new Error('Hay un registro sin identificador válido. No se subieron datos.');
  return id;
};
function announceProfile(profile) { window.dispatchEvent(new CustomEvent('zipper-cloud-profile',{detail:{profile,cloudEnabled:localStorage.getItem('zipperStorageMode')==='cloud'}})); }
async function memberFor(user) {
  if (!user) return null;
  const snap = await getDoc(doc(db, ...ORG_PATH, 'members', user.uid));
  if (!snap.exists()) return null;
  const profile = snap.data();
  if (profile.active !== true || !['owner','seller'].includes(profile.role)) return null;
  return { uid:user.uid, email:user.email||'', ...profile };
}
async function login(email,password) {
  await withReadTimeout(setPersistence(auth,browserLocalPersistence),10000,'la sesión');
  const credential = await withReadTimeout(
    signInWithEmailAndPassword(auth,String(email||'').trim(),String(password||'')),
    15000,
    'el inicio de sesión'
  );
  const profile = await withReadTimeout(memberFor(credential.user),15000,'el perfil del propietario');
  if (!profile) {
    await signOut(auth);
    throw new Error('La cuenta no tiene un perfil activo en Distribuidora Zipper. Revisa el usuario en Authentication y su perfil members.');
  }
  if (profile.role !== 'owner') {
    await signOut(auth);
    setTimeout(()=>{location.href='./vendedor.html'},1500);
    throw new Error('Esta es una cuenta de vendedor. Te llevamos a la app de ruta del vendedor…');
  }
  activeProfile = profile;
  announceProfile(profile);
  return profile;
}
async function requestPasswordReset(email) {
  const address=String(email||'').trim();
  if(!address) throw new Error('Ingresa el correo de la cuenta propietaria para solicitar el enlace.');
  await sendPasswordResetEmail(auth,address);
}
async function listMembers() {
  if (!activeProfile || activeProfile.role !== 'owner') throw new Error('Solo el dueño puede consultar los vendedores.');
  const snapshot = await getDocs(collection(db, ...ORG_PATH, 'members'));
  return snapshot.docs.map(item=>({uid:item.id,...item.data()})).filter(item=>item.active===true && item.role==='seller');
}
// Informe de vendedores para el dueño: perfiles, jornadas, visitas y ventas de vendedores.
async function sellerActivity() {
  if (!activeProfile || activeProfile.role !== 'owner') throw new Error('Solo el dueño puede ver el informe de vendedores.');
  const [m,s,v]=await Promise.all([getDocs(collection(db,...ORG_PATH,'members')),getDocs(collection(db,...ORG_PATH,'sessions')),getDocs(collection(db,...ORG_PATH,'visits'))]);
  const sellers=m.docs.map(d=>({uid:d.id,...d.data()})).filter(x=>x.role==='seller');
  const uids=sellers.map(x=>x.uid);
  const sales=[];
  for(let i=0;i<uids.length;i+=30){const snap=await getDocs(query(collection(db,...ORG_PATH,'sales'),where('sellerUid','in',uids.slice(i,i+30))));snap.docs.forEach(d=>sales.push({id:d.id,...d.data()}))}
  const plain=x=>JSON.parse(JSON.stringify(x,(k,val)=>val&&typeof val.toDate==='function'?val.toDate().toISOString():val));
  return plain({sellers,sessions:s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>uids.includes(x.sellerUid)),visits:v.docs.map(d=>({id:d.id,...d.data()})).filter(x=>uids.includes(x.sellerUid)),sales,loadedAt:new Date().toISOString()});
}
function stopSync() { unsubs.forEach(fn=>{try{fn()}catch(_){}}); unsubs=[]; }
function writeLocal(key,rows) {
  const previous=applyingCloud; applyingCloud=true;
  try { localStorage.setItem(key,JSON.stringify(rows)); }
  catch (error) { console.error('No se pudo actualizar el almacenamiento local desde Firebase.',error); }
  finally { applyingCloud=previous; }
}
function scheduleRefresh() {
  if (refreshing) return;
  refreshing = true;
  requestAnimationFrame(()=>{
    refreshing = false;
    if (typeof window.zipperRefreshAfterCloud === 'function') window.zipperRefreshAfterCloud();
  });
}
function docsToRows(snapshot) { return snapshot.docs.map(s=>({id:s.id,...s.data()})); }

function withReadTimeout(promise, milliseconds, collectionName) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer=setTimeout(() => reject(new Error('Firebase está tardando demasiado al consultar '+collectionName+'. No se modificó ningún dato; vuelve a intentarlo cuando tengas mejor conexión.')), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}
async function inspectCloud(onProgress) {
  const names=['products','clients','sales','cashMovements','visits','settings'];
  const counts={};
  const deadline=Date.now()+25000;
  for (const name of names) {
    const label=name==='cashMovements'?'abonos y gastos':name==='settings'?'configuración':name==='products'?'productos':name==='clients'?'clientes':name==='sales'?'ventas':'visitas';
    if(onProgress) onProgress('Cuenta verificada. Consultando '+label+' en Firebase…');
    const remaining=deadline-Date.now();
    if(remaining<=0) throw new Error('Firebase demoró demasiado en responder. No se modificó ningún dato; vuelve a intentarlo cuando tengas mejor conexión.');
    counts[name]=(await withReadTimeout(getDocs(colRef(name)),remaining,label)).size;
  }
  return {localCount:localCount(),localCounts:localCounts(),cloudCount:Object.values(counts).reduce((a,b)=>a+b,0),counts};
}
function toCloudRows(key, rows, profile) {
  if (key==='zipperProductos') return {collection:'products',rows};
  if (key==='zipperClientes') return {collection:'clients',rows};
  if (key==='zipperComprobantes') return {collection:'sales',rows:rows.map(row=>({...row,sellerUid:row.sellerUid||profile.uid}))};
  if (key==='zipperPagos') return {collection:'cashMovements',rows:rows.map(row=>({...row,sourceType:'payment',sellerUid:row.sellerUid||profile.uid}))};
  if (key==='zipperGastosCaja') return {collection:'cashMovements',rows:rows.map(row=>({...row,sourceType:'expense',sellerUid:row.sellerUid||profile.uid}))};
  if (key.startsWith('zipperVisitados-')) {
    const date=key.slice('zipperVisitados-'.length);
    return {collection:'visits',rows:rows.map(clientId=>({id:profile.uid+'_'+date+'_'+String(clientId),clientId:String(clientId),date,sellerUid:profile.uid}))};
  }
  if (key==='zipperCategorias'||key==='zipperCategoriasEliminadas') {
    const data={id:'catalog'};
    data[key==='zipperCategorias'?'categories':'deletedCategories']=rows;
    return {collection:'settings',rows:[data]};
  }
  return null;
}
// Incremental write: only new or modified rows are uploaded and only rows that
// disappeared since previousRows are deleted. A previous row that carries just
// its id (no other fields) has unknown content, so it is rewritten to be safe.
async function writeRows(collectionName, rows, previousRows=[]) {
  const previousById=new Map();
  for (const row of previousRows) {
    if (row==null || row.id==null) continue;
    previousById.set(String(row.id),row);
  }
  const nextIds=new Set();
  const operations=[];
  for (const row of rows) {
    const id=safeId(row.id);
    nextIds.add(id);
    const previous=previousById.get(id);
    const previousHasData=!!previous && Object.keys(previous).some(key=>key!=='id');
    if (previousHasData && stableCompareString({...previous,id})===stableCompareString({...row,id})) continue;
    operations.push({type:'set',ref:doc(colRef(collectionName),id),data:row});
  }
  for (const id of previousById.keys()) if (!nextIds.has(id)) operations.push({type:'delete',ref:doc(colRef(collectionName),safeId(id))});
  if (!operations.length) return;
  for (let start=0; start<operations.length; start+=450) {
    const batch=writeBatch(db);
    operations.slice(start,start+450).forEach(op=>op.type==='set'?batch.set(op.ref,op.data):batch.delete(op.ref));
    await batch.commit();
  }
}

async function prepareSellerCatalog() {
  if(!activeProfile||activeProfile.role!=='owner') throw new Error('Solo el dueño puede preparar el catálogo.');
  if(localStorage.getItem('zipperStorageMode')!=='cloud') throw new Error('Conecta primero la app del dueño con Firebase.');
  if(navigator.onLine===false) throw new Error('Conéctate a internet antes de preparar el catálogo.');
  const settingRef=doc(colRef('settings'),'sellerMode');
  const modeSnap=await getDoc(settingRef);
  if(modeSnap.exists()&&Number(modeSnap.data().catalogVersion)>=1) {
    sellerCatalogVersion=1;
    localStorage.setItem('zipperSellerCatalogVersion','1');
    return {count:0,alreadyPrepared:true};
  }
  const [productSnap,costSnap]=await Promise.all([
    getDocs(colRef('products')),
    getDocs(colRef('productCosts'))
  ]);
  if(!productSnap.size) throw new Error('No se encontraron productos para preparar.');
  const costMap=new Map(costSnap.docs.map(item=>[item.id,item.data()]));
  const operations=[];
  for(const item of productSnap.docs) {
    const raw={id:item.id,...item.data()};
    const previousCost=costMap.get(item.id)||{};
    const pricePurchase=raw.pricePurchase??raw.purchasePrice??raw.costPrice??raw.cost??raw.buyPrice??raw.precioCompra??previousCost.pricePurchase??0;
    const safe=publicSellerProduct(raw);
    safe.sellerVisible=!isRemedyProduct(raw);
    operations.push({type:'set',ref:item.ref,data:safe});
    operations.push({type:'set',ref:doc(colRef('productCosts'),item.id),data:{id:item.id,pricePurchase:Math.max(0,Number(pricePurchase)||0),updatedAt:new Date().toISOString()}});
  }
  for(let start=0;start<operations.length;start+=450) {
    const batch=writeBatch(db);
    operations.slice(start,start+450).forEach(op=>batch.set(op.ref,op.data));
    await batch.commit();
  }
  await setDoc(settingRef,{id:'sellerMode',enabled:false,catalogVersion:1,preparedAt:new Date().toISOString(),preparedBy:activeProfile.uid});
  sellerCatalogVersion=1;
  localStorage.setItem('zipperSellerCatalogVersion','1');
  productCostsCache=(await getDocs(colRef('productCosts'))).docs.map(d=>({id:d.id,...d.data()}));
  writeLocal('zipperProductCostsV1',productCostsCache);
  await startSync(activeProfile);
  return {count:productSnap.size,alreadyPrepared:false};
}

async function writeSellerProductRows(rows,previousRows=[]) {
  const oldById=new Map(previousRows.filter(row=>row&&row.id!=null).map(row=>[String(row.id),row]));
  const newById=new Map(rows.filter(row=>row&&row.id!=null).map(row=>[String(row.id),row]));
  const costOps=[],metadataOps=[];
  for(const row of rows) {
    const id=safeId(row.id),old=oldById.get(id),publicRow=publicSellerProduct(row),costRow=privateProductCost(row);
    const hasPriorStock=!!old&&old.stock!=null,stockDelta=hasPriorStock?Number(row.stock||0)-Number(old.stock||0):0;
    const changed={};
    if(old) {
      const oldPublic=publicSellerProduct(old);
      Object.keys(publicRow).forEach(key=>{
        if(key!=='stock'&&key!=='lastSellerSaleId'&&JSON.stringify(publicRow[key])!==JSON.stringify(oldPublic[key]))changed[key]=publicRow[key];
      });
    }
    const ref=doc(colRef('products'),id);
    if(!old||stockDelta!==0) {
      await runTransaction(db,async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists()){tx.set(ref,publicRow);return}
        const current=snap.data();
        tx.set(ref,{...publicRow,stock:hasPriorStock?Math.max(0,Number(current.stock||0)+stockDelta):Number(current.stock||0),...(typeof current.lastSellerSaleId==='string'?{lastSellerSaleId:current.lastSellerSaleId}:{})});
      });
    } else if(Object.keys(changed).length) {
      metadataOps.push({ref,data:changed});
    }
    const oldCost=old?privateProductCost(old).pricePurchase:null;
    if(!old||Number(oldCost)!==Number(costRow.pricePurchase))
      costOps.push({type:'set',ref:doc(colRef('productCosts'),id),data:costRow});
  }
  for(const [id] of oldById) if(!newById.has(id)) {
    costOps.push({type:'delete',ref:doc(colRef('productCosts'),safeId(id))});
    await deleteDoc(doc(colRef('products'),safeId(id)));
  }
  for(let start=0;start<metadataOps.length;start+=450) {
    const batch=writeBatch(db);
    metadataOps.slice(start,start+450).forEach(op=>batch.update(op.ref,op.data));
    await batch.commit();
  }
  for(let start=0;start<costOps.length;start+=450) {
    const batch=writeBatch(db);
    costOps.slice(start,start+450).forEach(op=>op.type==='set'?batch.set(op.ref,op.data):batch.delete(op.ref));
    await batch.commit();
  }
}
async function writeLocalArrayToCloud(key, rows, previousRows=[], previousHashes=null) {
  if(!activeProfile||activeProfile.role!=='owner') throw new Error('Conecta la cuenta propietaria para sincronizar los cambios pendientes.');
  if(key==='zipperCategorias'||key==='zipperCategoriasEliminadas') {
    const catalog={id:'catalog',categories:localArray('zipperCategorias'),deletedCategories:localArray('zipperCategoriasEliminadas')};
    await setDoc(doc(colRef('settings'),'catalog'),catalog,{merge:true});
    return;
  }
  if(key==='zipperProductos'&&sellerCatalogVersion>=1) {
    await writeSellerProductRows(rows,previousRows);
    return;
  }
  if(previousHashes&&typeof previousHashes==='object') {
    // Send only rows that are new or whose content changed since the baseline;
    // previous rows are reduced to the ids that disappeared (to delete them).
    const currentIds=new Set(rows.map(row=>String(row?.id)));
    rows=rows.filter(row=>!(row&&row.id!=null&&previousHashes[String(row.id)]===rowFingerprint(row)));
    previousRows=previousRows.filter(row=>!currentIds.has(String(row?.id)));
  }
  if(key.startsWith('zipperVisitados-')) {
    // Visit rows are fully determined by the client id: only additions and removals matter.
    const before=new Set(previousRows.map(String)), after=new Set(rows.map(String));
    rows=rows.filter(id=>!before.has(String(id)));
    previousRows=previousRows.filter(id=>!after.has(String(id)));
  }
  const mapped=toCloudRows(key,rows,activeProfile);
  if(!mapped) return;
  let previous=previousRows;
  if(key==='zipperPagos') previous=previousRows.map(row=>({...row,id:'payment_'+row.id,sourceType:'payment',sellerUid:row.sellerUid||activeProfile.uid}));
  else if(key==='zipperGastosCaja') previous=previousRows.map(row=>({...row,id:'expense_'+row.id,sourceType:'expense',sellerUid:row.sellerUid||activeProfile.uid}));
  else if(key.startsWith('zipperVisitados-')) {
    const date=key.slice('zipperVisitados-'.length);
    previous=previousRows.map(clientId=>({id:activeProfile.uid+'_'+date+'_'+String(clientId)}));
  }
  if(key==='zipperPagos') mapped.rows=mapped.rows.map(row=>({...row,id:'payment_'+row.id}));
  if(key==='zipperGastosCaja') mapped.rows=mapped.rows.map(row=>({...row,id:'expense_'+row.id}));
  await writeRows(mapped.collection,mapped.rows,previous);
}
async function flushPendingChanges() {
  if(flushingPendingChanges||localStorage.getItem('zipperStorageMode')!=='cloud') { updateSyncIndicator(); return; }
  if(navigator.onLine===false) { updateSyncIndicator(); return; }
  if(!activeProfile) { updateSyncIndicator(); return; }
  flushingPendingChanges=true;
  lastSyncError='';
  updateSyncIndicator();
  try {
    while(navigator.onLine!==false) {
      const outbox=readOutbox();
      const entry=Object.entries(outbox)[0];
      if(!entry) break;
      const [key,item]=entry;
      const previousRows=key.startsWith('zipperVisitados-')
        ?(item.previousIds||[])
        :key==='zipperProductos'&&Array.isArray(item.previousRows)
          ?item.previousRows
          :(item.previousIds||[]).map(id=>({id}));
      await writeLocalArrayToCloud(key,localArray(key),previousRows,item.previousHashes||null);
      const latest=readOutbox();
      if(latest[key]?.revision===item.revision) {
        delete latest[key];
        saveOutbox(latest);
      }
    }
  } catch(error) {
    console.error('Firebase: cambio pendiente conservado en el teléfono.',error);
    lastSyncError=error.message||'No se pudo sincronizar un cambio pendiente.';
    schedulePendingFlush(30000);
  } finally {
    flushingPendingChanges=false;
    updateSyncIndicator();
  }
}
async function onLocalArrayChanged(key, rows, previousRows=[]) {
  const previousRaw=JSON.stringify(previousRows);
  enqueueLocalChange(key,previousRaw,JSON.stringify(rows));
  await flushPendingChanges();
}
async function collectLocalImport(profile) {
  const groups=[
    ['products',localArray('zipperProductos')],
    ['clients',localArray('zipperClientes')],
    ['sales',localArray('zipperComprobantes').map(row=>({...row,sellerUid:profile.uid}))],
    ['cashMovements',[
      ...localArray('zipperPagos').map(row=>({...row,id:'payment_'+row.id,sourceType:'payment',sellerUid:profile.uid})),
      ...localArray('zipperGastosCaja').map(row=>({...row,id:'expense_'+row.id,sourceType:'expense',sellerUid:profile.uid}))
    ]]
  ];
  Object.keys(localStorage).filter(key=>key.startsWith('zipperVisitados-')).forEach(key=>{
    const date=key.slice('zipperVisitados-'.length);
    const rows=localArray(key).map(clientId=>({id:profile.uid+'_'+date+'_'+String(clientId),clientId:String(clientId),date,sellerUid:profile.uid}));
    groups[3][1].push(...rows);
  });
  const settings={id:'catalog',categories:localArray('zipperCategorias'),deletedCategories:localArray('zipperCategoriasEliminadas')};
  groups.push(['settings',[settings]]);
  return groups;
}
function stableCompareValue(value) {
  if (value === undefined) return {__zipperUndefined:true};
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return {__firestoreTimestamp:value.toDate().toISOString()};
  if (Array.isArray(value)) return value.map(stableCompareValue);
  const result={};
  Object.keys(value).sort().forEach(key=>{result[key]=stableCompareValue(value[key])});
  return result;
}
function stableCompareString(value) {
  return JSON.stringify(stableCompareValue(value));
}
function indexCompareRows(rows) {
  const byId=new Map(), duplicateIds=new Set();
  let missingIds=0;
  rows.forEach(row=>{
    const id=String(row?.id??'').trim();
    if(!id){missingIds++;return}
    if(byId.has(id)) duplicateIds.add(id);
    else byId.set(id,row);
  });
  return {byId,duplicateIds,missingIds};
}
async function compareLocalWithCloud(profile,onProgress) {
  if(!profile||profile.role!=='owner') throw new Error('Solo la cuenta propietaria puede comparar los datos.');
  const localGroups=await collectLocalImport(profile);
  const results=[];
  for(const [name,localRowsRaw] of localGroups) {
    const label={products:'Productos',clients:'Clientes',sales:'Ventas',cashMovements:'Abonos y gastos',visits:'Visitas',settings:'Catálogo'}[name]||name;
    if(onProgress) onProgress('Comparando '+label+' en modo solo lectura…');
    const snapshot=await withReadTimeout(getDocs(colRef(name)),20000,label);
    let localRows=localRowsRaw;
    let cloudRows=snapshot.docs.map(item=>({...item.data(),id:item.id}));
    if(name==='settings') {
      localRows=localRows.filter(row=>row.id==='catalog');
      cloudRows=cloudRows.filter(row=>row.id==='catalog');
    }
    const local=indexCompareRows(localRows), cloud=indexCompareRows(cloudRows);
    const localOnly=[], cloudOnly=[], different=[], identical=[];
    local.byId.forEach((row,id)=>{
      if(!cloud.byId.has(id)) localOnly.push(id);
      else {
        const other=cloud.byId.get(id);
        if(stableCompareString(row)===stableCompareString(other)) identical.push(id);
        else {
          const keys=new Set([...Object.keys(row||{}),...Object.keys(other||{})]);
          const fields=[...keys].filter(key=>stableCompareString(row?.[key])!==stableCompareString(other?.[key]));
          different.push({id,fields});
        }
      }
    });
    cloud.byId.forEach((_row,id)=>{if(!local.byId.has(id))cloudOnly.push(id)});
    results.push({name,label,localCount:localRows.length,cloudCount:cloudRows.length,common:identical.length+different.length,identical:identical.length,different,localOnly,cloudOnly,localDuplicates:[...local.duplicateIds],localMissingIds:local.missingIds,cloudMissingIds:cloud.missingIds});
  }
  return results;
}
function formatCloudComparison(results) {
  const lines=['COMPARACIÓN DE SOLO LECTURA · no se modificó ni fusionó ningún dato.'];
  results.forEach(item=>{
    lines.push(item.label+': teléfono '+item.localCount+' · Firebase '+item.cloudCount+' · coinciden por ID '+item.common+' ('+item.identical+' iguales, '+item.different.length+' distintos) · solo teléfono '+item.localOnly.length+' · solo Firebase '+item.cloudOnly.length+'.');
    const sample=(label,values)=>{if(values.length)lines.push('  '+label+': '+values.slice(0,5).join(', ')+(values.length>5?'…':'')+(values.length>5?' ('+values.length+' en total)':''))};
    sample('Solo teléfono',item.localOnly);
    sample('Solo Firebase',item.cloudOnly);
    if(item.different.length) lines.push('  Mismos IDs con campos distintos: '+item.different.slice(0,5).map(row=>row.id+' ['+row.fields.join(', ')+']').join('; ')+(item.different.length>5?'… ('+item.different.length+' en total)':''));
    sample('IDs repetidos en el teléfono',item.localDuplicates);
    if(item.localMissingIds||item.cloudMissingIds)lines.push('  Registros sin ID: teléfono '+item.localMissingIds+' · Firebase '+item.cloudMissingIds+'.');
  });
  return lines.join('\n');
}
async function importFingerprint(groups) {
  const bytes=new TextEncoder().encode(JSON.stringify(groups));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function validateImportResume(groups) {
  const allowed={};
  groups.forEach(([name,rows])=>{allowed[name]=new Set(rows.map(row=>safeId(row.id)))});
  allowed.settings.add('ownerImport');
  for(const [name,ids] of Object.entries(allowed)) {
    const snapshot=await getDocs(colRef(name));
    for(const item of snapshot.docs) if(!ids.has(item.id))
      throw new Error('La nube contiene datos ajenos a la importación interrumpida. No se modificó ningún dato local.');
  }
}
async function importLocalData(onProgress) {
  if (!activeProfile || activeProfile.role!=='owner') throw new Error('Solo el dueño puede importar los datos locales.');
  if(onProgress) onProgress('Preparando la importación y comprobando Firebase…');
  const groups=await collectLocalImport(activeProfile);
  const fingerprint=await importFingerprint(groups);
  const migrationRef=doc(colRef('settings'),'ownerImport');
  const migrationSnap=await getDoc(migrationRef);
  let marker=migrationSnap.exists()?migrationSnap.data():null;
  if(marker) {
    if(marker.state!=='importing'||marker.ownerUid!==activeProfile.uid||marker.fingerprint!==fingerprint)
      throw new Error('La nube ya contiene datos o una importación distinta. No se reemplazó nada.');
    await validateImportResume(groups);
  } else {
    const state=await inspectCloud();
    if(state.cloudCount!==0) throw new Error('Ya existen datos en la nube. La importación se detuvo para no reemplazarlos.');
    marker={id:'ownerImport',state:'importing',ownerUid:activeProfile.uid,fingerprint,startedAt:new Date().toISOString()};
    await setDoc(migrationRef,marker);
  }
  let total=0;
  const completedGroups=[];
  try {
    for(const [name,rows] of groups) {
      if(onProgress) onProgress('Subiendo '+name+' ('+rows.length+' registros)…');
      const operations=rows.map(row=>({ref:doc(colRef(name),safeId(row.id)),data:row}));
      for(let start=0;start<operations.length;start+=450) {
        const batch=writeBatch(db);
        operations.slice(start,start+450).forEach(op=>batch.set(op.ref,op.data));
        await batch.commit();
      }
      total+=rows.length;
      completedGroups.push(name);
      await setDoc(migrationRef,{completedGroups:[...completedGroups],updatedAt:new Date().toISOString()},{merge:true});
      if(onProgress) onProgress(name+' guardado ('+total+' registros procesados)…');
    }
    await setDoc(migrationRef,{state:'complete',completedAt:new Date().toISOString()},{merge:true});
    localStorage.setItem('zipperStorageMode','cloud');
    await startSync(activeProfile);
    return total;
  } catch(error) {
    console.error('Firebase: importación local interrumpida; se puede reanudar.',error);
    const status=document.getElementById('cloudModalStatus');
    if(status) status.textContent='Importación pausada. Tus datos locales siguen intactos. Corrige la conexión y vuelve a pulsar Importar para continuar con esta misma copia.';
    throw new Error('La importación se pausó y quedó lista para reanudarse. Los datos locales no se cambiaron.');
  }
}
async function useExistingCloudData({allowLocalWithBackup=false}={}) {
  if (!activeProfile || activeProfile.role!=='owner') throw new Error('Solo el dueño puede activar esta opción.');
  if(localCount()>0&&!allowLocalWithBackup) throw new Error('Hay datos locales. Guarda primero un respaldo antes de cargar Firebase.');
  if(allowLocalWithBackup&&Object.keys(readOutbox()).length) throw new Error('Hay cambios locales pendientes de sincronizar. No se cargó Firebase para conservarlos.');
  localStorage.setItem('zipperStorageMode','cloud');
  await startSync(activeProfile);
}
async function startSync(profile) {
  stopSync();
  try {
    const modeSnap=await getDoc(doc(colRef('settings'),'sellerMode'));
    sellerCatalogVersion=modeSnap.exists()?Number(modeSnap.data().catalogVersion)||0:0;
    localStorage.setItem('zipperSellerCatalogVersion',String(sellerCatalogVersion));
    if(sellerCatalogVersion>=1) {
      productCostsCache=(await getDocs(colRef('productCosts'))).docs.map(d=>({id:d.id,...d.data()}));
      writeLocal('zipperProductCostsV1',productCostsCache);
    }
  } catch (_) { sellerCatalogVersion=Number(localStorage.getItem('zipperSellerCatalogVersion')||0); }
  activeProfile=profile;
  if(profile.role!=='owner') throw new Error('La sincronización de vendedores se habilitará cuando quede lista la vista separada por vendedor.');
  const watch=(name,callback)=>unsubs.push(onSnapshot(colRef(name),snapshot=>callback(docsToRows(snapshot)),error=>{
    console.error('Firebase: error leyendo '+name,error);
    lastSyncError=error.message||'No se pudo leer '+name+' desde Firebase.';
    updateSyncIndicator();
  }));
  watch('products',rows=>{if(!pendingCloudCollection('products')){writeLocal('zipperProductos',mergeProductCosts(rows));scheduleRefresh()}});
  watch('clients',rows=>{if(!pendingCloudCollection('clients')){writeLocal('zipperClientes',rows);scheduleRefresh()}});
  watch('sales',rows=>{if(!pendingCloudCollection('sales')){writeLocal('zipperComprobantes',rows);scheduleRefresh()}});
  watch('cashMovements',rows=>{
    if(pendingCloudCollection('cashMovements')) return;
    writeLocal('zipperPagos',rows.filter(row=>row.sourceType==='payment').map(row=>({...row,id:String(row.id).replace(/^payment_/, '')})));
    writeLocal('zipperGastosCaja',rows.filter(row=>row.sourceType==='expense').map(row=>({...row,id:String(row.id).replace(/^expense_/, '')})));
    scheduleRefresh();
  });
  watch('visits',rows=>{
    if(pendingCloudCollection('visits')) return;
    const byDate={};
    rows.forEach(row=>{if(row.sellerUid!==profile.uid)return;const date=String(row.date||'');if(!date)return;(byDate[date]||= []).push(String(row.clientId))});
    // Cloud-originated: must not be queued again as local changes.
    const wasApplying=applyingCloud;applyingCloud=true;
    try {
      Object.keys(localStorage).filter(key=>key.startsWith('zipperVisitados-')&&!byDate[key.slice('zipperVisitados-'.length)]).forEach(key=>localStorage.removeItem(key));
      Object.entries(byDate).forEach(([date,ids])=>writeLocal('zipperVisitados-'+date,[...new Set(ids)]));
    } finally { applyingCloud=wasApplying; }
    scheduleRefresh();
  });
  watch('productCosts',rows=>{
    productCostsCache=rows;
    writeLocal('zipperProductCostsV1',rows);
    if(!pendingCloudCollection('products')) {
      writeLocal('zipperProductos',mergeProductCosts(localArray('zipperProductos'),rows));
      scheduleRefresh();
    }
  });
  watch('settings',rows=>{
    if(pendingCloudCollection('settings')) return;
    const catalog=rows.find(row=>row.id==='catalog');
    const sellerMode=rows.find(row=>row.id==='sellerMode');
    if(catalog){writeLocal('zipperCategorias',Array.isArray(catalog.categories)?catalog.categories:[]);writeLocal('zipperCategoriasEliminadas',Array.isArray(catalog.deletedCategories)?catalog.deletedCategories:[]);scheduleRefresh()}
    if(sellerMode){sellerCatalogVersion=Number(sellerMode.catalogVersion)||0;localStorage.setItem('zipperSellerCatalogVersion',String(sellerCatalogVersion));}
  });
  lastSyncError='';
  updateSyncIndicator();
  announceProfile(profile);
  schedulePendingFlush();
}
function installStorageSyncHooks() {
  if(Storage.prototype.__zipperCloudHooked) return;
  const nativeSet=Storage.prototype.setItem, nativeRemove=Storage.prototype.removeItem;
  const syncable=key=>['zipperProductos','zipperClientes','zipperComprobantes','zipperPagos','zipperGastosCaja','zipperCategorias','zipperCategoriasEliminadas'].includes(key)||String(key).startsWith('zipperVisitados-');
  const queue=(key,previousRaw)=>{
    if(!syncable(key)||localStorage.getItem('zipperStorageMode')!=='cloud'||applyingCloud) return;
    const currentRaw=localStorage.getItem(key)||'[]';
    enqueueLocalChange(key,previousRaw,currentRaw);
  };
  Storage.prototype.setItem=function(key,value) {
    const isLocal=this===localStorage,storageKey=String(key);
    const previousRaw=isLocal&&syncable(storageKey)?this.getItem(storageKey):null;
    const result=nativeSet.call(this,key,value);
    if(isLocal) queue(storageKey,previousRaw);
    return result;
  };
  Storage.prototype.removeItem=function(key) {
    const isLocal=this===localStorage,storageKey=String(key);
    const previousRaw=isLocal&&syncable(storageKey)?this.getItem(storageKey):null;
    const result=nativeRemove.call(this,key);
    if(isLocal) queue(storageKey,previousRaw);
    return result;
  };
  Object.defineProperty(Storage.prototype,'__zipperCloudHooked',{value:true,configurable:false});
}

function cloudLabel() {
  document.getElementById('cloudLogout')?.classList.toggle('hidden',!activeProfile);
  updateSyncIndicator();
}
function backupLocal() {
  return typeof window.zipperBackupDirect==='function' ? window.zipperBackupDirect()===true : false;
}
async function connectUi() {
  const modal=document.getElementById('cloudModal');
  if(!modal)return;
  const close=()=>modal.classList.add('hidden');
  document.getElementById('cloudOpen')?.addEventListener('click',()=>modal.classList.remove('hidden'));
  document.getElementById('cloudClose')?.addEventListener('click',close);
  document.getElementById('cloudBackup')?.addEventListener('click',()=>{
    if(backupLocal()) {
      const progress=document.getElementById('cloudImportProgress');
      if(progress) progress.textContent='Respaldo generado. Comprueba que esté en Descargas y marca la casilla de confirmación para continuar.';
    }
  });
  document.getElementById('cloudBackupConfirm')?.addEventListener('change',event=>{
    const importButton=document.getElementById('cloudImport');
    if(importButton) importButton.disabled=!event.target.checked;
    const loadButton=document.getElementById('cloudLoadExisting');
    if(loadButton) loadButton.disabled=!event.target.checked;
    const progress=document.getElementById('cloudImportProgress');
    if(progress&&event.target.checked) progress.textContent='Respaldo confirmado. Ya puedes cargar Firebase en este teléfono.';
  });
  document.getElementById('cloudCompare')?.addEventListener('click',async()=>{
    const button=document.getElementById('cloudCompare');
    const report=document.getElementById('cloudCompareReport');
    const status=document.getElementById('cloudModalStatus');
    if(!activeProfile||activeProfile.role!=='owner') {
      if(status)status.textContent='Vuelve a verificar la cuenta propietaria para comparar los datos.';
      return;
    }
    button.disabled=true;
    report.classList.remove('hidden');
    report.textContent='Preparando comparación de solo lectura…';
    try {
      const results=await compareLocalWithCloud(activeProfile,message=>{if(status)status.textContent=message;});
      report.textContent=formatCloudComparison(results);
      if(status)status.textContent='Comparación terminada. No se escribió ni reemplazó ningún dato.';
    } catch(error) {
      report.textContent='No se completó la comparación. No se modificó ningún dato. '+(error.message||'Revisa la conexión y vuelve a intentarlo.');
      if(status)status.textContent='La comparación no pudo terminar; los datos no se modificaron.';
    } finally {
      button.disabled=false;
    }
  });
  document.getElementById('cloudSignIn')?.addEventListener('click',async()=>{
    const status=document.getElementById('cloudModalStatus');
    const email=document.getElementById('cloudEmail')?.value||'';
    const password=document.getElementById('cloudPassword')?.value||'';
    const button=document.getElementById('cloudSignIn');
    if(status)status.textContent='Verificando cuenta…';
    if(button)button.disabled=true;
    try {
      const profile=await login(email,password);
      document.getElementById('cloudPassword').value='';
      document.getElementById('cloudAccount').textContent=(profile.displayName||profile.email)+' · '+profile.role;
      document.getElementById('cloudAfterLogin').classList.remove('hidden');
      const state=await inspectCloud(message=>{if(status)status.textContent=message;});
      document.getElementById('cloudCounts').textContent=countsLabel(state);
      const localData=state.localCount>0;
      const cloudData=state.cloudCount>0;
      const importBtn=document.getElementById('cloudImport');
      const useBtn=document.getElementById('cloudUseExisting');
      const backupConfirmRow=document.getElementById('cloudBackupConfirmRow');
      const backupConfirm=document.getElementById('cloudBackupConfirm');
      if(backupConfirmRow) backupConfirmRow.classList.toggle('hidden',!localData);
      if(backupConfirm) backupConfirm.checked=false;
      document.getElementById('cloudBackup').classList.toggle('hidden',!localData);
      importBtn.classList.toggle('hidden',!localData||cloudData);
      importBtn.disabled=!localData||cloudData;
      const loadCloudButton=document.getElementById('cloudLoadExisting');
      const canLoadCloud=localData&&cloudData&&profile.role==='owner';
      if(loadCloudButton) {
        loadCloudButton.classList.toggle('hidden',!canLoadCloud);
        loadCloudButton.disabled=true;
      }
      const canUseCloud=cloudData && !localData;
      useBtn.classList.toggle('hidden',!canUseCloud);
      useBtn.disabled=!canUseCloud;
      if(profile.role==='seller') {
        if(status)status.textContent='Perfil de vendedor validado. La vista y sincronización por vendedor aún están en preparación; no se activó la nube.';
        document.getElementById('cloudImport').classList.add('hidden');
        document.getElementById('cloudUseExisting').classList.add('hidden');
      } else if(localData&&cloudData) {
        if(status)status.textContent='Los datos de ambos lados están disponibles. Guarda un respaldo del teléfono y luego pulsa “Cargar datos de Firebase en este teléfono”.';
      } else if(localData) {
        if(status)status.textContent='Cuenta de dueño verificada. Primero guarda un respaldo y luego podrás importar estos registros.';
      } else if(cloudData) {
        if(status)status.textContent='Firebase ya tiene datos. Para usarlos desde este teléfono primero genera un respaldo de los datos locales.';
      } else {
        if(status)status.textContent='Cuenta de dueño verificada. No hay datos locales ni en Firebase para importar.';
        localStorage.setItem('zipperStorageMode','cloud');
        await startSync(profile);
      }
    } catch(error) {
      if(status)status.textContent=error.message||'No se pudo verificar la cuenta.';
    } finally {if(button)button.disabled=false}
  });
  document.getElementById('cloudResetPassword')?.addEventListener('click',async()=>{
    const status=document.getElementById('cloudModalStatus');
    const email=document.getElementById('cloudEmail')?.value||'';
    const button=document.getElementById('cloudResetPassword');
    if(!String(email).trim()) {
      if(status)status.textContent='Escribe el correo de la cuenta propietaria y vuelve a intentarlo.';
      document.getElementById('cloudEmail')?.focus();
      return;
    }
    if(button)button.disabled=true;
    if(status)status.textContent='Enviando solicitud de restablecimiento…';
    try {
      await requestPasswordReset(email);
      if(status)status.textContent='Firebase envió el enlace de restablecimiento al correo de la cuenta. Revisa también Spam.';
    } catch(error) {
      if(status)status.textContent=error.message||'No se pudo enviar el enlace de restablecimiento.';
    } finally {if(button)button.disabled=false}
  });
  document.getElementById('cloudImport')?.addEventListener('click',async()=>{
    const status=document.getElementById('cloudModalStatus');
    const progress=document.getElementById('cloudImportProgress');
    const button=document.getElementById('cloudImport');
    if(button.disabled) return;
    button.disabled=true;
    const originalLabel='Importar mis datos a Firebase';
    button.textContent='Importando…';
    if(progress) progress.textContent='Importación iniciada. Mantén esta ventana abierta; te mostraré qué grupo se está guardando.';
    try {
      const total=await importLocalData(message=>{if(progress)progress.textContent=message;});
      if(status)status.textContent='Importación terminada. El modo nube está activo.';
      if(progress)progress.textContent='Importación completada: '+total+' registros guardados en Firebase.';
      button.textContent='Importación completada';
      const counts=await inspectCloud();
      const cloudCounts=document.getElementById('cloudCounts');
      if(cloudCounts)cloudCounts.textContent=countsLabel(counts);
      cloudLabel();
    } catch(error) {
      const message=error.message||'No se pudo completar la importación.';
      if(status)status.textContent='La importación no terminó.';
      if(progress)progress.textContent='Error de importación: '+message;
      button.disabled=false;
      button.textContent=originalLabel;
      alert('No se pudo completar la importación: '+message);
    }
  });
  document.getElementById('cloudLoadExisting')?.addEventListener('click',async()=>{
    const status=document.getElementById('cloudModalStatus');
    const progress=document.getElementById('cloudImportProgress');
    const button=document.getElementById('cloudLoadExisting');
    if(!document.getElementById('cloudBackupConfirm')?.checked) {
      if(status)status.textContent='Primero guarda y confirma el respaldo del teléfono.';
      return;
    }
    if(button)button.disabled=true;
    if(status)status.textContent='Activando Firebase y cargando los datos en este teléfono…';
    try {
      await useExistingCloudData({allowLocalWithBackup:true});
      if(status)status.textContent='Firebase quedó activo. Los datos de la nube se están cargando en Zipper.';
      if(progress)progress.textContent='Carga iniciada. Mantén la app abierta hasta que aparezcan tus productos, clientes y movimientos.';
      cloudLabel();
    } catch(error) {
      if(status)status.textContent=error.message||'No se pudo cargar Firebase.';
      if(button)button.disabled=false;
    }
  });
  document.getElementById('cloudUseExisting')?.addEventListener('click',async()=>{
    const status=document.getElementById('cloudModalStatus');
    try {await useExistingCloudData();if(status)status.textContent='Modo nube activado. Los datos de Firebase se cargarán en esta app.';cloudLabel();}
    catch(error){if(status)status.textContent=error.message||'No se pudo activar el modo nube.'}
  });
  document.getElementById('cloudLogout')?.addEventListener('click',async()=>{
    stopSync();localStorage.setItem('zipperStorageMode','local');await signOut(auth);activeProfile=null;announceProfile(null);cloudLabel();close();
  });
  cloudLabel();
  window.addEventListener('online',async()=>{
    lastSyncError='';
    updateSyncIndicator();
    const user=auth.currentUser;
    if(user&&localStorage.getItem('zipperStorageMode')==='cloud') {
      try {
        const profile=await memberFor(user);
        if(profile?.role==='owner') await startSync(profile);
        else await flushPendingChanges();
      } catch(error) {
        lastSyncError=error.message||'No se pudo restaurar la cuenta de Firebase.';
        updateSyncIndicator();
      }
    }
  });
  window.addEventListener('offline',updateSyncIndicator);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') {
      updateSyncIndicator();
      if(navigator.onLine!==false) schedulePendingFlush();
    }
  });
  onAuthStateChanged(auth,async user=>{
    if(!user)return;
    try {
      const profile=await memberFor(user);
      if(!profile || profile.role!=='owner'){await signOut(auth);return}
      activeProfile=profile;
      if(localStorage.getItem('zipperStorageMode')==='cloud') await startSync(profile);
      else updateSyncIndicator();
      announceProfile(profile);
      cloudLabel();
    } catch(error) {
      console.error('Firebase: no se pudo restaurar la sesión.',error);
      updateSyncIndicator();
    }
  });
}
const api={login,signOut:()=>signOut(auth),memberFor,listMembers,sellerActivity,inspectCloud,importLocalData,useExistingCloudData,prepareSellerCatalog,startSync,stopSync,onLocalArrayChanged,cloudLabel};
window.zipperFirebaseCloud=api;
installStorageSyncHooks();
if(!window.zipperRefreshAfterCloud)window.zipperRefreshAfterCloud=()=>['renderHome','renderCash','renderInventory','renderClients','renderHistory'].forEach(name=>{try{if(typeof window[name]==='function')window[name]()}catch(error){console.error(error)}});
const initializeCloudUi=()=>{
  connectUi().then(()=>{
    window.zipperFirebaseUiReady=true;
    window.dispatchEvent(new Event('zipper-firebase-ui-ready'));
  }).catch(error=>{
    console.error('Firebase: no se pudo activar la ventana de conexión.',error);
    const status=document.getElementById('cloudModalStatus');
    if(status)status.textContent='No se pudo activar la conexión con Firebase. No se verificó la cuenta ni se cambiaron datos.';
  });
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeCloudUi,{once:true});else initializeCloudUi();
