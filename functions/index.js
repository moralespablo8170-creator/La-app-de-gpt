const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');

initializeApp();
const auth=getAuth();
const db=getFirestore();
const firebaseConfig=JSON.parse(process.env.FIREBASE_CONFIG||'{}');
const ORG=String(firebaseConfig.projectId||'').trim();
if(!ORG)throw new Error('FIREBASE_CONFIG no contiene el ID del proyecto Firebase de destino.');

exports.createSellerAccount=onCall(
 {region:'southamerica-west1',maxInstances:1,concurrency:1},
 async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Inicia sesión como propietario.');
  const ownerSnap=await db.doc('orgs/'+ORG+'/members/'+request.auth.uid).get();
  if(!ownerSnap.exists||ownerSnap.data().active!==true||ownerSnap.data().role!=='owner')
   throw new HttpsError('permission-denied','Solo el propietario activo puede crear cuentas de vendedor.');

  const input=request.data||{};
  const displayName=typeof input.displayName==='string'?input.displayName.trim():'';
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  if(displayName.length<2||displayName.length>80)
   throw new HttpsError('invalid-argument','Escribe el nombre del vendedor (2 a 80 caracteres).');
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   throw new HttpsError('invalid-argument','Escribe un correo electrónico válido para el acceso.');
  if(password.length<8||password.length>128)
   throw new HttpsError('invalid-argument','La clave inicial debe tener entre 8 y 128 caracteres.');
  if(email===String(request.auth.token.email||'').trim().toLowerCase())
   throw new HttpsError('invalid-argument','Usa un correo distinto al de la cuenta propietaria.');

  let user;
  try{
   user=await auth.createUser({email,password,displayName,emailVerified:false,disabled:false});
  }catch(error){
   if(error.code==='auth/email-already-exists')
    throw new HttpsError('already-exists','Ese correo ya tiene una cuenta Firebase.');
   throw new HttpsError('internal','Firebase no pudo crear la cuenta de acceso.');
  }

  try{
   await db.doc('orgs/'+ORG+'/members/'+user.uid).create({
    role:'seller',
    active:true,
    displayName,
    email,
    provisionedBy:request.auth.uid,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
   });
  }catch(error){
   await auth.deleteUser(user.uid).catch(()=>{});
   console.error('No se pudo crear el perfil asociado a la nueva cuenta.',error.code||error.message);
   throw new HttpsError('internal','No se pudo completar el perfil. La cuenta incompleta fue retirada.');
  }

  return {uid:user.uid,email:user.email,displayName:user.displayName};
 });

exports.setSellerAccess=onCall(
 {region:'southamerica-west1',maxInstances:1,concurrency:1},
 async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Inicia sesión como propietario.');
  const ownerSnap=await db.doc('orgs/'+ORG+'/members/'+request.auth.uid).get();
  if(!ownerSnap.exists||ownerSnap.data().active!==true||ownerSnap.data().role!=='owner')
   throw new HttpsError('permission-denied','Solo el propietario activo puede cambiar accesos.');

  const input=request.data||{},uid=typeof input.uid==='string'?input.uid.trim():'',active=input.active;
  if(!uid||uid.includes('/')||uid===request.auth.uid||typeof active!=='boolean')
   throw new HttpsError('invalid-argument','El vendedor o el estado de acceso no es válido.');
  const memberRef=db.doc('orgs/'+ORG+'/members/'+uid);
  const memberSnap=await memberRef.get();
  if(!memberSnap.exists||memberSnap.data().role!=='seller')
   throw new HttpsError('not-found','No se encontró ese perfil de vendedor.');

  if(active){
   try{await auth.updateUser(uid,{disabled:false})}
   catch(error){throw new HttpsError('failed-precondition','No se pudo habilitar la cuenta de Firebase Authentication.')}
   await memberRef.update({active:true,updatedAt:new Date().toISOString()});
   return {uid,active:true,authDisabled:false};
  }

  // Deny Firestore immediately; Auth account disable and token revocation follow.
  await memberRef.update({active:false,updatedAt:new Date().toISOString()});
  try{
   await auth.updateUser(uid,{disabled:true});
   await auth.revokeRefreshTokens(uid);
   return {uid,active:false,authDisabled:true};
  }catch(error){
   console.error('El perfil quedó bloqueado en Firestore, pero no se pudo deshabilitar Authentication.',error.code||error.message);
   return {uid,active:false,authDisabled:false};
  }
 });
