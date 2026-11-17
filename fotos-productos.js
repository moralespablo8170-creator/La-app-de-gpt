// Fotos miniatura de los productos (las mismas del catálogo para clientes).
// Lee el catálogo publicado (público) para saber qué foto corresponde a cada producto de la app.
// Lo usan la app del dueño (carrito) y la app del vendedor.
(function(){
  const API='https://firestore.googleapis.com/v1/projects/zipper-a12f1/databases/(default)/documents/publico/';
  const KEY='AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF4';
  const CACHE='zipperFotosProductos';
  let byProduct={},custom={},loaded=false;
  const listeners=[];
  try{const c=JSON.parse(localStorage.getItem(CACHE)||'null');if(c&&c.byProduct){byProduct=c.byProduct;loaded=true}}catch(_){}
  function build(pub){
    const map={};const photos=pub?.photos||{};
    Object.entries(pub?.links||{}).forEach(([key,pid])=>{if(!pid||pid==='none'||map[pid])return;const ph=photos[key];if(ph==='none')return;map[String(pid)]={key,custom:!!ph}});
    (pub?.extra||[]).forEach(x=>{if(!x?.productId||map[x.productId])return;const ph=photos[x.key];if(ph&&ph!=='none')map[String(x.productId)]={key:x.key,custom:true}});
    return map;
  }
  async function load(){
    try{
      const r=await fetch(API+'catalogo?key='+KEY,{cache:'no-store'});if(!r.ok)return;
      const j=await r.json();const pub=JSON.parse(j.fields?.data?.stringValue||'null');if(!pub)return;
      byProduct=build(pub);loaded=true;
      try{localStorage.setItem(CACHE,JSON.stringify({byProduct,at:Date.now()}))}catch(_){}
      listeners.forEach(fn=>{try{fn()}catch(_){}});
    }catch(_){}
  }
  async function loadCustom(key){
    if(custom[key]!==undefined)return;custom[key]='';
    try{const r=await fetch(API+'foto-'+String(key).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,80)+'?key='+KEY);if(!r.ok)return;const j=await r.json();custom[key]=j.fields?.data?.stringValue||'';
      if(custom[key])document.querySelectorAll('img[data-photo-key="'+key+'"]').forEach(img=>{img.src=custom[key];img.style.visibility=''})}catch(_){}
  }
  // URL de la foto del producto (o '' si no tiene).
  function url(p){
    if(!p)return '';
    const hit=byProduct[String(p.id)]||(p.baseProductId!=null?byProduct[String(p.baseProductId)]:null);
    if(!hit)return '';
    if(hit.custom){loadCustom(hit.key);return custom[hit.key]||''}
    return 'catalogo/img/'+hit.key+'.jpg';
  }
  // HTML de la miniatura; si no hay foto devuelve el respaldo (por ejemplo el punto de color).
  function thumb(p,fallback){
    const hit=p&&(byProduct[String(p.id)]||(p.baseProductId!=null?byProduct[String(p.baseProductId)]:null));
    if(!hit)return fallback||'';
    const u=url(p);
    return '<img class="pthumb" data-photo-key="'+hit.key+'" src="'+(u||'data:image/gif;base64,R0lGODlhAQABAAAAACw=')+'" alt="" loading="lazy"'+(u?'':' style="visibility:hidden"')+' onerror="this.style.visibility=\'hidden\'">';
  }
  const css=document.createElement('style');
  css.textContent='.pthumb{width:44px;height:44px;flex:none;object-fit:contain;background:#fff;border-radius:9px;border:1px solid #e2e8f0;padding:2px}';
  (document.head||document.documentElement).appendChild(css);
  window.zipperProductPhotos={url,thumb,load,onChange:fn=>listeners.push(fn),get loaded(){return loaded}};
  load();
})();
// App del dueño: cambia el punto de color por la foto en las sugerencias, el producto elegido y la bandeja.
(function(){
  if(typeof window.renderCart!=='function'&&!document.getElementById('cartSection'))return;
  function decorate(){
    const P=window.zipperProductPhotos,byId=typeof productById==='function'?productById:null;if(!P||!byId)return;
    document.querySelectorAll('#productSuggestions .suggestion[data-id]').forEach(b=>{const dot=b.querySelector('.color-dot');const p=byId(b.dataset.id);if(dot&&p){const t=P.thumb(p,'');if(t)dot.outerHTML=t}});
    const d=document.querySelector('#productDraft .draft-info .color-dot');if(d&&typeof draftProductId!=='undefined'&&draftProductId){const t=P.thumb(byId(draftProductId),'');if(t)d.outerHTML=t}
    document.querySelectorAll('#chosenProducts .chosen-line').forEach(line=>{if(line.querySelector('.pthumb'))return;const id=line.querySelector('[data-id]')?.dataset.id;const p=id&&byId(id);const t=p?P.thumb(p,''):'';const info=line.querySelector('.chosen-product-info');if(t&&info)info.insertAdjacentHTML('afterbegin',t)});
  }
  function wrap(){const fn=window.renderCart;if(typeof fn!=='function'||fn.__withPhotos)return;window.renderCart=function(){const r=fn.apply(this,arguments);try{decorate()}catch(e){console.warn(e)}return r};window.renderCart.__withPhotos=true}
  const css=document.createElement('style');css.textContent='#productSuggestions .suggestion .pthumb,#productDraft .pthumb{width:46px;height:46px}.chosen-product-info{display:flex;align-items:center;gap:10px}.chosen-product-info .pthumb{width:40px;height:40px}';document.head.appendChild(css);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(wrap,0),{once:true});else setTimeout(wrap,0);
  window.zipperProductPhotos?.onChange(()=>{try{if(typeof renderCart==='function')renderCart()}catch(_){}});
})();
