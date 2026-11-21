// Arreglo puntual del catálogo publicado (pedido por el dueño, 21-11-2026):
// "Tapsin caliente día" queda igual que "Tapsin caliente noche": se vende por unidad y por caja de 60 a $27.500,
// y la fila extra "Tapsin caliente x caja" (que se había renombrado "Tapsin caliente dia") se oculta.
// Guarda una copia del catálogo anterior en publico/catalogo-respaldo-tapsin por si hay que volver atrás.
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.applicationDefault()});
const db=admin.firestore();
(async()=>{
  const ref=db.collection('publico').doc('catalogo');const snap=await ref.get();if(!snap.exists)throw new Error('No hay catálogo publicado');
  const raw=snap.data();const x=JSON.parse(raw.data||'{}');x.items=x.items||{};
  await db.collection('publico').doc('catalogo-respaldo-tapsin').set(raw);
  const dia=x.items['rem-tapsin-caliente-dia']||{};const caja=x.items['rem-tapsin-caliente-x-caja']||{};const noche=x.items['rem-tapsin-caliente-noche']||{};
  const box=noche.box&&noche.box.units>1?{...noche.box}:{units:60,price:27500,manual:true};
  x.items['rem-tapsin-caliente-dia']={...dia,mode:'dual',box};
  x.items['rem-tapsin-caliente-x-caja']={...caja,hidden:true,userHidden:true};
  if(x.names)delete x.names['rem-tapsin-caliente-x-caja'];
  await ref.set({data:JSON.stringify(x),updatedAt:new Date().toISOString()});
  console.log('Listo: Tapsin caliente día →',JSON.stringify(x.items['rem-tapsin-caliente-dia']));
  console.log('Tapsin caliente x caja → oculto');
})().catch(e=>{console.error(e.message);process.exit(1)});
