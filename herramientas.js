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
  for(const k of ['zipperProductos','zipperClientes','zipperComprobantes'])if(!data[k])data[k]='[]';
  const backup={app:'Distribuidora zipper',schemaVersion:1,createdAt:new Date().toISOString(),data};validateZipperBackup(backup);
  const name='Zipper-respaldo-'+localDate()+'.json';
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);
  a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},30000);
  status.textContent='Respaldo solicitado: '+name+'. Si Android pregunta, elige Descargar o Guardar.';
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
  confirmDelete('Restaurar respaldo','Este archivo contiene '+products.length+' productos, '+clients.length+' clientes y '+sales.length+' ventas. Reemplazará los datos actuales de este navegador. ¿Restaurar?',()=>{
   try{
    const before={};zipperDataKeys(localStorage).forEach(k=>before[k]=localStorage.getItem(k));
    localStorage.setItem('zipperRespaldoAntesRestauracion',JSON.stringify({createdAt:new Date().toISOString(),data:before}));
    /* Restauración exacta: primero quitamos los datos Zipper actuales y después escribimos TODO el respaldo. */
    zipperDataKeys(localStorage).forEach(k=>localStorage.removeItem(k));
    Object.entries(file.data).forEach(([k,v])=>localStorage.setItem(k,v));
    /* Verificación obligatoria antes de recargar. */
    const restoredSales=JSON.parse(localStorage.getItem('zipperComprobantes')||'[]');
    const restoredClients=JSON.parse(localStorage.getItem('zipperClientes')||'[]');
    const restoredProducts=JSON.parse(localStorage.getItem('zipperProductos')||'[]');
    if(restoredSales.length!==sales.length||restoredClients.length!==clients.length||restoredProducts.length!==products.length)throw Error('La verificación de los datos restaurados falló.');
    /* Evita que la carga inicial trate el respaldo restaurado como una instalación nueva y reemplace datos. */
    const seedVersion=file.data.zipperSeedVersion;if(seedVersion!=null)localStorage.setItem('zipperSeedVersion',seedVersion);
    $('backupStatus').textContent='RESTAURACIÓN CORRECTA: '+restoredSales.length+' ventas, '+restoredClients.length+' clientes y '+restoredProducts.length+' productos. Recargando…';
    alert('RESPALDO RESTAURADO CORRECTAMENTE. Se recuperaron '+restoredSales.length+' ventas.');
    setTimeout(()=>window.location.reload(),500);
   }catch(e){
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
$('previewExampleReceipt').onclick=previewExampleReceipt;
$('exportBackup').onclick=exportZipperBackup;
window.zipperBackupDirect=exportZipperBackup;
window.zipperRestoreDirect=restoreZipperBackup;
$('backupFile').onchange=e=>restoreZipperBackup(e.target);
