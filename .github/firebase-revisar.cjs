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
  line('  · con unidad de compra caja/display (buyUnit)',products.docs.filter(d=>{const u=d.data().buyUnit;return u&&u!=='unidad'}).length);
  line('  · actualizados en las últimas 24 h (updatedAt)',products.docs.filter(d=>{const t=Date.parse(d.data().updatedAt||'');return t&&Date.now()-t<864e5}).length);
  try{const pub=await db.collection('publico').doc('catalogo').get();const x=pub.exists?JSON.parse(pub.data().data||'{}'):{};const it=Object.values(x.items||{});line('Catálogo publicado: productos',it.length);line('  · por unidad y caja',it.filter(i=>i.mode==='dual').length);line('  · enlazados',Object.values(x.links||{}).filter(v=>v&&v!=='none').length);line('  · publicado',pub.exists?String(pub.data().updatedAt||'').slice(0,16):'no');/* El catálogo publicado ya es público (se ve en la página del catálogo): se pueden listar sus productos agregados. */(x.extra||[]).forEach(e=>{const i=(x.items||{})[e.key]||{};line('  · agregado: '+String(e.name).slice(0,40),(e.section||'sin sección')+' · $'+(Number(i.price)||0)+(i.hidden?' · oculto':''))})}catch(e){line('Catálogo publicado','error '+e.message)}
  // Revisión del catálogo: nombre que ve el cliente ↔ producto de la app al que está enlazado (lo que se carga al pedido).
  try{const pub=await db.collection('publico').doc('catalogo').get();const x=pub.exists?JSON.parse(pub.data().data||'{}'):{};
    const base=require(require('path').join(__dirname,'..','catalogo','catalogo.json'));const pn={};products.docs.forEach(d=>{const v=d.data();pn[d.id]=[v.name,v.flavor].filter(Boolean).join(' · ')});
    const rowsA=[];base.sections.forEach(sec=>sec.items.forEach(it=>rowsA.push({key:it.key,name:(x.names||{})[it.key]||it.name,sec:sec.title})));(x.extra||[]).forEach(e=>rowsA.push({key:e.key,name:e.name,sec:e.section||'Otros',extra:true}));
    const extraLink=k=>{const e=(x.extra||[]).find(y=>y.key===k);return e&&(e.productId||e.pid||e.id)};
    Object.keys(x.items||{}).filter(k=>/tapsin/.test(k)).forEach(k=>console.log('DETALLE '+k+' '+JSON.stringify(x.items[k])+' nombre='+((x.names||{})[k]||'')+' enlace='+((x.links||{})[k]||'')+' foto='+((x.photos||{})[k]?'sí':'no')));
    console.log('\n===== Catálogo: nombre del cliente → producto enlazado =====');
    rowsA.forEach(r=>{const i=(x.items||{})[r.key]||{};const pid=(x.links||{})[r.key]||extraLink(r.key);if(i.hidden&&!/tapsin/i.test(r.name))return;
      console.log((r.sec+' | '+r.name).slice(0,60).padEnd(60)+' → '+(pid&&pid!=='none'?(pn[pid]||'¿producto borrado? '+pid):'(sin enlace)')+' · $'+(Number(i.price)||0)+(i.mode&&i.mode!=='single'?' · '+i.mode:'')+(i.hidden?' · OCULTO':'')+(x.photos&&x.photos[r.key]?' · foto propia':''))});
  }catch(e){console.log('Revisión de catálogo falló:',e.message)}
  // Últimos pedidos del catálogo (sin datos del cliente: solo si trae nombre/teléfono, de qué enlace vino, total y hora).
  try{const ps=await db.collection('pedidosCatalogo').orderBy('createdAt','desc').limit(12).get();console.log('\n===== Últimos pedidos del catálogo =====');
    ps.docs.forEach(d=>{const v=d.data();let o={};try{o=JSON.parse(v.data||'{}')}catch(_){}
      console.log(new Date(v.createdAt||o.createdAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})+' · #'+(o.code||'?')+' · estado '+(v.status||'?')+' · nombre '+(o.who?'SÍ':'NO')+' · tel '+(o.tel?'SÍ':'NO')+' · enlace '+(o.sellerName?'vendedor '+o.sellerName:(o.sellerPhone?'vendedor (sin nombre)':'tuyo'))+' · $'+(o.total||0)+' · '+((o.lines||[]).length)+' productos')})
  }catch(e){console.log('Últimos pedidos: no se pudo leer',e.message)}
  line('Pedidos del catálogo (pedidosCatalogo)',(await db.collection('pedidosCatalogo').count().get()).data().count);
  line('Pedidos a proveedor en la nube',(await col('supplierOrders').count().get()).data().count);
  line('Costos privados (productCosts)',(await col('productCosts').get()).size);
  line('Ventas en Firebase',(await col('sales').count().get()).data().count);
  line('  · registradas por vendedores',(await col('sales').where('sellerUid','in',sellers.length?sellers.slice(0,10).map(s=>s.uid):['-']).count().get()).data().count);
  {const all=(await col('sales').get()).docs.map(d=>d.data());const day=x=>String(x.fecha||x.date||x.occurredAt||'').slice(0,10);
   const owner=new Set(owners.map(o=>o.uid));const own=all.filter(x=>!x.stockDeductions&&(!x.sellerUid||owner.has(x.sellerUid)));
   line('  · ventas del dueño (total)',own.length);
   ['2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17'].forEach(d=>line('  · ventas del dueño con fecha '+d,own.filter(x=>day(x)===d).length));
   line('  · folio más alto del dueño',Math.max(0,...own.map(x=>Number(x.folio)||0)));}
  let authUsers=0,token;do{const r=await auth.listUsers(1000,token);authUsers+=r.users.length;token=r.pageToken}while(token);
  line('Cuentas de acceso totales (Authentication)',authUsers);
  console.log('\n===== Estado de Firebase (solo cantidades) =====\n'+out.join('\n')+'\n');
})().catch(e=>{console.error('Error al revisar Firebase:',e.code||'',e.message);process.exit(1)});
