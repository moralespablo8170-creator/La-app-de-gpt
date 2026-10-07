/* Herramientas locales: vista previa sin venta y respaldo validado. */
function zipperDataKeys(storage){return Object.keys(storage).filter(k=>k.startsWith('zipper')&&!k.startsWith('zipperRespaldo'))}
function validateZipperBackup(file){
 if(!file||file.app!=='Distribuidora zipper'||file.schemaVersion!==1||!file.data||typeof file.data!=='object'||Array.isArray(file.data))throw Error('Este archivo no es un respaldo válido de Zipper.');
 for(const [key,value]of Object.entries(file.data)){if(!key.startsWith('zipper')||key.startsWith('zipperRespaldo')||typeof value!=='string')throw Error('El respaldo contiene datos no permitidos.')}
 for(const key of ['zipperProductos','zipperClientes','zipperComprobantes']){const rows=JSON.parse(file.data[key]||'null');if(!Array.isArray(rows))throw Error('Falta '+key+' en el respaldo.');const ids=new Set();for(const row of rows){if(!row||row.id==null||ids.has(String(row.id)))throw Error('Registro inválido o duplicado en '+key);ids.add(String(row.id));if(key==='zipperProductos'&&(!String(row.name||'').trim()||!Number.isInteger(Number(row.stock))||Number(row.stock)<0))throw Error('Stock o nombre inválido.');if(key==='zipperComprobantes'&&(!Array.isArray(row.items)||row.items.some(i=>!Number.isInteger(Number(i.qty))||Number(i.qty)<=0||!Number.isFinite(Number(i.price))||Number(i.price)<0)))throw Error('Detalle de venta inválido.')}}
 return file
}
async function exportZipperBackup(){
 try{
  const data={};zipperDataKeys(localStorage).forEach(k=>data[k]=localStorage.getItem(k));
  for(const k of ['zipperProductos','zipperClientes','zipperComprobantes'])if(!data[k])data[k]='[]';
  const backup={app:'Distribuidora zipper',schemaVersion:1,createdAt:new Date().toISOString(),data};validateZipperBackup(backup);
  const name='Zipper-respaldo-'+localDate()+'.json',blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  if(typeof window.showSaveFilePicker==='function'){
   const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Respaldo Zipper',accept:{'application/json':['.json']}}]});
   const writable=await handle.createWritable();await writable.write(blob);await writable.close();
   $('backupStatus').textContent='Respaldo guardado correctamente: '+name;alert('Respaldo guardado correctamente.');return;
  }
  const shareFile=new File([blob],name,{type:'application/json'});
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[shareFile]})){
   $('backupStatus').textContent='Elige Archivos o Guardar para conservar el respaldo.';
   await navigator.share({files:[shareFile],title:'Respaldo Distribuidora Zipper'});
   $('backupStatus').textContent='Respaldo enviado al destino elegido: '+name;return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},10000);
  $('backupStatus').textContent='Descarga iniciada: '+name+'. Revisa Descargas.';
 }catch(e){
  if(e&&e.name==='AbortError'){$('backupStatus').textContent='Guardado cancelado. No se modificó ningún dato.';return}
  $('backupStatus').textContent='No se pudo guardar el respaldo: '+(e&&e.message?e.message:e);alert('No se pudo guardar el respaldo.');
 }
}
async function restoreZipperBackup(input){
 const selected=input.files?.[0];if(!selected)return;
 try{if(selected.size>20*1024*1024)throw Error('El archivo supera los 20 MB.');const file=validateZipperBackup(JSON.parse(await selected.text()));const counts=['zipperProductos','zipperClientes','zipperComprobantes'].map(k=>JSON.parse(file.data[k]).length);
 confirmDelete('Restaurar respaldo','Este archivo contiene '+counts[0]+' productos, '+counts[1]+' clientes y '+counts[2]+' ventas. Reemplazará los datos actuales de este navegador. ¿Restaurar?',()=>{
  const keys=[...new Set([...zipperDataKeys(localStorage),...Object.keys(file.data)])],before={};keys.forEach(k=>before[k]=localStorage.getItem(k));
  try{localStorage.setItem('zipperRespaldoAntesRestauracion',JSON.stringify({createdAt:new Date().toISOString(),data:before}));for(const k of keys){if(k in file.data)localStorage.setItem(k,file.data[k]);else if(!['zipperDictatedInventoryVersion','zipperInventoryUpdateVersion','zipperSeedVersion'].includes(k))localStorage.removeItem(k)}$('backupStatus').textContent='Respaldo restaurado. Recargando la aplicación…';window.location.reload()}
  catch(e){try{keys.forEach(k=>before[k]===null?localStorage.removeItem(k):localStorage.setItem(k,before[k]))}catch(rollback){$('backupStatus').textContent='Error al guardar y revertir. Conserva el archivo de respaldo y solicita revisión.';return}$('backupStatus').textContent='No se pudo restaurar; se conservaron los datos anteriores: '+e.message}
 })
 }catch(e){$('backupStatus').textContent='No se restauró ningún dato: '+e.message}finally{input.value=''}
}
function previewExampleReceipt(){
 renderPrint({folio:'EJEMPLO',fecha:localDate(),cliente:'Cliente de ejemplo · NO ES UNA VENTA',items:[{desc:'Amsterdam papelillo con boquilla',qty:2,price:600},{desc:'Pañuelo Elite',qty:1,price:3100},{desc:'Nombre largo de producto para revisar el ancho del ticket',qty:3,price:1200}]});openReceiptPreview()
}
$('previewExampleReceipt').onclick=previewExampleReceipt;
$('exportBackup').onclick=exportZipperBackup;
$('chooseBackup').onclick=()=>{const input=$('backupFile');input.value='';input.click()};
$('backupFile').onchange=e=>restoreZipperBackup(e.target);
