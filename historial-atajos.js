// Historial: botones de acceso rápido bajo el título para ir directo a cada sección
// (Ventas, Respaldo, Firebase, Vendedores, Catálogo…) y, en cada sección, un botón para volver arriba.
// Las secciones se detectan solas, así que si se agrega una nueva también aparece su botón.
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const ICON={'RESPALDO':'💾','FIREBASE':'☁️','CLIENTES':'📒','CATÁLOGO':'📒'};
  function label(card){
    if(card.classList.contains('history-card'))return {ico:'🧾',txt:'Ventas'};
    const k=(card.querySelector('.kicker')?.textContent||'').trim().toUpperCase();
    let h=(card.querySelector('h2')?.textContent||'').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu,'').trim();
    if(/catálogo/i.test(h))return {ico:'📒',txt:'Catálogo'};
    if(k==='FIREBASE'||/nube/i.test(h))return {ico:'☁️',txt:'Firebase'};
    if(/respaldo/i.test(h))return {ico:'💾',txt:'Respaldo'};
    return {ico:ICON[k]||'📌',txt:h.split(/\s+/).slice(0,2).join(' ')||k||'Sección'};
  }
  function cards(view){return [...view.children].filter(e=>e.matches('section.card')&&!e.classList.contains('hidden')&&e.id!=='paymentHistoryEdit')}
  function go(el){el.scrollIntoView({behavior:'smooth',block:'start'})}
  function render(){
    const view=$('historyView');if(!view)return;
    let nav=$('historyShortcuts');
    if(!nav){nav=document.createElement('nav');nav.id='historyShortcuts';nav.className='hist-atajos';nav.setAttribute('aria-label','Ir a una sección');
      const banner=view.querySelector('.page-banner');if(banner)banner.insertAdjacentElement('afterend',nav);else view.prepend(nav);
      nav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
        if(b.dataset.act){$(b.dataset.act)?.click();return}
        const el=b.dataset.id&&$(b.dataset.id);if(el)go(el)})}
    const list=cards(view);
    list.forEach((c,i)=>{if(!c.id)c.id='histSec'+i;
      if(!c.classList.contains('history-card')&&!c.querySelector(':scope > .hist-arriba')){const up=document.createElement('button');up.type='button';up.className='hist-arriba';up.textContent='⬆ Volver arriba';up.onclick=()=>go(nav);c.appendChild(up)}});
    const btns=list.map(c=>{const l=label(c);return '<button type="button" data-id="'+c.id+'"><span>'+l.ico+'</span>'+l.txt+'</button>'});
    if($('sellerAdminOpen'))btns.push('<button type="button" data-act="sellerAdminOpen"><span>👥</span>Vendedores</button>');
    if($('catalogAdminOpen'))btns.push('<button type="button" data-act="catalogAdminOpen"><span>✏️</span>Editar catálogo</button>');
    const html=btns.join('');if(nav.innerHTML!==html)nav.innerHTML=html;
  }
  function start(){
    const view=$('historyView');if(!view)return;
    const css=document.createElement('style');
    css.textContent='.hist-atajos{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:0 0 14px;scroll-margin-top:12px}.hist-atajos button{display:flex;align-items:center;gap:6px;min-height:48px;padding:6px 10px;border-radius:14px;border:2px solid #1d4ed8;background:#eff6ff;color:#1e3a8a;font-weight:900;font-size:15px;text-align:left;margin:0}.hist-atajos button span{font-size:18px}.hist-atajos button[data-act]{background:#1d4ed8;color:#fff}#historyView > section.card{scroll-margin-top:12px}.hist-arriba{display:block;width:100%;margin:14px 0 0;min-height:44px;border-radius:12px;border:1px solid #cbd5e1;background:#f1f5f9;color:#0f172a;font-weight:800}';
    document.head.appendChild(css);
    render();
    let t=null;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(render,150)}).observe(view,{childList:true,attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});else setTimeout(start,0);
})();
