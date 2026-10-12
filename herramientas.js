/* Herramientas locales: vista previa sin venta y respaldo validado. */
function zipperDataKeys(storage){return Object.keys(storage).filter(k=>k.startsWith('zipper')&&!k.startsWith('zipperRespaldo'))}
function validateZipperBackup(file){
 if(!file||file.app!=='Distribuidora zipper'||file.schemaVersion!==1||!file.data||typeof file.data!=='object'||Array.isArray(file.data))throw Error('Este archivo no es un respaldo válido de Zipper.');
 for(const [key,value]of Object.entries(file.data)){if(!key.startsWith('zipper')||key.startsWith('zipperRespaldo')||typeof value!=='string')throw Error('El respaldo contiene datos no permitidos.')}
 for(const key of ['zipperProductos','zipperClientes','zipperComprobantes']){const rows=JSON.parse(file.data[key]||'null');if(!Array.isArray(rows))throw Error('Falta '+key+' en el respaldo.');const ids=new Set();for(const row of rows){if(!row||row.id==null||ids.has(String(row.id)))throw Error('Registro inválido o duplicado en '+key);ids.add(String(row.id));if(key==='zipperProductos'&&(!String(row.name||'').trim()||!Number.isInteger(Number(row.stock))||Number(row.stock)<0))throw Error('Stock o nombre inválido.');if(key==='zipperComprobantes'&&(!Array.isArray(row.items)||row.items.some(i=>!Number.isInteger(Number(i.qty))||Number(i.qty)<=0||!Number.isFinite(Number(i.price))||Number(i.price)<0)))throw Error('Detalle de venta inválido.')}}
 return file
}
function exportZipperBackup(){
 const status=$('backupStatus');
 try{
  status.textContent='Preparando respaldo…';
  const data={};zipperDataKeys(localStorage).forEach(k=>data[k]=localStorage.getItem(k));
  for(const k of ['zipperProductos','zipperClientes','zipperComprobantes','zipperPagos','zipperGastosCaja'])if(!data[k])data[k]='[]';
  const backup={app:'Distribuidora zipper',schemaVersion:1,createdAt:new Date().toISOString(),data};validateZipperBackup(backup);
  const name='Zipper-respaldo-'+localDate()+'.json';
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);
  a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},30000);
  status.textContent='Respaldo solicitado: '+name+' · '+JSON.parse(data.zipperComprobantes).length+' ventas · '+JSON.parse(data.zipperPagos).length+' abonos · '+JSON.parse(data.zipperGastosCaja).length+' gastos. Revisa Descargas.';
  alert('Respaldo preparado. Revisa Descargas: '+name);
 }catch(e){
  status.textContent='ERROR DE RESPALDO: '+(e&&e.message?e.message:e);
  alert(status.textContent);
 }
}
async function restoreZipperBackup(input){
 const selected=input.files?.[0];if(!selected)return;
 try{
  if(selected.size>20*1024*1024)throw Error('El archivo supera los 20 MB.');
  const file=validateZipperBackup(JSON.parse(await selected.text()));
  const sales=JSON.parse(file.data.zipperComprobantes||'[]');
  const clients=JSON.parse(file.data.zipperClientes||'[]');
  const products=JSON.parse(file.data.zipperProductos||'[]');
  const financialKeys=['zipperPagos','zipperGastosCaja'];
  const missing=financialKeys.filter(k=>!Object.prototype.hasOwnProperty.call(file.data,k));
  if(missing.length)throw Error('El respaldo no incluye '+missing.join(' y ')+'. No se reemplazará la información actual. Busca el respaldo completo del teléfono original.');
  const expected={};
  for(const k of ['zipperProductos','zipperClientes','zipperComprobantes',...financialKeys]){
   const a=JSON.parse(file.data[k]);if(!Array.isArray(a))throw Error('Datos inválidos en '+k);
   expected[k]=a.length;
  }
  confirmDelete('Restaurar respaldo','El archivo contiene '+products.length+' productos, '+clients.length+' clientes, '+sales.length+' ventas, '+expected.zipperPagos+' abonos y '+expected.zipperGastosCaja+' gastos. Reemplazará los datos de este navegador. ¿Restaurar?',()=>{
   const before={};zipperDataKeys(localStorage).forEach(k=>before[k]=localStorage.getItem(k));
   try{
    localStorage.setItem('zipperRespaldoAntesRestauracion',JSON.stringify({createdAt:new Date().toISOString(),data:before}));
    for(const [k,v] of Object.entries(file.data))localStorage.setItem(k,v);
    // Verificar todas las claves, incluidas rutas, visitados, pendientes y preferencias.
    for(const [k,v] of Object.entries(file.data))if(localStorage.getItem(k)!==v)throw Error('Falló la restauración de '+k);
    for(const [k,n] of Object.entries(expected)){
     const restored=JSON.parse(localStorage.getItem(k)||'null');
     if(!Array.isArray(restored)||restored.length!==n||localStorage.getItem(k)!==file.data[k])throw Error('Falló la comprobación de '+k);
    }
    for(const k of zipperDataKeys(localStorage))if(!Object.prototype.hasOwnProperty.call(file.data,k))localStorage.removeItem(k);
    for(const [k,v] of Object.entries(file.data))if(localStorage.getItem(k)!==v)throw Error('Verificación final fallida: '+k);
    for(const k of zipperDataKeys(localStorage))if(!Object.prototype.hasOwnProperty.call(file.data,k))throw Error('Quedó una clave ajena al respaldo: '+k);
    $('backupStatus').textContent='RESTAURACIÓN VERIFICADA: '+sales.length+' ventas, '+expected.zipperPagos+' abonos y '+expected.zipperGastosCaja+' gastos. Recargando…';
    alert('Restauración completa verificada, incluidos abonos y gastos de caja.');
    setTimeout(()=>window.location.reload(),500);
   }catch(e){
    try{
     for(const k of zipperDataKeys(localStorage))if(!Object.prototype.hasOwnProperty.call(before,k))localStorage.removeItem(k);
     for(const [k,v] of Object.entries(before))localStorage.setItem(k,v);
    }catch(rollbackError){alert('No se pudo recuperar automáticamente el estado anterior. Conserva el respaldo y no borres la aplicación.');}
    $('backupStatus').textContent='ERROR AL RESTAURAR: '+(e&&e.message?e.message:e);
    alert($('backupStatus').textContent);
   }
  });
 }catch(e){
  $('backupStatus').textContent='No se restauró ningún dato: '+e.message;
  alert($('backupStatus').textContent);
 }finally{input.value=''}
}
function previewExampleReceipt(){
 renderPrint({folio:'EJEMPLO',fecha:localDate(),cliente:'Cliente de ejemplo · NO ES UNA VENTA',items:[{desc:'Amsterdam papelillo con boquilla',qty:2,price:600},{desc:'Pañuelo Elite',qty:1,price:3100},{desc:'Nombre largo de producto para revisar el ancho del ticket',qty:3,price:1200}]});openReceiptPreview()
}
const previewBtn=$('previewExampleReceipt');if(previewBtn)previewBtn.onclick=previewExampleReceipt;
const exportBtn=$('exportBackup');if(exportBtn)exportBtn.onclick=exportZipperBackup;
window.zipperBackupDirect=exportZipperBackup;
window.zipperRestoreDirect=restoreZipperBackup;
/* El selector se enlaza aquí y también desde index como respaldo; ninguno debe impedir el arranque. */
const backupInput=$('backupFile');if(backupInput)backupInput.onchange=e=>restoreZipperBackup(e.target);
