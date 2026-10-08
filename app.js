const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n)||0);
const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DEFAULT_CATEGORIES=['Tabaquería','Caramelos','Arcor','Nestlé','Remedios','Otros'];
let currentView='home',selectedClientId='',cart=[],editingSaleId='',editingProductId=null,editingProductVariant='',editingClientId=null,currentPromos=[],statType='route',statPeriod='day',totalPeriod='week',clientFilter='all',historyType='sales',showVisited=false,routePickerOpen=false,draftProductId='',draftQty='',showCartTray=false;
let lastClientAlertId='',lastClientAlertAt=0;

function readArray(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
function writeArray(k,a){try{localStorage.setItem(k,JSON.stringify(a));return true}catch(e){alert('No se pudo guardar en este dispositivo.');return false}}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function routeSession(){try{const x=JSON.parse(localStorage.getItem('zipperRutaSesion')||'null');return x&&x.date===localDate()&&x.week&&x.day?x:null}catch(e){return null}}
function setRouteSession(week,day){if(!['A','B'].includes(week)||!DAYS.includes(day)){alert('Selecciona semana y día para comenzar la ruta.');return}localStorage.setItem('zipperRutaSesion',JSON.stringify({date:localDate(),week,day,routes:[{week,day}],viewedRoute:{week,day}}));routePickerOpen=false;showVisited=false;renderHome()}
function viewedRoute(){const session=routeSession();if(!session)return null;const r=session.viewedRoute;return r&&['A','B'].includes(r.week)&&DAYS.includes(r.day)?r:{week:session.week,day:session.day}}
function browseRoute(week,day){const session=routeSession();if(!session)return;if(!['A','B'].includes(week)||!DAYS.includes(day))return;const routes=Array.isArray(session.routes)?session.routes:[{week:session.week,day:session.day}];if(!routes.some(r=>r.week===week&&r.day===day))routes.push({week,day});session.routes=routes;session.viewedRoute={week,day};localStorage.setItem('zipperRutaSesion',JSON.stringify(session));routePickerOpen=false;showVisited=false;$('homeName').value='';$('homeAddress').value='';$('visitedReview').classList.add('hidden');$('visitedSales').innerHTML='';renderHome()}
function returnDailyRoute(){const session=routeSession();if(session)browseRoute(session.week,session.day)}
function clearRouteSession(){localStorage.removeItem('zipperRutaSesion');$('homeWeek').value='';$('homeDay').value='';routePickerOpen=false;showVisited=false;selectedClientId='';editingSaleId='';cart=[];draftProductId='';draftQty='';showCartTray=false;$('homeName').value='';$('homeAddress').value='';$('cartSection').classList.add('hidden');$('visitedReview').classList.add('hidden');$('visitedSales').classList.add('hidden');$('visitedSales').innerHTML='';showView('home')}
function visitedIds(){return readArray('zipperVisitados-'+localDate())}
function markClientVisited(id){const c=clientById(id);if(!c)return;markVisited(c.id);selectedClientId='';editingSaleId='';cart=[];draftProductId='';draftQty='';showCartTray=false;showVisited=false;renderHome();$('saleStatus').textContent='Cliente marcado como visitado sin registrar una venta.';}
function markVisited(id){const a=visitedIds().map(String).filter(x=>x!==String(id));a.unshift(String(id));writeArray('zipperVisitados-'+localDate(),a)}
function uid(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function confirmDelete(title,detail,onConfirm){const modal=$('deleteConfirmModal');if(!modal){if(window.confirm(detail))onConfirm();return}$('deleteConfirmTitle').textContent=title||'Confirmar borrado';$('deleteConfirmMessage').textContent=detail||'¿Estás seguro que quieres borrar?';modal.classList.remove('hidden');const accept=$('deleteConfirmAccept'),cancel=$('deleteConfirmCancel');const close=()=>{modal.classList.add('hidden');accept.onclick=null;cancel.onclick=null};cancel.onclick=close;accept.onclick=()=>{close();onConfirm()};setTimeout(()=>accept.focus(),0)}
function getCategories(){const removed=readArray('zipperCategoriasEliminadas').map(String);const saved=readArray('zipperCategorias').filter(x=>String(x).trim()).map(String);return [...new Set([...DEFAULT_CATEGORIES,...saved].filter(x=>!removed.some(r=>norm(r)===norm(x))))].sort((a,b)=>a.localeCompare(b,'es'))}
function getClients(){return readArray('zipperClientes').filter(c=>c&&c.id!=null&&String(c.name||'').trim()).map(c=>({...c,name:String(c.name).trim(),rut:String(c.rut||'').toUpperCase(),phone:String(c.phone||''),address:String(c.address||''),route:String(c.route||''),routeWeek:(c.routeWeek==='1'||c.week==='1')?'A':(c.routeWeek==='2'||c.week==='2')?'B':(c.routeWeek||c.week||'A'),routeDay:c.routeDay||c.day||'',active:c.active!==false}))}
function clientRoute(c,week){const w=String(week||'A');const ra=c&&c.routeAssignments&&c.routeAssignments[w];if(ra)return {week:w,day:ra.day||'',position:Number(ra.position)||999999};if(w==='B'&&c&&c.routeWeekB)return {week:'B',day:c.routeDayB||'',position:Number(c.routePositionB)||999999};if(c&&String(c.routeWeek||'A')===w)return {week:w,day:c.routeDay||c.day||'',position:Number(c.routePosition)||999999};return null}
function setClientRoute(c,week,day,position){const w=String(week||'A');c.routeAssignments=c.routeAssignments&&typeof c.routeAssignments==='object'?c.routeAssignments:{};c.routeAssignments[w]={day:day||'',position:Number(position)||999999};if(w==='A'){c.routeWeek='A';c.routeDay=day||'';c.routePosition=Number(position)||999999}else{c.routeWeekB='B';c.routeDayB=day||'';c.routePositionB=Number(position)||999999;if(!c.routeWeek||c.routeWeek==='B'){c.routeWeek='B';c.routeDay=day||'';c.routePosition=Number(position)||999999}}}
function defaultPromos(name){const n=norm(name);const p=[];if(/ron[ ._-]*son.*trans|ron[ ._-]*trans/.test(n))p.push({minQty:10,price:3300,label:'Desde 10 unidades: $3.300'});if(/bigtime.*ultra/.test(n))p.push({minQty:3,price:11200,label:'Desde 3 unidades: $11.200'});return p}

function getRawProducts(){return readArray('zipperProductos').filter(p=>p&&p.id!=null&&String(p.name||'').trim()).map(p=>({...p,name:String(p.name).trim(),category:p.category||'Otros',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}))}
function canonicalUltraRows(raw){const defs=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}];const rows=raw.filter(p=>{const n=norm(p.name);return p.variantKey==='bigtime-ultra'||n.includes('bigtime ultra')});if(!rows.length)return [];const base=rows[0];const sums={negro:0,azul:0,rojo:0,verde:0};rows.forEach(p=>{const f=norm(p.flavor),c=norm(p.color),n=norm(p.name);let k='';if(f.includes('menta fuerte')||c==='negro'||n.includes('menta fuerte')||n.includes(' negro'))k='negro';else if(f.includes('aqua azul')||c==='azul'||n.includes('aqua azul')||n.includes(' azul'))k='azul';else if(f.includes('sandia')||c==='rojo'||n.includes('sandia')||n.includes(' rojo'))k='rojo';else if(f==='menta'||c==='verde'||n.includes(' menta')||n.includes(' verde'))k='verde';if(k)sums[k]+=Number(p.stock||0)});return defs.map(d=>({...base,id:(rows.find(p=>norm(p.color)===d.color)?.id||base.id),name:'Big Time Ultra · '+d.flavor,color:d.color,flavor:d.flavor,variantKey:'bigtime-ultra',category:base.category||'Tabaquería',stock:sums[d.color]||0,pricePurchase:Math.max(0,Number(base.pricePurchase??base.purchasePrice)||0),price:Math.max(0,Number(base.price??base.priceSale)||0),active:base.active!==false,promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}))}
function getProducts(){const raw=readArray('zipperProductos').filter(p=>p&&p.id!=null&&String(p.name||'').trim());const hasBT=raw.some(p=>p.variantKey==='bigtime'&&p.flavor);const hasBU=raw.some(p=>p.variantKey==='bigtime-ultra'&&p.flavor);const hasAL=raw.some(p=>p.variantKey==='alka2'&&p.flavor);const hasLA=raw.some(p=>p.variantKey==='languetazo'&&p.color);let bt=0,bu=0,al=0,la=0;const colorsBT=[{color:'verde',flavor:'Menta'},{color:'negro',flavor:'Menta fuerte'},{color:'rojo',flavor:'Sandía'},{color:'aqua',flavor:'Aqua azul'},{color:'celeste',flavor:'Refrescante'},{color:'rosado',flavor:'Bubble Gum'}],colorsBU=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}],colorsAL=['rosado','azul','verde'],colorsLA=['verde','naranja'];const tabacoSabores=['Chocolate','Cherry','Caramelo','Vainilla','Original','Mango','Uva','Arándano','Menta','Sandía','Maracuyá','Coco','Virginia','Café turco','Chicle'];const ultraRows=canonicalUltraRows(raw);return raw.filter(p=>{const n=norm(p.name);return !(p.variantKey==='bigtime-ultra'||n.includes('bigtime ultra'))}).flatMap(p=>{const original=String(p.name).trim(),n=norm(original);if(n.includes('tabaco bristol')&&!p.variantKey){return tabacoSabores.map((s,ix)=>({...p,id:String(p.id)+'::tabaco::'+ix,name:'Tabaco Bristol 45 gr · '+s,flavor:s,baseProductId:p.id,variantKey:'tabaco-bristol',category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}))}if(p.variantKey==='tabaco-bristol'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Tabaquería',promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='bigtime'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='bigtime-ultra'&&p.flavor){const f=norm(p.flavor),col=norm(p.color);const canon=f.includes('menta fuerte')?'negro':f.includes('aqua azul')?'azul':f.includes('sandia')?'rojo':f==='menta'?'verde':col;return [{...p,name:'Big Time Ultra · '+(canon==='negro'?'Menta fuerte':canon==='azul'?'Aqua azul':canon==='rojo'?'Sandía':'Menta'),color:canon||'negro',flavor:canon==='negro'?'Menta fuerte':canon==='azul'?'Aqua azul':canon==='rojo'?'Sandía':'Menta',category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}]};if(p.variantKey==='alka2'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Caramelos',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='languetazo'&&p.color)return [{...p,name:String(p.name).trim(),category:p.category||'Caramelos',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(n.includes('bigtime ultra')){if(hasBU)return [];if(/promo|11200/.test(n))return [];const ix=bu++;if(ix>=4)return [];p={...p,name:'Big Time Ultra · '+colorsBU[ix].flavor,color:colorsBU[ix].color,flavor:colorsBU[ix].flavor,variantKey:'bigtime-ultra',category:p.category||'Tabaquería',promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}}else if(/^bigtime\b/.test(n)){if(hasBT)return [];const ix=bt++;if(ix>=6)return [];p={...p,name:'Big Time · '+colorsBT[ix].flavor,color:colorsBT[ix].color,flavor:colorsBT[ix].flavor,variantKey:'bigtime',category:p.category||'Tabaquería'}}else if(n.includes('alka 2')){if(hasAL)return [];const ix=al++;if(ix>=3)return [];p={...p,name:'Alka 2 · '+colorsAL[ix],color:colorsAL[ix],variantKey:'alka2',category:p.category||'Caramelos'}}else if(n.includes('languetaz')){if(hasLA)return [];const ix=la++;if(ix>=2)return [];p={...p,name:'Languetazo · '+colorsLA[ix],color:colorsLA[ix],variantKey:'languetazo',category:p.category||'Caramelos'}}return p?[{...p,name:String(p.name).trim(),category:p.category||'Otros',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}]:[]}).concat(ultraRows).filter(Boolean).filter(p=>!(p.baseProductId&&p.disabledVariants&&p.disabledVariants[norm(p.flavor||p.color||'')])).reduce((acc,p)=>{const key=p.variantKey==='bigtime'||p.variantKey==='bigtime-ultra'||p.variantKey==='alka2'||p.variantKey==='languetazo'||p.variantKey==='tabaco-bristol'?(p.variantKey+'|'+norm(p.flavor||p.color||p.name)):null;if(key){const old=acc.find(x=>x.__variantKey===key);if(old){if(Number(p.stock||0)>Number(old.stock||0))old.stock=p.stock;return acc}p.__variantKey=key}acc.push(p);return acc},[]).map(p=>{delete p.__variantKey;return p}).sort((a,b)=>{const order={'bigtime':1,'bigtime-ultra':2,'alka2':3,'languetazo':4,'tabaco-bristol':5};const oa=order[a.variantKey]||9,ob=order[b.variantKey]||9;return oa-ob||String(a.name).localeCompare(String(b.name),'es')})}
function getSales(){return readArray('zipperComprobantes')}
function clientById(id){return getClients().find(c=>String(c.id)===String(id))}
function productById(id){const ps=getProducts();return ps.find(p=>String(p.id)===String(id))||(String(id).startsWith('ultra-display-')?ps.find(p=>p.variantKey==='bigtime-ultra'&&p.color===String(id).slice(14)):null)}
function saleItemStockId(i){const id=i.baseProductId||i.productId;const p=productById(id);return p?(p.baseProductId||p.id):id}
function saleTotal(s){return(s.items||[]).reduce((a,i)=>a+Math.round(Number(i.qty||0)*Number(i.price||0)),0)}
function saleCost(s){return(s.items||[]).reduce((a,i)=>a+Math.round(Number(i.qty||0)*Number(i.purchasePrice||0)),0)}
function saleProfit(s){return saleTotal(s)-saleCost(s)}
function saleDate(s){return String(s.fecha||s.date||'').slice(0,10)}
function periodMatch(date,period){const d=String(date||'');const now=localDate();if(period==='day')return d===now;const n=new Date(now+'T12:00:00');const x=new Date(d+'T12:00:00');if(Number.isNaN(x.getTime()))return false;if(period==='month')return d.slice(0,7)===now.slice(0,7);if(period==='year')return d.slice(0,4)===now.slice(0,4);const start=new Date(n);start.setDate(n.getDate()-((n.getDay()+6)%7));return x>=start&&x<=n}
function promotionGroup(p){return p.variantKey==='bigtime-ultra'?'bigtime-ultra':null}
function effectivePrice(p,qty){let price=Number(p.price)||0,applied=null;const group=promotionGroup(p);let effectiveQty=qty;if(group)effectiveQty=cart.reduce((a,i)=>{const x=productById(i.productId);return a+(x&&promotionGroup(x)===group?Number(i.qty||0):0)},0);(p.promotions||[]).slice().sort((a,b)=>Number(b.minQty)-Number(a.minQty)).some(pr=>{if(effectiveQty>=Number(pr.minQty)&&Number(pr.price)>=0){price=Number(pr.price);applied=pr;return true}return false});return{price,applied,effectiveQty}}
function productLabel(p){return p.name}
function normalizeClientFields(){if(!$('clientRut')||!$('clientPhone'))return;$('clientRut').value=formatRut($('clientRut').value);$('clientPhone').value=formatPhone($('clientPhone').value)}
function showView(name){
  if(name!=='clients'&&$('clientsView')&&!$('clientsView').classList.contains('hidden')){
    normalizeClientFields();
    if(!validateClientField(true)){
      $('clientValidation').scrollIntoView({behavior:'smooth',block:'center'});
      return
    }
  }
  currentView=name;const map={home:'homeView',cash:'cashView',products:'productsView',clients:'clientsView',history:'historyView'};Object.entries(map).forEach(([k,id])=>$(id).classList.toggle('hidden',k!==name));const labels={home:'Inicio',cash:'Caja diaria',products:'Productos',clients:'Clientes',history:'Historial'};$('pageTitle').textContent=labels[name];document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.id===name+'Tab'));window.scrollTo(0,0);if(name==='home')renderHome();if(name==='cash')renderCash();if(name==='products'){renderProductForm();renderInventory();renderCategories()}if(name==='clients'){renderClients()}if(name==='history')renderHistory()}
function bindNav(){
  [['homeTab','home'],['cashTab','cash'],['productsTab','products'],['clientsTab','clients'],['historyTab','history']]
  .forEach(([id,v])=>{
    $(id).onclick=e=>{
      e.preventDefault();
      if(v!=='clients'&&$('clientsView')&&!$('clientsView').classList.contains('hidden')){
        normalizeClientFields();
        if(!validateClientField(true)){
          $('clientValidation').scrollIntoView({behavior:'smooth',block:'center'});
          return
        }
      }
      showView(v)
    }
  })
}
function migrateVariantInventory(){
  const ps=getRawProducts();
  let changed=false;
  const out=[];
  const btColors=[{color:'verde',flavor:'Menta'},{color:'negro',flavor:'Menta fuerte'},{color:'rojo',flavor:'Sandía'},{color:'aqua',flavor:'Aqua azul'},{color:'celeste',flavor:'Refrescante'},{color:'rosado',flavor:'Bubble Gum'}];
  const buColors=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}];
  const alColors=['rosado','azul','verde'];
  const laColors=['verde','naranja'];
  const tabacoSabores=['Chocolate','Cherry','Caramelo','Vainilla','Original','Mango','Uva','Arándano','Menta','Sandía','Maracuyá','Coco','Virginia','Café turco','Chicle'];

  // If old Tabaco was a single product, split its stock into the 15 independent flavors.
  ps.forEach(p=>{
    const n=norm(p.name);
    if(n.includes('tabaco bristol') && !p.flavor){
      tabacoSabores.forEach((flavor,i)=>out.push({...p,id:i===0?p.id:uid(),name:'Tabaco Bristol 45 gr · '+flavor,flavor,variantKey:'tabaco-bristol',stock:i===4?Number(p.stock||0):0}));
      changed=true;
    }else out.push(p);
  });

  // Ensure all BigTime/Ultra/Alka 2/Languetazo variants exist even when an older localStorage
  // version had only one generic product. Existing stock stays on the first available variant.
  const ensureGroup=(match,defs,variantKey)=>{
    const rows=out.filter(p=>match(norm(p.name)) && p.variantKey!==variantKey);
    const existing=out.filter(p=>p.variantKey===variantKey);
    if(existing.length>=defs.length)return;
    const base=rows[0]||existing[0];
    if(!base)return;
    if(rows.length){
      const ix=out.indexOf(base);
      out.splice(ix,1);
    }
    const stock=Number(base.stock||0);
    const pricePurchase=Number(base.pricePurchase??base.purchasePrice)||0;
    const price=Number(base.price??base.priceSale)||0;
    const category=base.category;
    defs.forEach((d,i)=>{
      const ex=existing[i];
      if(ex){ return; }
      out.push({...base,id:i===0?base.id:uid(),name:(variantKey==='bigtime'?'Big Time · ':variantKey==='bigtime-ultra'?'Big Time Ultra · ':variantKey==='alka2'?'Alka 2 · ':'Languetazo · ')+d.flavor,flavor:d.flavor,color:d.color,variantKey,category,pricePurchase,price,stock:i===0?stock:0});
    });
    changed=true;
  };
  ensureGroup(n=>/^bigtime\b/.test(n)&&!n.includes('ultra')&&n!=='bigtime',btColors,'bigtime');
  ensureGroup(n=>n.includes('bigtime ultra')&&!/promo|11200/.test(n),buColors,'bigtime-ultra');
  ensureGroup(n=>n.includes('alka 2'),alColors,'alka2');
  ensureGroup(n=>n.includes('languetaz'),laColors,'languetazo');

  if(changed){writeArray('zipperProductos',out);return true}
  return false;
}

function repairUltraVariants(){const ps=getRawProducts();const rows=ps.filter(p=>p.variantKey==='bigtime-ultra'&&p.flavor);if(!rows.length)return false;const defs=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}];const generic=ps.filter(p=>!(p.variantKey==='bigtime-ultra'&&p.flavor));const base=rows[0];const sums={negro:0,azul:0,rojo:0,verde:0};rows.forEach(p=>{const f=norm(p.flavor),col=norm(p.color),name=norm(p.name);let key='';if(f.includes('menta fuerte')||col==='negro'||name.includes('menta fuerte')||name.includes(' negro'))key='negro';else if(f.includes('aqua azul')||col==='azul'||name.includes('aqua azul')||name.includes(' azul'))key='azul';else if(f.includes('sandia')||col==='rojo'||name.includes('sandia')||name.includes(' rojo'))key='rojo';else if(f==='menta'||col==='verde'||name.includes('menta')||name.includes(' verde'))key='verde';if(key)sums[key]+=Number(p.stock||0)});const out=defs.map(def=>({...base,id:(rows.find(p=>norm(p.color)===def.color)?.id||uid()),name:'Big Time Ultra · '+def.flavor,color:def.color,flavor:def.flavor,variantKey:'bigtime-ultra',category:base.category||'Tabaquería',stock:sums[def.color]||0,pricePurchase:Number(base.pricePurchase??base.purchasePrice)||0,price:Number(base.price??base.priceSale)||0,promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}));writeArray('zipperProductos',[...generic,...out]);return true}
function applyInventoryUpdate(){
  const VERSION='inventory-format-1';
  if(localStorage.getItem('zipperInventoryUpdateVersion')===VERSION)return false;
  const ps=getRawProducts();
  if(!ps.length)return false;
  const setNameStock=(test,name,stock)=>{
    const p=ps.find(test);
    if(!p)return false;
    p.name=name;p.stock=Math.max(0,Number(stock)||0);p.active=true;return true
  };
  const byName=s=>p=>norm(p.name)===norm(s);
  const byContains=s=>p=>norm(p.name).includes(norm(s));

  // Uniform spelling/format while preserving the requested product names.
  setNameStock(byContains('pañuelo elite'),'Pañuelo Elite',11);
  setNameStock(byContains('vaso 10oz'),'Vaso chico 10 oz',21);
  setNameStock(byContains('vaso rojo'),'Vaso rojo 16 oz',0);
  setNameStock(byContains('vaso 160z'),'Vaso grande 16 oz',25);
  setNameStock(byContains('huincha'),'Wincha de embalaje',14);
  setNameStock(byContains('ron.clasic'),'Ronson clásico',52);
  setNameStock(byContains('ron. diseño'),'Ronson diseño',28);
  setNameStock(p=>norm(p.name).includes('ron.trans'), 'Ronson transparente',66);
  setNameStock(byName('CHISPER'),'Chispero',12);
  setNameStock(byContains('clipper'),'Clipper',2);
  setNameStock(byContains('filtro verso mentol'),'Filtro Verso Mentol',38);
  setNameStock(byContains('filtro verso grueso'),'Filtro Verso Azul',71);
  setNameStock(byContains('filtro verso clasico'),'Filtro Verso Rojo',31);
  setNameStock(byContains('filtro verso organico'),'Filtro Verso Café Orgánico',33);
  setNameStock(byContains('enrolador'),'Enrolador',22);
  setNameStock(byName('moledor'),'Moledor',48);
  setNameStock(byContains('pipas con moledor'),'Pipas con moledor',57);
  setNameStock(byName('pipas'),'Pipas con malla',0);
  setNameStock(byContains('ocb c/ boquilla'),'OCB con boquilla',2);
  setNameStock(byContains('amster con boquilla'),'Amsterdam papelillo con boquilla',5);
  setNameStock(byContains('boquilla  ocb'),'Boquilla OCB',3);
  setNameStock(byContains('boquilla amsterdam'),'Boquilla Amsterdam',7);
  setNameStock(byContains('amsterda'),'Papelillo Amsterdam',3);
  setNameStock(byContains('ocb organico'),'OCB Orgánico',2);
  setNameStock(byContains('ocb        gris'),'OCB Gris Expert',2);
  setNameStock(byContains('ocb negro'),'OCB Negro',14);
  setNameStock(byContains('cono rosa'),'Papelillo cono rosa',2);
  setNameStock(byContains('blunt de rosa'),'Blun pétalos de rosa',8);
  setNameStock(byContains('blunt                '),'Blunt',569);
  setNameStock(byContains('raw c/ boqui'),'RAW',106);
  const rawBox=ps.find(byContains('raw c/    boquilla'));
  if(rawBox)rawBox.active=false;
  const kitBox=ps.find(byContains('kit-kat'));
  if(kitBox)kitBox.active=false;
  setNameStock(byContains('kit - kat'),'Kit Kat unidad',240);
  setNameStock(byContains('bolsa botillera'),'Bolsa botillera',9);
  setNameStock(byContains('bolsa de basura    80x100'),'Bolsa de basura 80x110',9);
  setNameStock(byContains('bolsa de basura    90x120'),'Bolsa de basura 90x120',14);
  setNameStock(byContains('pila aa'),'Pila Eveready doble A',6);
  setNameStock(byContains('pila aaa'),'Pila Eveready triple A',17);
  setNameStock(byContains('pila d'),'Pila Eveready D',5);

  // Caramelos / Arcor / Nestlé.
  setNameStock(byContains('bazooka'),'Bazooka',18);
  setNameStock(byContains('bon o bon'),'Bonobon',61);
  setNameStock(byName('nikolo'),'Nikolo',4);
  setNameStock(byName('chubi'),'Chubi',20);
  setNameStock(byName('tifany'),'Tiffany',11);
  setNameStock(byContains('rocklet  naranjo'),'Rocklet naranja',7);
  setNameStock(byContains('rocklet  negro'),'Rocklet negro',9);
  setNameStock(byName('amberry'),'Gomitas Amberry',5);
  setNameStock(byName('ambrosit'),'Gomitas Ambrosito',0);
  setNameStock(byName('flippy'),'Gomitas Flippy',0);
  setNameStock(byContains('frutillas con crema'),'Gomitas Ambrosoli frutillas con crema',6);
  setNameStock(byName('loop'),'Gomitas Loop',4);
  setNameStock(byName('turron'),'Turrón',10);
  setNameStock(byContains('menta chocolate'),'Caramelo menta chocolate',13);
  setNameStock(byContains('tofee surtido'),'Tofi/Tofee surtido 400g',13);
  setNameStock(byContains('chupete    bowlings'),'Coyac bowling',8);
  setNameStock(byName('mentitas'),'Mentitas Ambrosoli',8);
  setNameStock(byName('full'),'Full de Ambrosoli',1);
  const free=ps.filter(p=>norm(p.name).includes('freegells'));
  [['amarillo',7],['rojo',2],['azul',10]].forEach((x,i)=>{if(free[i]){free[i].name='Freegels '+x[0];free[i].stock=x[1];free[i].active=true}});
  const alka2=ps.filter(p=>norm(p.name).includes('alka 2'));
  ['rosado','azul','verde'].forEach((color,i)=>{if(alka2[i]){alka2[i].name='Alka 2 · '+color;alka2[i].flavor=color;alka2[i].color=color;alka2[i].variantKey='alka2';alka2[i].stock=[27,20,13][i];alka2[i].active=true}});
  const lang=ps.filter(p=>norm(p.name).includes('languetaz'));
  [['verde',3],['naranja',1]].forEach((x,i)=>{if(lang[i]){lang[i].name='Languetazo · '+x[0];lang[i].color=x[0];lang[i].variantKey='languetazo';lang[i].stock=x[1];lang[i].active=true}});
  setNameStock(byContains('conquista rollo'),'Conquista palmerita',64);
  setNameStock(byName('cracker'),'Cracker',86);
  setNameStock(byContains('galleta vino'),'Galleta de vino',78);
  setNameStock(byContains('triton chocolate'),'Tritón chocolate',178);
  setNameStock(byContains('triton vainilla'),'Tritón vainilla',195);
  setNameStock(byContains('super 8'),'Super 8',9);
  setNameStock(byContains('trencito'),'Trencito 80g',43);

  // Bristol: 15 variants, with the exact stocks dictated by the user.
  const br=ps.filter(p=>p.variantKey==='tabaco-bristol' || norm(p.name).includes('tabaco bristol'));
  const brStocks={uva:24,caramelo:39,menta:21,coco:10,virginia:5,arandano:9,cherry:18,berry:10,mango:32,vainilla:35,original:57,'mango maracuya':15,chicle:3,chocolate:36,'cafe turco':10};
  const brRows=br.length?br:[];
  Object.entries(brStocks).forEach(([key,stock])=>{
    const p=brRows.find(x=>norm(x.flavor||x.name).includes(key));
    if(p){p.name='Tabaco Bristol 45 gr · '+({'arandano':'Arándano','mango maracuya':'Mango maracuyá','cafe turco':'Café turco'}[key]||key.replace(/(^| )\\w/g,m=>m.toUpperCase()));p.stock=stock;p.variantKey='tabaco-bristol';p.flavor=p.name.split(' · ')[1];p.active=true}
  });

  // Big Time and Big Time Ultra variants.
  const bt=ps.filter(p=>p.variantKey==='bigtime');
  const btStocks={menta:132,'menta fuerte':195,'sandia':130,'aqua azul':82,refrescante:78,'bubble gum':44};
  bt.forEach(p=>{const f=norm(p.flavor||p.name);const k=Object.keys(btStocks).find(x=>f.includes(x));if(k){const label={'menta':'Menta','menta fuerte':'Menta fuerte','sandia':'Rojo','aqua azul':'Azul','refrescante':'Celeste','bubble gum':'Rosado'}[k];p.name='Big Time '+label;p.stock=btStocks[k];p.active=true}});
  const bu=ps.filter(p=>p.variantKey==='bigtime-ultra');
  const buStocks={'menta fuerte':25,'aqua azul':9,sandia:7,menta:13};
  bu.forEach(p=>{const f=norm(p.flavor||p.name);const k=Object.keys(buStocks).find(x=>f.includes(x));if(k){const label={'menta fuerte':'Negro','aqua azul':'Azul',sandia:'Rojo',menta:'Verde'}[k];p.name='Big Time Ultra '+label;p.stock=buStocks[k];p.active=true}});

  // Alka, Alka Ice and Enora keep their requested product words; only spelling/case is normalized.
  setNameStock(byName('alka'),'Alka',34);
  setNameStock(byName('alka ice'),'Alka Ice',4);
  setNameStock(byName('en hora'),'Enora',2);
  const eno=ps.find(byName('eno'));
  if(eno){eno.name='Eno azul';eno.stock=4;eno.active=true;const ev={...eno,id:uid(),name:'Eno verde',stock:1};ps.push(ev)}

  // Medicines.
  const med={
    ibuprofeno:18,loperamida:4,famotidina:2,clorfenamina:4,ketoprofeno:6,ketorolaco:6,colmax:5,
    paracetamol:16,domperidona:4,'pastilla carbon':14,naproxeno:13,loratadina:4,migranol:9,
    amoxicilina:2,diclofenaco:11,desloratadina:6,omeprasol:1,cefalmin:10,preservativos:155,
    'parche curitas':1
  };
  Object.entries(med).forEach(([needle,stock])=>{
    const p=ps.find(x=>norm(x.name).includes(needle));
    if(p){p.stock=stock;p.active=true}
  });
  // Tapsin variants.
  setNameStock(byContains('tapsin dia'),'Tabsin limonada día',118);
  setNameStock(byContains('tapsin noche'),'Tabsin limonada noche',33);
  setNameStock(byContains('tapsin calnte dia'),'Tabsin rojo pastilla día',4);
  setNameStock(byContains('tapsin calnte noche'),'Tabsin morado pastilla noche',53);
  // Explicitly requested Alka naming and remaining variant stocks.
  const alka=ps.filter(p=>p.variantKey==='alka2');
  if(alka.length>=3)[27,20,13].forEach((v,i)=>alka[i].stock=v);

  writeArray('zipperProductos',ps);
  localStorage.setItem('zipperInventoryUpdateVersion',VERSION);
  return true
}

function installDictatedInventory(s){
 const version=s.inventoryBaselineVersion;
 if(!version||localStorage.getItem('zipperDictatedInventoryVersion')===version)return false;
 if(s.products.some(p=>!p.id||!String(p.name||'').trim()||!Number.isInteger(p.stock)||p.stock<0)||new Set(s.products.map(p=>String(p.id))).size!==s.products.length)throw Error('Inventario base inválido');
 const existing=getRawProducts(),clean=v=>norm(v).replace(/\s+/g,' ');
 const products=s.products.map(p=>{const aliases=(p.baselineAliases||[p.name]).map(clean);let found=p.variantKey?existing.find(x=>x.variantKey===p.variantKey&&clean(x.flavor||x.color||'')===clean(p.flavor||p.color||'')):existing.find(x=>!x.variantKey&&aliases.includes(clean(x.name)));const next={...p};delete next.baselineAliases;if(found){next.price=found.price;next.pricePurchase=found.pricePurchase;next.promotions=found.promotions}return next});
 const targets=['zipperProductos','zipperComprobantes','zipperInventoryUpdateVersion','zipperDictatedInventoryVersion','zipperSeedVersion',...Object.keys(localStorage).filter(k=>k.startsWith('zipperVisitados-'))],before={};targets.forEach(k=>before[k]=localStorage.getItem(k));
 localStorage.setItem('zipperRespaldoAntesBaseDictada',JSON.stringify({date:new Date().toISOString(),data:before}));
 try{localStorage.setItem('zipperProductos',JSON.stringify(products));/* IMPORTANTE: una actualización de inventario nunca debe borrar ventas ni visitas históricas. */localStorage.setItem('zipperInventoryUpdateVersion','inventory-format-1');localStorage.setItem('zipperSeedVersion',String(s.version));localStorage.setItem('zipperDictatedInventoryVersion',version)}
 catch(e){targets.forEach(k=>{if(before[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[k])});throw e}
 cart=[];selectedClientId='';editingSaleId='';return true
}
function loadSeed(){return fetch('./data/zipper-seed.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No se pudo cargar el inventario');return r.json()}).then(s=>{
 if(!s||!Array.isArray(s.clients)||!Array.isArray(s.products))throw Error('Base inválida');
 installDictatedInventory(s);
 const ver=String(s.version||'1');
 if(localStorage.getItem('zipperSeedVersion')!==ver||!getClients().length){const cs=getClients();s.clients.forEach(x=>{const name=String(x.name||'').trim();if(name&&!cs.some(c=>norm(c.name)===norm(name)&&norm(c.address)===norm(x.address)))cs.push({...x,id:uid(),route:x.route||'',routeWeek:x.routeWeek||'A',routeDay:x.routeDay||'',active:x.active!==false})});writeArray('zipperClientes',cs);writeArray('zipperCategorias',[...(s.categories||[]),...getCategories()]);localStorage.setItem('zipperSeedVersion',ver)}
 renderHome();renderInventory();renderClients();renderCash();renderHistory()
 }).catch(e=>{alert('No se pudo incorporar la base del inventario: '+e.message)})}


function latestSalesForClient(id){return getSales().filter(s=>String(s.clienteId)===String(id)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||Number(b.folio||0)-Number(a.folio||0))}function renderVisitedSales(id){const rows=latestSalesForClient(id);$('visitedSales').innerHTML=rows.length?'<div class="kicker">VENTAS REGISTRADAS DE ESTE CLIENTE</div>'+rows.map(s=>'<article class="history-row"><div><strong>#'+esc(s.folio)+' · '+esc(s.fecha)+'</strong><span>'+(s.items||[]).map(i=>esc(i.qty)+' × '+esc(i.desc)).join(' · ')+'</span></div><div class="actions-small"><strong>'+money(saleTotal(s))+'</strong>'+(saleDate(s)===localDate()?'<button class="primary edit-visited-sale" data-id="'+esc(s.clienteId)+'" type="button">Modificar venta</button>':'')+'<button class="secondary reprint-visited" data-id="'+esc(s.id)+'" type="button">Reimprimir</button></div></article>').join(''):'<p class="muted">Este cliente aún no tiene ventas registradas.</p>';document.querySelectorAll('.review-visited').forEach(b=>b.onclick=()=>renderReviewForClient(b.dataset.id));document.querySelectorAll('.edit-visited-sale').forEach(b=>b.onclick=()=>openClientSaleForEdit(b.dataset.id));document.querySelectorAll('.reprint-visited').forEach(b=>b.onclick=()=>{const sale=getSales().find(x=>String(x.id)===String(b.dataset.id));if(sale){renderPrint(sale);openReceiptPreview()}})}function renderHome(){
  const all=getClients().filter(c=>c.active!==false),session=routeSession(),view=viewedRoute();
  $('routeSetup').classList.toggle('hidden',!!session);
  $('activeRouteBox').classList.toggle('hidden',!session||!!selectedClientId);
  $('routePicker').classList.toggle('hidden',!session||!routePickerOpen);
  if(!session){$('routeClients').innerHTML='';$('dailyRoutes').innerHTML='';$('returnDailyRoute').classList.add('hidden');$('visitedButton').textContent='Visitados (0)';return}
  $('activeRouteLabel').textContent='Semana '+view.week+' · '+view.day;
  const routes=Array.isArray(session.routes)?session.routes:[{week:session.week,day:session.day}];
  $('dailyRoutes').innerHTML='<p class="daily-route-note">Ruta inicial de hoy: Semana '+esc(session.week)+' · '+esc(session.day)+'</p>'+routes.map(r=>'<button class="secondary daily-route '+(r.week===view.week&&r.day===view.day?'active':'')+'" data-week="'+esc(r.week)+'" data-day="'+esc(r.day)+'" type="button">Semana '+esc(r.week)+' · '+esc(r.day)+'</button>').join('');
  $('returnDailyRoute').classList.toggle('hidden',view.week===session.week&&view.day===session.day);
  document.querySelectorAll('.daily-route').forEach(b=>b.onclick=()=>browseRoute(b.dataset.week,b.dataset.day));
  const visited=visitedIds().map(String),hn=norm($('homeName').value),ha=norm($('homeAddress').value);
  const members=all.filter(c=>{const r=clientRoute(c,view.week);return r&&norm(r.day)===norm(view.day)});
  const filtered=members.filter(c=>(!hn||searchMatches(c.name,hn))&&(!ha||searchMatches(c.address,ha)));
  const rows=filtered.filter(c=>showVisited?visited.includes(String(c.id)):!visited.includes(String(c.id))).sort((a,b)=>showVisited?visited.indexOf(String(a.id))-visited.indexOf(String(b.id)):bestSearchScore([a.name,a.address],hn)-bestSearchScore([b.name,b.address],hn)||bestSearchScore([a.address,a.name],ha)-bestSearchScore([b.address,b.name],ha)||clientRoute(a,view.week).position-clientRoute(b,view.week).position||a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
  $('routeClients').innerHTML=rows.length?rows.map(c=>{const sale=latestSalesForClient(c.id).find(s=>saleDate(s)===localDate());return '<article class="route-client '+(showVisited?'visited-row':'')+'"><div><strong>'+esc(c.name)+'</strong><span>'+esc(c.address||'Sin dirección')+'</span><span>Semana '+esc(view.week)+' · '+esc(view.day)+'</span></div><div class="actions-small">'+(showVisited?'<span class="sale-status-badge '+(sale?'has-sale':'no-sale')+'">'+(sale?'VENTA · '+money(saleTotal(sale)):'VISITADO · SIN VENTA')+'</span><button class="primary review-visited" data-id="'+esc(c.id)+'" type="button">Revisar</button><button class="primary edit-visited-sale" data-id="'+esc(c.id)+'" type="button">Agregar / modificar venta</button><button class="secondary reprint-last" data-id="'+esc(c.id)+'" type="button">Reimprimir último</button><button class="ghost view-client-sales" data-id="'+esc(c.id)+'" type="button">Ventas anteriores</button>':'<button class="primary select-client" data-id="'+esc(c.id)+'" type="button">Carrito</button><button class="secondary mark-visited" data-id="'+esc(c.id)+'" type="button">Visitado</button>')+'</div></article>'}).join(''):'<p class="muted">'+(showVisited?'Aún no hay clientes visitados.':'No quedan clientes pendientes para esta ruta.')+'</p>';
  $('visitedSales').classList.toggle('hidden',!showVisited);$('visitedBack').classList.toggle('hidden',!showVisited);
  document.querySelectorAll('.review-visited').forEach(b=>b.onclick=()=>renderReviewForClient(b.dataset.id));
  document.querySelectorAll('.edit-visited-sale').forEach(b=>b.onclick=()=>openClientSaleForEdit(b.dataset.id));
  document.querySelectorAll('.reprint-last').forEach(b=>b.onclick=()=>{const sale=latestSalesForClient(b.dataset.id).find(s=>saleDate(s)===localDate());if(sale){renderPrint(sale);openReceiptPreview()}});
  document.querySelectorAll('.view-client-sales').forEach(b=>b.onclick=()=>{renderVisitedSales(b.dataset.id);$('visitedSales').scrollIntoView({behavior:'smooth',block:'start'})});
  document.querySelectorAll('.select-client').forEach(b=>b.onclick=()=>openClientCart(b.dataset.id));
  document.querySelectorAll('.mark-visited').forEach(b=>b.onclick=()=>markClientVisited(b.dataset.id));
  $('visitedButton').textContent='Visitados ('+members.filter(c=>visited.includes(String(c.id))).length+')';
  if(selectedClientId)renderCart();
}
function renderReviewForClient(id){const c=clientById(id);const sale=latestSalesForClient(id).find(s=>saleDate(s)===localDate());const box=$('visitedReview');if(!box||!c)return;if(!sale){box.innerHTML='<div class="review-card"><div class="kicker">REVISAR PEDIDO</div><h3>'+esc(c.name)+'</h3><p class="muted">Este cliente no tiene una venta registrada.</p></div>';box.classList.remove('hidden');return}const items=(sale.items||[]).filter(i=>Number(i.qty||0)>0);box.innerHTML='<div class="review-card"><div class="section-title"><div><div class="kicker">REVISAR PEDIDO</div><h3>'+esc(c.name)+'</h3><p class="muted">Venta #'+esc(sale.folio)+' · '+esc(sale.fecha)+'</p></div><button class="secondary close-review" type="button">Cerrar</button></div><div class="review-list">'+(items.length?items.map(i=>'<div class="review-item"><span>'+esc(i.desc||'Producto')+'</span><strong>'+esc(i.qty)+' unidades</strong></div>').join(''):'<p class="muted">La venta no contiene productos.</p>')+'</div></div>';box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});const close=box.querySelector('.close-review');if(close)close.onclick=()=>{box.classList.add('hidden');box.innerHTML='';showVisited=false;selectedClientId='';showCartTray=false;showView('home')}}function openClientSaleForEdit(id){const c=clientById(id);if(!c)return;const sale=latestSalesForClient(id).find(s=>saleDate(s)===localDate());if(!sale){openClientCart(id);return}const missing=(sale.items||[]).filter(i=>!productById(i.productId)&&!productById(i.baseProductId));if(missing.length){alert('No se puede modificar esta venta porque faltan productos del catálogo actual:\n\n'+missing.map(i=>(i.desc||'Producto sin nombre')+' ('+i.qty+' unidades)').join('\n')+'\n\nLa venta original se conserva intacta. Revisa el catálogo antes de editarla.');return}selectedClientId=c.id;editingSaleId=sale.id;cart=[];(sale.items||[]).forEach(i=>{const p=productById(i.productId)||productById(i.baseProductId);if(p){const existing=cart.find(x=>String(x.productId)===String(p.id));if(existing)existing.qty+=Number(i.qty||0);else cart.push({productId:p.id,qty:Number(i.qty||0)})}});draftProductId='';draftQty='';showCartTray=true;$('cartClientName').textContent=c.name;$('cartClientMeta').textContent=(c.address||'Sin dirección')+' · EDITANDO VENTA #'+sale.folio;$('cartSection').classList.remove('hidden');$('cartSearchName').value='';$('cartCategory').value='';$('saleStatus').textContent='Venta existente abierta. Puedes agregar o quitar productos y guardar para reemplazarla.';renderHome();renderCart();setTimeout(()=>$('cartSection').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function openClientCart(id){const c=clientById(id);if(!c)return;editingSaleId='';selectedClientId=c.id;cart=[];draftProductId='';draftQty='';showCartTray=false;$('cartClientName').textContent=c.name;$('cartClientMeta').textContent=(c.address||'Sin dirección')+' · Semana '+(c.routeWeek||'—')+' · '+(c.routeDay||'Sin día');$('cartSection').classList.remove('hidden');$('cartSearchName').value='';$('cartCategory').value='';renderHome();renderCart();setTimeout(()=>$('cartSection').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function cartProductMatches(p){const q=norm($('cartSearchName').value),cat=$('cartCategory').value;return(!cat||p.category===cat)&&(!q||searchMatches(p.name,q)||searchMatches(p.color||'',q))}
function cartStockBadge(p,remaining){const n=Math.max(0,Number(remaining??p?.stock)||0);if(n===0)return '<b class="stock-badge stock-zero">0 · SIN STOCK</b>';if(n<=5)return '<b class="stock-badge stock-low">'+n+' · STOCK BAJO</b>';return '<b class="stock-badge stock-ok">'+n+' · STOCK OK</b>'}
function renderCartRoute(){const box=$('cartActiveRoute');if(!box)return;const c=clientById(selectedClientId);if(!c){box.classList.add('hidden');return}const sale=editingSaleId?getSales().find(s=>String(s.id)===String(editingSaleId)):null;const route=viewedRoute();const week=sale?.routeWeek||route?.week||c.routeWeek||'';const day=sale?.routeDay||route?.day||c.routeDay||'';box.classList.remove('hidden');$('cartActiveRouteLabel').textContent=(week?'Semana '+week:'Sin semana')+' · '+(day||'Sin día');}
function renderCart(){
  if(!selectedClientId)return;
  renderCartRoute();
  const selectedCat=$('cartCategory').value;
  const active=getProducts().filter(p=>p.active);
  const cats=[...new Set(active.map(p=>p.category))];
  $('cartCategory').innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  $('cartCategory').value=selectedCat;
  const q=norm($('cartSearchName').value);
  const suggestions=q?active.filter(p=>cartProductMatches(p)).sort((a,b)=>{
    const sa=bestSearchScore([a.name,a.color||''],q),sb=bestSearchScore([b.name,b.color||''],q);
    return sa-sb||norm(a.name).localeCompare(norm(b.name),'es',{sensitivity:'base'})||norm(a.color||'').localeCompare(norm(b.color||''),'es',{sensitivity:'base'});
  }).slice(0,10):[];
  $('productSuggestions').innerHTML=suggestions.map(p=>'<button type="button" class="suggestion" data-id="'+esc(p.id)+'">'+'<span class="color-dot color-'+esc(p.color||'none')+'"></span>'+'<span><strong>'+esc(p.name)+'</strong><small>'+money(p.price)+'</small>'+cartStockBadge(p,p.stock)+'</span></button>').join('');
  const draft=draftProductId?productById(draftProductId):null;
  if(draft){
    $('productDraft').innerHTML='<div class="draft-product"><div class="draft-info"><span class="color-dot color-'+esc(draft.color||'none')+'"></span><div><strong>'+esc(draft.name)+'</strong><small>'+cartStockBadge(draft,draft.stock)+' · '+money(draft.price)+'</small></div></div><div class="draft-controls"><input id="draftQty" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="'+esc(draftQty)+'" placeholder="Cantidad"><button id="assignDraft" class="primary" type="button" '+(!draftQty||Number(draftQty)<1?'disabled':'')+'>Asignar</button></div></div>';
  }else{$('productDraft').innerHTML='';}
  const chosen=cart.map(i=>{
    const p=productById(i.productId);
    if(!p)return '';
    const ep=effectivePrice(p,i.qty);
    return '<div class="chosen-line"><div class="chosen-product-info">'+'<div><strong>'+esc(p.name)+'</strong><span>'+i.qty+' × '+money(ep.price)+(ep.applied?' · OFERTA':'')+' · '+cartStockBadge(p,Math.max(0,p.stock))+'</span></div></div><div class="chosen-actions"><button class="qty-btn chosen-minus" data-id="'+esc(p.id)+'" type="button">−</button><b>'+i.qty+'</b><button class="qty-btn chosen-plus" data-id="'+esc(p.id)+'" type="button">＋</button><button class="delete-line" data-id="'+esc(p.id)+'" type="button" aria-label="Eliminar producto">✕</button></div></div>';
  }).join('');
  $('chosenProducts').innerHTML=chosen||'<p class="muted">La bandeja está vacía.</p>';
  $('chosenProducts').classList.toggle('hidden',!showCartTray);
  $('toggleCartTray').textContent=showCartTray?'Ocultar bandeja':'Ver bandeja ('+cart.reduce((a,i)=>a+Number(i.qty||0),0)+')';
  $('cartItems').innerHTML='';
  document.querySelectorAll('.cart-plus,.chosen-plus').forEach(btn=>btn.onclick=()=>changeCart(btn.dataset.id,1));
  document.querySelectorAll('.cart-minus,.chosen-minus').forEach(btn=>btn.onclick=()=>changeCart(btn.dataset.id,-1));
  document.querySelectorAll('.delete-line').forEach(btn=>btn.onclick=()=>confirmDelete('Eliminar producto del carrito','¿Estás seguro de que deseas eliminar '+(productById(btn.dataset.id)?.name||'este producto')+' del carrito?',()=>{cart=cart.filter(i=>String(i.productId)!==String(btn.dataset.id));renderCart()}));
  document.querySelectorAll('.suggestion').forEach(btn=>btn.onclick=()=>{
    if(draftProductId||draftQty)return;
    draftProductId=btn.dataset.id;draftQty='';renderCart();
    setTimeout(()=>{const q=$('draftQty');if(q){q.focus();q.select();}},0);
  });
  const draftInput=$('draftQty');
  if(draftInput)draftInput.oninput=e=>{draftQty=String(e.target.value||'').replace(/\D/g,'');e.target.value=draftQty;const assign=$('assignDraft');if(assign)assign.disabled=!(draftQty&&Number(draftQty)>=1);};
  const assign=$('assignDraft');
  if(assign)assign.onclick=()=>{
    const currentDraft=productById(draftProductId),qty=Math.floor(Number(draftInput?.value)||0);
    if(!currentDraft||qty<1)return;
    const existing=cart.find(i=>String(i.productId)===String(currentDraft.id));
    const stockKey=currentDraft.baseProductId||currentDraft.id;
    const used=cart.reduce((a,x)=>{const p=productById(x.productId);return a+(p&&(p.baseProductId||p.id)===stockKey?Number(x.qty||0):0);},0);
    const current=existing?Number(existing.qty||0):0;
    if(qty+used>availableCartStock(currentDraft))return;
    if(existing)existing.qty+=qty;else cart.push({productId:currentDraft.id,qty});
    draftProductId='';draftQty='';$('cartSearchName').value='';$('saleStatus').textContent='';renderCart();$('cartSearchName').focus();
  };
  let total=0;
  cart.forEach(i=>{const p=productById(i.productId);if(p)total+=effectivePrice(p,i.qty).price*i.qty;});
  $('cartTotal').textContent=money(total);
}
function availableCartStock(p){const k=String(p.baseProductId||p.id);const old=editingSaleId?getSales().find(s=>String(s.id)===String(editingSaleId)):null;return Number(p.stock||0)+(old?.items||[]).reduce((sum,i)=>sum+(String(saleItemStockId(i))===k?Number(i.qty||0):0),0)}
function changeCart(id,delta){const p=productById(id);if(!p)return;let i=cart.find(x=>String(x.productId)===String(id));const next=(i?i.qty:0)+delta;const stockKey=p.baseProductId||p.id;const used=cart.reduce((a,x)=>{const q=productById(x.productId);return a+(q&&(q.baseProductId||q.id)===stockKey?Number(x.qty||0):0)},0);if(next<=0){confirmDelete('Eliminar producto del carrito','¿Estás seguro de que deseas eliminar '+p.name+' del carrito?',()=>{cart=cart.filter(x=>String(x.productId)!==String(id));$('saleStatus').textContent='';renderCart()});return}else if(used+delta<=availableCartStock(p)){if(i)i.qty=next;else cart.push({productId:p.id,qty:next})}else{return}$('saleStatus').textContent='';renderCart()}
function showPromos(id){const p=productById(id);if(!p)return;const lines=(p.promotions||[]).map(x=>'Desde '+x.minQty+' unidades → '+money(x.price)).join('\n');alert((p.name||'Producto')+'\n\n'+(lines||'No hay promociones programadas.')+'\n\nLa promoción se aplica automáticamente al alcanzar la cantidad.')}
function cartData(){const items=cart.map(i=>{const p=productById(i.productId);if(!p)return null;const ep=effectivePrice(p,i.qty);return{productId:p.id,baseProductId:p.baseProductId||p.id,desc:p.name,flavor:p.flavor||'',qty:i.qty,price:ep.price,purchasePrice:p.pricePurchase,promotion:ep.applied||null}}).filter(Boolean);return{items,total:items.reduce((a,i)=>a+Math.round(i.qty*i.price),0),cost:items.reduce((a,i)=>a+Math.round(i.qty*i.purchasePrice),0)}}
function openSaveOptions(){if(!cartData().items.length){$('saleStatus').textContent='Agrega productos al carrito.';return}$('saveOptions').classList.remove('hidden')}
function closeSaveOptions(){$('saveOptions').classList.add('hidden')}
function finalizeSale(printAfter){const paymentMethod=$('salePaymentMethod')?.value||'cash';const c=clientById(selectedClientId);if(!c)return;const d=cartData();if(!d.items.length){closeSaveOptions();return}const ps=getRawProducts();const sales=getSales();const activeRoute=viewedRoute();const oldSale=editingSaleId?sales.find(s=>String(s.id)===String(editingSaleId)):null;if(editingSaleId&&!oldSale){closeSaveOptions();$('saleStatus').textContent='No se encontró la venta original. No se guardó ningún cambio.';return}if(oldSale&&saleDate(oldSale)!==localDate()){closeSaveOptions();$('saleStatus').textContent='Solo puedes modificar ventas del día actual.';return}if(oldSale){(oldSale.items||[]).forEach(i=>{const baseId=saleItemStockId(i);const p=ps.find(x=>String(x.id)===String(baseId));if(p)p.stock=Number(p.stock||0)+Number(i.qty||0)})}const needed={};d.items.forEach(i=>{const k=String(i.baseProductId||i.productId);needed[k]=(needed[k]||0)+Number(i.qty)});if(Object.entries(needed).some(([k,n])=>{const p=ps.find(x=>String(x.id)===k);return !p||n>Number(p.stock||0)})){closeSaveOptions();$('saleStatus').textContent='Stock insuficiente. Revisa las cantidades del pedido.';return}const previousProducts=readArray('zipperProductos');d.items.forEach(i=>{const baseId=saleItemStockId(i);const p=ps.find(x=>String(x.id)===String(baseId));if(p)p.stock=Math.max(0,Number(p.stock||0)-Number(i.qty||0))});if(!writeArray('zipperProductos',ps)){closeSaveOptions();return}let sale,folio;if(oldSale){folio=oldSale.folio;sale={...oldSale,fecha:oldSale.fecha,clienteId:c.id,cliente:c.name,ruta:c.route||'',routeWeek:oldSale.routeWeek||activeRoute?.week||c.routeWeek||'',routeDay:oldSale.routeDay||activeRoute?.day||c.routeDay||'',items:d.items,total:d.total,cost:d.cost,profit:d.total-d.cost,paymentMethod,paymentStatus:paymentMethod==='pending'?'pending':'paid'};const ix=sales.findIndex(s=>String(s.id)===String(oldSale.id));if(ix>=0)sales[ix]=sale}else{folio=Math.max(0,...sales.map(s=>Number(s.folio)||0))+1;sale={id:uid(),folio,fecha:localDate(),clienteId:c.id,cliente:c.name,ruta:c.route||'',routeWeek:activeRoute?.week||c.routeWeek||'',routeDay:activeRoute?.day||c.routeDay||'',items:d.items,total:d.total,cost:d.cost,profit:d.total-d.cost,paymentMethod,paymentStatus:paymentMethod==='pending'?'pending':'paid'};sales.push(sale)}if(writeArray('zipperComprobantes',sales)){markVisited(c.id);closeSaveOptions();cart=[];draftProductId='';draftQty='';showCartTray=false;editingSaleId='';renderInventory();$('saleStatus').textContent=(oldSale?(printAfter?'Venta modificada. Vista previa de impresión abierta. ':'Venta modificada correctamente. '):(printAfter?'Venta guardada. Vista previa de impresión abierta. ':'Venta guardada correctamente. '))+'Folio #'+folio;renderPrint(sale);if(printAfter)openReceiptPreview();selectedClientId='';$('cartSection').classList.add('hidden');renderHome();}else{writeArray('zipperProductos',previousProducts);closeSaveOptions();}}
function saveSale(){openSaveOptions()}
function printSale(){openSaveOptions()}
function saleRouteWeek(s){const c=s&&s.clienteId?clientById(s.clienteId):null;const v=s?.routeWeek||c?.routeWeek||'';return String(v)==='1'?'A':String(v)==='2'?'B':String(v).toUpperCase()||'Sin ruta'}
function saleRouteDay(s){const c=s&&s.clienteId?clientById(s.clienteId):null;return String(s?.routeDay||c?.routeDay||'Sin día')}
function isoWeekInfo(dateStr){const d=dateStr instanceof Date?new Date(dateStr):new Date(String(dateStr||'')+'T12:00:00');if(Number.isNaN(d.getTime()))return null;const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day+3);const year=d.getFullYear(),first=new Date(year,0,4,12),week=1+Math.round(((d-first)/86400000-3+((first.getDay()+6)%7))/7);return{year,week}}
function cashFilteredSales(){const rf=$('statRouteFilter')?.value||'',df=$('statDayFilter')?.value||'';return getSales().filter(s=>(!rf||saleRouteWeek(s)===rf)&&(!df||saleRouteDay(s)===df))}
function statsPeriodRows(){return cashFilteredSales().filter(s=>periodMatch(saleDate(s),statPeriod))}
function getPayments(){return readArray('zipperPagos')}
function clientDebt(id){const credit=getSales().filter(s=>String(s.clienteId)===String(id)&&(paymentMethodOf(s)==='pending'||s.paymentStatus==='pending')).reduce((a,s)=>a+saleTotal(s),0);const paid=getPayments().filter(p=>String(p.clienteId)===String(id)).reduce((a,p)=>a+Number(p.amount||0),0);return Math.max(0,credit-paid)}
function debtClients(){const ids=[...new Set(getSales().filter(s=>paymentMethodOf(s)==='pending'||s.paymentStatus==='pending').map(s=>String(s.clienteId)))];return ids.map(id=>{const c=clientById(id);return{id,name:c?.name||getSales().find(s=>String(s.clienteId)===id)?.cliente||'Cliente',debt:clientDebt(id)}}).filter(x=>x.debt>0).sort((a,b)=>b.debt-a.debt)}
function addDebtPayment(clientId){const debt=clientDebt(clientId);if(debt<=0)return;const raw=prompt('Monto del abono (saldo actual '+money(debt)+')','');if(raw===null)return;const amount=Math.floor(Number(String(raw).replace(/[^0-9]/g,''))||0);if(amount<=0){alert('Ingresa un monto válido.');return}if(amount>debt){alert('El abono no puede superar el saldo pendiente de '+money(debt)+'.');return}const method=prompt('Forma de pago: escribe efectivo o transferencia','efectivo');if(method===null)return;const m=norm(method);const paymentMethod=m.startsWith('trans')?'transfer':m.startsWith('efec')?'cash':'';if(!paymentMethod){alert('Usa efectivo o transferencia.');return}const c=clientById(clientId);const rows=getPayments();rows.push({id:uid(),clienteId:clientId,cliente:c?.name||'Cliente',date:localDate(),amount,paymentMethod});if(writeArray('zipperPagos',rows)){renderCash();renderHistory()}}
let cashRange='day'
function cashSelectedDate(){return $('cashDate')?.value||localDate()}
function cashRangeDates(){const d=new Date(cashSelectedDate()+'T12:00:00'),a=new Date(d),b=new Date(d);if(cashRange==='week'){const n=(d.getDay()+6)%7;a.setDate(d.getDate()-n);b.setDate(a.getDate()+6)}else if(cashRange==='fortnight'){a.setDate(d.getDate()<=15?1:16);b.setMonth(d.getMonth()+1,0);if(d.getDate()<=15)b.setDate(15)}else if(cashRange==='month'){a.setDate(1);b.setMonth(d.getMonth()+1,0)}const f=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');return{start:f(a),end:f(b)}}
function cashRangeLabel(){const r=cashRangeDates(),f=x=>new Date(x+'T12:00:00').toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'});if(cashRange==='day')return cashSelectedDate()===localDate()?'Resumen de hoy':'Caja · '+f(r.start);if(cashRange==='week')return 'Caja semanal · '+f(r.start)+' al '+f(r.end);if(cashRange==='fortnight')return 'Caja quincenal · '+f(r.start)+' al '+f(r.end);return 'Caja mensual · '+new Date(r.start+'T12:00:00').toLocaleDateString('es-CL',{month:'long',year:'numeric'})}
function paymentMethodOf(s){return s?.paymentMethod||'cash'}
function renderCash(){
 const selected=cashSelectedDate(),range=cashRangeDates(),inRange=x=>x>=range.start&&x<=range.end,rows=getSales().filter(s=>inRange(saleDate(s))),payments=getPayments().filter(p=>inRange(String(p.date||'').slice(0,10)));
 const sales=rows.reduce((a,s)=>a+saleTotal(s),0),cost=rows.reduce((a,s)=>a+saleCost(s),0),profit=sales-cost;
 const paidSales=rows.filter(s=>paymentMethodOf(s)!=='pending'&&s.paymentStatus!=='pending');
 const cashSales=paidSales.filter(s=>paymentMethodOf(s)==='cash').reduce((a,s)=>a+saleTotal(s),0),transferSales=paidSales.filter(s=>paymentMethodOf(s)==='transfer').reduce((a,s)=>a+saleTotal(s),0);
 const cashAbonos=payments.filter(p=>p.paymentMethod==='cash').reduce((a,p)=>a+Number(p.amount||0),0),transferAbonos=payments.filter(p=>p.paymentMethod==='transfer').reduce((a,p)=>a+Number(p.amount||0),0);
 $('cashSales').textContent=money(sales);$('cashCost').textContent=money(cost);$('cashProfit').textContent=money(profit);
 if($('cashDayTitle'))$('cashDayTitle').textContent=cashRangeLabel();
 if($('cashPaymentSummary'))$('cashPaymentSummary').innerHTML=
  '<div><span>Efectivo recibido</span><strong>'+money(cashSales+cashAbonos)+'</strong><small>Ventas '+money(cashSales)+' · Abonos '+money(cashAbonos)+'</small></div>'+
  '<div><span>Transferencias recibidas</span><strong>'+money(transferSales+transferAbonos)+'</strong><small>Ventas '+money(transferSales)+' · Abonos '+money(transferAbonos)+'</small></div>'+
  '<div><span>Dinero recibido</span><strong>'+money(cashSales+transferSales+cashAbonos+transferAbonos)+'</strong><small>Incluye cobros de deudas anteriores</small></div>';
 const debts=debtClients();
 if($('cashPendingList'))$('cashPendingList').innerHTML=debts.length?debts.map(x=>'<article class="history-row"><div><strong>'+esc(x.name)+'</strong><span>Saldo pendiente actual</span></div><div class="actions-small"><strong>'+money(x.debt)+'</strong><button class="primary debt-payment" data-id="'+esc(x.id)+'" type="button">Registrar abono</button></div></article>').join(''):'<p class="muted">No hay clientes con saldo pendiente.</p>';
 document.querySelectorAll('.debt-payment').forEach(b=>b.onclick=()=>addDebtPayment(b.dataset.id));
 if($('cashPaymentsToday'))$('cashPaymentsToday').innerHTML=payments.length?payments.slice().reverse().map(p=>'<article class="history-row"><div><strong>'+esc(p.cliente||'Cliente')+'</strong><span>'+esc(p.paymentMethod==='transfer'?'Transferencia':'Efectivo')+' · '+esc(p.date)+'</span></div><strong>Abono '+money(p.amount)+'</strong></article>').join(''):'<p class="muted">No hay abonos registrados en esta fecha.</p>';
 renderStats();renderGeneralTotal()
}
function periodLabel(){return({day:'Hoy',week:'Esta semana',month:'Este mes',year:'Este año'})[statPeriod]||'Período seleccionado'}
function renderStats(){
  const rows=statsPeriodRows(),total=rows.reduce((a,s)=>a+saleTotal(s),0),cost=rows.reduce((a,s)=>a+saleCost(s),0),profit=total-cost,tickets=rows.length,avg=tickets?total/tickets:0;
  let previous=0;
  if(statPeriod==='day'){const d=new Date(localDate()+'T12:00:00');d.setDate(d.getDate()-1);const key=d.toISOString().slice(0,10);previous=cashFilteredSales().filter(s=>saleDate(s)===key).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='week'){const end=new Date(localDate()+'T12:00:00');end.setDate(end.getDate()-((end.getDay()+6)%7)-1);const start=new Date(end);start.setDate(start.getDate()-6);previous=cashFilteredSales().filter(s=>{const d=new Date(saleDate(s)+'T12:00:00');return d>=start&&d<=end}).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='month'){const d=new Date(localDate()+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()-1);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');previous=cashFilteredSales().filter(s=>saleDate(s).slice(0,7)===key).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='year'){const key=String(Number(localDate().slice(0,4))-1);previous=cashFilteredSales().filter(s=>saleDate(s).slice(0,4)===key).reduce((a,s)=>a+saleTotal(s),0)}
  const growth=previous?((total-previous)/previous*100):null;
  $('statsOutput').innerHTML='<div class="stats-kpis"><div><span>Vendido</span><strong>'+money(total)+'</strong><small>'+periodLabel()+'</small></div><div><span>Invertido</span><strong>'+money(cost)+'</strong></div><div><span>Ganancia</span><strong>'+money(profit)+'</strong></div><div><span>Comprobantes</span><strong>'+tickets+'</strong></div><div><span>Ticket promedio</span><strong>'+money(avg)+'</strong></div><div><span>Variación</span><strong>'+ (growth===null?'—':(growth>=0?'+':'')+growth.toFixed(1)+'%')+'</strong><small>vs. período anterior</small></div></div>';

  const out={};
  const keyFor=s=>statType==='client'?(s.cliente||'Sin cliente'):statType==='route'?saleRouteWeek(s):statType==='product'?null:saleRouteDay(s);
  if(statType==='product')rows.forEach(s=>(s.items||[]).forEach(i=>{const k=i.desc||'Producto';if(!out[k])out[k]={qty:0,total:0,cost:0,tickets:0};out[k].qty+=Number(i.qty||0);out[k].total+=Number(i.qty||0)*Number(i.price||0);out[k].cost+=Number(i.qty||0)*Number(i.purchasePrice||0)}));
  else rows.forEach(s=>{const k=keyFor(s);if(!out[k])out[k]={qty:0,total:0,cost:0,tickets:0};out[k].qty+=1;out[k].tickets+=1;out[k].total+=saleTotal(s);out[k].cost+=saleCost(s)});
  const arr=Object.entries(out).map(([k,v])=>({...v,name:k,profit:v.total-v.cost,margin:v.total?(v.total-v.cost)/v.total*100:0})).sort((a,b)=>b.total-a.total);
  const heading=statType==='day'?'Comparación por día de reparto':statType==='route'?'Comparación Ruta A vs Ruta B':statType==='client'?'Ranking de clientes':'Ranking de productos';
  $('statsOutput').innerHTML+='<div class="stats-subtitle">'+heading+'</div>'+(arr.length?arr.slice(0,20).map((v,i)=>'<div class="stat-line"><div><strong>'+(i+1)+'. '+esc(v.name)+'</strong><small>'+ (statType==='product'?v.qty+' unidades':' '+v.tickets+' comprobantes')+' · Ganancia '+money(v.profit)+' · Margen '+v.margin.toFixed(1)+'%</small></div><strong>'+money(v.total)+'</strong></div>').join(''):'<p class="muted">No hay datos para esta selección.</p>');
  renderStatsChart(); renderTrendChart();
}
function chartData(){
  const rows=cashFilteredSales(),mode=$('chartMode')?.value||'weekly',out={};
  const add=(k,s)=>{if(!k)return;out[k]=(out[k]||0)+saleTotal(s)};
  if(mode==='route')rows.forEach(s=>add(saleRouteWeek(s),s));
  else if(mode==='day')rows.forEach(s=>add(saleRouteDay(s),s));
  else if(mode==='client')rows.forEach(s=>add(s.cliente||'Sin cliente',s));
  else if(mode==='product')rows.forEach(s=>(s.items||[]).forEach(i=>{const k=i.desc||'Producto';out[k]=(out[k]||0)+Number(i.qty||0)*Number(i.price||0)}));
  else if(mode==='weekByYear'){const info=isoWeekInfo($('statsCompareDate')?.value||localDate());rows.forEach(s=>{const x=isoWeekInfo(saleDate(s));if(x&&info&&x.week===info.week)add(String(x.year),s)})}
  else if(mode==='annual')rows.forEach(s=>add(saleDate(s).slice(0,4)||'Sin año',s));
  else{const keys=[];const now=new Date(localDate()+'T12:00:00');for(let i=11;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i*7);const inf=isoWeekInfo(d);keys.push(inf.year+'-S'+String(inf.week).padStart(2,'0'))}rows.forEach(s=>{const x=isoWeekInfo(saleDate(s));if(x){const k=x.year+'-S'+String(x.week).padStart(2,'0');if(keys.includes(k))add(k,s)}});return keys.map(k=>({label:k,value:out[k]||0}))}
  return Object.entries(out).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
}
function renderStatsChart(){
  const el=$('statsChart');if(!el)return;const data=chartData();if(!data.length){el.innerHTML='<p class="muted">No hay ventas suficientes para graficar.</p>';return}
  const max=Math.max(...data.map(x=>x.value),1),sum=data.reduce((a,x)=>a+x.value,0),w=820,h=300,pad=48,bw=Math.max(16,Math.min(62,(w-pad*2)/data.length-12));
  const bars=data.map((x,i)=>{const slot=(w-pad*2)/data.length,x0=pad+i*slot+(slot-bw)/2,y=235-(x.value/max)*175,hh=235-y,pct=sum?x.value/sum*100:0;return '<g><rect x="'+x0.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" rx="6" class="chart-bar"><title>'+esc(String(x.label))+' · Ventas '+money(x.value)+' · '+pct.toFixed(1)+'% del total</title></rect><text x="'+(x0+bw/2).toFixed(1)+'" y="'+Math.max(16,y-22).toFixed(1)+'" text-anchor="middle" class="chart-value">'+esc(money(x.value))+'</text><text x="'+(x0+bw/2).toFixed(1)+'" y="'+Math.max(28,y-7).toFixed(1)+'" text-anchor="middle" class="chart-value">'+pct.toFixed(1)+'%</text><text x="'+(x0+bw/2).toFixed(1)+'" y="258" text-anchor="middle" class="chart-label">'+esc(String(x.label).slice(0,14))+'</text></g>'}).join('');
  el.innerHTML='<div class="chart-title">'+esc(($('chartMode')?.selectedOptions[0]?.textContent)||'Comparación')+'</div><div class="chart-mini-summary"><span>Total: <strong>'+money(sum)+'</strong></span><span>Máximo: <strong>'+esc(String(data.slice().sort((a,b)=>b.value-a.value)[0].label))+'</strong></span></div><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Gráfico comparativo de ventas">'+bars+'<line x1="'+pad+'" y1="235" x2="'+(w-pad)+'" y2="235" class="chart-axis"></line></svg><p class="muted chart-footnote">Cada barra muestra monto y participación del total. Toca una barra para ver el detalle.</p>';
}
function renderTrendChart(){
  const el=$('statsTrendChart');
  if(!el)return;
  const rows=cashFilteredSales();
  const now=new Date(localDate()+'T12:00:00');
  let start=new Date(now), end=new Date(now);
  if(statPeriod==='week'){start.setDate(now.getDate()-((now.getDay()+6)%7));}
  else if(statPeriod==='month'){start=new Date(now.getFullYear(),now.getMonth(),1,12);}
  else if(statPeriod==='year'){start=new Date(now.getFullYear(),0,1,12);}
  const points=[];
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const key=d.toISOString().slice(0,10);
    const total=rows.filter(s=>saleDate(s)===key).reduce((a,s)=>a+saleTotal(s),0);
    points.push({date:key,total});
  }
  if(!points.length){el.innerHTML='<p class="muted">No hay datos suficientes para mostrar la tendencia.</p>';return}
  const w=820,h=300,padL=48,padR=24,padT=34,padB=48;
  const max=Math.max(...points.map(p=>p.total),1);
  const x=i=>points.length===1?(w-padL-padR)/2+padL:padL+i*(w-padL-padR)/(points.length-1);
  const y=v=>padT+(h-padT-padB)-(v/max)*(h-padT-padB);
  const path=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.total).toFixed(1)).join(' ');
  const dots=points.map((p,i)=>{
    const show=points.length<=14||i===0||i===points.length-1||i%Math.ceil(points.length/8)===0;
    const label=p.date.slice(8,10)+'/'+p.date.slice(5,7);
    return '<g><circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.total).toFixed(1)+'" r="4" class="trend-dot"><title>'+label+' · Ventas '+money(p.total)+'</title></circle>'+(show?'<text x="'+x(i).toFixed(1)+'" y="'+(h-18)+'" text-anchor="middle" class="chart-label">'+label+'</text>':'')+'</g>'
  }).join('');
  const total=points.reduce((a,p)=>a+p.total,0),peak=points.reduce((a,b)=>a.total>b.total?a:b);
  el.innerHTML='<div class="chart-title">Evolución diaria · '+esc(periodLabel())+'</div><div class="chart-mini-summary"><span>Total: <strong>'+money(total)+'</strong></span><span>Mejor día: <strong>'+esc(peak.date.slice(8,10)+'/'+peak.date.slice(5,7))+' · '+money(peak.total)+'</strong></span></div><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Evolución diaria de ventas"><line x1="'+padL+'" y1="'+(h-padB)+'" x2="'+(w-padR)+'" y2="'+(h-padB)+'" class="chart-axis"></line><path d="'+path+'" fill="none" class="trend-line"></path>'+dots+'</svg><p class="muted chart-footnote">La línea muestra las ventas de cada día del período seleccionado. Toca un punto para ver el monto exacto.</p>';
}
function renderGeneralTotal(){const rows=cashFilteredSales().filter(s=>periodMatch(saleDate(s),totalPeriod)),t=rows.reduce((a,s)=>a+saleTotal(s),0);$('generalTotal').textContent=money(t);$('generalTotalMeta').textContent=rows.length+' comprobantes · filtros de ruta/día aplicados.'}function resetProductForm(){editingProductId=null;editingProductVariant='';currentPromos=[];$('productFormTitle').textContent='Ingreso de producto nuevo';$('productStock').closest('label').classList.remove('hidden');$('productStockLabel').textContent='Stock inicial';$('productStockHelp').textContent='Cantidad disponible al ingresar el producto.';$('productName').value='';$('productBuy').value='';$('productSell').value='';$('productStock').value='';$('productStock').disabled=false;$('productStatus').textContent='';$('cancelProduct').classList.add('hidden');if($('deleteProduct'))$('deleteProduct').classList.add('hidden');renderPromoRows()}
function renderProductForm(){renderCategoriesOptions();$('productStockLabel').textContent=editingProductId?'Agregar unidades al stock':'Stock inicial';$('productStockHelp').textContent=editingProductId?'Stock actual: '+(getRawProducts().find(x=>String(x.id)===String(editingProductId))?.stock??0)+'. Las unidades ingresadas se sumarán automáticamente.':'Cantidad disponible al ingresar el producto.';}
function renderCategoriesOptions(){const cats=getCategories();$('productCategory').innerHTML=cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('')}
function renderPromoRows(){$('promoRows').innerHTML=currentPromos.map((p,i)=>'<div class="promo-row"><input aria-label="Cantidad" type="number" min="1" step="1" value="'+esc(p.minQty)+'" data-promo-min="'+i+'" placeholder="Cantidad"><input aria-label="Precio oferta" type="number" min="0" step="1" value="'+esc(p.price)+'" data-promo-price="'+i+'" placeholder="Precio oferta"><span class="promo-tag">OFERTA</span><button data-promo-del="'+i+'" type="button">Eliminar</button></div>').join('');document.querySelectorAll('[data-promo-min]').forEach(e=>e.oninput=()=>currentPromos[Number(e.dataset.promoMin)].minQty=Number(e.value));document.querySelectorAll('[data-promo-price]').forEach(e=>e.oninput=()=>currentPromos[Number(e.dataset.promoPrice)].price=Number(e.value));document.querySelectorAll('[data-promo-del]').forEach(e=>e.onclick=()=>confirmDelete('Borrar oferta','¿Estás seguro que quieres borrar esta oferta?',()=>{currentPromos.splice(Number(e.dataset.promoDel),1);renderPromoRows()}))}
function saveProduct(){const name=$('productName').value.trim(),buy=Number($('productBuy').value),sell=Number($('productSell').value),stockMin=Number($('productStockMin').value),enteredStock=editingProductId?0:Math.max(0,Number($('productStock').value)||0),category=$('productCategory').value;if(!Number.isInteger(stockMin)||stockMin<0){$('productStatus').textContent='El stock mínimo debe ser un número entero desde cero.';return}if(!Number.isInteger(enteredStock)){ $('productStatus').textContent='El stock debe ser una cantidad entera de unidades.';return}if(!name||!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0||!category){$('productStatus').textContent='Completa nombre, compra, venta y categoría.';return}const ps=getRawProducts();const clean=currentPromos.filter(p=>Number(p.minQty)>0&&Number.isFinite(Number(p.price))).map(p=>({minQty:Number(p.minQty),price:Number(p.price),label:'Desde '+p.minQty+' unidades: '+money(p.price)}));if(editingProductId){const p=ps.find(x=>String(x.id)===String(editingProductId));if(p){if(editingProductVariant){p.promotions=clean}else Object.assign(p,{name,pricePurchase:buy,price:sell,category,promotions:clean,stockMin})}}else ps.push({id:uid(),name,pricePurchase:buy,price:sell,stock:enteredStock,stockMin,category,active:true,promotions:clean});if(writeArray('zipperProductos',ps)){resetProductForm();$('productSearch').value='';renderInventory();$('productStatus').textContent='Producto guardado.';const search=$('productSearch');search.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{search.focus({preventScroll:true});search.select()},350)}}
function editProduct(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const raw=getRawProducts().find(x=>String(x.id)===String(rawId));if(!raw)return;editingProductId=raw.id;editingProductVariant=p.baseProductId?norm(p.flavor||p.color||''):'';currentPromos=(raw.promotions||[]).map(x=>({...x}));$('productFormTitle').textContent='Editar producto'+(editingProductVariant?' · '+p.name:'');$('productName').value=raw.name;$('productBuy').value=raw.pricePurchase;$('productSell').value=raw.price;$('productStockMin').value=Number.isInteger(Number(raw.stockMin))&&raw.stockMin!=null?raw.stockMin:5;$('productStock').value='';$('productStock').disabled=true;$('productStock').closest('label').classList.add('hidden');renderCategoriesOptions();$('productCategory').value=raw.category;renderPromoRows();$('cancelProduct').classList.remove('hidden');$('deleteProduct').classList.remove('hidden');$('productEditor').scrollIntoView({behavior:'smooth',block:'start'})}
function deleteProduct(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const raw=getRawProducts().find(x=>String(x.id)===String(rawId));if(!raw)return;if(p.baseProductId){const key=norm(p.flavor||p.color||'');if(!key)return;confirmDelete('Borrar producto','¿Estás seguro que quieres borrar este producto del catálogo? Esta variante se quitará y el resto quedará intacto.',()=>{raw.disabledVariants={...(raw.disabledVariants||{}),[key]:true};if(writeArray('zipperProductos',getRawProducts().map(x=>String(x.id)===String(rawId)?raw:x))){resetProductForm();renderInventory();$('productStatus').textContent='Producto borrado del catálogo.'}});return}confirmDelete('Borrar producto','¿Estás seguro que quieres borrar el producto "'+p.name+'"? Esta acción no se puede deshacer.',()=>{const ps=getRawProducts().filter(x=>String(x.id)!==String(rawId));if(writeArray('zipperProductos',ps)){resetProductForm();renderInventory();$('productStatus').textContent='Producto borrado.'}})}
function searchScore(text,q){const t=norm(text),x=norm(q);if(!x)return 99;if(t===x)return 0;if(t.startsWith(x))return 1;const words=t.split(/[^a-z0-9]+/).filter(Boolean);if(words.some(w=>w.startsWith(x)))return 2;if(t.includes(x))return 3;return 99}
function searchMatches(text,q){const x=norm(q);return !x||searchScore(text,x)<99}
function bestSearchScore(texts,q){const x=norm(q);if(!x)return 99;return Math.min(...texts.map(t=>searchScore(t,x)))}
let inventoryLowOnly=false;
function productMinimum(p){const raw=getRawProducts().find(x=>String(x.id)===String(p.baseProductId||p.id));const n=Number(raw?.stockMin);return Number.isInteger(n)&&n>=0?n:5}
function renderInventory(){const q=norm($('productSearch').value);const ps=getProducts().filter(p=>(searchMatches(p.name,q)||searchMatches(p.color||'',q))&&(!inventoryLowOnly||Number(p.stock)<=productMinimum(p))).sort((a,b)=>{if(inventoryLowOnly)return Number(a.stock)-Number(b.stock)||String(a.name).localeCompare(String(b.name),'es');if(!q)return String(a.name).localeCompare(String(b.name),'es');return bestSearchScore([a.name,a.color||''],q)-bestSearchScore([b.name,a.color||''],q)||String(a.name).localeCompare(String(b.name),'es')});const alertBtn=$('lowStockFilter');if(alertBtn){const lowCount=getProducts().filter(p=>Number(p.stock)<=productMinimum(p)).length;alertBtn.textContent=(inventoryLowOnly?'Mostrar todos · ':'Revisar bajo stock · ')+lowCount;alertBtn.setAttribute('aria-pressed',String(inventoryLowOnly))}$('inventoryList').innerHTML=ps.length?ps.map(p=>{const cls=p.stock<=0?'stock-zero':p.stock<=productMinimum(p)?'stock-low':'stock-ok';const color=p.color?norm(p.color):({'tabaqueria':'azul','caramelos':'naranja','arcor':'verde','nestle':'rosado','remedios':'celeste'}[norm(p.category)]||'aqua');return'<article class="inventory-row product-card-row">'+'<div class="product-ident inventory-main"><span class="color-dot color-'+esc(color)+'" aria-hidden="true"></span><div><strong>'+esc(p.name)+'</strong><span>'+esc(p.category)+' · Venta '+money(p.price)+' · Compra '+money(p.pricePurchase)+'</span><span>Promociones: '+((p.promotions||[]).length?'Sí':'No')+'</span></div></div><span class="stock-badge '+cls+'">'+(p.stock<=0?'0 · SIN STOCK':p.stock<=productMinimum(p)?p.stock+' · POCO STOCK':p.stock+' · STOCK DISPONIBLE')+'</span><div class="inventory-actions"><button class="secondary edit-product" data-id="'+esc(p.id)+'" type="button">Editar</button><button class="secondary adjust-stock" data-id="'+esc(p.id)+'" type="button">Stock</button></div></article>'}).join(''):'<p class="muted">No hay productos.</p>';document.querySelectorAll('.edit-product').forEach(b=>b.onclick=()=>editProduct(b.dataset.id));document.querySelectorAll('.adjust-stock').forEach(b=>b.onclick=()=>adjustStock(b.dataset.id))}
document.addEventListener('click',e=>{if(e.target?.id==='lowStockFilter'){inventoryLowOnly=!inventoryLowOnly;renderInventory()}});
function adjustStock(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';modal.innerHTML='<div style="width:min(420px,100%);background:#18201d;border:1px solid #39443f;border-radius:18px;padding:20px"><h3 style="margin-top:0">Ajustar stock · '+esc(p.name)+'</h3><p class="muted">Stock actual: <strong>'+p.stock+'</strong></p><label>Cantidad<input id="stockAdjustQty" type="number" min="1" step="1" inputmode="numeric" placeholder="Ej: 5"></label><div class="actions" style="margin-top:16px"><button id="stockAddBtn" class="primary" type="button">＋ Sumar</button><button id="stockSubtractBtn" class="danger" type="button">− Restar</button><button id="stockCancelBtn" class="secondary" type="button">Cancelar</button></div><p id="stockAdjustError" class="status"></p></div>';document.body.appendChild(modal);const qty=modal.querySelector('#stockAdjustQty'),err=modal.querySelector('#stockAdjustError');const close=()=>modal.remove();const apply=sign=>{const n=Number(qty.value);if(!Number.isInteger(n)||n<=0){err.textContent='Ingresa una cantidad válida de unidades.';qty.focus();return}const ps=getRawProducts();const x=ps.find(z=>String(z.id)===String(rawId));if(!x){close();return}const current=Math.max(0,Number(x.stock||0));if(sign==='-'&&n>current){err.textContent='No puedes restar '+n+' unidades porque el stock actual es '+current+'.';qty.focus();return}x.stock=sign==='+'?current+n:current-n;if(writeArray('zipperProductos',ps)){close();renderInventory();$('productStatus').textContent=(sign==='+'?'Se agregaron ':'Se restaron ')+n+' unidades de '+p.name+'. Stock actualizado: '+x.stock+'.';$('productSearch').value='';window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>$('productSearch').focus(),250)}};modal.querySelector('#stockAddBtn').onclick=()=>apply('+');modal.querySelector('#stockSubtractBtn').onclick=()=>apply('-');modal.querySelector('#stockCancelBtn').onclick=close;setTimeout(()=>qty.focus(),50)}

function resetClientForm(){editingClientId=null;$('clientFormTitle').textContent='Nuevo cliente';$('clientName').value='';$('clientRut').value='';$('clientPhone').value='569 ';$('clientAddress').value='';$('clientWeek').value='A';$('clientDay').value='';$('clientPosition').value='';$('clientValidation').textContent='';$('clientValidation').className='validation';$('cancelClient').classList.add('hidden');if($('deleteClient'))$('deleteClient').classList.add('hidden')}
function formatRut(r){const s=String(r||'').toUpperCase().replace(/[^0-9K]/g,'');if(s.length<2)return s;return s.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'-'+s.slice(-1)}
function formatPhone(v){const s=String(v||'').replace(/\D/g,'').replace(/^569/,'').slice(0,8);return '569 '+(s?s.slice(0,4)+(s.length>4?' '+s.slice(4):''):'')}
function validateRut(r){const s=String(r||'').toUpperCase().replace(/[^0-9K]/g,'');if(!s||s.length<2)return false;const body=s.slice(0,-1),dv=s.slice(-1);let sum=0,m=2;for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*m;m=m===7?2:m+1}const d=11-(sum%11),want=d===11?'0':d===10?'K':String(d);return want===dv}
function validateClientField(show=true){
  const rut=String($('clientRut').value||'').trim();
  const digits=String($('clientPhone').value||'').replace(/\D/g,'');
  const phoneBody=digits.replace(/^569/,'');
  let msg='';
  if(rut&&!validateRut(rut))msg='RUT mal ingresado. Revisa el número y su dígito verificador.';
  else if(phoneBody.length>0&&phoneBody.length<8)msg='Teléfono incompleto. Debe ingresar los 8 números después de 569.';
  else if(phoneBody.length>8)msg='Teléfono mal ingresado. Debe tener 8 números después de 569.';
  if(show){
    $('clientValidation').textContent=msg;
    $('clientValidation').className='validation'+(msg?'':' ok')
  }
  return !msg
}
function validateClientInput(id,announce=true){
  if(id==='clientRut'){
    const value=String($(id).value||'').trim();
    $(id).value=formatRut(value);
    if(value&&!validateRut(value)){
      if(announce){const now=Date.now();if(lastClientAlertId!==id||now-lastClientAlertAt>900){lastClientAlertId=id;lastClientAlertAt=now;alert('RUT mal ingresado. Revisa el número y su dígito verificador antes de continuar.')}}
      $(id).focus();
      return false
    }
    return true
  }
  if(id==='clientPhone'){
    const digits=String($(id).value||'').replace(/\D/g,'');
    const body=digits.replace(/^569/,'');
    $(id).value=formatPhone(digits);
    if(body.length>0&&body.length<8){
      if(announce){const now=Date.now();if(lastClientAlertId!==id||now-lastClientAlertAt>900){lastClientAlertId=id;lastClientAlertAt=now;alert('Teléfono incompleto. Debes ingresar los 8 números después de 569 antes de continuar.')}}
      $(id).focus();
      return false
    }
    if(body.length>8){
      if(announce){const now=Date.now();if(lastClientAlertId!==id||now-lastClientAlertAt>900){lastClientAlertId=id;lastClientAlertAt=now;alert('Teléfono mal ingresado. Debe tener 8 números después de 569.')}}
      $(id).focus();
      return false
    }
    return true
  }
  return true
}
function bindImmediateValidation(id){
  $(id).addEventListener('blur',()=>{
    const ok=validateClientInput(id,true);
    validateClientField(true);
    if(!ok)setTimeout(()=>$(id).focus(),0)
  });
  $(id).addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const ok=validateClientInput(id,true);
      if(!ok)return;
      $(id).blur()
    }
  })
}
function saveClient(){
  normalizeClientFields();
  if(!validateClientField(true))return;
  const name=$('clientName').value.trim(),address=$('clientAddress').value.trim();
  if(!name||!address){$('clientValidation').textContent='Nombre y dirección son obligatorios.';return}
  const rut=$('clientRut').value.trim().toUpperCase(),cs=getClients();
  const week=$('clientWeek').value,day=$('clientDay').value;
  const rawPos=String($('clientPosition').value||'').trim();
  const wanted=rawPos?Math.max(1,parseInt(rawPos,10)||1):null;
  const id=editingClientId||uid();
  let current=cs.find(c=>String(c.id)===String(id));
  const oldRoute=current?clientRoute(current,week):null;
  const data={name,rut,phone:($('clientPhone').value.replace(/\D/g,'')==='569'?'':$('clientPhone').value.replace(/\D/g,'')),address,route:'',active:true};
  if(current)Object.assign(current,data);else{current={id,...data};cs.push(current)}
  const group=cs.filter(c=>String(c.id)!==String(id)&&norm(clientRoute(c,week)?.day)===norm(day)&&clientRoute(c,week));
  const insertAt=wanted||group.reduce((m,c)=>Math.max(m,clientRoute(c,week).position===999999?0:clientRoute(c,week).position),0)+1;
  if(!oldRoute||norm(oldRoute.day)!==norm(day)||oldRoute.position!==insertAt){group.forEach(c=>{const r=clientRoute(c,week);if(r.position>=insertAt&&r.position<999999)setClientRoute(c,week,day,r.position+1)})}
  setClientRoute(current,week,day,insertAt);
  if(writeArray('zipperClientes',cs)){resetClientForm();$('clientSearchName').value='';$('clientSearchAddress').value='';renderClients();renderHome();window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>$('clientSearchName').focus(),250)}
}
function deleteClient(id){const c=clientById(id);if(!c)return;confirmDelete('Borrar cliente','¿Estás seguro que quieres borrar el cliente "'+c.name+'"? Esta acción no se puede deshacer.',()=>{const cs=getClients().filter(x=>String(x.id)!==String(id));if(writeArray('zipperClientes',cs)){resetClientForm();renderClients();renderHome();$('clientValidation').textContent='Cliente borrado correctamente.';$('clientValidation').className='validation ok'}})}
function editClient(id){const c=clientById(id);if(!c)return;editingClientId=c.id;$('clientFormTitle').textContent='Editar cliente';$('clientName').value=c.name;$('clientRut').value=c.rut;$('clientPhone').value=formatPhone(c.phone);$('clientAddress').value=c.address;const week=$('filterWeek').value||c.routeWeek||'A',r=clientRoute(c,week);$('clientWeek').value=week;$('clientDay').value=r?.day||'';$('clientPosition').value=r&&r.position<999999?r.position:'';$('cancelClient').classList.remove('hidden');if($('deleteClient'))$('deleteClient').classList.remove('hidden');validateClientField(false);$('clientEditor').scrollIntoView({behavior:'smooth',block:'start'})}
function renderClients(){const all=getClients();const qn=norm($('clientSearchName').value),q=norm($('clientSearchAddress').value),w=$('filterWeek').value,d=$('filterDay').value;let rows=all.filter(c=>{const r=w?clientRoute(c,w):null;return c.active!==false&&(!qn||searchMatches(c.name,qn))&&(!q||searchMatches(c.address,q))&&(!w||!!r)&&(!d||(w?r&&norm(r.day)===norm(d):['A','B'].some(week=>norm(clientRoute(c,week)?.day)===norm(d))))});rows.sort((a,b)=>bestSearchScore([a.name,a.address,a.phone,a.rut],qn)-bestSearchScore([b.name,b.address,b.phone,b.rut],qn)||bestSearchScore([a.address,a.name,a.phone,a.rut],q)-bestSearchScore([b.address,b.name,b.phone,b.rut],q)||((w?(clientRoute(a,w)?.position||999999):999999)-(w?(clientRoute(b,w)?.position||999999):999999))||a.name.localeCompare(b.name,'es',{sensitivity:'base'}));$('clientList').innerHTML=rows.length?rows.map((c,index)=>'<article class="client-row"><span class="client-number number-'+(index%5)+'" aria-hidden="true">'+(index+1)+'</span><div class="client-details"><strong>'+esc(c.name)+'</strong><span>'+esc(c.address)+'</span><span>Tel: '+esc(c.phone||'Sin teléfono')+' · RUT: '+esc(c.rut||'Sin RUT')+'</span><span>'+['A','B'].filter(week=>!w||week===w).map(week=>{const r=clientRoute(c,week);return r?'Semana '+esc(week)+' · '+esc(r.day||'Sin día')+(r.position<999999?' · Posición '+esc(r.position):''):''}).filter(Boolean).join(' / ')+'</span></div><div class="actions-small"><button class="secondary edit-client" data-id="'+esc(c.id)+'" type="button">Editar</button><button class="primary client-sale" data-id="'+esc(c.id)+'" type="button">Vender</button></div></article>').join(''):'<p class="muted">No hay clientes para esta selección.</p>';document.querySelectorAll('.edit-client').forEach(b=>b.onclick=()=>editClient(b.dataset.id));document.querySelectorAll('.client-sale').forEach(b=>b.onclick=()=>{showView('home');openClientCart(b.dataset.id)})}

function paymentLabel(s){return s.paymentMethod==='transfer'?'Transferencia':s.paymentMethod==='pending'?'Pendiente':'Efectivo'}
function markPendingPaid(id){const sales=getSales(),s=sales.find(x=>String(x.id)===String(id));if(!s)return;const method=prompt('Pago recibido. Escribe 1 para Efectivo o 2 para Transferencia:','1');if(method===null)return;if(method!=='1'&&method!=='2'){alert('Selecciona 1 o 2.');return}s.paymentMethod=method==='2'?'transfer':'cash';s.paymentStatus='paid';s.paidDate=localDate();if(writeArray('zipperComprobantes',sales))renderHistory()}
function renderHistory(){const from=$('historyFrom').value,to=$('historyTo').value;if(historyType==='sales'){const rows=getSales().filter(s=>(!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to)).sort((a,b)=>saleDate(b).localeCompare(saleDate(a)));$('historyOutput').innerHTML=rows.length?rows.map(s=>'<article class="history-row"><div><strong>#'+esc(s.folio)+' · '+esc(s.cliente)+'</strong><span>'+esc(s.fecha)+' · '+esc(s.ruta||'Sin ruta')+' · '+(s.items||[]).length+' líneas · '+esc(paymentLabel(s))+'</span></div><div class="actions-small"><strong>'+money(saleTotal(s))+'</strong><button class="secondary history-reprint" data-sale-id="'+esc(s.id)+'" type="button">Ver ticket / Reimprimir</button></div></article>').join(''):'<p class="muted">No hay ventas en este período.</p>';document.querySelectorAll('.history-reprint').forEach(b=>b.onclick=()=>{const sale=getSales().find(x=>String(x.id)===String(b.dataset.saleId));if(!sale){alert('No se encontró esta venta.');return}renderPrint(sale);openReceiptPreview()})}else if(historyType==='clients'){const sums={};getSales().forEach(s=>{if((!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to)){const k=s.cliente||'Sin cliente';sums[k]=(sums[k]||0)+saleTotal(s)}});const rows=Object.entries(sums).sort((a,b)=>b[1]-a[1]);$('historyOutput').innerHTML=rows.length?rows.map(x=>'<article class="history-row"><div><strong>'+esc(x[0])+'</strong><span>Total acumulado del período</span></div><strong>'+money(x[1])+'</strong></article>').join(''):'<p class="muted">No hay movimientos.</p>'}else if(historyType==='pending'){const rows=getSales().filter(s=>s.paymentStatus==='pending'||s.paymentMethod==='pending').filter(s=>(!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to)).sort((a,b)=>saleDate(a).localeCompare(saleDate(b)));const total=rows.reduce((a,s)=>a+saleTotal(s),0);$('historyOutput').innerHTML=(rows.length?'<div class="pending-total">Total pendiente: <strong>'+money(total)+'</strong></div>'+rows.map(s=>'<article class="history-row pending-row"><div><strong>'+esc(s.cliente)+'</strong><span>Venta #'+esc(s.folio)+' · '+esc(s.fecha)+'</span></div><div class="actions-small"><strong>'+money(saleTotal(s))+'</strong><button class="primary mark-paid" data-id="'+esc(s.id)+'" type="button">Marcar pagado</button></div></article>').join(''):'<p class="muted">No hay pagos pendientes.</p>');document.querySelectorAll('.mark-paid').forEach(b=>b.onclick=()=>markPendingPaid(b.dataset.id))}else{const sums={};getSales().forEach(s=>{if((!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to))(s.items||[]).forEach(i=>{const k=i.desc||'Producto';if(!sums[k])sums[k]={qty:0,total:0,profit:0};sums[k].qty+=Number(i.qty||0);sums[k].total+=Number(i.qty||0)*Number(i.price||0);sums[k].profit+=Number(i.qty||0)*(Number(i.price||0)-Number(i.purchasePrice||0))})});const rows=Object.entries(sums).sort((a,b)=>b[1].qty-a[1].qty);$('historyOutput').innerHTML=rows.length?rows.map(x=>'<article class="history-row"><div><strong>'+esc(x[0])+'</strong><span>'+x[1].qty+' unidades · Ganancia '+money(x[1].profit)+'</span></div><strong>'+money(x[1].total)+'</strong></article>').join(''):'<p class="muted">No hay movimientos de productos.</p>'}}

let preparedReceipt=null;
function renderPrint(s){preparedReceipt=s;$('printArea').innerHTML='<div class="receipt"><h2>DISTRIBUIDORA ZIPPER</h2><div>Comprobante #'+esc(s.folio)+' · '+esc(s.fecha)+'</div><div style="margin:6px 0"><strong>'+esc(s.cliente)+'</strong></div>'+(s.items||[]).map(i=>'<div class="line ticket-product-line"><span class="ticket-product">'+esc(i.desc)+(i.promotion?' · OFERTA':'')+'</span><span class="ticket-calculation">'+esc(i.qty)+' × '+money(i.price)+' = <strong>'+money(Math.round(Number(i.qty)*Number(i.price)))+'</strong></span></div>').join('')+'<div class="total"><span>TOTAL</span><strong>'+money(saleTotal(s))+'</strong></div></div>'}
function receiptFormat(){return '80'}
function applyReceiptFormat(){const f='80';$('receiptFormat').value=f;localStorage.setItem('zipperPrintFormat',f);const width=f==='58'?'48mm':f==='80'?'72mm':'190mm';const receipt=$('printArea').querySelector('.receipt');if(receipt)receipt.style.width=width;$('receiptPreview').innerHTML=$('printArea').innerHTML;const preview=$('receiptPreview').querySelector('.receipt');if(preview){preview.style.maxWidth='100%';preview.style.margin='0 auto'}let style=$('receiptPageStyle');if(!style){style=document.createElement('style');style.id='receiptPageStyle';document.head.appendChild(style)}const chars=f==='58'?16:28;const lines=(preparedReceipt?.items||[]).reduce((sum,i)=>sum+Math.ceil((String(i.desc||'')+(i.promotion?' · OFERTA':'')).length/chars)+1,0);let height=Math.max(65,50+lines*5);if(f!=='letter'&&receipt){const measure=document.createElement('div');measure.className='print-area';measure.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;display:block;pointer-events:none';const copy=receipt.cloneNode(true);copy.style.cssText='width:'+width+';max-width:none;margin:0;font-size:11px;overflow-wrap:anywhere';measure.appendChild(copy);document.body.appendChild(measure);try{const actual=copy.getBoundingClientRect().height;if(actual>0)height=Math.max(65,Math.ceil(actual*25.4/96)+10)}finally{measure.remove()}}style.textContent='@media print{@page{size:'+(f==='letter'?'letter':f+'mm '+height+'mm')+';margin:3mm}.print-area .receipt{width:'+width+';max-width:100%;margin:0;font-size:11px;overflow-wrap:anywhere}.receipt .line{gap:6px}.receipt .line strong{white-space:nowrap;flex:none}}';$('receiptFormatNote').textContent=f==='letter'?'Papel carta. Selecciona también carta en el diálogo de impresión.':'Rollo de '+f+' mm. En el diálogo de Android, selecciona el servicio de impresión y el mismo ancho de papel. Desactiva encabezados y pies del navegador si aparecen.'}
function openReceiptPreview(){if(!preparedReceipt)return;$('receiptFormat').value=receiptFormat();applyReceiptFormat();$('receiptPrintModal').classList.remove('hidden')}
function closeReceiptPreview(){$('receiptPrintModal').classList.add('hidden')}
function sendReceiptToSystem(){if(!preparedReceipt){alert('Primero selecciona un comprobante.');return}applyReceiptFormat();closeReceiptPreview();requestAnimationFrame(()=>window.print())}
function addCategory(){const n=$('newCategory').value.trim();if(!n)return;const cs=getCategories();if(cs.some(x=>norm(x)===norm(n))){$('categoryStatus').textContent='Esa categoría ya existe.';return}const saved=readArray('zipperCategorias').filter(x=>String(x).trim());const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(n));saved.push(n);writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);$('newCategory').value='';$('categoryStatus').textContent='Categoría creada.';renderCategories()}
function renameCategory(oldName,next){if(!next||norm(next)===norm(oldName))return;const cs=getCategories();if(cs.some(x=>norm(x)===norm(next))){alert('Ya existe una categoría con ese nombre.');return}const saved=readArray('zipperCategorias').filter(x=>String(x).trim());const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(next));const si=saved.findIndex(x=>norm(x)===norm(oldName));if(si>=0)saved[si]=next;else saved.push(next);if(!removed.some(x=>norm(x)===norm(oldName)))removed.push(oldName);const ps=getRawProducts();ps.forEach(p=>{if(norm(p.category)===norm(oldName))p.category=next});writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);writeArray('zipperProductos',ps);renderCategories();renderInventory();renderCategoriesOptions();$('categoryStatus').textContent='Categoría modificada.'}
function editCategory(oldName){const n=prompt('Nuevo nombre para la categoría:',oldName);if(n!==null)renameCategory(oldName,n.trim())}
function deleteCategory(name){if(norm(name)==='otros'){alert('La categoría Otros no se puede eliminar porque funciona como respaldo.');return}const used=getRawProducts().some(p=>norm(p.category)===norm(name));confirmDelete('Borrar categoría','¿Estás seguro que quieres borrar la categoría "'+name+'"?'+(used?' Los productos que la usan pasarán a "Otros".':''),()=>{const saved=getCategories().filter(x=>norm(x)!==norm(name));const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(name));removed.push(name);const ps=getRawProducts();ps.forEach(p=>{if(norm(p.category)===norm(name))p.category='Otros'});writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);writeArray('zipperProductos',ps);renderCategories();renderInventory();renderCategoriesOptions();$('categoryStatus').textContent='Categoría eliminada.'})}
function renderCategories(){renderCategoriesOptions();const cs=getCategories();$('categoryList').innerHTML=cs.length?cs.map(c=>'<div class="category-admin-row"><input value="'+esc(c)+'" data-category-input="'+esc(c)+'"><div class="category-admin-actions"><button class="secondary edit-category" data-category="'+esc(c)+'" type="button">Modificar</button><button class="danger delete-category" data-category="'+esc(c)+'" type="button">Eliminar</button></div></div>').join(''):'<p class="muted">No hay categorías.</p>';document.querySelectorAll('.edit-category').forEach(b=>b.onclick=()=>{const n=document.querySelector('[data-category-input="'+CSS.escape(b.dataset.category)+'"]')?.value.trim();renameCategory(b.dataset.category,n||b.dataset.category)});document.querySelectorAll('.delete-category').forEach(b=>b.onclick=()=>deleteCategory(b.dataset.category))}


// Bloqueo definitivo de navegación cuando Clientes tiene datos inválidos.
function guardClientNavigation(e){
  const tab=e.target.closest&&e.target.closest('.tab');
  if(!tab)return;
  const map={homeTab:'home',cashTab:'cash',productsTab:'products',clientsTab:'clients',historyTab:'history'};
  const v=map[tab.id];
  if(v&&v!=='clients'&&$('clientsView')&&!$('clientsView').classList.contains('hidden')){
    normalizeClientFields();
    if(!validateClientField(true)){
      e.preventDefault();e.stopImmediatePropagation();
      $('clientValidation').scrollIntoView({behavior:'smooth',block:'center'});
    }
  }
}
document.addEventListener('click',guardClientNavigation,true);function bind(){bindNav();$('resetRoute').onclick=clearRouteSession;$('receiptFormat').onchange=applyReceiptFormat;$('receiptPrintNow').onclick=sendReceiptToSystem;$('receiptPrintClose').onclick=closeReceiptPreview;$('newProduct').onclick=()=>{resetProductForm();renderProductForm();$('productEditor').scrollIntoView({behavior:'smooth',block:'start'});$('productName').focus()};$('routeStart').onclick=()=>setRouteSession($('homeWeek').value,$('homeDay').value);$('visitedButton').onclick=()=>{showVisited=!showVisited;renderHome()};$('visitedBack').onclick=()=>{showVisited=false;renderHome()};$('otherRoute').onclick=()=>{routePickerOpen=!routePickerOpen;const view=viewedRoute();if(view){$('browseWeek').value=view.week;$('browseDay').value=view.day}renderHome()};$('incorporateRoute').onclick=()=>browseRoute($('browseWeek').value,$('browseDay').value);$('closeRoutePicker').onclick=()=>{routePickerOpen=false;renderHome()};$('returnDailyRoute').onclick=returnDailyRoute;$('homeWeek').onchange=renderHome;$('homeDay').onchange=renderHome;$('homeName').oninput=renderHome;$('homeAddress').oninput=renderHome;$('closeCart').onclick=()=>{$('cartSection').classList.add('hidden');selectedClientId='';cart=[];draftProductId='';draftQty='';showCartTray=false;renderHome()};$('saveSale').onclick=saveSale;$('saveOnly').onclick=()=>finalizeSale(false);$('saveAndPrint').onclick=()=>finalizeSale(true);$('cancelSave').onclick=closeSaveOptions;$('cartSearchName').oninput=()=>{if(draftProductId&&!draftQty)draftProductId='';renderCart()};$('cartCategory').onchange=()=>{if(draftProductId&&!draftQty)draftProductId='';renderCart()};$('toggleCartTray').onclick=()=>{showCartTray=!showCartTray;renderCart()};
if($('statsCompareDate'))$('statsCompareDate').value=localDate();if($('cashDate')){$('cashDate').value=localDate();$('cashDate').onchange=renderCash;document.querySelectorAll('#cashRange button').forEach(b=>b.onclick=()=>{cashRange=b.dataset.range;document.querySelectorAll('#cashRange button').forEach(x=>x.classList.toggle('active',x===b));renderCash()})}document.querySelectorAll('#statType button').forEach(b=>b.onclick=()=>{statType=b.dataset.type;document.querySelectorAll('#statType button').forEach(x=>x.classList.toggle('active',x===b));renderStats()});document.querySelectorAll('#statPeriod button').forEach(b=>b.onclick=()=>{statPeriod=b.dataset.period;if(statPeriod==='day'){if($('statRouteFilter'))$('statRouteFilter').value='';if($('statDayFilter'))$('statDayFilter').value=''}document.querySelectorAll('#statPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderStats();renderGeneralTotal()});document.querySelectorAll('#totalPeriod button').forEach(b=>b.onclick=()=>{totalPeriod=b.dataset.period;document.querySelectorAll('#totalPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderGeneralTotal()});if($('statRouteFilter'))$('statRouteFilter').onchange=()=>{renderStats();renderGeneralTotal()};if($('statDayFilter'))$('statDayFilter').onchange=()=>{renderStats();renderGeneralTotal()};if($('chartMode'))$('chartMode').onchange=renderStatsChart;if($('statsCompareDate'))$('statsCompareDate').onchange=renderStatsChart;
$('addPromo').onclick=()=>{currentPromos.push({minQty:1,price:0});renderPromoRows()};$('saveProduct').onclick=saveProduct;$('deleteProduct').onclick=()=>{if(editingProductId)deleteProduct(editingProductId)};$('cancelProduct').onclick=()=>{resetProductForm();renderInventory();document.getElementById('inventoryList').scrollIntoView({behavior:'smooth',block:'start'});};$('saveCategory').onclick=addCategory;$('closeCategoryAdmin').onclick=()=>{$('categoryAdminPanel').classList.add('hidden')};$('openCategoryAdmin').onclick=()=>{$('categoryAdminPanel').classList.toggle('hidden');renderCategories();};
$('newClient').onclick=()=>{resetClientForm();$('clientEditor').scrollIntoView({behavior:'smooth',block:'start'});$('clientName').focus()};$('saveClient').onclick=saveClient;$('cancelClient').onclick=resetClientForm;$('deleteClient').onclick=()=>{if(editingClientId)deleteClient(editingClientId)};$('clientSearchName').oninput=renderClients;$('clientSearchAddress').oninput=renderClients;$('productSearch').oninput=renderInventory;$('clientWeek').onchange=()=>{if(!editingClientId)return;const r=clientRoute(clientById(editingClientId),$('clientWeek').value);$('clientDay').value=r?.day||'';$('clientPosition').value=r&&r.position<999999?r.position:'';};$('filterWeek').onchange=renderClients;$('filterDay').onchange=renderClients;bindImmediateValidation('clientRut');bindImmediateValidation('clientPhone');$('clientRut').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^0-9K]/g,'').slice(0,9)};$('clientPhone').oninput=e=>{e.target.value=formatPhone(e.target.value)};
document.querySelectorAll('#historyType button').forEach(b=>b.onclick=()=>{historyType=b.dataset.history;document.querySelectorAll('#historyType button').forEach(x=>x.classList.toggle('active',x===b));renderHistory()});$('historyFrom').onchange=renderHistory;$('historyTo').onchange=renderHistory}
bind();
migrateVariantInventory();
repairUltraVariants();
applyInventoryUpdate();
resetProductForm();resetClientForm();renderHome();renderCash();renderInventory();renderClients();renderHistory();
loadSeed();
