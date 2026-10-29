const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');

initializeApp();
const auth=getAuth();
const db=getFirestore();
const ORG='zipper-a12f1';

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
  if(email.length>254||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))
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
