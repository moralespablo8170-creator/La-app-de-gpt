// Proyección de compras y comparación de meses/años.
// Usa solo las ventas guardadas en el teléfono: no modifica datos.
(function(){
  const DAY=86400000;
  const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const parse=v=>{const [y,m,d]=String(v||'').slice(0,10).split('-').map(Number);return y?new Date(y,(m||1)-1,d||1,12).getTime():NaN};
  const iso=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const pct=(a,b)=>b>0?Math.round((a-b)/b*100):null;
  const pctLabel=v=>v===null?'<span class="pj-muted">sin datos</span>':'<span class="'+(v>=0?'pj-up':'pj-down')+'">'+(v>=0?'▲ +':'▼ ')+v+'%</span>';

  // Une cada línea vendida con el producto actual (por id o por nombre).
  function productIndex(){
    const products=getProducts(),byId=new Map(),byName=new Map();
    products.forEach(p=>{byId.set(String(p.id),p);if(p.baseProductId)byId.set(String(p.baseProductId)+'|'+norm(p.flavor||p.color||''),p);byName.set(norm(p.name),p)});
    return {products,find:i=>byId.get(String(i.productId))||byName.get(norm(i.desc))||null};
  }
  // Unidades vendidas por producto y día.
  function salesByProduct(){
    const idx=productIndex(),units=new Map();let first=Infinity;
    getSales().forEach(s=>{
      if(s.annulled||s.status==='annulled')return;
      const t=parse(saleDate(s));if(!Number.isFinite(t))return;first=Math.min(first,t);
      (s.items||[]).forEach(i=>{const p=idx.find(i);const key=p?String(p.id):'name:'+norm(i.desc);if(!units.has(key))units.set(key,{p,name:p?p.name:(i.desc||'Producto'),days:[]});units.get(key).days.push([t,Number(i.qty)||0])});
    });
    return {idx,units,first};
  }
  const sumRange=(days,from,to)=>days.reduce((a,[t,q])=>t>=from&&t<to?a+q:a,0);

  function forecast(days,start,horizon,first){
    const recentWindow=horizon<=7?28:90;
    const recent=sumRange(days,start-recentWindow*DAY,start)/recentWindow*horizon;
    const yearAgo=start-365*DAY;
    const hasLastYear=first<=yearAgo-28*DAY;
    let lastYear=null,growth=1,value=recent;
    if(hasLastYear){
      lastYear=sumRange(days,yearAgo,yearAgo+horizon*DAY);
      const prevRecent=sumRange(days,yearAgo-recentWindow*DAY,yearAgo),thisRecent=sumRange(days,start-recentWindow*DAY,start);
      growth=prevRecent>0?Math.min(2,Math.max(.5,thisRecent/prevRecent)):1;
      value=.5*recent+.5*lastYear*growth;
    }
    return {recent,lastYear,growth,value};
  }

  function renderProjection(){
    const box=$('projectionOutput');if(!box)return;
    const horizon=Number($('projectionHorizon').value)||7,margin=Number($('projectionMargin').value)||0,onlyBuy=$('projectionOnlyBuy').checked;
    const q=norm($('projectionSearch').value||'');
    const start=parse(localDate());
    const {units,first}=salesByProduct();
    const rows=[];
    units.forEach(u=>{
      if(!u.p)return;
      if(q&&!norm(u.name).includes(q))return;
      const f=forecast(u.days,start,horizon,first);
      if(f.value<=0&&!sumRange(u.days,start-90*DAY,start))return;
      const need=Math.ceil(f.value*(1+margin/100));
      const stock=Math.max(0,Number(u.p.stock)||0);
      const buy=Math.max(0,need-stock);
      const cost=buy*(Number(u.p.pricePurchase)||0);
      const lastPeriod=sumRange(u.days,start-horizon*DAY,start);
      rows.push({u,f,need,stock,buy,cost,lastPeriod,days:f.value>0?Math.floor(stock/(f.value/horizon)):null});
    });
    rows.sort((a,b)=>b.buy-a.buy||b.need-a.need);
    const shown=onlyBuy?rows.filter(r=>r.buy>0):rows;
    const totalCost=shown.reduce((a,r)=>a+r.cost,0),totalBuy=shown.reduce((a,r)=>a+r.buy,0);
    const period=horizon<=7?'la próxima semana':'el próximo mes';
    const yearNote=Number.isFinite(first)&&first<=start-393*DAY?'Combina las ventas recientes con el mismo período del año pasado (ajustado según cómo vas este año).':'Basado en tus ventas recientes. Cuando tengas un año de datos también se usará el mismo período del año anterior.';
    box.innerHTML='<div class="pj-summary"><div class="summary-tile tile-blue"><strong>'+shown.filter(r=>r.buy>0).length+'</strong><span>Productos por comprar</span></div><div class="summary-tile tile-amber"><strong>'+totalBuy+'</strong><span>Unidades sugeridas</span></div><div class="summary-tile tile-green"><strong>'+money(totalCost)+'</strong><span>Costo estimado de compra</span></div></div>'+
      '<p class="pj-note">Para '+period+' · margen de seguridad '+margin+'%. '+yearNote+'</p>'+
      (shown.length?'<div class="pj-list">'+shown.map(r=>{
        const lvl=r.buy>0?(r.stock===0?'pj-critical':'pj-buy'):'pj-ok';
        return '<article class="pj-row '+lvl+'"><div class="pj-head"><strong>'+esc(r.u.name)+'</strong>'+(r.buy>0?'<span class="pj-buy-badge">Comprar '+r.buy+'</span>':'<span class="pj-ok-badge">Stock suficiente</span>')+'</div>'+
          '<div class="pj-grid"><span><b>'+r.stock+'</b>Stock hoy</span><span><b>'+Math.round(r.f.value)+'</b>Venta proyectada</span><span><b>'+r.lastPeriod+'</b>'+(horizon<=7?'Últimos 7 días':'Últimos 30 días')+'</span><span><b>'+(r.f.lastYear===null?'—':r.f.lastYear)+'</b>Mismo período año pasado</span></div>'+
          '<small>'+(r.days===null?'Sin ventas recientes.':r.days<=0?'⚠️ Sin stock: puedes quedar corto hoy mismo.':'El stock actual alcanza para unos '+r.days+' días.')+(r.cost?' · Costo de la compra sugerida: '+money(r.cost):'')+'</small></article>';
      }).join('')+'</div><div class="actions"><button id="projectionCopy" class="secondary wide" type="button">📋 Copiar lista de compras</button></div>':'<p class="muted empty-state">📦 No hay ventas suficientes para proyectar.</p>');
    const copy=$('projectionCopy');
    if(copy)copy.onclick=()=>{
      const list=shown.filter(r=>r.buy>0);
      const text='Lista de compras · '+period+' ('+localDate()+')\n\n'+list.map(r=>'• '+r.u.name+': comprar '+r.buy+' (stock '+r.stock+', proyección '+Math.round(r.f.value)+')').join('\n')+'\n\nTotal estimado: '+money(list.reduce((a,r)=>a+r.cost,0));
      const done=()=>alert('Lista copiada. Puedes pegarla en WhatsApp o enviarla al proveedor.');
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>prompt('Copia la lista:',text));else prompt('Copia la lista:',text);
    };
  }

  // Comparación mes a mes y con el mismo mes del año anterior.
  function renderComparison(){
    const box=$('comparisonOutput');if(!box)return;
    const now=new Date(parse(localDate())),y=now.getFullYear(),m=now.getMonth(),dayOfMonth=now.getDate();
    const sales=getSales().filter(s=>!(s.annulled||s.status==='annulled'));
    const stats=(year,month,uptoDay)=>{let total=0,units=0,count=0;const clients=new Set();sales.forEach(s=>{const d=saleDate(s);const [sy,sm,sd]=d.split('-').map(Number);if(sy===year&&sm===month+1&&(!uptoDay||sd<=uptoDay)){total+=saleTotal(s);count++;clients.add(String(s.clienteId||s.cliente));(s.items||[]).forEach(i=>units+=Number(i.qty)||0)}});return {total,units,count,clients:clients.size}};
    const prev=new Date(y,m-1,1);
    const cur=stats(y,m,dayOfMonth),lastMonthSame=stats(prev.getFullYear(),prev.getMonth(),dayOfMonth),lastYearSame=stats(y-1,m,dayOfMonth);
    const lastMonthFull=stats(prev.getFullYear(),prev.getMonth()),lastYearFull=stats(y-1,m);
    const daysInMonth=new Date(y,m+1,0).getDate();
    const projected=Math.round(cur.total/dayOfMonth*daysInMonth);
    const months=[];for(let k=11;k>=0;k--){const d=new Date(y,m-k,1);const a=stats(d.getFullYear(),d.getMonth()),b=stats(d.getFullYear()-1,d.getMonth());months.push({label:MONTHS[d.getMonth()].slice(0,3)+' '+String(d.getFullYear()).slice(2),a,b})}
    const max=Math.max(1,...months.map(x=>Math.max(x.a.total,x.b.total)));
    box.innerHTML='<div class="pj-compare">'+
      '<div class="pj-cmp-card tile-blue"><span>'+MONTHS[m]+' (hasta el día '+dayOfMonth+')</span><strong>'+money(cur.total)+'</strong><small>'+plural(cur.count,'venta','ventas')+' · '+plural(cur.units,'unidad','unidades')+' · '+plural(cur.clients,'cliente','clientes')+'</small></div>'+
      '<div class="pj-cmp-card tile-violet"><span>vs. '+MONTHS[prev.getMonth()]+' a la misma fecha</span><strong>'+money(lastMonthSame.total)+'</strong><small>'+pctLabel(pct(cur.total,lastMonthSame.total))+' · mes completo '+money(lastMonthFull.total)+'</small></div>'+
      '<div class="pj-cmp-card tile-amber"><span>vs. '+MONTHS[m]+' '+(y-1)+' a la misma fecha</span><strong>'+money(lastYearSame.total)+'</strong><small>'+pctLabel(pct(cur.total,lastYearSame.total))+' · mes completo '+money(lastYearFull.total)+'</small></div>'+
      '<div class="pj-cmp-card tile-green"><span>Proyección de cierre de '+MONTHS[m]+'</span><strong>'+money(projected)+'</strong><small>Si sigues al ritmo actual</small></div></div>'+
      '<h3 class="pj-sub">Últimos 12 meses <span class="pj-legend"><i class="lg-now"></i>Este año <i class="lg-prev"></i>Año anterior</span></h3><div class="pj-bars">'+months.map(x=>'<div class="pj-bar-row"><span class="pj-bar-label">'+x.label+'</span><div class="pj-bar-track"><div class="pj-bar now" style="width:'+(x.a.total/max*100).toFixed(1)+'%"></div><div class="pj-bar prev" style="width:'+(x.b.total/max*100).toFixed(1)+'%"></div></div><span class="pj-bar-value">'+money(x.a.total)+'</span></div>').join('')+'</div>';
  }

  function renderProjections(){try{renderProjection();renderComparison()}catch(error){console.error('Proyecciones:',error)}}
  window.renderProjections=renderProjections;
  function bind(){
    ['projectionHorizon','projectionMargin','projectionOnlyBuy'].forEach(id=>$(id)?.addEventListener('change',renderProjection));
    $('projectionSearch')?.addEventListener('input',renderProjection);
    const original=window.renderCash;
    if(typeof original==='function'&&!original.__withProjections){window.renderCash=function(){const r=original.apply(this,arguments);renderProjections();return r};window.renderCash.__withProjections=true}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
