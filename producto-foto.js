// Productos con foto (reemplaza los colores):
// - En el formulario de producto: elegir / quitar foto y "Mostrar en el catálogo para clientes".
// - Al guardar, el producto nuevo queda agregado al catálogo con su foto.
// - En la lista de Productos se ve la foto; tocándola se cambia.
(function(){
  const $=id=>document.getElementById(id);
  const e=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const nrm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const slug=v=>nrm(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
  const PERS=['unidad','display','caja','bolsa','paquete','pack','manga','rollo','tira','sachet'];
  const cloud=()=>localStorage.getItem('zipperStorageMode')==='cloud'&&typeof window.zipperFirebaseCloud?.publishCatalog==='function';
  let pendingPhoto=null,removePhoto=false,baseSections=null;

  function resizePhoto(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const S=420,c=document.createElement('canvas');c.width=S;c.height=S;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,S,S);const k=Math.min((S*.94)/img.width,(S*.94)/img.height),w=img.width*k,h=img.height*k;g.drawImage(img,(S-w)/2,(S-h)/2,w,h);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.82))};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudo leer la imagen'))};img.src=url})}
  function pickFile(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>res(i.files&&i.files[0]||null);i.click()})}
  async function sections(){if(baseSections)return baseSections;try{const r=await fetch('catalogo/catalogo.json',{cache:'no-cache'});const j=await r.json();baseSections=j.sections.map(s=>s.title)}catch(_){baseSections=[]}return baseSections}
  function catalogKeyOf(pub,id){id=String(id);const k=Object.entries(pub?.links||{}).find(([,v])=>String(v)===id)?.[0];if(k)return {key:k,linked:true};const x=(pub?.extra||[]).find(x=>String(x.productId)===id);return x?{key:x.key,linked:false,extra:x}:null}

  // Publica en el catálogo: foto y/o producto agregado.
  async function syncCatalog(productId,opts){
    if(!cloud())throw new Error('Conecta tu cuenta de Firebase para guardar fotos y el catálogo.');
    const api=window.zipperFirebaseCloud;
    const p=typeof productById==='function'?productById(productId):null;if(!p)throw new Error('No encontré el producto.');
    const raw=getRawProducts().find(x=>String(x.id)===String(p.baseProductId||p.id))||p;
    let pub=await api.readPublishedCatalog();
    pub=pub||{version:2,items:{},links:{},extra:[],photos:{}};pub.items=pub.items||{};pub.links=pub.links||{};pub.extra=pub.extra||[];pub.photos=pub.photos||{};
    let found=catalogKeyOf(pub,raw.id);
    if(!found&&opts.inCatalog){
      const secs=await sections();const sec=opts.section||secs.find(t=>nrm(t)===nrm(raw.category))||secs.find(t=>nrm(t).includes(nrm(raw.category))||nrm(raw.category).includes(nrm(t)))||'Otros productos';
      let key='x-'+slug(raw.name);while(pub.items[key]||pub.extra.some(x=>x.key===key))key+='-2';
      const x={key,name:String(raw.name).trim(),fmt:opts.fmt||'',per:opts.per||'unidad',section:sec,productId:String(raw.id)};
      pub.extra.push(x);found={key,linked:false,extra:x};
    }
    if(found&&!found.linked&&found.extra){
      if(opts.inCatalog===false){pub.extra=pub.extra.filter(x=>x.key!==found.key);delete pub.items[found.key];if(pub.photos[found.key]&&pub.photos[found.key]!=='none'){try{await api.deleteCatalogPhoto(found.key)}catch(_){}}delete pub.photos[found.key];found=null}
      else{Object.assign(found.extra,{name:String(raw.name).trim(),...(opts.section?{section:opts.section}:{}),...(opts.fmt!=null?{fmt:opts.fmt}:{}),...(opts.per?{per:opts.per}:{})});pub.items[found.key]={...(pub.items[found.key]||{}),price:Number(raw.price)||0}}
    }
    if(found){
      if(opts.photo){await api.publishCatalogPhoto(found.key,opts.photo);pub.photos[found.key]=Date.now()}
      else if(opts.removePhoto){if(pub.photos[found.key]&&pub.photos[found.key]!=='none'){try{await api.deleteCatalogPhoto(found.key)}catch(_){}}pub.photos[found.key]='none'}
    }
    pub.updatedAt=new Date().toISOString();
    await api.publishCatalog(pub);
    try{await window.zipperProductPhotos?.load()}catch(_){}
    return found;
  }

  // ---- Formulario de producto ----
  function mountForm(){
    if($('pfPhotoBox')||!$('productName'))return;
    ['productBarColorLabel','productBarColors'].forEach(id=>{const el=$(id);if(el)(el.closest('label')||el).classList.add('hidden')});
    const anchor=$('productName').closest('label')||$('productName');
    anchor.insertAdjacentHTML('afterend','<div id="pfPhotoBox" class="pf-photo"><div class="pf-photo-img" id="pfPhotoPreview"><span>📷<br>Sin foto</span></div><div class="pf-photo-side"><b>Foto del producto</b><small>Se ve en el carrito, en Productos y en el catálogo.</small><div class="pf-photo-actions"><button id="pfPhotoPick" class="secondary" type="button">📷 Elegir foto</button><button id="pfPhotoRemove" class="secondary hidden" type="button">🗑 Quitar</button></div></div></div>'+
      '<div id="pfCatalogBox" class="pf-catalog"><label class="pf-check"><input id="pfInCatalog" type="checkbox" checked> Mostrar en el catálogo para clientes</label><small id="pfCatalogInfo" class="muted"></small><div id="pfCatalogFields" class="pf-catalog-fields"><label class="pf-wide">Sección del catálogo<select id="pfSec"><option>Otros productos</option></select></label><label>Formato que ve el cliente<input id="pfFmt" placeholder="Ej: Display x 24 · Bolsa 400 g"></label><label>Precio por<select id="pfPer">'+PERS.map(x=>'<option>'+x+'</option>').join('')+'</select></label></div></div>');
    $('pfPhotoPick').onclick=async()=>{const f=await pickFile();if(!f)return;try{pendingPhoto=await resizePhoto(f);removePhoto=false;paintPreview(pendingPhoto)}catch(err){alert(err.message)}};
    $('pfPhotoRemove').onclick=()=>{pendingPhoto=null;removePhoto=true;paintPreview('')};
    $('pfInCatalog').onchange=()=>$('pfCatalogFields').classList.toggle('hidden',!$('pfInCatalog').checked||$('pfInCatalog').disabled);
    const css=document.createElement('style');css.textContent='.pf-photo{display:flex;gap:12px;align-items:center;margin:10px 0;padding:10px;border:1px dashed #94a3b8;border-radius:14px}.pf-photo-img{width:96px;height:96px;flex:none;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:12px;overflow:hidden;border:1px solid #e2e8f0}.pf-photo-img img{width:100%;height:100%;object-fit:contain}.pf-photo-side{display:flex;flex-direction:column;gap:4px}.pf-photo-side small{color:#94a3b8}.pf-photo-actions{display:flex;gap:6px;flex-wrap:wrap}.pf-photo-actions button{min-height:0;padding:8px 10px}.pf-catalog{margin:6px 0 10px;padding:10px;border-radius:14px;background:#0ea5e914;border:1px solid #38bdf855}.pf-check{display:flex;align-items:center;gap:8px;font-weight:800}.pf-check input{width:auto}.pf-catalog-fields{display:grid;grid-template-columns:1fr 140px;gap:8px}.pf-catalog-fields label{margin:6px 0 0}.pf-wide{grid-column:1/-1}.inv-thumb{width:52px;height:52px;flex:none;border-radius:10px;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;padding:2px;cursor:pointer;overflow:hidden}.inv-thumb img{width:100%;height:100%;object-fit:contain;pointer-events:none}';document.head.appendChild(css);
  }
  function paintPreview(src){const b=$('pfPhotoPreview');if(!b)return;b.innerHTML=src?'<img src="'+e(src)+'" alt="">':'<span>📷<br>Sin foto</span>';$('pfPhotoRemove')?.classList.toggle('hidden',!src)}
  async function fillForm(productId){
    mountForm();pendingPhoto=null;removePhoto=false;
    const p=productId&&typeof productById==='function'?productById(productId):null;
    paintPreview(p?window.zipperProductPhotos?.url(p)||'':'');
    const box=$('pfInCatalog');$('pfFmt').value='';$('pfPer').value='unidad';
    const secs=await sections();const cat=$('productCategory')?.value||p?.category||'';$('pfSec').innerHTML=secs.concat(['Otros productos']).map(t=>'<option>'+e(t)+'</option>').join('');$('pfSec').value=secs.find(t=>nrm(t)===nrm(cat))||secs.find(t=>nrm(t).includes(nrm(cat))||nrm(cat).includes(nrm(t)))||'Otros productos';
    if(!p){box.disabled=false;box.checked=true;$('pfCatalogFields').classList.remove('hidden');$('pfCatalogInfo').textContent=cloud()?'El producto nuevo se agrega al catálogo con su foto.':'Conecta Firebase para agregarlo al catálogo.'}
    else{box.disabled=true;box.checked=false;$('pfCatalogFields').classList.add('hidden');$('pfCatalogInfo').textContent=cloud()?'Revisando el catálogo…':'Conecta Firebase para ver el catálogo.'}
    if(p&&cloud()){try{const pub=await window.zipperFirebaseCloud.readPublishedCatalog();const f=catalogKeyOf(pub,p.baseProductId||p.id);
      if(f&&f.linked){box.checked=true;box.disabled=true;$('pfCatalogInfo').textContent='✅ Ya está en el catálogo (lo cambias en Editar catálogo).';$('pfCatalogFields').classList.add('hidden')}
      else if(f){box.disabled=false;box.checked=true;$('pfCatalogFields').classList.remove('hidden');$('pfFmt').value=f.extra.fmt||'';if(f.extra.section)$('pfSec').value=f.extra.section;$('pfPer').value=f.extra.per||'unidad';$('pfCatalogInfo').textContent='✅ Está en el catálogo.'}
      else{box.disabled=false;box.checked=false;$('pfCatalogFields').classList.add('hidden');$('pfCatalogInfo').textContent='No está en el catálogo. Márcalo para agregarlo.'}
      const u=window.zipperProductPhotos?.url(p);if(u)paintPreview(u)}catch(_){}}
  }
  function wrapForm(){
    const save=window.saveProduct,reset=window.resetProductForm,edit=window.editProduct;
    if(typeof save==='function'&&!save.__withPhoto){window.saveProduct=function(){
      const before=localStorage.getItem('zipperProductos'),wasEditing=typeof editingProductId!=='undefined'?editingProductId:null,name=$('productName')?.value.trim();
      const opts={photo:pendingPhoto,removePhoto,inCatalog:$('pfInCatalog')?($('pfInCatalog').disabled?undefined:$('pfInCatalog').checked):undefined,fmt:$('pfFmt')?.value.trim(),per:$('pfPer')?.value,section:$('pfSec')?.value};
      const r=save.apply(this,arguments);
      if(localStorage.getItem('zipperProductos')===before)return r; // no se guardó (faltaba algún dato)
      const id=wasEditing||(()=>{const ps=getRawProducts().filter(x=>nrm(x.name)===nrm(name));return ps.length?ps[ps.length-1].id:null})();
      const needs=opts.photo||opts.removePhoto||(!wasEditing&&opts.inCatalog)||(wasEditing&&opts.inCatalog!==undefined);
      pendingPhoto=null;removePhoto=false;
      if(id&&needs){const st=$('productStatus');syncCatalog(id,opts).then(f=>{if(st)st.textContent=(st.textContent?st.textContent+' ':'')+(f?'📒 Catálogo actualizado'+(opts.photo?' con la foto':'')+'.':'');try{renderInventory()}catch(_){}}).catch(err=>{if(st)st.textContent=(st.textContent?st.textContent+' ':'')+'⚠ '+(err.message||err)})}
      return r};window.saveProduct.__withPhoto=true}
    // El botón Guardar quedó enlazado a la función original al cargar la app: se enlaza a la nueva para que el producto nuevo sí llegue al catálogo.
    const btn=$('saveProduct');if(btn&&!btn.__withPhoto){btn.onclick=()=>window.saveProduct();btn.__withPhoto=true}
    if(typeof reset==='function'&&!reset.__withPhoto){window.resetProductForm=function(){const r=reset.apply(this,arguments);try{fillForm(null)}catch(_){}return r};window.resetProductForm.__withPhoto=true}
    if(typeof edit==='function'&&!edit.__withPhoto){window.editProduct=function(id){const r=edit.apply(this,arguments);try{fillForm(id)}catch(_){}return r};window.editProduct.__withPhoto=true}
    const inv=window.renderInventory;
    if(typeof inv==='function'&&!inv.__withPhoto){window.renderInventory=function(){const r=inv.apply(this,arguments);try{decorateList()}catch(err){console.warn(err)}return r};window.renderInventory.__withPhoto=true}
  }
  // ---- Lista de Productos: foto en vez de color; tocar la foto para cambiarla ----
  function decorateList(){
    document.querySelectorAll('#inventoryList .product-card-row').forEach(row=>{
      if(row.querySelector('.inv-thumb'))return;const id=row.querySelector('.edit-product')?.dataset.id;const p=id&&productById(id);if(!p)return;
      const dot=row.querySelector('.inventory-main .color-dot');const u=window.zipperProductPhotos?.url(p)||'';
      const html='<button type="button" class="inv-thumb" data-photo-for="'+e(id)+'" title="Cambiar foto">'+(u?'<img src="'+e(u)+'" alt="">':'📷')+'</button>';
      if(dot)dot.outerHTML=html;else row.querySelector('.inventory-main')?.insertAdjacentHTML('afterbegin',html);
    });
  }
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest&&ev.target.closest('.inv-thumb[data-photo-for]');if(!b)return;
    const id=b.dataset.photoFor,p=productById(id);if(!p)return;
    if(!cloud()){alert('Conecta tu cuenta de Firebase para guardar fotos.');return}
    const f=await pickFile();if(!f)return;
    const st=$('productStatus');try{const data=await resizePhoto(f);b.innerHTML='<img src="'+data+'" alt="">';if(st)st.textContent='Guardando foto de '+p.name+'…';await syncCatalog(id,{photo:data,inCatalog:true});if(st)st.textContent='✅ Foto de '+p.name+' guardada (también en el catálogo).'}catch(err){if(st)st.textContent='⚠ No se pudo guardar la foto: '+(err.message||err)}
  });
  window.zipperProductPhotos?.onChange(()=>{try{if(document.querySelector('#inventoryList')){document.querySelectorAll('#inventoryList .inv-thumb').forEach(x=>{const id=x.dataset.photoFor,p=productById(id),u=p&&window.zipperProductPhotos.url(p);if(u)x.innerHTML='<img src="'+e(u)+'" alt="">'})}}catch(_){}});
  // La lista se vuelve a dibujar desde varios lugares (buscar, categoría, stock): se ponen las fotos cada vez.
  function watchList(){const list=$('inventoryList');if(!list||list.__photoObs)return;let busy=false;const obs=new MutationObserver(()=>{if(busy)return;busy=true;try{decorateList()}catch(_){}busy=false});obs.observe(list,{childList:true});list.__photoObs=true}
  function start(){mountForm();wrapForm();watchList();fillForm(null);try{renderInventory()}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});else setTimeout(start,0);
})();
