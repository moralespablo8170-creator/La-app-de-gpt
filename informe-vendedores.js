// Historial → Vendedores: informe diario y semanal de jornadas, ventas y visitas de cada vendedor.
// Lee desde Firebase (solo el dueño conectado a la nube). No modifica datos.
(function(){
  let cache=null,loading=false,lastError='';
  const $=id=>document.getElementById(id);
  const hm=iso=>{if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})};
  const mins=(a,b)=>{const x=new Date(a).getTime(),y=new Date(b).getTime();return Number.isFinite(x)&&Number.isFinite(y)&&y>x?Math.round((y-x)/60000):null};
  const dur=m=>m==null?'—':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min';
  const avgTime=list=>{const v=list.filter(Boolean).map(iso=>{const d=new Date(iso);return d.getHours()*60+d.getMinutes()});if(!v.length)return '—';const a=Math.round(v.reduce((x,y)=>x+y,0)/v.length);return String(Math.floor(a/60)).padStart(2,'0')+':'+String(a%60).padStart(2,'0')};
  const nice=d=>typeof historyNiceDate==='function'?historyNiceDate(d,true):d;
  const saleDay=s=>String(s.fecha||s.date||s.occurredAt||'').slice(0,10);
  const sessionDay=s=>String(s.id||'').split('_').pop().slice(0,10)||String(s.openedAtLocal||'').slice(0,10);
  const cloudOwner=()=>localStorage.getItem('zipperStorageMode')==='cloud'&&typeof window.zipperFirebaseCloud?.sellerActivity==='function';

  async function load(force){
    if(loading||(!force&&cache&&Date.now()-new Date(cache.loadedAt).getTime()<60000))return;
    loading=true;lastError='';renderSellers();
    try{cache=await window.zipperFirebaseCloud.sellerActivity()}catch(e){lastError=e.message||String(e)}
    finally{loading=false;renderSellers()}
  }
  function build(){
    const from=$('historyFrom').value||'0000-01-01',to=$('historyTo').value||'9999-12-31',inRange=d=>d>=from&&d<=to;
    return cache.sellers.map(seller=>{
      const days=new Map();
      const day=d=>{if(!days.has(d))days.set(d,{date:d,session:null,sales:[],visits:[]});return days.get(d)};
      cache.sessions.filter(s=>s.sellerUid===seller.uid&&inRange(sessionDay(s))).forEach(s=>day(sessionDay(s)).session=s);
      cache.sales.filter(s=>s.sellerUid===seller.uid&&inRange(saleDay(s))).forEach(s=>day(saleDay(s)).sales.push(s));
      cache.visits.filter(v=>v.sellerUid===seller.uid&&inRange(String(v.date||'').slice(0,10))).forEach(v=>day(String(v.date).slice(0,10)).visits.push(v));
      const rows=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
        const s=r.session||{},open=s.openedAtLocal||null,close=s.closedAtLocal||null;
        const first=s.firstSaleAtLocal||r.sales.map(x=>x.occurredAt).filter(Boolean).sort()[0]||null;
        const last=s.lastSaleAtLocal||r.sales.map(x=>x.occurredAt).filter(Boolean).sort().pop()||null;
        const clientsSold=new Set(r.sales.map(x=>String(x.clienteId))),noSale=r.visits.filter(v=>v.status!=='sale'&&!clientsSold.has(String(v.clientId))).length;
        return {...r,open,close,first,last,route:s.routeWeek?('Sem '+s.routeWeek+' · '+s.routeDay):'',worked:mins(open,close||(r.date===new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)&&open&&!close?new Date().toISOString():null)),stillOpen:!!open&&!close&&s.status!=='closed',total:r.sales.reduce((a,x)=>a+Number(x.total||0),0),clients:clientsSold.size,noSale};
      });
      const worked=rows.reduce((a,r)=>a+(r.worked||0),0);
      return {seller,rows,daysWorked:rows.filter(r=>r.open).length,sales:rows.reduce((a,r)=>a+r.sales.length,0),total:rows.reduce((a,r)=>a+r.total,0),noSale:rows.reduce((a,r)=>a+r.noSale,0),worked,avgOpen:avgTime(rows.map(r=>r.open)),avgClose:avgTime(rows.map(r=>r.close))};
    }).sort((a,b)=>b.total-a.total);
  }
  function reportText(list){
    const label=typeof historyRangeLabel==='function'?historyRangeLabel($('historyFrom').value,$('historyTo').value):'';
    return ['*Informe de vendedores* · '+label,''].concat(...list.map(x=>['*'+(x.seller.displayName||x.seller.email)+'*','Días trabajados: '+x.daysWorked+' · Horas: '+dur(x.worked),'Inicio promedio: '+x.avgOpen+' · Término promedio: '+x.avgClose,'Ventas: '+x.sales+' · Total '+money(x.total)+' · Visitas sin venta: '+x.noSale,...x.rows.map(r=>'  '+nice(r.date)+': inicio '+hm(r.open)+' · término '+(r.stillOpen?'sin cerrar':hm(r.close))+' · '+r.sales.length+' ventas '+money(r.total)),''])).join('\n');
  }
  function renderSellers(){
    if(typeof historyType==='undefined'||historyType!=='sellers')return;
    const out=$('historyOutput');if(!out)return;
    if(!cloudOwner()){out.innerHTML='<p class="muted empty-state">🧑‍💼 Para ver el informe de vendedores conecta tu cuenta de Firebase (Herramientas → Conectar cuenta Firebase).</p>';return}
    if(!cache){out.innerHTML='<p class="muted empty-state">'+(lastError?'No se pudo cargar: '+esc(lastError):'⏳ Cargando jornadas y ventas de vendedores…')+'</p>';if(!loading&&!lastError)load();return}
    const list=build();
    out.innerHTML='<div class="actions history-tools"><button id="sellersRefresh" class="secondary" type="button">'+(loading?'⏳ Actualizando…':'↻ Actualizar')+'</button><button id="sellersCopy" class="secondary" type="button">📋 Copiar informe</button></div><p class="muted">Datos de Firebase de las '+hm(cache.loadedAt)+' · Usa los filtros de arriba (Hoy, Esta semana, Este mes…) para cambiar el período.</p>'+
      (list.length?list.map(x=>'<article class="seller-report"><div class="seller-report-head"><strong>🧑‍💼 '+esc(x.seller.displayName||x.seller.email||'Vendedor')+(x.seller.active===false?' · desactivado':'')+'</strong><span>'+money(x.total)+'</span></div>'+
        '<div class="seller-report-stats"><div><b>'+x.daysWorked+'</b><small>días trabajados</small></div><div><b>'+dur(x.worked)+'</b><small>horas en jornada</small></div><div><b>'+x.avgOpen+'</b><small>inicio promedio</small></div><div><b>'+x.avgClose+'</b><small>término promedio</small></div><div><b>'+x.sales+'</b><small>ventas</small></div><div><b>'+x.noSale+'</b><small>visitas sin venta</small></div></div>'+
        (x.rows.length?'<div class="seller-report-table"><table><thead><tr><th>Día</th><th>Ruta</th><th>Inicio</th><th>1ª venta</th><th>Término</th><th>Jornada</th><th>Ventas</th><th>Total</th><th>Sin venta</th></tr></thead><tbody>'+x.rows.map(r=>'<tr class="'+(r.stillOpen?'still-open':!r.open?'no-session':'')+'"><td>'+esc(nice(r.date))+'</td><td>'+esc(r.route||'—')+'</td><td>'+hm(r.open)+'</td><td>'+hm(r.first)+'</td><td>'+(r.stillOpen?'<b>Sin cerrar</b>':hm(r.close))+'</td><td>'+dur(r.worked)+(r.stillOpen&&r.worked!=null?' (en curso)':'')+'</td><td>'+r.sales.length+'</td><td>'+money(r.total)+'</td><td>'+r.noSale+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">Sin jornadas ni ventas en este período.</p>')+'</article>').join(''):'<p class="muted empty-state">Todavía no hay vendedores creados.</p>');
    $('sellersRefresh').onclick=()=>load(true);
    $('sellersCopy').onclick=()=>{const t=reportText(list);const ok=()=>{if(typeof zipperToast==='function')zipperToast('📋 Informe copiado. Pégalo en WhatsApp o donde quieras.')};if(navigator.clipboard?.writeText)navigator.clipboard.writeText(t).then(ok).catch(()=>prompt('Copia el informe:',t));else prompt('Copia el informe:',t)};
  }
  function wrap(){const fn=window.renderHistory;if(typeof fn!=='function'||fn.__withSellers)return;window.renderHistory=function(){const r=fn.apply(this,arguments);try{renderSellers()}catch(e){console.error('Informe vendedores:',e)}return r};window.renderHistory.__withSellers=true}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(wrap,0),{once:true});else setTimeout(wrap,0);
})();
