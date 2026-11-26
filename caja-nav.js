// Caja diaria: botonera arriba para saltar a cada sección, y en cada sección un botón "⬆ Arriba"
// para volver al inicio de la caja sin recorrer toda la hoja.
(function(){
  const LINKS=[
    {label:'💵 Caja',find:v=>v.querySelector('#cashDate')?.closest('.card')},
    {label:'💸 Salidas',find:v=>heading(v,'h3','salidas de efectivo')},
    {label:'🧾 Saldos pendientes',find:v=>heading(v,'h3','saldo actual por cliente')},
    {label:'💰 Abonos',find:v=>heading(v,'h3','dinero recibido')},
    {label:'📈 Comparación',find:v=>v.querySelector('.pj-card')},
    {label:'📊 Análisis',find:v=>v.querySelector('#statsOutput')?.closest('.card')}
  ];
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  function heading(v,tag,text){return [...v.querySelectorAll(tag)].find(h=>norm(h.textContent).includes(text))||null}
  function css(){const s=document.createElement('style');s.textContent=
    '.caja-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}'+
    '.caja-nav button{flex:1 1 30%;min-height:44px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:800;font-size:13px;padding:8px 6px}'+
    '.caja-top{float:right;border:0;border-radius:999px;background:#e5e7eb;color:#111827;font-weight:800;font-size:12px;padding:6px 11px;margin:0 0 6px 8px;min-height:32px}'+
    '#cashView .caja-target{scroll-margin-top:10px}';
    document.head.appendChild(s)}
  function go(el){if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
  function setup(){
    const v=document.getElementById('cashView');if(!v||v.querySelector('.caja-nav'))return;
    css();
    const nav=document.createElement('div');nav.className='caja-nav';
    LINKS.forEach(l=>{const b=document.createElement('button');b.type='button';b.textContent=l.label;b.onclick=()=>go(l.find(v));nav.appendChild(b)});
    const banner=v.querySelector('.page-banner');if(banner)banner.after(nav);else v.prepend(nav);
    // Botón "Arriba" en cada sección (menos la primera, que ya está arriba)
    LINKS.slice(1).forEach(l=>{const el=l.find(v);if(!el||el.querySelector(':scope > .caja-top'))return;el.classList.add('caja-target');
      const b=document.createElement('button');b.type='button';b.className='caja-top';b.textContent='⬆ Arriba';b.onclick=()=>go(nav);
      if(/^H[23]$/.test(el.tagName))el.prepend(b);else el.prepend(b)});
    LINKS[0].find(v)?.classList.add('caja-target');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
