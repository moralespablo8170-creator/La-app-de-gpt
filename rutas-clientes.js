// Orden de clientes por día de ruta: numeración propia de cada día y semana,
// conteo de clientes por día y vista previa del lugar al crear o editar.
(function(){
  const WEEKS=['A','B'];
  const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const SHORT={lunes:'Lun',martes:'Mar',miercoles:'Mié',jueves:'Jue',viernes:'Vie',sabado:'Sáb'};
  let rankIndex=new Map(),groups=new Map();

  // Ordena cada ruta (semana + día) igual que al guardar: por posición y luego por orden de registro.
  function buildRouteIndex(clients){
    rankIndex=new Map();groups=new Map();
    const all=clients||getClients().filter(c=>c.active!==false);
    WEEKS.forEach(week=>{
      all.forEach((c,i)=>{
        const r=clientRoute(c,week);if(!r||!r.day)return;
        const key=week+'|'+norm(r.day);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push({c,i,pos:r.position});
      });
    });
    groups.forEach((list,key)=>{
      list.sort((a,b)=>a.pos-b.pos||a.i-b.i);
      list.forEach((item,index)=>rankIndex.set(key+'|'+String(item.c.id),index+1));
    });
  }
  function routeRankOf(c,week){const r=clientRoute(c,week);return r&&r.day?rankIndex.get(week+'|'+norm(r.day)+'|'+String(c.id))||0:0}
  function routeCount(week,day){return (groups.get(week+'|'+norm(day))||[]).length}
  function routeChips(c,onlyWeek){
    const chips=WEEKS.filter(w=>!onlyWeek||w===onlyWeek).map(week=>{
      const r=clientRoute(c,week);if(!r||!r.day)return '';
      const rank=routeRankOf(c,week),total=routeCount(week,r.day);
      return '<span class="route-chip week-'+week+'">Sem '+week+' · '+esc(SHORT[norm(r.day)]||r.day)+' · <b>N° '+rank+'</b><small> de '+total+'</small></span>';
    }).filter(Boolean);
    return chips.length?'<span class="route-chips">'+chips.join('')+'</span>':'<span class="route-chips"><span class="route-chip no-route">Sin día asignado</span></span>';
  }
  function renderRouteCounts(){
    buildRouteIndex();
    const box=$('routeCounts');if(!box)return;
    const fw=$('filterWeek').value,fd=$('filterDay').value;
    const usedDays=DAYS.filter(d=>d!=='Sábado'||WEEKS.some(w=>routeCount(w,d)));
    let html='<div class="route-counts-head"><strong>📍 Clientes por día de ruta</strong><span>Toca un día para ver su orden</span></div><div class="route-counts-table" style="grid-template-columns:auto repeat('+usedDays.length+',minmax(0,1fr))"><span></span>'+usedDays.map(d=>'<span class="rc-day">'+SHORT[norm(d)]+'</span>').join('');
    WEEKS.forEach(week=>{
      const total=usedDays.reduce((a,d)=>a+routeCount(week,d),0);
      html+='<span class="rc-week week-'+week+'">Sem '+week+'<small>'+total+'</small></span>'+usedDays.map(d=>{
        const n=routeCount(week,d),active=fw===week&&norm(fd)===norm(d);
        return '<button type="button" class="rc-cell week-'+week+(active?' active':'')+(n?'':' empty')+'" data-week="'+week+'" data-day="'+d+'" aria-label="Semana '+week+' '+d+': '+n+' clientes">'+n+'</button>';
      }).join('');
    });
    html+='</div>';
    if(fw&&fd)html+='<p class="route-filter-note">Mostrando <b>Semana '+esc(fw)+' · '+esc(fd)+'</b> en orden de visita: '+routeCount(fw,fd)+' clientes. <button type="button" id="routeCountsClear" class="link-button">Ver todos</button></p>';
    box.innerHTML=html;
    box.querySelectorAll('.rc-cell').forEach(b=>b.onclick=()=>{
      const same=$('filterWeek').value===b.dataset.week&&norm($('filterDay').value)===norm(b.dataset.day);
      $('filterWeek').value=same?'':b.dataset.week;$('filterDay').value=same?'':b.dataset.day;renderClients();
      $('clientList')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    const clear=$('routeCountsClear');if(clear)clear.onclick=()=>{$('filterWeek').value='';$('filterDay').value='';renderClients()};
  }
  // Vista previa: cómo quedará la ruta del día con este cliente en la posición elegida.
  function renderClientRoutePreview(){
    const box=$('clientRoutePreview');if(!box)return;
    const week=$('clientWeek').value,day=$('clientDay').value;
    if(!day){box.innerHTML='<p class="muted">Elige semana y día para ubicar al cliente en la ruta.</p>';return}
    const all=getClients();
    const group=all.filter(c=>c.active!==false&&String(c.id)!==String(editingClientId||'')&&clientRoute(c,week)&&norm(clientRoute(c,week).day)===norm(day));
    group.sort((a,b)=>clientRoute(a,week).position-clientRoute(b,week).position||all.indexOf(a)-all.indexOf(b));
    const raw=String($('clientPosition').value||'').trim(),wanted=raw?Math.max(1,parseInt(raw,10)||1):null;
    const insertAt=Math.min(group.length,Math.max(0,(wanted??group.length+1)-1));
    const name=$('clientName').value.trim()||(editingClientId?'Este cliente':'Cliente nuevo');
    const list=group.map(c=>({name:c.name,self:false}));list.splice(insertAt,0,{name,self:true});
    $('clientPosition').max=String(group.length+1);
    const around=list.map((x,i)=>({...x,n:i+1})).filter((x,i)=>Math.abs(i-insertAt)<=3||i===0||i===list.length-1);
    let last=0;
    box.innerHTML='<p class="route-preview-title">📍 Semana '+esc(week)+' · '+esc(day)+': '+group.length+' clientes'+(editingClientId?' además de este':'')+'. Quedará en el <b>N° '+(insertAt+1)+' de '+list.length+'</b>'+(wanted?'':' (al final; escribe otro número para cambiarlo)')+'.</p><ol class="route-preview">'+around.map(x=>{const gap=x.n-last>1?'<li class="gap">…</li>':'';last=x.n;return gap+'<li class="'+(x.self?'self':'')+'"><b>'+x.n+'</b> '+esc(x.name)+(x.self?' ⬅':'')+'</li>'}).join('')+'</ol>';
  }
  window.buildRouteIndex=buildRouteIndex;window.routeRankOf=routeRankOf;window.routeChips=routeChips;
  window.renderRouteCounts=renderRouteCounts;window.renderClientRoutePreview=renderClientRoutePreview;
  function bind(){
    ['clientWeek','clientDay'].forEach(id=>$(id)?.addEventListener('change',()=>setTimeout(renderClientRoutePreview,0)));
    ['clientPosition','clientName'].forEach(id=>$(id)?.addEventListener('input',renderClientRoutePreview));
    $('newClient')?.addEventListener('click',()=>setTimeout(renderClientRoutePreview,0));
    renderClientRoutePreview();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
