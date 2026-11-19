// Promos para redes: arma imágenes para estados de WhatsApp (1080×1920) y un collage para
// Instagram (1080×1350) con las fotos, precios y ofertas del catálogo. Se abre con catalogo.html?modo=promos.
// Todo sale del mismo catálogo que ven los clientes, así que los precios siempre están al día.
(function(){
  'use strict';
  const CAT_URL='https://moralespablo8170-creator.github.io/La-app-de-gpt/catalogo.html';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  let api=null,all=[],picked=[],q='';

  function offerLine(it,money){
    if(it.box){const each=Math.round(it.box.price/it.box.units);return '📦 Caja de '+it.box.units+': '+money(it.box.price)+(each<it.price?' · sale a '+money(each)+' c/u':'')}
    if(it.promo)return '★ Desde '+it.promo.min+': '+money(it.promo.price)+' c/'+(it.per||'unidad');
    return '';
  }
  const isOffer=it=>!!(it.promo||(it.box&&Math.round(it.box.price/it.box.units)<it.price));

  // ---------- Dibujo ----------
  const imgCache=new Map();
  function loadImg(src){if(!src)return Promise.resolve(null);if(imgCache.has(src))return imgCache.get(src);
    const p=new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src});imgCache.set(src,p);return p}
  function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
  function fit(c,img,x,y,w,h){if(!img)return;const s=Math.min(w/img.width,h/img.height),iw=img.width*s,ih=img.height*s;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih)}
  // Escribe un texto en varias líneas dentro de un ancho; devuelve la altura usada.
  function wrap(c,text,x,y,maxW,lh,maxLines,align){
    const words=String(text).split(/\s+/);const lines=[];let cur='';
    words.forEach(w=>{const t=cur?cur+' '+w:w;if(c.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t});if(cur)lines.push(cur);
    const out=lines.slice(0,maxLines);if(lines.length>maxLines){let l=out[out.length-1];while(c.measureText(l+'…').width>maxW&&l.length)l=l.slice(0,-1);out[out.length-1]=l+'…'}
    c.textAlign=align||'left';out.forEach((l,i)=>c.fillText(l,x,y+i*lh));return out.length*lh}
  function countLines(c,text,maxW){let n=1,cur='';String(text).split(/\s+/).forEach(w=>{const t=cur?cur+' '+w:w;if(c.measureText(t).width>maxW&&cur){n++;cur=w}else cur=t});return n}
  function bg(c,W,H){const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0b1630');g.addColorStop(.55,'#12317a');g.addColorStop(1,'#1d4ed8');c.fillStyle=g;c.fillRect(0,0,W,H);
    c.globalAlpha=.08;c.fillStyle='#fff';for(let i=0;i<7;i++){c.beginPath();c.arc(W*(i%2?0.9:0.1),H*(i/7),180+i*20,0,Math.PI*2);c.fill()}c.globalAlpha=1}
  async function header(c,W,y,size){
    const logo=await loadImg('assets/icono-512.png');if(logo)c.drawImage(logo,60,y,size,size);
    c.fillStyle='#fff';c.font='800 '+Math.round(size*.42)+'px Poppins, system-ui, sans-serif';c.textAlign='left';c.fillText('DISTRIBUIDORA',60+size+24,y+size*.45);
    c.fillStyle='#facc15';c.font='800 '+Math.round(size*.55)+'px Poppins, system-ui, sans-serif';c.fillText('ZIPPER',60+size+24,y+size*.95)}
  function footer(c,W,H,h){
    c.fillStyle='#facc15';rr(c,60,H-h-60,W-120,h,36);c.fill();
    c.fillStyle='#0b1630';c.textAlign='center';c.font='800 '+Math.round(h*.3)+'px Poppins, system-ui, sans-serif';c.fillText('📲 Pide por WhatsApp',W/2,H-60-h*.55);
    c.font='600 '+Math.round(h*.2)+'px Inter, system-ui, sans-serif';c.fillText('Responde este estado y te envío el catálogo',W/2,H-60-h*.2)}

  async function story(it){
    const W=1080,H=1920,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d'),money=api.money;
    bg(c,W,H);await header(c,W,70,150);
    if(isOffer(it)){c.save();c.translate(W-90,140);c.rotate(.12);c.fillStyle='#dc2626';rr(c,-230,-60,260,110,24);c.fill();c.fillStyle='#fff';c.font='900 56px Poppins, system-ui, sans-serif';c.textAlign='center';c.fillText('OFERTA',-100,14);c.restore()}
    // Tarjeta blanca con la foto
    c.fillStyle='#fff';rr(c,60,300,W-120,1060,48);c.fill();
    const img=await loadImg(it.img);if(img)fit(c,img,110,350,W-220,760);else{c.fillStyle='#94a3b8';c.font='700 60px Poppins, system-ui';c.textAlign='center';c.fillText('📦',W/2,700)}
    c.fillStyle='#0f172a';c.font='800 74px Poppins, system-ui, sans-serif';const used=wrap(c,it.name,W/2,1190,W-200,84,2,'center');
    c.fillStyle='#64748b';c.font='500 44px Inter, system-ui, sans-serif';if(it.fmt&&used<160)wrap(c,it.fmt,W/2,1190+used+10,W-200,52,1,'center');
    // Precio
    c.fillStyle='#fff';c.textAlign='center';c.font='900 170px Poppins, system-ui, sans-serif';c.fillText(money(it.price),W/2,1590);
    c.font='600 50px Inter, system-ui, sans-serif';c.fillStyle='#cbd5e1';c.fillText(it.box?'por unidad':'por '+(it.per||'unidad'),W/2,1660);
    const off=isOffer(it)||it.box?offerLine(it,money):'';if(off){c.font='800 50px Poppins, system-ui, sans-serif';const w=Math.min(W-120,c.measureText(off).width+80);c.fillStyle='#dc2626';rr(c,(W-w)/2,1710,w,96,48);c.fill();c.fillStyle='#fff';wrap(c,off,W/2,1775,w-60,56,1,'center')}
    return cv}

  async function collage(list){
    const W=1080,H=1350,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d'),money=api.money;
    bg(c,W,H);await header(c,W,40,110);
    const allOff=list.every(isOffer);if(allOff){c.fillStyle='#facc15';c.font='900 64px Poppins, system-ui, sans-serif';c.textAlign='right';c.fillText('⭐ OFERTAS',W-60,120)}
    const n=list.length,cols=n<=2?n:n<=4?2:3,rows=Math.ceil(n/cols),top=180,bottom=30,gap=24;
    const cw=(W-120-(cols-1)*gap)/cols,ch=(H-top-bottom-30-(rows-1)*gap)/rows;
    for(let i=0;i<n;i++){const it=list[i],x=60+(i%cols)*(cw+gap),y=top+Math.floor(i/cols)*(ch+gap);
      c.fillStyle='#fff';rr(c,x,y,cw,ch,28);c.fill();
      const fs=cols===3?30:36,lh=fs+4,off=offerLine(it,money).replace(/^📦 /,'').replace(/^★ /,'');
      c.font='800 '+fs+'px Poppins, system-ui, sans-serif';const nl=Math.min(2,countLines(c,it.name,cw-30));
      const offY=y+ch-22,priceY=off?offY-(fs-6)-16:y+ch-26,nameLast=priceY-(fs+18)-10,nameFirst=nameLast-(nl-1)*lh;
      fit(c,await loadImg(it.img),x+16,y+14,cw-32,nameFirst-fs-14-(y+14));
      c.fillStyle='#0f172a';wrap(c,it.name,x+cw/2,nameFirst,cw-30,lh,2,'center');
      c.fillStyle='#dc2626';c.font='900 '+(fs+18)+'px Poppins, system-ui, sans-serif';c.textAlign='center';c.fillText(money(it.price),x+cw/2,priceY);
      if(!allOff&&isOffer(it)){c.fillStyle='#dc2626';rr(c,x+12,y+12,150,46,14);c.fill();c.fillStyle='#fff';c.font='900 26px Poppins, system-ui, sans-serif';c.textAlign='center';c.fillText('OFERTA',x+87,y+45)}
      if(off){c.fillStyle='#334155';c.font='700 '+(fs-10)+'px Inter, system-ui, sans-serif';wrap(c,off,x+cw/2,offY,cw-24,fs-6,1,'center')}}
    return cv}

  // ---------- Pantalla ----------
  function css(){const s=document.createElement('style');s.textContent=
    'body.promomode #list,body.promomode .foot,body.promomode #sheet,body.promomode .bar,body.promomode #upd{display:none!important}'+
    '#promos{max-width:720px;margin:0 auto;padding:12px 14px 120px;font-family:Inter,system-ui,sans-serif}#promos h2{font-family:Poppins;margin:6px 0}'+
    '#promos .pm-help{background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:10px 12px;font-size:14px;color:#1e3a8a}'+
    '#promos input[type=search]{width:100%;box-sizing:border-box;margin:10px 0;padding:12px 14px;font-size:16px;border:2px solid #0f172a;border-radius:14px}'+
    '.pm-list{display:flex;flex-direction:column;gap:6px}.pm-item{display:flex;align-items:center;gap:10px;padding:8px;border:2px solid #e2e8f0;border-radius:14px;background:#fff;text-align:left;font:inherit;width:100%}'+
    '.pm-item.on{border-color:#16a34a;background:#f0fdf4}.pm-item img{width:54px;height:54px;object-fit:contain;flex:none}.pm-item b{display:block;font-size:15px}.pm-item small{color:#64748b}.pm-item .pm-of{color:#dc2626;font-weight:700}'+
    '.pm-tick{margin-left:auto;font-size:22px}.pm-sec{margin:14px 0 4px;font-family:Poppins;font-size:13px;text-transform:uppercase;color:#475569}'+
    '.pm-bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:2px solid #0f172a;padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px;z-index:50}'+
    '.pm-bar button{flex:1;min-height:52px;border-radius:14px;border:0;font:800 15px Poppins,system-ui;color:#fff;background:#1d4ed8}.pm-bar button:disabled{opacity:.4}.pm-bar button.alt{background:#dc2626}'+
    '.pm-out{position:fixed;inset:0;background:#0f172aee;z-index:60;overflow:auto;padding:14px}.pm-out .pm-card{max-width:520px;margin:0 auto 18px;background:#fff;border-radius:18px;padding:12px}'+
    '.pm-out img{width:100%;border-radius:12px;display:block}.pm-out .pm-act{display:flex;gap:8px;margin-top:10px}.pm-out .pm-act button{flex:1;min-height:48px;border-radius:12px;border:0;font:800 15px Poppins,system-ui;background:#16a34a;color:#fff}.pm-out .pm-act button.sec{background:#e2e8f0;color:#0f172a}'+
    '.pm-close{position:sticky;top:0;display:block;margin:0 auto 12px;min-height:48px;padding:0 22px;border-radius:999px;border:0;background:#fff;font:800 16px Poppins,system-ui}';
    document.head.appendChild(s)}
  function paint(){
    const box=$('pmList');const t=norm(q.trim());
    const show=all.filter(x=>!t||norm(x.it.name+' '+x.sec).includes(t));
    let html='',last='';
    show.forEach(x=>{const sec=x.offer?'⭐ Ofertas':x.sec;if(sec!==last){html+='<div class="pm-sec">'+esc(sec)+'</div>';last=sec}
      const on=picked.includes(x.it);
      html+='<button type="button" class="pm-item'+(on?' on':'')+'" data-k="'+esc(x.it.key)+'">'+(x.it.img?'<img src="'+esc(x.it.img)+'" alt="">':'<span style="width:54px;text-align:center">📦</span>')+'<span><b>'+esc(x.it.name)+'</b><small>'+api.money(x.it.price)+(x.offer?' · <span class="pm-of">'+esc(offerLine(x.it,api.money))+'</span>':'')+'</small></span><span class="pm-tick">'+(on?'✅':'⬜')+'</span></button>'});
    box.innerHTML=html||'<p>No hay productos con ese nombre.</p>';
    $('pmStory').disabled=!picked.length;$('pmStory').textContent='🖼 Estado'+(picked.length>1?'s ('+picked.length+')':'');
    $('pmCollage').disabled=picked.length<2;$('pmCollage').textContent='🧩 Collage'+(picked.length>=2?' ('+Math.min(6,picked.length)+')':'');
  }
  async function showResults(canvases,names){
    const out=document.createElement('div');out.className='pm-out';out.innerHTML='<button class="pm-close" type="button">✕ Cerrar y volver</button>';document.body.appendChild(out);
    out.querySelector('.pm-close').onclick=()=>out.remove();
    // Sin enlace largo: en un estado no se puede poner botón y el enlace confunde. El cliente responde el estado y se le manda el catálogo.
    const text='🛒 ¡Ofertas Distribuidora Zipper! Respóndeme este estado y te envío el catálogo para hacer tu pedido.';
    for(let i=0;i<canvases.length;i++){
      const blob=await new Promise(r=>canvases[i].toBlob(r,'image/jpeg',.92));const url=URL.createObjectURL(blob);const file=new File([blob],'zipper-'+names[i]+'.jpg',{type:'image/jpeg'});
      const card=document.createElement('div');card.className='pm-card';card.innerHTML='<img src="'+url+'" alt=""><div class="pm-act"><button type="button" data-share>📲 Compartir</button><button type="button" class="sec" data-dl>⬇ Descargar</button></div>';
      card.querySelector('[data-dl]').onclick=()=>{const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove()};
      card.querySelector('[data-share]').onclick=async()=>{try{if(navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({files:[file]});else{card.querySelector('[data-dl]').click();alert('Tu teléfono no permite compartir directo: la imagen se descargó. Súbela desde la galería a tu estado.')}}catch(_){}}
      out.appendChild(card)}
    const tip=document.createElement('p');tip.style.cssText='color:#fff;text-align:center;max-width:520px;margin:0 auto';tip.textContent='Toca "Compartir" y elige WhatsApp → Mi estado, o Instagram. Si la descargas, queda en tu galería.';out.appendChild(tip)}
  async function build(kind){
    const btns=[$('pmStory'),$('pmCollage')];btns.forEach(b=>b.disabled=true);const old=$(kind==='story'?'pmStory':'pmCollage').textContent;$(kind==='story'?'pmStory':'pmCollage').textContent='Armando…';
    try{await (document.fonts?.ready||Promise.resolve());
      if(kind==='story'){const cs=[];for(const it of picked)cs.push(await story(it));await showResults(cs,picked.map(it=>it.key))}
      else{const l=picked.slice(0,6);await showResults([await collage(l)],['ofertas'])}}
    catch(e){alert('No se pudo armar la imagen: '+(e.message||e))}
    finally{$(kind==='story'?'pmStory':'pmCollage').textContent=old;paint()}}
  async function start(a){
    api=a;css();document.body.classList.add('promomode');document.title='Promos para redes · Zipper';
    await a.photosReady;
    const seen=new Set();
    a.data.sections.forEach(s=>s.items.forEach(it=>{if(it.hidden||!(it.price>0))return;if(isOffer(it)&&!seen.has(it.key)){seen.add(it.key);all.push({it,sec:s.title,offer:true})}}));
    a.data.sections.forEach(s=>s.items.forEach(it=>{if(it.hidden||!(it.price>0)||seen.has(it.key))return;seen.add(it.key);all.push({it,sec:s.title,offer:false})}));
    picked=all.filter(x=>x.offer).slice(0,4).map(x=>x.it);
    const wrapEl=document.createElement('section');wrapEl.id='promos';
    wrapEl.innerHTML='<h2>📣 Promos para WhatsApp e Instagram</h2><div class="pm-help">Marca los productos y toca <b>🖼 Estado</b> (una imagen por producto, tamaño estado de WhatsApp) o <b>🧩 Collage</b> (2 a 6 productos en una imagen para Instagram). Los precios y ofertas salen del catálogo, siempre al día.</div><input id="pmQ" type="search" placeholder="🔍 Buscar producto…"><div id="pmList" class="pm-list"></div>'+
      '<div class="pm-bar"><button id="pmStory" type="button">🖼 Estado</button><button id="pmCollage" class="alt" type="button">🧩 Collage</button></div>';
    const hero=document.querySelector('header.hero');if(hero)hero.insertAdjacentElement('afterend',wrapEl);else document.body.prepend(wrapEl);
    $('pmQ').oninput=e=>{q=e.target.value;paint()};
    $('pmList').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;const x=all.find(y=>y.it.key===b.dataset.k);if(!x)return;const i=picked.indexOf(x.it);if(i>=0)picked.splice(i,1);else picked.push(x.it);paint()};
    $('pmStory').onclick=()=>build('story');$('pmCollage').onclick=()=>build('collage');
    paint();
  }
  window.zipperPromos={start,story,collage};
})();
