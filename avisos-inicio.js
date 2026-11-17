// Avisos de Inicio compactos: junta todos los avisos (pedidos del catálogo, cobranza,
// stock bajo, pedidos de proveedor y respaldo) en UN solo bloque de botones de colores.
// Al tocar un botón se despliega el detalle con sus acciones. Los avisos originales
// siguen funcionando escondidos: este módulo solo los lee y reenvía los toques.
(function(){
  'use strict';
  // Orden de prioridad (arriba = más importante) y color de cada aviso.
  const KINDS=[
    {key:'pedidos',  btn:'catOrdersOpen',  icon:'🛒',title:'Pedidos'},
    {key:'cobranza', btn:'alertDebtOpen',  icon:'💰',title:'Cobranza'},
    {key:'stock',    btn:'alertStockOpen', icon:'📦',title:'Stock bajo'},
    {key:'proveedor',btn:'poHomeOpen',     icon:'🚚',title:'Proveedor'},
    {key:'respaldo', btn:'alertBackupNow', icon:'💾',title:'Respaldo'}
  ];
  let openKey='',box=null,scheduled=false,lastSig='';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function sources(){return [$('homeAlerts'),$('catOrdersAlert'),$('poHomeAlert')].filter(Boolean)}

  function badge(kind,title){
    if(kind.key==='cobranza'){const m=title.match(/\$\s?([\d.]+)/);if(!m)return '';const n=Number(m[1].replace(/\./g,''))||0;return n>=1000000?'$'+(Math.round(n/100000)/10).toString().replace('.',',')+' M':n>=1000?'$'+Math.round(n/1000)+' mil':'$'+n}
    if(kind.key==='respaldo')return '!';
    const m=title.match(/(\d+)/);return m?m[1]:''
  }

  function collect(){
    const found=[];
    sources().forEach(src=>src.querySelectorAll('.home-alert').forEach(el=>{
      const kind=KINDS.find(k=>el.querySelector('#'+k.btn));if(!kind)return;
      const title=(el.querySelector('strong')?.textContent||'').trim();
      const detail=(el.querySelector('span')?.textContent||'').trim();
      const buttons=[...el.querySelectorAll('.home-alert-actions button')].filter(b=>b.id).map(b=>({id:b.id,text:b.textContent.trim(),ghost:b.classList.contains('ghost')}));
      found.push({kind,title,detail,buttons,late:el.classList.contains('alert-debt')});
    }));
    return KINDS.map(k=>found.find(f=>f.kind===k)).filter(Boolean);
  }

  function render(){
    scheduled=false;
    const home=$('homeAlerts');if(!home)return;
    if(!box){
      box=document.createElement('section');box.id='homeAlertsCompact';box.className='avisos-compactos';
      home.insertAdjacentElement('beforebegin',box);
      box.addEventListener('click',onClick);
    }
    const items=collect();
    if(!items.some(i=>i.kind.key===openKey))openKey='';
    if(!items.length){box.innerHTML='';box.hidden=true;lastSig='';return}
    box.hidden=false;
    const open=items.find(i=>i.kind.key===openKey);
    const sig=openKey+'|'+JSON.stringify(items.map(i=>[i.kind.key,i.title,i.detail,i.buttons,i.late]));
    if(sig===lastSig)return;lastSig=sig;
    box.innerHTML='<div class="avisos-grid">'+items.map(i=>
      '<button type="button" class="aviso-btn aviso-'+i.kind.key+(i.late?' aviso-urgente':'')+(i.kind.key===openKey?' abierto':'')+'" data-k="'+i.kind.key+'" aria-expanded="'+(i.kind.key===openKey)+'">'+
      '<span class="aviso-ico">'+i.kind.icon+'</span><span class="aviso-txt">'+esc(i.kind.title)+'</span>'+
      (badge(i.kind,i.title)?'<span class="aviso-num">'+esc(badge(i.kind,i.title))+'</span>':'')+'</button>').join('')+'</div>'+
      (open?'<div class="aviso-detalle aviso-'+open.kind.key+'"><strong>'+esc(open.title)+'</strong><p>'+esc(open.detail)+'</p><div class="aviso-acciones">'+
        open.buttons.map(b=>'<button type="button" class="'+(b.ghost?'ghost':'primary')+'" data-go="'+esc(b.id)+'">'+esc(b.text)+'</button>').join('')+
      '</div></div>':'');
  }

  function onClick(ev){
    const go=ev.target.closest('[data-go]');
    if(go){const real=$(go.dataset.go);openKey='';if(real)real.click();schedule();return}
    const t=ev.target.closest('[data-k]');
    if(t){openKey=openKey===t.dataset.k?'':t.dataset.k;render()}
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(render)}

  function start(){
    const home=$('homeAlerts');if(!home)return;
    document.body.classList.add('avisos-compactos-on');
    // Vigila los avisos originales (se vuelven a dibujar solos) y actualiza el bloque.
    new MutationObserver(muts=>{if(muts.some(m=>!box||!box.contains(m.target)))schedule()})
      .observe(home.parentNode,{childList:true,subtree:true,characterData:true});
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else setTimeout(start,0);
})();
