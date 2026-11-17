// Catálogo para clientes (catalogo.html): se maneja desde la app del dueño.
// - Precios y ofertas: salen de tu inventario. Después de la primera publicación,
//   cada cambio de precio u oferta en la app se publica solo (unos segundos después).
// - Fotos: se cambian, quitan o vuelven a la original desde "Editar catálogo".
// - Productos: puedes agregar productos de tu app al catálogo o dejar de mostrar alguno.
(function(){
  const URL_CAT='https://moralespablo8170-creator.github.io/La-app-de-gpt/catalogo.html';
  const LINKS='zipperCatalogoEnlaces';
  const PERS=['display','caja','unidad','bolsa','pack','manga','rollo','tira','sachet','paquete'];
  const $=id=>document.getElementById(id);
  const n=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/bigtime/g,'big time').replace(/rocklet\b/g,'rocklets');
  const slug=v=>n(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
  const STOP=new Set(['de','con','x','y','el','la','por','display','unidad','unidades','gr','g','und','caja','bolsa']);
  const stem=t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t;
  const list=s=>n(s).split(/[^a-z0-9]+/).filter(t=>t&&!STOP.has(t)).map(stem);
  const tokens=s=>new Set(list(s));
  // Parecido entre nombres: palabras en común; exige al menos una palabra "real" en común
  // (no solo números como 10 mg) y premia que empiecen igual (OCB con boquilla ≠ Boquilla OCB).
  let score=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let i=0,real=false;A.forEach(t=>{if(B.has(t)){i++;if(/[a-z]{3,}/.test(t)&&t!=='mg')real=true}});if(!real)return 0;return i/(A.size+B.size-i)+(list(a)[0]===list(b)[0]?.2:0)};
  const squash=s=>n(s).replace(/[^a-z0-9]/g,'');
  const score0=score;
  score=(a,b)=>{const x=squash(a),y=squash(b);if(x.length>=5&&y.length>=5&&(x===y||y.startsWith(x)||x.startsWith(y)))return Math.max(1,score0(a,b));return score0(a,b)};
  const priceOk=(cat,app)=>app>0&&app/cat>.8&&app/cat<1.25;
  // Unidades que trae la caja/display del catálogo: campo units o el primer número del formato ("Caja x 24", "60 unidades").
  const unitsOf=it=>Number(it.units)>1?Number(it.units):(()=>{const m=String(it.fmt||'').match(/(\d+)/);const u=m?Number(m[1]):0;return u>1&&u<=500?u:0})();
  // El catálogo vende la caja y tu app vende por unidad (RAW: $1.000 c/u, caja de 24 a $24.000).
  const boxMatch=(it,p)=>{const u=unitsOf(it),pr=Number(p.price);return u>1&&pr>0&&!priceOk(it.price,pr)&&it.price/(pr*u)>.7&&it.price/(pr*u)<1.2};
  const fmt=v=>typeof money==='function'?money(v):'$'+Math.round(v).toLocaleString('es-CL');
  const escH=v=>typeof esc==='function'?esc(v):String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const cloud=()=>localStorage.getItem('zipperStorageMode')==='cloud'&&typeof window.zipperFirebaseCloud?.publishCatalog==='function';
  let base=null,published=null,rows=null,extra=[],photos={},photoCache={},sections=[];

  function products(){return (typeof getProducts==='function'?getProducts():[]).filter(p=>p.active!==false)}
  function label(p){return p.name+(p.color&&!n(p.name).includes(n(p.color))?' ('+p.color+')':'')}
  function autoLinks(items,ps,fixed){
    const taken=new Set(Object.values(fixed).map(String)),out={},pairs=[];
    items.forEach(it=>{if(it.key in fixed)return;ps.forEach(p=>{if(!priceOk(it.price,Number(p.price))&&!boxMatch(it,p))return;const s=score(it.name,label(p)+' '+(p.flavor||''));if(s>=.5)pairs.push([s,it.key,p])})});
    pairs.sort((a,b)=>b[0]-a[0]);
    const shareable=p=>p.variantKey==='tabaco-bristol';
    pairs.forEach(([s,k,p])=>{if(out[k]||(taken.has(String(p.id))&&!shareable(p)))return;out[k]=p;taken.add(String(p.id))});
    return out;
  }
  async function loadBase(){if(base)return base;const r=await fetch('catalogo/catalogo.json',{cache:'no-cache'});base=await r.json();return base}
  async function loadPublished(){try{if(cloud()&&window.zipperFirebaseCloud.readPublishedCatalog)published=await window.zipperFirebaseCloud.readPublishedCatalog()}catch(_){}return published}

  // Arma la lista completa (catálogo base + productos agregados) enlazada con el inventario.
  function build(){
    const saved={...(published?.links||{}),...(read(LINKS)||{})};
    const ps=products(),byId=new Map(ps.map(p=>[String(p.id),p]));
    extra=(published?.extra||[]).filter(x=>x&&x.key&&x.name);
    photos={...(published?.photos||{})};
    sections=base.sections.map(s=>s.title);
    const all=base.sections.flatMap(sec=>sec.items),fixed={};
    all.forEach(it=>{const l=saved[it.key];if(l==='none'||(l&&byId.has(String(l))))fixed[it.key]=l});
    const auto=autoLinks(all,ps,Object.fromEntries(Object.entries(fixed).filter(([,v])=>v!=='none')));
    rows=[];
    base.sections.forEach(sec=>{
      sec.items.forEach(it=>{
        const link=fixed[it.key];
        const p=link==='none'?null:link?byId.get(String(link)):(auto[it.key]||null);
        const pub=published?.items?.[it.key];
        const row={it,sec:sec.title,p,none:link==='none',hidden:!!pub?.userHidden||(!!pub?.hidden&&!pub?.autoHidden),manual:pub?.manual?pub.price:null,modeSet:!!pub?.mode,boxUnits:Number(pub?.box?.units)||unitsOf(it),boxManual:pub?.box?.manual?Number(pub.box.price):null};
        row.mode=pub?.mode||(p&&boxMatch(it,p)?'dual':'single');
        rows.push(row);
      });
      extra.filter(x=>x.section===sec.title).forEach(x=>rows.push(extraRow(x,byId)));
    });
    extra.filter(x=>!sections.includes(x.section)).forEach(x=>rows.push(extraRow(x,byId)));
  }
  function extraRow(x,byId){const p=byId.get(String(x.productId))||null;const pub=published?.items?.[x.key];return {it:{key:x.key,name:x.name,fmt:x.fmt||'',per:x.per||'unidad',price:p?Number(p.price):Number(pub?.price||0)},sec:x.section||'Otros productos',p,extra:true,hidden:!!pub?.userHidden,manual:pub?.manual?pub.price:null}}
  // Precio de la caja: el que pusiste a mano, o la oferta de tu producto para esa cantidad, o unidad × cantidad.
  function boxPrice(r){if(r.boxManual!=null)return r.boxManual;const u=r.boxUnits,unit=rowPrice(r);const promo=r.p&&Array.isArray(r.p.promotions)?r.p.promotions.filter(x=>Number(x.minQty)>1&&Number(x.minQty)<=u&&Number(x.price)>0).sort((a,b)=>b.minQty-a.minQty)[0]:null;return Math.round((promo?Math.min(unit,Number(promo.price)):unit)*u)}
  function rowPrice(r){return r.manual!=null?r.manual:r.p&&Number(r.p.price)>0?Number(r.p.price):r.it.price}
  function payload(){
    const hideNoStock=!!(read('zipperCatalogoOcultarSinStock')??published?.settings?.hideNoStock);
    const items={},links={};
    rows.forEach(r=>{
      const x={price:rowPrice(r)};
      if(r.manual!=null)x.manual=true;
      const promo=r.p&&Array.isArray(r.p.promotions)&&r.p.promotions.find(p=>Number(p.minQty)>1&&Number(p.price)>0&&Number(p.price)<x.price);
      if(promo)x.promo={min:Number(promo.minQty),price:Number(promo.price)};else if(r.p)x.promo=null;
      if(r.hidden){x.hidden=true;x.userHidden=true}
      else if(hideNoStock&&r.p&&Number(r.p.stock)<=0){x.hidden=true;x.autoHidden=true}
      if(r.mode==='dual'&&r.boxUnits>1){x.mode='dual';x.box={units:r.boxUnits,price:boxPrice(r)};if(r.boxManual!=null)x.box.manual=true}
      else if(r.modeSet||r.mode==='single'&&r.p&&unitsOf(r.it)>1)x.mode='single';
      items[r.it.key]=x;
      if(!r.extra)links[r.it.key]=r.p?String(r.p.id):(r.none?'none':undefined);
    });
    return {version:2,items,links,extra,photos,settings:{hideNoStock}};
  }
  const same=(a,b)=>JSON.stringify({i:a.items,e:a.extra,p:a.photos,s:a.settings})===JSON.stringify({i:b?.items,e:b?.extra,p:b?.photos,s:b?.settings});
  async function send(data){
    const full={...data,updatedAt:new Date().toISOString()};
    await window.zipperFirebaseCloud.publishCatalog(full);
    published=full;
    try{localStorage.setItem(LINKS,JSON.stringify(data.links))}catch(_){}
  }

  // ---- Publicación automática: cuando cambian tus productos (precio, oferta, stock) ----
  let autoTimer=null,autoBusy=false,lastProducts=null;
  function scheduleAuto(delay){clearTimeout(autoTimer);autoTimer=setTimeout(autoPublish,delay||6000)}
  async function autoPublish(){
    if(autoBusy||!cloud()||!$('catalogAdmin')?.classList.contains('hidden'))return; // si el editor está abierto, publica el dueño
    autoBusy=true;
    try{
      await loadBase();await loadPublished();
      if(!published)return; // la primera vez se revisa y publica a mano
      build();const data=payload();
      if(!same(data,published)){await send(data);paintCardStatus('✅ Precios del catálogo actualizados automáticamente')}
    }catch(e){console.warn('Catálogo: publicación automática',e)}
    finally{autoBusy=false}
  }
  // Revisa cada pocos segundos si cambiaron tus productos (precio, oferta, stock).
  // IMPORTANTE: no reemplazar localStorage.setItem aquí: eso desconectaba la sincronización con Firebase.
  function watchProducts(){
    lastProducts=localStorage.getItem('zipperProductos');
    setInterval(()=>{const v=localStorage.getItem('zipperProductos');if(v!==lastProducts){lastProducts=v;scheduleAuto()}},5000);
    setTimeout(()=>scheduleAuto(1000),15000); // al abrir la app también revisa
  }
  function paintCardStatus(t){const el=$('catalogCardStatus');if(el)el.textContent=t}

  // ---- Fotos ----
  function resizePhoto(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const S=420,c=document.createElement('canvas');c.width=S;c.height=S;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,S,S);const k=Math.min((S*.94)/img.width,(S*.94)/img.height),w=img.width*k,h=img.height*k;g.drawImage(img,(S-w)/2,(S-h)/2,w,h);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.82))};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudo leer la imagen'))};img.src=url})}
  function photoSrc(r){const ph=photos[r.it.key];if(ph==='none')return '';if(ph)return photoCache[r.it.key]||'';return r.it.img||''}
  async function loadCustomPhotos(){
    const keys=Object.entries(photos).filter(([k,v])=>v&&v!=='none'&&!photoCache[k]).map(([k])=>k);
    await Promise.all(keys.map(async k=>{try{const d=await window.zipperFirebaseCloud.readCatalogPhoto(k);if(d){photoCache[k]=d;document.querySelectorAll('[data-photo="'+CSS.escape(k)+'"]').forEach(img=>{img.src=d;img.style.visibility=''})}}catch(_){}}));
  }
  function photoMenu(r){
    const m=document.createElement('div');m.className='zipper-modal';m.style.zIndex='20001';
    const hasCustom=photos[r.it.key]&&photos[r.it.key]!=='none',hasOriginal=!!r.it.img;
    m.innerHTML='<div class="zipper-modal-panel"><h2>Foto · '+escH(r.it.name)+'</h2><div class="actions"><button class="primary" data-a="new" type="button">📷 Elegir foto nueva</button>'+(photos[r.it.key]!=='none'?'<button class="danger" data-a="none" type="button">🗑 Quitar foto</button>':'')+((hasCustom||photos[r.it.key]==='none')&&hasOriginal?'<button class="secondary" data-a="orig" type="button">↺ Volver a la foto original</button>':'')+'<button class="secondary" data-a="close" type="button">Cancelar</button></div><p class="status" aria-live="polite"></p></div>';
    document.body.appendChild(m);
    const st=m.querySelector('.status'),close=()=>m.remove();
    m.onclick=async e=>{
      const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;
      if(a==='close')return close();
      if(!cloud()){st.textContent='Conecta tu cuenta de Firebase para guardar fotos.';return}
      try{
        if(a==='new'){
          const input=document.createElement('input');input.type='file';input.accept='image/*';
          input.onchange=async()=>{const f=input.files&&input.files[0];if(!f)return;st.textContent='Guardando foto…';try{const data=await resizePhoto(f);await window.zipperFirebaseCloud.publishCatalogPhoto(r.it.key,data);photoCache[r.it.key]=data;photos[r.it.key]=Date.now();await send(payload());close();repaint();toast('✅ Foto guardada. Los clientes ya la ven.')}catch(err){st.textContent='No se pudo guardar: '+(err.message||err)}};
          input.click();return;
        }
        st.textContent='Guardando…';
        if(hasCustom){try{await window.zipperFirebaseCloud.deleteCatalogPhoto(r.it.key)}catch(_){}}
        delete photoCache[r.it.key];
        if(a==='none')photos[r.it.key]='none';else delete photos[r.it.key];
        await send(payload());close();repaint();toast(a==='none'?'Foto quitada.':'Se volvió a la foto original.');
      }catch(err){st.textContent='No se pudo guardar: '+(err.message||err)}
    };
  }
  function toast(t){const el=$('catalogAdminStatus');if(el)el.textContent=t}

  // ---- Editor ----
  // Todo se guarda solo: cada cambio (enlace, precio, mostrar/ocultar, fotos, productos agregados)
  // se publica a los pocos segundos. No hace falta tocar ningún botón para guardar.
  let saveTimer=null;
  function saveSoon(msg){
    if(!cloud()){toast('⚠ Tu app no está conectada a Firebase: este cambio NO se guarda. Conéctala en Herramientas → Conectar cuenta Firebase.');return}
    toast(msg||'Guardando…');clearTimeout(saveTimer);
    saveTimer=setTimeout(async()=>{try{await send(payload());toast('✅ Guardado. Los clientes ya lo ven.')}catch(e){toast('⚠ No se pudo guardar: '+(e.message||e))}},1200);
  }
  async function open(){
    const modal=$('catalogAdmin');modal.classList.remove('hidden');
    $('catalogAdminBody').innerHTML='<p class="muted">Cargando catálogo…</p>';toast('');
    try{await loadBase()}catch(e){$('catalogAdminBody').innerHTML='<p class="status">No se pudo cargar el catálogo. Revisa tu conexión.</p>';return}
    await loadPublished();build();paint();
    if(!cloud())toast('⚠ Tu app no está conectada a Firebase: puedes mirar, pero los cambios no se guardan.');
    else{loadCustomPhotos();if(!published)saveSoon('Publicando el catálogo por primera vez…')}
  }
  function panel(){return $('catalogAdmin').querySelector('.catalog-admin-panel')}
  function repaint(){const y=panel().scrollTop;paint();panel().scrollTop=y;loadCustomPhotos()}
  // Cambia el precio en TUS PRODUCTOS (un solo precio para app, vendedores y catálogo).
  function setAppPrice(p,v){
    if(typeof getRawProducts!=='function'||typeof writeArray!=='function')return false;
    const ps=getRawProducts(),raw=ps.find(x=>String(x.id)===String(p.baseProductId||p.id));if(!raw)return false;
    raw.price=v;if(!writeArray('zipperProductos',ps))return false;
    p.price=v;try{if(typeof renderInventory==='function')renderInventory()}catch(_){}
    return true;
  }
  // Ventana para elegir con qué producto de tu inventario corresponde un producto del catálogo.
  function pickProduct(r,done){
    const ps=products().map(p=>({p,s:score(r.it.name,label(p)+' '+(p.flavor||''))})).sort((a,b)=>{const d=x=>Math.abs(Math.log((Number(x.p.price)||1)/(r.it.price||1)));return (b.s>0)-(a.s>0)||b.s-a.s||d(a)-d(b)});
    const m=document.createElement('div');m.className='zipper-modal';m.style.zIndex='20001';
    m.innerHTML='<div class="zipper-modal-panel cat-pick"><h2>¿Cuál de tus productos es?</h2><p class="muted">Catálogo: <b>'+escH(r.it.name)+'</b> · '+escH(r.it.fmt)+' · '+fmt(r.it.price)+'</p><input class="cat-pick-q" type="search" placeholder="🔍 Buscar en tus productos…"><div class="cat-pick-list"></div><div class="actions"><button class="secondary" data-none type="button">No está en mi inventario</button><button class="secondary" data-close type="button">Cancelar</button></div></div>';
    document.body.appendChild(m);
    const listEl=m.querySelector('.cat-pick-list'),q=m.querySelector('.cat-pick-q');
    const draw=()=>{const t=n(q.value.trim());listEl.innerHTML=ps.filter(x=>!t||n(label(x.p)).includes(t)).slice(0,60).map((x,i)=>'<button type="button" class="cat-pick-item'+(r.p&&String(r.p.id)===String(x.p.id)?' on':'')+'" data-id="'+escH(String(x.p.id))+'"><b>'+escH(label(x.p))+'</b><span>'+fmt(Number(x.p.price))+' · stock '+Number(x.p.stock||0)+'</span></button>').join('')||'<p class="muted">No hay productos con ese nombre.</p>'};
    draw();q.oninput=draw;
    m.onclick=e=>{
      if(e.target===m||e.target.closest('[data-close]'))return m.remove();
      if(e.target.closest('[data-none]')){m.remove();done(null);return}
      const b=e.target.closest('.cat-pick-item');if(b){const p=ps.find(x=>String(x.p.id)===b.dataset.id)?.p;m.remove();if(p)done(p)}
    };
  }
  function paint(){
    const ps=products(),linkedIds=new Set(rows.filter(r=>r.p).map(r=>String(r.p.id)));
    const linked=rows.filter(r=>r.p).length,noStock=rows.filter(r=>r.p&&Number(r.p.stock)<=0).length;
    const free=ps.filter(p=>!linkedIds.has(String(p.id)));
    let html='<datalist id="catalogFreeNames">'+free.map(p=>'<option value="'+escH(label(p))+'">').join('')+'</datalist>'+
      '<div class="cat-help"><b>Cómo funciona</b><br>• Los cambios se guardan solos.<br>• <b>📷 Foto:</b> toca el botón "Cambiar foto" de cada producto.<br>• <b>🔗 Enlazar</b> = decirle a la app qué producto de tu inventario es. Así el precio sale de tus productos y se actualiza solo. Los que están en amarillo no tienen enlace: toca "Enlazar" y elige el producto.<br>• Si cambias el precio aquí, también se cambia en tus productos.</div>'+
      '<p class="muted">'+linked+' de '+rows.length+' productos enlazados.</p>'+
      '<details class="cat-add"><summary>➕ Agregar un producto de tu app al catálogo</summary><label>Producto<input id="catAddProduct" list="catalogFreeNames" placeholder="Busca en tu inventario…"></label><label>Sección<select id="catAddSection">'+sections.concat(['Otros productos']).map(s=>'<option>'+escH(s)+'</option>').join('')+'</select></label><label>Formato (lo que lee el cliente)<input id="catAddFmt" placeholder="Ej: Display x 24"></label><label>Precio por<select id="catAddPer">'+PERS.map(p=>'<option>'+p+'</option>').join('')+'</select></label><button id="catAddBtn" class="primary" type="button">Agregar al catálogo</button></details>'+
      '<label class="check-row"><input id="catalogHideNoStock" type="checkbox"'+(payload().settings.hideNoStock?' checked':'')+'> No mostrar a los clientes los productos sin stock'+(noStock?' ('+noStock+')':'')+'</label>'+
      '<label class="check-row"><input id="catalogOnlyUnlinked" type="checkbox"> Ver solo los que faltan por enlazar ('+(rows.length-linked)+')</label>'+
      '<label class="search-field">🔍 Buscar<input id="catalogAdminSearch" type="search" placeholder="Producto…"></label><div id="catalogAdminRows">';
    let last='';
    rows.forEach((r,i)=>{
      if(r.sec!==last){html+='<h3 class="cat-sec">'+escH(r.sec)+'</h3>';last=r.sec}
      const price=rowPrice(r),src=photoSrc(r),custom=photos[r.it.key]&&photos[r.it.key]!=='none';
      html+='<div class="cat-row'+(r.p?'':' cat-unlinked')+(r.hidden?' cat-hidden':'')+'" data-i="'+i+'" data-q="'+escH(n(r.it.name+' '+r.sec))+'">'+
        '<div class="cat-top"><div class="cat-photo">'+(src||custom?'<img data-photo="'+escH(r.it.key)+'" src="'+escH(src)+'" alt="" draggable="false"'+(src?'':' style="visibility:hidden"')+'>':'<span>Sin foto</span>')+'</div>'+
        '<div class="cat-main"><strong>'+escH(r.it.name)+(r.extra?' <em class="cat-new">agregado</em>':'')+'</strong><small>'+escH(r.it.fmt)+'</small><button class="cat-photo-btn" type="button">📷 Cambiar foto</button></div></div>'+
        (r.extra?'<div class="cat-linkline"><span>🔗 '+escH(r.p?label(r.p):'producto borrado de la app')+'</span><button class="cat-remove" type="button">Quitar del catálogo</button></div>':
         '<button class="cat-linkbtn'+(r.p?'':' warn')+'" type="button">'+(r.p?'🔗 '+escH(label(r.p))+' · stock '+Number(r.p.stock||0)+' <u>cambiar</u>':'⚠ Sin enlazar · toca para elegir tu producto')+'</button>')+
        (r.p&&!r.extra&&r.mode!=='dual'&&!priceOk(r.it.price,Number(r.p.price))?'<small class="cat-diff">⚠ El precio de tu producto ('+fmt(Number(r.p.price))+') es muy distinto al del catálogo ('+fmt(r.it.price)+'). ¿Lo vendes por unidad? Revisa el enlace.</small>':'')+
        (r.p&&!r.extra?'<div class="cat-mode"><select class="cat-modesel"><option value="single"'+(r.mode!=='dual'?' selected':'')+'>Se vende por '+escH(r.it.per)+' ('+escH(r.it.fmt)+')</option><option value="dual"'+(r.mode==='dual'?' selected':'')+'>Se vende por unidad y por caja</option></select>'+
          (r.mode==='dual'?'<div class="cat-boxline">📦 Caja de <input class="cat-boxu" inputmode="numeric" value="'+r.boxUnits+'"> und a $<input class="cat-boxp" inputmode="numeric" value="'+boxPrice(r)+'">'+(r.boxManual!=null?' <small class="cat-diff">fijado a mano</small>':' <small>(calculado)</small>')+'</div>':'')+'</div>':'')+
        '<div class="cat-bottom"><label>'+(r.mode==='dual'?'Precio unidad $':'Precio $')+'<input class="cat-price" inputmode="numeric" value="'+price+'"></label><label class="cat-vis"><input class="cat-hide" type="checkbox"'+(r.hidden?' checked':'')+'> No mostrar</label></div></div>';
    });
    html+='</div>';
    $('catalogAdminBody').innerHTML=html;
    const box=$('catalogAdminRows');
    const filter=()=>{const q=n($('catalogAdminSearch').value.trim()),only=$('catalogOnlyUnlinked').checked;box.querySelectorAll('.cat-row').forEach(x=>x.style.display=(!q||x.dataset.q.includes(q))&&(!only||x.classList.contains('cat-unlinked'))?'':'none')};
    $('catalogAdminSearch').oninput=filter;$('catalogOnlyUnlinked').onchange=filter;
    $('catalogHideNoStock').onchange=e=>{try{localStorage.setItem('zipperCatalogoOcultarSinStock',e.target.checked?'true':'false')}catch(_){}saveSoon()};
    $('catAddProduct').onchange=e=>{const p=products().find(x=>n(label(x))===n(e.target.value)||n(x.name)===n(e.target.value));if(p&&!$('catAddFmt').value)$('catAddFmt').value=p.buyUnit&&p.buyUnit!=='unidad'&&p.buyPack>1?(p.buyUnit[0].toUpperCase()+p.buyUnit.slice(1))+' x '+p.buyPack:''};
    $('catAddBtn').onclick=()=>{
      const v=$('catAddProduct').value.trim(),p=products().find(x=>n(label(x))===n(v)||n(x.name)===n(v));
      if(!p){alert('Elige un producto de tu inventario de la lista.');return}
      let key='x-'+slug(p.name);while(rows.some(r=>r.it.key===key))key+='-2';
      const x={key,name:p.name,fmt:$('catAddFmt').value.trim(),per:$('catAddPer').value,section:$('catAddSection').value,productId:String(p.id)};
      extra.push(x);rows.push(extraRow(x,new Map([[String(p.id),p]])));
      rows.sort((a,b)=>{const ia=sections.indexOf(a.sec),ib=sections.indexOf(b.sec);return (ia<0?999:ia)-(ib<0?999:ib)});
      repaint();saveSoon('Agregado: '+p.name+'. Guardando…');
    };
    box.addEventListener('click',e=>{
      const row=e.target.closest('.cat-row');if(!row)return;const r=rows[Number(row.dataset.i)];
      if(e.target.closest('.cat-photo-btn')||e.target.closest('.cat-photo'))photoMenu(r);
      else if(e.target.closest('.cat-linkbtn'))pickProduct(r,p=>{r.p=p;r.none=!p;r.manual=null;repaint();saveSoon(p?'Enlazado con '+label(p)+'. Guardando…':'Quedó sin enlazar. Guardando…')});
      else if(e.target.closest('.cat-remove')){if(!confirm('¿Quitar "'+r.it.name+'" del catálogo?'))return;extra=extra.filter(x=>x.key!==r.it.key);rows=rows.filter(x=>x!==r);delete photos[r.it.key];repaint();saveSoon()}
    });
    box.addEventListener('change',e=>{
      const row=e.target.closest('.cat-row');if(!row)return;const r=rows[Number(row.dataset.i)];
      if(e.target.classList.contains('cat-modesel')){r.mode=e.target.value;r.modeSet=true;if(r.mode==='dual'&&!(r.boxUnits>1))r.boxUnits=unitsOf(r.it)||12;repaint();saveSoon(r.mode==='dual'?'Ahora se ofrece por unidad y por caja. Guardando…':'Se ofrece solo por '+r.it.per+'. Guardando…');return}
      if(e.target.classList.contains('cat-boxu')){const u=Math.round(Number(String(e.target.value).replace(/\D/g,'')));if(!(u>1)){e.target.value=r.boxUnits;return}r.boxUnits=u;repaint();saveSoon('Caja de '+u+' unidades. Guardando…');return}
      if(e.target.classList.contains('cat-boxp')){const v=Math.round(Number(String(e.target.value).replace(/\D/g,'')));if(!(v>0)){e.target.value=boxPrice(r);return}const calc=(()=>{const keep=r.boxManual;r.boxManual=null;const c=boxPrice(r);r.boxManual=keep;return c})();r.boxManual=v===calc?null:v;repaint();saveSoon('Precio de la caja: '+fmt(v)+'. Guardando…');return}
      if(e.target.classList.contains('cat-price')){
        const v=Math.round(Number(String(e.target.value).replace(/\D/g,'')));
        if(!(v>0)){e.target.value=rowPrice(r);return}
        if(r.p){
          if(Number(r.p.price)!==v){if(!confirm('¿Cambiar el precio de "'+label(r.p)+'" a '+fmt(v)+'?\n\nSe cambia también en tus productos (ventas y vendedores).')){e.target.value=rowPrice(r);return}
            if(!setAppPrice(r.p,v)){alert('No se pudo cambiar el precio en tus productos.');e.target.value=rowPrice(r);return}}
          r.manual=null;saveSoon('Precio cambiado a '+fmt(v)+' (también en tus productos). Guardando…');
        }else{r.manual=v===r.it.price?null:v;saveSoon('Precio cambiado a '+fmt(v)+'. Guardando…')}
      }else if(e.target.classList.contains('cat-hide')){r.hidden=e.target.checked;row.classList.toggle('cat-hidden',r.hidden);saveSoon(r.hidden?'No se mostrará a los clientes. Guardando…':'Se mostrará a los clientes. Guardando…')}
    });
  }
  async function publish(){
    if(!rows)return;
    if(!cloud()){toast('⚠ Para guardar, conecta tu cuenta de Firebase (Herramientas → Conectar cuenta Firebase).');return}
    clearTimeout(saveTimer);toast('Guardando…');
    try{await send(payload());toast('✅ Guardado. Los clientes ya lo ven.');paintCardStatus('')}
    catch(e){toast('⚠ No se pudo guardar: '+(e.message||e))}
  }
  function share(){location.href='https://wa.me/?text='+encodeURIComponent('Hola 👋, este es el catálogo de *Distribuidora Zipper*. Marca los productos que necesitas y envíanos tu pedido por WhatsApp:\n'+URL_CAT)}
  function mount(){
    if($('catalogCard'))return;
    const cloudCard=$('cloudSettingsCard');if(!cloudCard)return;
    const card=document.createElement('section');card.className='card';card.id='catalogCard';
    card.innerHTML='<div class="kicker">CLIENTES</div><h2>📒 Catálogo para clientes</h2><p class="muted">Tus clientes abren el enlace, marcan productos y te envían el pedido por WhatsApp. Los precios y ofertas salen de tus productos y se actualizan solos.</p><div class="actions"><button id="catalogAdminOpen" class="primary" type="button">Editar catálogo (fotos, productos, precios)</button><button id="catalogShare" class="secondary" type="button">Enviar enlace por WhatsApp</button><button id="catalogView" class="secondary" type="button">Ver catálogo</button><button id="catalogPrint" class="secondary" type="button">Catálogo para imprimir (sin precios)</button><button id="catalogPdf" class="secondary" type="button">Catálogo PDF con precios</button></div><p id="catalogCardStatus" class="status" aria-live="polite"></p>';
    cloudCard.parentNode.insertBefore(card,cloudCard.nextSibling);
    const modal=document.createElement('div');modal.id='catalogAdmin';modal.className='zipper-modal hidden';modal.setAttribute('role','dialog');
    modal.innerHTML='<div class="zipper-modal-panel catalog-admin-panel"><h2>📒 Editar catálogo</h2><div id="catalogAdminBody"></div><div class="catalog-admin-actions"><p id="catalogAdminStatus" class="status" aria-live="polite"></p><div class="actions"><button id="catalogAdminClose" class="primary" type="button">Listo</button></div></div></div>';
    document.body.appendChild(modal);
    $('catalogAdminOpen').onclick=open;$('catalogAdminClose').onclick=async()=>{if(saveTimer){clearTimeout(saveTimer);saveTimer=null;if(cloud())try{await send(payload())}catch(_){}}modal.classList.add('hidden');scheduleAuto(1500)};
    $('catalogShare').onclick=share;
    $('catalogView').onclick=()=>window.open('catalogo.html','_blank');
    $('catalogPrint').onclick=()=>window.open('catalogo.html?modo=imprimir','_blank');
    $('catalogPdf').onclick=()=>window.open('catalogo.html?modo=pdf','_blank');
    const css=document.createElement('style');css.textContent='.catalog-admin-panel{max-width:640px!important;max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain}.catalog-admin-actions{position:sticky;bottom:-20px;background:#fff;padding:8px 0 4px;border-top:1px solid #e5e7eb}.catalog-admin-actions .status{margin:0 0 6px}.cat-sec{margin:16px 0 6px;font-size:14px;text-transform:uppercase;color:#102b5c;border-bottom:2px solid #102b5c;padding-bottom:4px}.cat-row{padding:10px 0;border-bottom:1px solid #e5e7eb;display:flex;flex-direction:column;gap:6px}.cat-top{display:flex;gap:10px;align-items:flex-start}.cat-photo{width:72px;height:72px;flex:none;border:1px dashed #94a3b8;border-radius:10px;background:#fff;padding:2px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;text-align:center}.cat-photo img{width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.cat-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.cat-main strong{font-size:15px;line-height:1.2}.cat-main small{color:#64748b;font-size:12.5px}.cat-photo-btn{align-self:flex-start;margin-top:4px;min-height:0!important;padding:6px 10px!important;font-size:13px!important;background:#eef2ff!important;color:#1e3a8a!important;border:1px solid #c7d2fe!important;border-radius:8px!important;width:auto!important}.cat-new{font-style:normal;font-size:11px;background:#dcfce7;color:#166534;border-radius:8px;padding:1px 6px}.cat-linkbtn{width:100%;text-align:left;min-height:0!important;padding:9px 10px!important;font-size:13.5px!important;border-radius:10px!important;background:#f0fdf4!important;color:#14532d!important;border:1px solid #bbf7d0!important;font-weight:600}.cat-linkbtn u{color:#2563eb;font-weight:500}.cat-linkbtn.warn{background:#fffbeb!important;color:#92400e!important;border-color:#f59e0b!important}.cat-linkline{display:flex;gap:8px;align-items:center;font-size:13px;color:#14532d}.cat-linkline span{flex:1}.cat-remove{min-height:0!important;padding:6px 10px!important;font-size:13px!important;width:auto!important}.cat-mode select{width:100%;font-size:13.5px!important;padding:7px!important;min-height:0!important}.cat-boxline{margin-top:6px;font-size:13.5px;display:flex;flex-wrap:wrap;align-items:center;gap:4px}.cat-boxu{width:56px!important}.cat-boxp{width:90px!important}.cat-boxu,.cat-boxp{font-size:15px!important;padding:5px!important;min-height:0!important;font-weight:700}.cat-bottom{display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:13px}.cat-bottom label:first-child{display:flex;align-items:center;gap:6px;font-weight:600}.cat-price{width:110px!important;font-size:16px!important;padding:6px 8px!important;min-height:0!important;font-weight:700}.cat-diff{color:#b45309;font-weight:600;font-size:12px}.cat-hidden{opacity:.45}.cat-vis{display:flex;align-items:center;gap:6px;font-weight:600}.cat-help{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45;color:#1e3a8a;margin-bottom:8px}.cat-pick{max-height:calc(100dvh - 24px);overflow-y:auto}.cat-pick-q{width:100%;margin:6px 0}.cat-pick-list{display:flex;flex-direction:column;gap:6px;margin:6px 0 10px}.cat-pick-item{display:flex!important;flex-direction:column;align-items:flex-start!important;text-align:left;min-height:0!important;padding:9px 10px!important;border:1px solid #e5e7eb!important;border-radius:10px!important;background:#fff!important;color:#111827!important;width:100%}.cat-pick-item span{font-size:12.5px;color:#64748b;font-weight:400}.cat-pick-item.on{border-color:#16a34a!important;background:#f0fdf4!important}.cat-add{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin:10px 0}.cat-add summary{font-weight:700;cursor:pointer}.cat-add label{display:block;margin-top:8px}.cat-add button{margin-top:10px;width:100%}';
    document.head.appendChild(css);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  watchProducts();
  window.zipperCatalogAdmin={open,publish,score,autoPublish};
})();
