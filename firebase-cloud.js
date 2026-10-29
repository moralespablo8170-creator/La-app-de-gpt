// Firebase connection and owner-only first migration for Distribuidora Zipper.
// The local phone database remains the default. Cloud mode is enabled only after an explicit backup and import.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, collection, getDocs, onSnapshot,
  writeBatch, setDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

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
const db = getFirestore(firebaseApp);
const ORG_ID = 'zipper-a12f1';
const ORG_PATH = ['orgs', ORG_ID];
let activeProfile = null;
let unsubs = [];
let refreshing = false;
let applyingCloud = false;
let syncScheduled = false;
const queuedLocalChanges = new Map();

const localArray = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
};
const localCount = () => ['zipperClientes','zipperProductos','zipperComprobantes','zipperPagos','zipperGastosCaja']
  .reduce((sum,key)=>sum+localArray(key).length,0);
const colRef = name => collection(db, ...ORG_PATH, name);
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
  await setPersistence(auth,browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth,String(email||'').trim(),String(password||''));
  const profile = await memberFor(credential.user);
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

async function inspectCloud() {
  const names=['products','clients','sales','cashMovements','visits'];
  const counts={};
  for (const name of names) counts[name]=(await getDocs(colRef(name))).size;
  counts.settings=(await getDocs(colRef('settings'))).size;
  return {localCount:localCount(),cloudCount:Object.values(counts).reduce((a,b)=>a+b,0),counts};
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
async function onLocalArrayChanged(key, rows, previousRows=[]) {
  if (localStorage.getItem('zipperStorageMode')!=='cloud' || !activeProfile) return;
  if (activeProfile.role!=='owner') return;
  if (key==='zipperCategorias'||key==='zipperCategoriasEliminadas') {
    const catalog={id:'catalog',categories:localArray('zipperCategorias'),deletedCategories:localArray('zipperCategoriasEliminadas')};
    try { await setDoc(doc(colRef('settings'),'catalog'),catalog,{merge:true}); }
    catch(error) { console.error('Firebase: no se pudo sincronizar la configuración.',error); }
    return;
  }
  const mapped=toCloudRows(key,rows,activeProfile);
  if (!mapped) return;
  try {
    let previous=previousRows;
    if (key==='zipperPagos') previous=previousRows.map(row=>({...row,id:'payment_'+row.id,sourceType:'payment',sellerUid:row.sellerUid||activeProfile.uid}));
    else if (key==='zipperGastosCaja') previous=previousRows.map(row=>({...row,id:'expense_'+row.id,sourceType:'expense',sellerUid:row.sellerUid||activeProfile.uid}));
    else if (key==='zipperVisitados-'+key.slice('zipperVisitados-'.length)) previous=previousRows.map(clientId=>({id:activeProfile.uid+'_'+key.slice('zipperVisitados-'.length)+'_'+String(clientId)}));
    if (key==='zipperPagos') mapped.rows=mapped.rows.map(row=>({...row,id:'payment_'+row.id}));
    if (key==='zipperGastosCaja') mapped.rows=mapped.rows.map(row=>({...row,id:'expense_'+row.id}));
    await writeRows(mapped.collection,mapped.rows,previous);
  } catch(error) {
    console.error('Firebase: no se pudo sincronizar el cambio.',error);
    const status=document.getElementById('cloudStatus');
    if(status) status.textContent='No se pudo guardar el último cambio en la nube. Tus datos locales siguen guardados.';
  }
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
function startSync(profile) {
  stopSync();
  activeProfile=profile;
  if(profile.role!=='owner') throw new Error('La sincronización de vendedores se habilitará cuando quede lista la vista separada por vendedor.');
  const watch=(name,callback)=>unsubs.push(onSnapshot(colRef(name),snapshot=>callback(docsToRows(snapshot)),error=>{
    console.error('Firebase: error leyendo '+name,error);
    const status=document.getElementById('cloudStatus');
    if(status) status.textContent='No se pudo leer '+name+' desde la nube. Los datos locales se conservaron.';
  }));
  watch('products',rows=>{writeLocal('zipperProductos',rows);scheduleRefresh()});
  watch('clients',rows=>{writeLocal('zipperClientes',rows);scheduleRefresh()});
  watch('sales',rows=>{writeLocal('zipperComprobantes',rows);scheduleRefresh()});
  watch('cashMovements',rows=>{
    writeLocal('zipperPagos',rows.filter(row=>row.sourceType==='payment').map(row=>({...row,id:String(row.id).replace(/^payment_/, '')})));
    writeLocal('zipperGastosCaja',rows.filter(row=>row.sourceType==='expense').map(row=>({...row,id:String(row.id).replace(/^expense_/, '')})));
    scheduleRefresh();
  });
  watch('visits',rows=>{
    const byDate={};
    rows.forEach(row=>{if(row.sellerUid!==profile.uid)return;const date=String(row.date||'');if(!date)return;(byDate[date]||= []).push(String(row.clientId))});
    Object.keys(localStorage).filter(key=>key.startsWith('zipperVisitados-')).forEach(key=>localStorage.removeItem(key));
    Object.entries(byDate).forEach(([date,ids])=>writeLocal('zipperVisitados-'+date,[...new Set(ids)]));
    scheduleRefresh();
  });
  watch('settings',rows=>{
    const catalog=rows.find(row=>row.id==='catalog');
    if(catalog){writeLocal('zipperCategorias',Array.isArray(catalog.categories)?catalog.categories:[]);writeLocal('zipperCategoriasEliminadas',Array.isArray(catalog.deletedCategories)?catalog.deletedCategories:[]);scheduleRefresh()}
  });
  const status=document.getElementById('cloudStatus');
  if(status) status.textContent='Modo nube activo · propietario · sincronización conectada.';
  announceProfile(profile);
}
function installStorageSyncHooks() {
  if (Storage.prototype.__zipperCloudHooked) return;
  const nativeSet=Storage.prototype.setItem, nativeRemove=Storage.prototype.removeItem;
  const syncable=key=>['zipperProductos','zipperClientes','zipperComprobantes','zipperPagos','zipperGastosCaja','zipperCategorias','zipperCategoriasEliminadas'].includes(key)||String(key).startsWith('zipperVisitados-');
  const queue=(key,previousRaw)=>{
    if(!syncable(key)||localStorage.getItem('zipperStorageMode')!=='cloud'||applyingCloud)return;
    if(!queuedLocalChanges.has(key)){let previous=[];try{const parsed=JSON.parse(previousRaw||'[]');if(Array.isArray(parsed))previous=parsed}catch(_){}queuedLocalChanges.set(key,previous)}
    if(syncScheduled)return;syncScheduled=true;
    Promise.resolve().then(async()=>{
      syncScheduled=false;const pending=[...queuedLocalChanges.entries()];queuedLocalChanges.clear();
      for(const [changedKey,previous] of pending){let current=[];try{const parsed=JSON.parse(localStorage.getItem(changedKey)||'[]');if(Array.isArray(parsed))current=parsed}catch(_){}await onLocalArrayChanged(changedKey,current,previous)}
    });
  };
  Storage.prototype.setItem=function(key,value){
    const isLocal=this===localStorage,previous=isLocal&&syncable(String(key))?this.getItem(key):null;
    const result=nativeSet.call(this,key,value);if(isLocal)queue(String(key),previous);return result;
  };
  Storage.prototype.removeItem=function(key){
    const isLocal=this===localStorage,previous=isLocal&&syncable(String(key))?this.getItem(key):null;
    const result=nativeRemove.call(this,key);if(isLocal)queue(String(key),previous);return result;
  };
  Object.defineProperty(Storage.prototype,'__zipperCloudHooked',{value:true,configurable:false});
}

function cloudLabel() {
  const status=document.getElementById('cloudStatus');
  if(status) status.textContent=localStorage.getItem('zipperStorageMode')==='cloud'
    ?(activeProfile?'Modo nube activo · los cambios se sincronizan con Firebase.':'Modo nube seleccionado · conecta la cuenta propietaria para sincronizar.')
    :'Modo local activo · los datos permanecen en este teléfono.';
  document.getElementById('cloudLogout')?.classList.toggle('hidden',!activeProfile);
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
      document.getElementById('cloudImport')?.removeAttribute('disabled');
      const progress=document.getElementById('cloudImportProgress');
      if(progress) progress.textContent='Respaldo generado. Comprueba que esté en Descargas; luego pulsa Importar mis datos a Firebase.';
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
      const state=await inspectCloud();
      document.getElementById('cloudCounts').textContent='En este teléfono: '+state.localCount+' registros. En Firebase: '+state.cloudCount+' registros.';
      const localData=state.localCount>0;
      const cloudData=state.cloudCount>0;
      const importBtn=document.getElementById('cloudImport');
      const useBtn=document.getElementById('cloudUseExisting');
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
      if(cloudCounts)cloudCounts.textContent='En este teléfono: '+counts.localCount+' registros. En Firebase: '+counts.cloudCount+' registros.';
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
  onAuthStateChanged(auth,async user=>{
    if(!user)return;
    try {
      const profile=await memberFor(user);
      if(!profile || profile.role!=='owner'){await signOut(auth);return}
      activeProfile=profile;
      if(localStorage.getItem('zipperStorageMode')==='cloud') await startSync(profile);
      announceProfile(profile);
      cloudLabel();
    } catch(error){console.error('Firebase: no se pudo restaurar la sesión.',error)}
  });
}
const api={login,signOut:()=>signOut(auth),memberFor,listMembers,inspectCloud,importLocalData,useExistingCloudData,startSync,stopSync,onLocalArrayChanged,cloudLabel};
window.zipperFirebaseCloud=api;
installStorageSyncHooks();
if(!window.zipperRefreshAfterCloud)window.zipperRefreshAfterCloud=()=>['renderHome','renderCash','renderInventory','renderClients','renderHistory'].forEach(name=>{try{if(typeof window[name]==='function')window[name]()}catch(error){console.error(error)}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connectUi,{once:true});else connectUi();
