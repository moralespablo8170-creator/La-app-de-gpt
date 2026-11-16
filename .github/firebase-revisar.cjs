// Revisión de solo lectura del Firebase de Zipper.
// El repositorio es público: aquí se imprimen SOLO cantidades y estados, nunca nombres, correos ni datos de clientes.
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.applicationDefault()});
const db=admin.firestore(),auth=admin.auth();
const ORG=process.env.ZIPPER_ORG||'zipper-a12f1';
const col=name=>db.collection('orgs').doc(ORG).collection(name);
(async()=>{
  const out=[];const line=(k,v)=>out.push(k.padEnd(48,'.')+' '+v);
  const members=(await col('members').get()).docs.map(d=>({uid:d.id,...d.data()}));
  const owners=members.filter(m=>m.role==='owner'),sellers=members.filter(m=>m.role==='seller');
  line('Cuentas de dueño (members role=owner)',owners.length);
  line('Perfiles de vendedor',sellers.length);
  line('  · activos',sellers.filter(s=>s.active===true).length);
  let noAuth=0,disabled=0,emailMismatch=0;
  for(const s of sellers){
    try{const u=await auth.getUser(s.uid);if(u.disabled)disabled++;if(s.email&&u.email&&String(u.email).toLowerCase()!==String(s.email).toLowerCase())emailMismatch++}
    catch(e){if(String(e.code).includes('user-not-found'))noAuth++;else throw e}
  }
  line('  · perfil SIN cuenta de acceso (no podrán entrar)',noAuth);
  line('  · cuenta de acceso deshabilitada',disabled);
  line('  · correo del perfil distinto al de la cuenta',emailMismatch);
  const mode=await col('settings').doc('sellerMode').get(),m=mode.exists?mode.data():{};
  line('Catálogo seguro preparado (catalogVersion>=1)',Number(m.catalogVersion)>=1?'sí':'NO');
  line('Acceso de vendedores encendido',m.enabled===true?'sí':'NO');
  const clients=(await col('clients').get()).docs.map(d=>d.data());
  const sellerIds=new Set(sellers.map(s=>s.uid));
  line('Clientes en Firebase',clients.length);
  line('  · asignados a algún vendedor',clients.filter(c=>(c.assignedSellerUids||[]).length).length);
  line('  · asignados a un vendedor que ya no existe',clients.filter(c=>(c.assignedSellerUids||[]).some(u=>!sellerIds.has(String(u)))).length);
  const products=await col('products').get();
  line('Productos en Firebase',products.size);
  line('  · visibles para vendedores',products.docs.filter(d=>d.data().sellerVisible===true).length);
  line('  · con precio de compra a la vista (debería ser 0)',products.docs.filter(d=>{const x=d.data();return ['pricePurchase','purchasePrice','cost','costPrice','buyPrice','precioCompra'].some(k=>x[k]!=null)}).length);
  line('Costos privados (productCosts)',(await col('productCosts').get()).size);
  line('Ventas en Firebase',(await col('sales').count().get()).data().count);
  line('  · registradas por vendedores',(await col('sales').where('sellerUid','in',sellers.length?sellers.slice(0,10).map(s=>s.uid):['-']).count().get()).data().count);
  let authUsers=0,token;do{const r=await auth.listUsers(1000,token);authUsers+=r.users.length;token=r.pageToken}while(token);
  line('Cuentas de acceso totales (Authentication)',authUsers);
  console.log('\n===== Estado de Firebase (solo cantidades) =====\n'+out.join('\n')+'\n');
})().catch(e=>{console.error('Error al revisar Firebase:',e.code||'',e.message);process.exit(1)});
