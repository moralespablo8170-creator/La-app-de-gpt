// Catálogo para clientes: enlaza cada producto del catálogo con tu inventario,
// revisa precios y los publica. Los clientes ven siempre los precios publicados
// en catalogo.html (y lo pueden pedir por WhatsApp).
(function(){
  const URL_CAT='https://moralespablo8170-creator.github.io/La-app-de-gpt/catalogo.html';
  const LINKS='zipperCatalogoEnlaces';
  const $=id=>document.getElementById(id);
  const n=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/bigtime/g,'big time').replace(/rocklet\b/g,'rocklets');
  const STOP=new Set(['de','con','x','y','el','la','por','display','unidad','unidades','gr','g','und','caja','bolsa']);
  const stem=t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t;
  const list=s=>n(s).split(/[^a-z0-9]+/).filter(t=>t&&!STOP.has(t)).map(stem);
  const tokens=s=>new Set(list(s));
  // Parecido entre nombres: palabras en común; exige al menos una palabra "real" en común
  // (no solo números como 10 mg) y premia que empiecen igual (OCB con boquilla ≠ Boquilla OCB).
  const score=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let i=0,real=false;A.forEach(t=>{if(B.has(t)){i++;if(/[a-z]{3,}/.test(t)&&t!=='mg')real=true}});if(!real)return 0;return i/(A.size+B.size-i)+(list(a)[0]===list(b)[0]?.2:0)};
  const priceOk=(cat,app)=>app>0&&app/cat>.8&&app/cat<1.25;
  const fmt=v=>typeof money==='function'?money(v):'$'+Math.round(v).toLocaleString('es-CL');
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  let base=null,state=null;

  function products(){return (typeof getProducts==='function'?getProducts():[]).filter(p=>p.active!==false)}
  function label(p){return p.name+(p.color&&!n(p.name).includes(n(p.color))?' ('+p.color+')':'')}
  // Enlace automático: se reparte de mayor a menor parecido, cada producto de la app una sola vez,
  // y solo si el precio es parecido (si no, probablemente uno es por unidad y el otro por display).
  function autoLinks(items,ps,fixed){
    const taken=new Set(Object.values(fixed).map(String)),out={},pairs=[];
    items.forEach(it=>{if(it.key in fixed)return;ps.forEach(p=>{if(!priceOk(it.price,Number(p.price)))return;const s=score(it.name,label(p)+' '+(p.flavor||''));if(s>=.5)pairs.push([s,it.key,p])})});
    pairs.sort((a,b)=>b[0]-a[0]);
    const shareable=p=>p.variantKey==='tabaco-bristol';
    pairs.forEach(([s,k,p])=>{if(out[k]||(taken.has(String(p.id))&&!shareable(p)))return;out[k]=p;taken.add(String(p.id))});
    return out;
  }
  async function loadBase(){if(base)return base;const r=await fetch('catalogo/catalogo.json',{cache:'no-cache'});base=await r.json();return base}

  async function open(){
    const modal=$('catalogAdmin');modal.classList.remove('hidden');
    $('catalogAdminBody').innerHTML='<p class="muted">Cargando catálogo…</p>';
    try{await loadBase()}catch(e){$('catalogAdminBody').innerHTML='<p class="status">No se pudo cargar el catálogo. Revisa tu conexión.</p>';return}
    let published=null;
    try{if(localStorage.getItem('zipperStorageMode')==='cloud'&&window.zipperFirebaseCloud?.readPublishedCatalog)published=await window.zipperFirebaseCloud.readPublishedCatalog()}catch(_){}
    const saved=read(LINKS)||published?.links||{};
    const ps=products(),byId=new Map(ps.map(p=>[String(p.id),p]));
    const all=base.sections.flatMap(sec=>sec.items),fixed={};
    all.forEach(it=>{const l=saved[it.key];if(l==='none'||(l&&byId.has(String(l))))fixed[it.key]=l});
    const auto=autoLinks(all,ps,Object.fromEntries(Object.entries(fixed).filter(([,v])=>v!=='none')));
    Object.keys(fixed).forEach(k=>{if(fixed[k]==='none')auto[k]=undefined});
    state=[];
    base.sections.forEach(sec=>sec.items.forEach(it=>{
      const link=fixed[it.key];
      const p=link==='none'?null:link?byId.get(String(link)):(auto[it.key]||null);
      const pub=published?.items?.[it.key];
      state.push({it,sec:sec.title,p,none:link==='none',hidden:!!pub?.hidden,manual:pub?.manual?pub.price:null});
    }));
    paint();
  }
  function rowPrice(r){return r.manual!=null?r.manual:r.p&&Number(r.p.price)>0?Number(r.p.price):r.it.price}
  function paint(){
    const ps=products();
    const linked=state.filter(r=>r.p).length,diff=state.filter(r=>r.p&&Number(r.p.price)>0&&Number(r.p.price)!==r.it.price&&r.manual==null).length,noStock=state.filter(r=>r.p&&Number(r.p.stock)<=0).length;
    let html='<datalist id="catalogProductNames">'+ps.map(p=>'<option value="'+esc(label(p))+'">').join('')+'</datalist>'+
      '<p class="muted">'+linked+' de '+state.length+' productos enlazados con tu inventario. El precio que publicas es el de tu app; si un producto no está enlazado se usa el precio del catálogo.'+(diff?' <b>'+diff+(diff===1?' cambia':' cambian')+' de precio.</b>':'')+'</p>'+
      '<label class="check-row"><input id="catalogHideNoStock" type="checkbox"'+(read('zipperCatalogoOcultarSinStock')?' checked':'')+'> Ocultar a los clientes los productos sin stock'+(noStock?' ('+noStock+')':'')+'</label>'+
      '<label class="check-row"><input id="catalogOnlyUnlinked" type="checkbox"> Ver solo los que faltan por enlazar ('+(state.length-linked)+')</label>'+'<label class="search-field">🔍 Buscar<input id="catalogAdminSearch" type="search" placeholder="Producto…"></label><div id="catalogAdminRows">';
    let last='';
    state.forEach((r,i)=>{
      if(r.sec!==last){html+='<h3 class="cat-sec">'+esc(r.sec)+'</h3>';last=r.sec}
      const appPrice=r.p?Number(r.p.price):0,price=rowPrice(r),changed=price!==r.it.price;
      html+='<div class="cat-row'+(r.p?'':' cat-unlinked')+(r.hidden?' cat-hidden':'')+'" data-i="'+i+'" data-q="'+esc(n(r.it.name+' '+r.sec))+'">'+
        '<img src="'+esc(r.it.img||'')+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'+
        '<div class="cat-main"><strong>'+esc(r.it.name)+'</strong><small>'+esc(r.it.fmt)+'</small>'+
        '<input class="cat-link" list="catalogProductNames" placeholder="Enlazar con producto de la app…" value="'+esc(r.p?label(r.p):'')+'">'+
        '<small class="cat-info">'+(r.p?'App: '+fmt(appPrice)+' · stock '+Number(r.p.stock||0)+(priceOk(r.it.price,appPrice)?'':' · <b class="cat-diff">⚠ precio muy distinto: ¿la app vende por unidad?</b>'):'Sin enlazar · se publica con precio del catálogo')+'</small></div>'+
        '<div class="cat-side"><label>Precio<input class="cat-price" inputmode="numeric" value="'+price+'"></label>'+(changed?'<small class="cat-diff">antes '+fmt(r.it.price)+'</small>':'')+
        '<label class="cat-vis"><input class="cat-hide" type="checkbox"'+(r.hidden?' checked':'')+'> Ocultar</label></div></div>';
    });
    html+='</div>';
    $('catalogAdminBody').innerHTML=html;
    const rows=$('catalogAdminRows');
    const filter=()=>{const q=n($('catalogAdminSearch').value.trim()),only=$('catalogOnlyUnlinked').checked;rows.querySelectorAll('.cat-row').forEach(x=>x.style.display=(!q||x.dataset.q.includes(q))&&(!only||x.classList.contains('cat-unlinked'))?'':'none')};
    $('catalogAdminSearch').oninput=filter;$('catalogOnlyUnlinked').onchange=filter;
    $('catalogHideNoStock').onchange=e=>{try{localStorage.setItem('zipperCatalogoOcultarSinStock',e.target.checked?'true':'false')}catch(_){}};
    rows.addEventListener('change',e=>{
      const row=e.target.closest('.cat-row');if(!row)return;const r=state[Number(row.dataset.i)];
      if(e.target.classList.contains('cat-link')){
        const v=e.target.value.trim();
        if(!v){r.p=null;r.none=true;r.manual=null}else{const p=products().find(x=>n(label(x))===n(v)||n(x.name)===n(v));if(!p){alert('No encontré ese producto en tu inventario. Elige uno de la lista.');e.target.value=r.p?label(r.p):'';return}r.p=p;r.none=false;r.manual=null}
        const y=window.scrollY;paint();window.scrollTo(0,y);
      }else if(e.target.classList.contains('cat-price')){
        const v=Math.round(Number(String(e.target.value).replace(/\D/g,'')));
        if(!(v>0)){e.target.value=rowPrice(r);return}
        r.manual=(r.p&&Number(r.p.price)===v)||(!r.p&&v===r.it.price)?null:v;
      }else if(e.target.classList.contains('cat-hide')){r.hidden=e.target.checked;row.classList.toggle('cat-hidden',r.hidden)}
    });
  }
  async function publish(){
    if(!state)return;
    const st=$('catalogAdminStatus');
    if(localStorage.getItem('zipperStorageMode')!=='cloud'||!window.zipperFirebaseCloud?.publishCatalog){st.textContent='Para publicar, conecta tu cuenta de Firebase (Herramientas → Conectar cuenta Firebase).';return}
    const hideNoStock=!!read('zipperCatalogoOcultarSinStock');
    const items={},links={};
    state.forEach(r=>{
      const x={price:rowPrice(r)};
      if(r.manual!=null)x.manual=true;
      const promo=r.p&&Array.isArray(r.p.promotions)&&r.p.promotions.find(p=>Number(p.minQty)>1&&Number(p.price)>0&&Number(p.price)<x.price);
      if(promo)x.promo={min:Number(promo.minQty),price:Number(promo.price)};else if(r.p)x.promo=null;
      if(r.hidden||(hideNoStock&&r.p&&Number(r.p.stock)<=0))x.hidden=true;
      items[r.it.key]=x;
      links[r.it.key]=r.p?String(r.p.id):(r.none?'none':undefined);
    });
    try{localStorage.setItem(LINKS,JSON.stringify(links))}catch(_){}
    st.textContent='Publicando…';$('catalogAdminPublish').disabled=true;
    try{await window.zipperFirebaseCloud.publishCatalog({version:1,updatedAt:new Date().toISOString(),items,links});st.textContent='✅ Catálogo publicado. Los clientes ya ven estos precios.'}
    catch(e){st.textContent='No se pudo publicar: '+(e.message||e)}
    finally{$('catalogAdminPublish').disabled=false}
  }
  function share(){location.href='https://wa.me/?text='+encodeURIComponent('Hola 👋, este es el catálogo de *Distribuidora Zipper*. Marca los productos que necesitas y envíanos tu pedido por WhatsApp:\n'+URL_CAT)}
  function mount(){
    if($('catalogCard'))return;
    const cloud=$('cloudSettingsCard');if(!cloud)return;
    const card=document.createElement('section');card.className='card';card.id='catalogCard';
    card.innerHTML='<div class="kicker">CLIENTES</div><h2>📒 Catálogo para clientes</h2><p class="muted">Tus clientes abren el enlace, marcan productos y te envían el pedido por WhatsApp. Los precios salen de tu inventario cuando publicas.</p><div class="actions"><button id="catalogAdminOpen" class="primary" type="button">Revisar y publicar precios</button><button id="catalogShare" class="secondary" type="button">Enviar enlace por WhatsApp</button><button id="catalogView" class="secondary" type="button">Ver catálogo</button><button id="catalogPrint" class="secondary" type="button">Catálogo para imprimir (sin precios)</button><button id="catalogPdf" class="secondary" type="button">Catálogo PDF con precios</button></div>';
    cloud.parentNode.insertBefore(card,cloud.nextSibling);
    const modal=document.createElement('div');modal.id='catalogAdmin';modal.className='zipper-modal hidden';modal.setAttribute('role','dialog');
    modal.innerHTML='<div class="zipper-modal-panel catalog-admin-panel"><h2>📒 Precios del catálogo</h2><div id="catalogAdminBody"></div><p id="catalogAdminStatus" class="status" aria-live="polite"></p><div class="actions catalog-admin-actions"><button id="catalogAdminPublish" class="primary" type="button">Publicar catálogo</button><button id="catalogAdminClose" class="secondary" type="button">Cerrar</button></div></div>';
    document.body.appendChild(modal);
    $('catalogAdminOpen').onclick=open;$('catalogAdminClose').onclick=()=>modal.classList.add('hidden');$('catalogAdminPublish').onclick=publish;
    $('catalogShare').onclick=share;
    $('catalogView').onclick=()=>window.open('catalogo.html','_blank');
    $('catalogPrint').onclick=()=>window.open('catalogo.html?modo=imprimir','_blank');
    $('catalogPdf').onclick=()=>window.open('catalogo.html?modo=pdf','_blank');
    const css=document.createElement('style');css.textContent='.catalog-admin-panel{max-width:640px!important;max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain}.catalog-admin-actions{position:sticky;bottom:-20px;background:#fff;padding:10px 0 4px}.cat-sec{margin:16px 0 6px;font-size:14px;text-transform:uppercase;color:#102b5c;border-bottom:2px solid #102b5c;padding-bottom:4px}.cat-row{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #e5e7eb}.cat-row img{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#f8fafc;flex:none}.cat-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.cat-main small{color:#64748b;font-size:12px}.cat-link{font-size:14px!important;padding:6px 8px!important;margin-top:4px;min-height:0!important}.cat-side{width:96px;flex:none;display:flex;flex-direction:column;gap:4px;font-size:12px}.cat-price{font-size:15px!important;padding:6px!important;min-height:0!important;font-weight:700}.cat-diff{color:#b45309;font-weight:600}.cat-unlinked .cat-link{border-color:#f59e0b!important;background:#fffbeb}.cat-hidden{opacity:.45}.cat-vis{display:flex;align-items:center;gap:4px}';
    document.head.appendChild(css);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  window.zipperCatalogAdmin={open,publish,score};
})();
