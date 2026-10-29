// Firebase connection and owner-only first migration for Distribuidora Zipper.
// The local phone database remains the default. Cloud mode is enabled only after an explicit backup and import.
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, collection, getDocs, onSnapshot, writeBatch, setDoc, deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF4',
  authDomain: 'zipper-a12f1.firebaseapp.com',
  projectId: 'zipper-a12f1',
  storageBucket: 'zipper-a12f1.firebasestorage.app',
  messagingSenderId: '729619217486',
  appId: '1:729619217486:web:6350b05ead8ecd70c1171f',
  measurementId: 'G-KX0HXC2Z54'
};

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
const ORG_ID = 'zipper-a12f1';
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
  try { localStorage.setItem(OUTBOX_KEY,JSON.stringify(outbox)); }
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
    message='No se pudo confirmar el envío · los cambios siguen guardados en el teléfono y se reintentará.';
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
    indicator.classList.remove('hidden','sync-ok','sync-pending','sync-offline','sync-error');
    indicator.classList.add(state);
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
function enqueueLocalChange(key, previousRaw, currentRaw) {
  if(localStorage.getItem('zipperStorageMode')!=='cloud'||applyingCloud) return;
  const outbox=readOutbox();
  const existing=outbox[key];
  outbox[key]={
    previousIds:existing?.previousIds||parseArray(previousRaw).map(row=>typeof row==='object'&&row?row.id:row),
    revision:String(Date.now())+'-'+Math.random().toString(36).slice(2)
  };
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
function publicSellerProduct(row) {
  const clean={...row};
  privateProductFields.forEach(key=>delete clean[key]);
  clean.sellerVisible=true;
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
    throw new Error('El acceso vendedor todavía no se activa en esta versión. La app seguirá usando el modo local mientras se termina la vista protegida por vendedor.');
  }
  activeProfile = profile;
  announceProfile(profile);
  return profile;
}
async function listMembers() {
  if (!activeProfile || activeProfile.role !== 'owner') throw new Error('Solo el dueño puede consultar los vendedores.');
  const snapshot = await getDocs(collection(db, ...ORG_PATH, 'members'));
  return snapshot.docs.map(item=>({uid:item.id,...item.data()})).filter(item=>item.active===true && item.role==='seller');
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
async function writeRows(collectionName, rows, previousRows=[]) {
  const previousIds=new Set(previousRows.map(row=>String(row.id)));
  const nextIds=new Set(rows.map(row=>String(row.id)));
  const operations=[];
  for (const row of rows) {
    const id=safeId(row.id);
    operations.push({type:'set',ref:doc(colRef(collectionName),id),data:row});
  }
  for (const id of previousIds) if (!nextIds.has(id)) operations.push({type:'delete',ref:doc(colRef(collectionName),safeId(id))});
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
    safe.sellerVisible=true;
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

async function writeLocalArrayToCloud(key, rows, previousRows=[]) {
  if(!activeProfile||activeProfile.role!=='owner') throw new Error('Conecta la cuenta propietaria para sincronizar los cambios pendientes.');
  if(key==='zipperCategorias'||key==='zipperCategoriasEliminadas') {
    const catalog={id:'catalog',categories:localArray('zipperCategorias'),deletedCategories:localArray('zipperCategoriasEliminadas')};
    await setDoc(doc(colRef('settings'),'catalog'),catalog,{merge:true});
    return;
  }
  if(key==='zipperProductos'&&sellerCatalogVersion>=1) {
    const publicRows=rows.map(publicSellerProduct);
    const privateRows=rows.map(privateProductCost);
    const previousIds=previousRows.map(row=>({id:row.id}));
    await writeRows('products',publicRows,previousIds);
    await writeRows('productCosts',privateRows,previousIds);
    return;
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
        :(item.previousIds||[]).map(id=>({id}));
      await writeLocalArrayToCloud(key,localArray(key),previousRows);
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
async function useExistingCloudData() {
  if (!activeProfile || activeProfile.role!=='owner') throw new Error('Solo el dueño puede activar esta opción.');
  if(localCount()>0) throw new Error('Hay datos locales. No se reemplazaron; exporta y revisa la copia antes de cambiar a los datos de la nube.');
  localStorage.setItem('zipperStorageMode','cloud');
  await startSync(activeProfile);
}
async function startSync(profile) {
  stopSync();
  try {
    const modeSnap=await getDoc(doc(colRef('settings'),'sellerMode'));
    sellerCatalogVersion=modeSnap.exists()?Number(modeSnap.data().catalogVersion)||0:0;
    localStorage.setItem('zipperSellerCatalogVersion',String(sellerCatalogVersion));
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
    Object.keys(localStorage).filter(key=>key.startsWith('zipperVisitados-')).forEach(key=>localStorage.removeItem(key));
    Object.entries(byDate).forEach(([date,ids])=>writeLocal('zipperVisitados-'+date,[...new Set(ids)]));
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
      const confirmation=document.getElementById('cloudBackupConfirm');
      if(confirmation) confirmation.checked=true;
      document.getElementById('cloudImport')?.removeAttribute('disabled');
      const progress=document.getElementById('cloudImportProgress');
      if(progress) progress.textContent='Respaldo generado. Comprueba que esté en Descargas; luego pulsa Importar mis datos a Firebase.';
    }
  });
  document.getElementById('cloudBackupConfirm')?.addEventListener('change',event=>{
    const importButton=document.getElementById('cloudImport');
    if(importButton) importButton.disabled=!event.target.checked;
    const progress=document.getElementById('cloudImportProgress');
    if(progress&&event.target.checked) progress.textContent='Marcaste que el respaldo ya está guardado. Ahora puedes importar los datos locales.';
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
      if(backupConfirmRow) backupConfirmRow.classList.toggle('hidden',!localData||cloudData);
      if(backupConfirm) backupConfirm.checked=false;
      document.getElementById('cloudBackup').classList.toggle('hidden',!localData||cloudData);
      importBtn.classList.toggle('hidden',!localData||cloudData);
      importBtn.disabled=localData;
      const canUseCloud=cloudData && !localData;
      useBtn.classList.toggle('hidden',!canUseCloud);
      useBtn.disabled=!canUseCloud;
      if(profile.role==='seller') {
        if(status)status.textContent='Perfil de vendedor validado. La vista y sincronización por vendedor aún están en preparación; no se activó la nube.';
        document.getElementById('cloudImport').classList.add('hidden');
        document.getElementById('cloudUseExisting').classList.add('hidden');
      } else if(localData&&cloudData) {
        if(status)status.textContent='Hay datos en el teléfono y en Firebase. No se reemplazó ni fusionó nada.';
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
const api={login,signOut:()=>signOut(auth),memberFor,listMembers,inspectCloud,importLocalData,useExistingCloudData,prepareSellerCatalog,startSync,stopSync,onLocalArrayChanged,cloudLabel};
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
