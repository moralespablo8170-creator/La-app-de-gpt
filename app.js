const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n)||0);
const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DEFAULT_CATEGORIES=['Tabaquería','Caramelos','Arcor','Nestlé','Remedios','Otros'];
let currentView='home',selectedClientId='',cart=[],editingSaleId='',editingProductId=null,editingProductVariant='',editingClientId=null,currentPromos=[],statType='day',statPeriod='day',totalPeriod='week',clientFilter='all',historyType='sales',showVisited=false,exceptionSearch=false,draftProductId='',draftQty='',showCartTray=false;
let lastClientAlertId='',lastClientAlertAt=0;

function readArray(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}}
function writeArray(k,a){try{localStorage.setItem(k,JSON.stringify(a));return true}catch(e){alert('No se pudo guardar en este dispositivo.');return false}}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function routeSession(){try{const x=JSON.parse(localStorage.getItem('zipperRutaSesion')||'null');return x&&x.date===localDate()&&x.week&&x.day?x:null}catch(e){return null}}
function setRouteSession(week,day){if(!week||!day){alert('Selecciona semana y día para comenzar la ruta.');return}localStorage.setItem('zipperRutaSesion',JSON.stringify({date:localDate(),week,day}));exceptionSearch=false;showVisited=false;renderHome()}
function clearRouteSession(){localStorage.removeItem('zipperRutaSesion');showVisited=false;renderHome()}
function visitedIds(){return readArray('zipperVisitados-'+localDate())}
function markClientVisited(id){const c=clientById(id);if(!c)return;markVisited(c.id);selectedClientId='';editingSaleId='';cart=[];draftProductId='';draftQty='';showCartTray=false;showVisited=false;renderHome();$('saleStatus').textContent='Cliente marcado como visitado sin registrar una venta.';}
function markVisited(id){const a=visitedIds().map(String).filter(x=>x!==String(id));a.unshift(String(id));writeArray('zipperVisitados-'+localDate(),a)}
function uid(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function getCategories(){const removed=readArray('zipperCategoriasEliminadas').map(String);const saved=readArray('zipperCategorias').filter(x=>String(x).trim()).map(String);return [...new Set([...DEFAULT_CATEGORIES,...saved].filter(x=>!removed.some(r=>norm(r)===norm(x))))].sort((a,b)=>a.localeCompare(b,'es'))}
function getClients(){return readArray('zipperClientes').filter(c=>c&&c.id!=null&&String(c.name||'').trim()).map(c=>({...c,name:String(c.name).trim(),rut:String(c.rut||'').toUpperCase(),phone:String(c.phone||''),address:String(c.address||''),route:String(c.route||''),routeWeek:(c.routeWeek==='1'||c.week==='1')?'A':(c.routeWeek==='2'||c.week==='2')?'B':(c.routeWeek||c.week||'A'),routeDay:c.routeDay||c.day||'',active:c.active!==false}))}
function defaultPromos(name){const n=norm(name);const p=[];if(/ron[ ._-]*son.*trans|ron[ ._-]*trans/.test(n))p.push({minQty:10,price:3300,label:'Desde 10 unidades: $3.300'});if(/bigtime.*ultra/.test(n))p.push({minQty:3,price:11200,label:'Desde 3 unidades: $11.200'});return p}

function getRawProducts(){return readArray('zipperProductos').filter(p=>p&&p.id!=null&&String(p.name||'').trim()).map(p=>({...p,name:String(p.name).trim(),category:p.category||'Otros',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}))}
function canonicalUltraRows(raw){const defs=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}];const rows=raw.filter(p=>{const n=norm(p.name);return p.variantKey==='bigtime-ultra'||n.includes('bigtime ultra')});if(!rows.length)return [];const base=rows[0];const sums={negro:0,azul:0,rojo:0,verde:0};rows.forEach(p=>{const f=norm(p.flavor),c=norm(p.color),n=norm(p.name);let k='';if(f.includes('menta fuerte')||c==='negro'||n.includes('menta fuerte')||n.includes(' negro'))k='negro';else if(f.includes('aqua azul')||c==='azul'||n.includes('aqua azul')||n.includes(' azul'))k='azul';else if(f.includes('sandia')||c==='rojo'||n.includes('sandia')||n.includes(' rojo'))k='rojo';else if(f==='menta'||c==='verde'||n.includes(' menta')||n.includes(' verde'))k='verde';if(k)sums[k]+=Number(p.stock||0)});return defs.map(d=>({...base,id:'ultra-display-'+d.color,name:'Big Time Ultra · '+d.flavor,color:d.color,flavor:d.flavor,variantKey:'bigtime-ultra',category:base.category||'Tabaquería',stock:sums[d.color]||0,pricePurchase:Math.max(0,Number(base.pricePurchase??base.purchasePrice)||0),price:Math.max(0,Number(base.price??base.priceSale)||0),active:base.active!==false,promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}))}
function getProducts(){const raw=readArray('zipperProductos').filter(p=>p&&p.id!=null&&String(p.name||'').trim());const hasBT=raw.some(p=>p.variantKey==='bigtime'&&p.flavor);const hasBU=raw.some(p=>p.variantKey==='bigtime-ultra'&&p.flavor);const hasAL=raw.some(p=>p.variantKey==='alka2'&&p.flavor);const hasLA=raw.some(p=>p.variantKey==='languetazo'&&p.color);let bt=0,bu=0,al=0,la=0;const colorsBT=[{color:'verde',flavor:'Menta'},{color:'negro',flavor:'Menta fuerte'},{color:'rojo',flavor:'Sandía'},{color:'aqua',flavor:'Aqua azul'},{color:'celeste',flavor:'Refrescante'},{color:'rosado',flavor:'Bubble Gum'}],colorsBU=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}],colorsAL=['rosado','azul','verde'],colorsLA=['verde','naranja'];const tabacoSabores=['Chocolate','Cherry','Caramelo','Vainilla','Original','Mango','Uva','Arándano','Menta','Sandía','Maracuyá','Coco','Virginia','Café turco','Chicle'];const ultraRows=canonicalUltraRows(raw);return raw.filter(p=>{const n=norm(p.name);return !(p.variantKey==='bigtime-ultra'||n.includes('bigtime ultra'))}).flatMap(p=>{const original=String(p.name).trim(),n=norm(original);if(n.includes('tabaco bristol')&&!p.variantKey){return tabacoSabores.map((s,ix)=>({...p,id:String(p.id)+'::tabaco::'+ix,name:'Tabaco Bristol 45 gr · '+s,flavor:s,baseProductId:p.id,variantKey:'tabaco-bristol',category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}))}if(p.variantKey==='tabaco-bristol'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Tabaquería',promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='bigtime'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='bigtime-ultra'&&p.flavor){const f=norm(p.flavor),col=norm(p.color);const canon=f.includes('menta fuerte')?'negro':f.includes('aqua azul')?'azul':f.includes('sandia')?'rojo':f==='menta'?'verde':col;return [{...p,name:'Big Time Ultra · '+(canon==='negro'?'Menta fuerte':canon==='azul'?'Aqua azul':canon==='rojo'?'Sandía':'Menta'),color:canon||'negro',flavor:canon==='negro'?'Menta fuerte':canon==='azul'?'Aqua azul':canon==='rojo'?'Sandía':'Menta',category:p.category||'Tabaquería',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}]};if(p.variantKey==='alka2'&&p.flavor)return [{...p,name:String(p.name).trim(),category:p.category||'Caramelos',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(p.variantKey==='languetazo'&&p.color)return [{...p,name:String(p.name).trim(),category:p.category||'Caramelos',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}];if(n.includes('bigtime ultra')){if(hasBU)return [];if(/promo|11200/.test(n))return [];const ix=bu++;if(ix>=4)return [];p={...p,name:'Big Time Ultra · '+colorsBU[ix].flavor,color:colorsBU[ix].color,flavor:colorsBU[ix].flavor,variantKey:'bigtime-ultra',category:p.category||'Tabaquería',promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}}else if(/^bigtime\b/.test(n)){if(hasBT)return [];const ix=bt++;if(ix>=6)return [];p={...p,name:'Big Time · '+colorsBT[ix].flavor,color:colorsBT[ix].color,flavor:colorsBT[ix].flavor,variantKey:'bigtime',category:p.category||'Tabaquería'}}else if(n.includes('alka 2')){if(hasAL)return [];const ix=al++;if(ix>=3)return [];p={...p,name:'Alka 2 · '+colorsAL[ix],color:colorsAL[ix],variantKey:'alka2',category:p.category||'Caramelos'}}else if(n.includes('languetaz')){if(hasLA)return [];const ix=la++;if(ix>=2)return [];p={...p,name:'Languetazo · '+colorsLA[ix],color:colorsLA[ix],variantKey:'languetazo',category:p.category||'Caramelos'}}return p?[{...p,name:String(p.name).trim(),category:p.category||'Otros',pricePurchase:Math.max(0,Number(p.pricePurchase??p.purchasePrice)||0),price:Math.max(0,Number(p.price??p.priceSale)||0),stock:Math.max(0,Number(p.stock)||0),active:p.active!==false,promotions:Array.isArray(p.promotions)&&p.promotions.length?p.promotions:defaultPromos(p.name)}]:[]}).concat(ultraRows).filter(Boolean).filter(p=>!(p.baseProductId&&p.disabledVariants&&p.disabledVariants[norm(p.flavor||p.color||'')])).reduce((acc,p)=>{const key=p.variantKey==='bigtime'||p.variantKey==='bigtime-ultra'||p.variantKey==='alka2'||p.variantKey==='languetazo'||p.variantKey==='tabaco-bristol'?(p.variantKey+'|'+norm(p.flavor||p.color||p.name)):null;if(key){const old=acc.find(x=>x.__variantKey===key);if(old){if(Number(p.stock||0)>Number(old.stock||0))old.stock=p.stock;return acc}p.__variantKey=key}acc.push(p);return acc},[]).map(p=>{delete p.__variantKey;return p}).sort((a,b)=>{const order={'bigtime':1,'bigtime-ultra':2,'alka2':3,'languetazo':4,'tabaco-bristol':5};const oa=order[a.variantKey]||9,ob=order[b.variantKey]||9;return oa-ob||String(a.name).localeCompare(String(b.name),'es')})}
function getSales(){return readArray('zipperComprobantes')}
function clientById(id){return getClients().find(c=>String(c.id)===String(id))}
function productById(id){return getProducts().find(p=>String(p.id)===String(id))}
function saleTotal(s){return(s.items||[]).reduce((a,i)=>a+Number(i.qty||0)*Number(i.price||0),0)}
function saleCost(s){return(s.items||[]).reduce((a,i)=>a+Number(i.qty||0)*Number(i.purchasePrice||0),0)}
function saleProfit(s){return saleTotal(s)-saleCost(s)}
function saleDate(s){return String(s.fecha||s.date||'').slice(0,10)}
function periodMatch(date,period){const d=String(date||'');const now=localDate();if(period==='day')return d===now;const n=new Date(now+'T12:00:00');const x=new Date(d+'T12:00:00');if(Number.isNaN(x.getTime()))return false;if(period==='month')return d.slice(0,7)===now.slice(0,7);if(period==='year')return d.slice(0,4)===now.slice(0,4);const diff=(n-x)/86400000;return diff>=0&&diff<7}
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
  currentView=name;const map={home:'homeView',cash:'cashView',products:'productsView',clients:'clientsView',history:'historyView'};Object.entries(map).forEach(([k,id])=>$(id).classList.toggle('hidden',k!==name));const labels={home:'Inicio',cash:'Caja diaria',products:'Productos',clients:'Clientes',history:'Historial'};$('pageTitle').textContent=labels[name];document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.id===name+'Tab'));window.scrollTo(0,0);if(name==='home')renderHome();if(name==='cash')renderCash();if(name==='products'){renderProductForm();renderInventory();renderCategories()}if(name==='clients'){renderClientForm();renderClients()}if(name==='history')renderHistory()}
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
      if(ex){ out.push(ex); return; }
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

function repairUltraVariants(){const ps=getRawProducts();const rows=ps.filter(p=>p.variantKey==='bigtime-ultra'&&p.flavor);if(!rows.length)return false;const defs=[{color:'negro',flavor:'Menta fuerte'},{color:'azul',flavor:'Aqua azul'},{color:'rojo',flavor:'Sandía'},{color:'verde',flavor:'Menta'}];const generic=ps.filter(p=>!(p.variantKey==='bigtime-ultra'&&p.flavor));const base=rows[0];const sums={negro:0,azul:0,rojo:0,verde:0};rows.forEach(p=>{const f=norm(p.flavor),col=norm(p.color),name=norm(p.name);let key='';if(f.includes('menta fuerte')||col==='negro'||name.includes('menta fuerte')||name.includes(' negro'))key='negro';else if(f.includes('aqua azul')||col==='azul'||name.includes('aqua azul')||name.includes(' azul'))key='azul';else if(f.includes('sandia')||col==='rojo'||name.includes('sandia')||name.includes(' rojo'))key='rojo';else if(f==='menta'||col==='verde'||name.includes('menta')||name.includes(' verde'))key='verde';if(key)sums[key]+=Number(p.stock||0)});const out=defs.map(def=>({...base,id:uid(),name:'Big Time Ultra · '+def.flavor,color:def.color,flavor:def.flavor,variantKey:'bigtime-ultra',category:base.category||'Tabaquería',stock:sums[def.color]||0,pricePurchase:Number(base.pricePurchase??base.purchasePrice)||0,price:Number(base.price??base.priceSale)||0,promotions:[{minQty:3,price:11200,label:'Oferta desde 3 unidades: $11.200'}]}));writeArray('zipperProductos',[...generic,...out]);return true}
function applyInventoryUpdate(){
  const VERSION='inventory-format-1';
  if(localStorage.getItem('zipperInventoryUpdateVersion')===VERSION)return false;
  const ps=getRawProducts();
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
  setNameStock(byName('alka'),'Alka',4);
  setNameStock(byName('alka ice'),'Alka Ice',34);
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

function loadSeed(){return fetch('./data/zipper-seed.json',{cache:'no-store'}).then(r=>r.json()).then(s=>{if(!s||!Array.isArray(s.clients)||!Array.isArray(s.products))return;const ver=String(s.version||'1');if(localStorage.getItem('zipperSeedVersion')===ver){applyInventoryUpdate();renderInventory();return}const cs=getClients(),ps=getRawProducts();s.clients.forEach(x=>{const name=String(x.name||'').trim();if(name&&!cs.some(c=>norm(c.name)===norm(name)&&norm(c.address)===norm(x.address))){cs.push({...x,id:uid(),route:x.route||'',routeWeek:x.routeWeek||'A',routeDay:x.routeDay||'',active:x.active!==false})}});s.products.forEach(x=>{const name=String(x.name||'').trim();if(name&&!ps.some(p=>norm(p.name)===norm(name)&&Number(p.price)===Number(x.price))){ps.push({...x,id:uid(),name,stock:Number(x.stock)||0,promotions:Array.isArray(x.promotions)?x.promotions:defaultPromos(name)})}});writeArray('zipperClientes',cs);writeArray('zipperProductos',ps);writeArray('zipperCategorias',[...(s.categories||[]),...getCategories()]);localStorage.setItem('zipperSeedVersion',ver);applyInventoryUpdate();renderHome();renderInventory();renderClients()}).catch(()=>{})}

function latestSalesForClient(id){return getSales().filter(s=>String(s.clienteId)===String(id)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||Number(b.folio||0)-Number(a.folio||0))}function renderVisitedSales(id){const rows=latestSalesForClient(id);$('visitedSales').innerHTML=rows.length?'<div class="kicker">VENTAS REGISTRADAS DE ESTE CLIENTE</div>'+rows.map(s=>'<article class="history-row"><div><strong>#'+esc(s.folio)+' · '+esc(s.fecha)+'</strong><span>'+(s.items||[]).map(i=>esc(i.qty)+' × '+esc(i.desc)).join(' · ')+'</span></div><div class="actions-small"><strong>'+money(saleTotal(s))+'</strong><button class="primary edit-visited-sale" data-id="'+esc(s.clienteId)+'" type="button">Modificar venta</button><button class="secondary reprint-visited" data-id="'+esc(s.id)+'" type="button">Reimprimir</button></div></article>').join(''):'<p class="muted">Este cliente aún no tiene ventas registradas.</p>';document.querySelectorAll('.review-visited').forEach(b=>b.onclick=()=>renderReviewForClient(b.dataset.id));document.querySelectorAll('.edit-visited-sale').forEach(b=>b.onclick=()=>openClientSaleForEdit(b.dataset.id));document.querySelectorAll('.reprint-visited').forEach(b=>b.onclick=()=>{const sale=getSales().find(x=>String(x.id)===String(b.dataset.id));if(sale){renderPrint(sale);window.print()}})}function renderHome(){const all=getClients().filter(c=>c.active!==false);const session=routeSession();const setup=$('routeSetup'),activeBox=$('activeRouteBox');if(setup)setup.classList.toggle('hidden',!!session);if($('exceptionSearch'))$('exceptionSearch').classList.toggle('hidden',!exceptionSearch);if(activeBox)activeBox.classList.toggle('hidden',!session||!!selectedClientId);if(session){$('activeRouteLabel').textContent='Semana '+session.week+' · '+session.day;const visited=visitedIds().map(String);let routeClients=all.filter(c=>String(c.routeWeek||'A')===String(session.week)&&norm(c.routeDay)===norm(session.day));if(!exceptionSearch){const hn=norm($('homeName').value),ha=norm($('homeAddress').value);routeClients=routeClients.filter(c=>(!hn||norm(c.name).includes(hn))&&(!ha||norm(c.address).includes(ha)))}if(exceptionSearch){const w=$('otherWeek').value,d=$('otherDay').value,n=norm($('otherName').value),ad=norm($('otherAddress').value);routeClients=all.filter(c=>(!w||String(c.routeWeek)===String(w))&&(!d||norm(c.routeDay)===norm(d))&&(!n||norm(c.name).includes(n))&&(!ad||norm(c.address).includes(ad)));$('otherResults').innerHTML=routeClients.length?routeClients.map(c=>'<article class="route-client"><div><strong>'+esc(c.name)+'</strong><span>'+esc(c.address||'Sin dirección')+'</span><span>Semana '+esc(c.routeWeek||'—')+' · '+esc(c.routeDay||'Sin día')+'</span></div><button class="primary select-client" data-id="'+esc(c.id)+'" type="button">Carrito</button></article>').join(''):'<p class="muted">No hay clientes con esa búsqueda.</p>';}else{const pending=routeClients.filter(c=>!visited.includes(String(c.id)));const rows=showVisited?routeClients.filter(c=>visited.includes(String(c.id))).sort((a,b)=>visited.indexOf(String(a.id))-visited.indexOf(String(b.id))):pending;$('routeClients').innerHTML=rows.length?rows.map(c=>'<article class="route-client '+(showVisited?'visited-row':'')+'"><div><strong>'+esc(c.name)+'</strong><span>'+esc(c.address||'Sin dirección')+'</span><span>Semana '+esc(c.routeWeek||'—')+' · '+esc(c.routeDay||'Sin día')+'</span></div><div class="actions-small">'+(showVisited?(()=>{const sale=latestSalesForClient(c.id)[0];return '<span class="sale-status-badge '+(sale?'has-sale':'no-sale')+'">'+(sale?'VENTA · '+money(saleTotal(sale)):'VISITADO · SIN VENTA')+'</span><button class="primary review-visited" data-id="'+esc(c.id)+'" type="button">Revisar</button><button class="primary edit-visited-sale" data-id="'+esc(c.id)+'" type="button">Agregar / modificar venta</button><button class="secondary reprint-last" data-id="'+esc(c.id)+'" type="button">Reimprimir último</button><button class="ghost view-client-sales" data-id="'+esc(c.id)+'" type="button">Ventas anteriores</button>'})():'<button class="primary select-client" data-id="'+esc(c.id)+'" type="button">Carrito</button><button class="secondary mark-visited" data-id="'+esc(c.id)+'" type="button">Visitado</button>')+'</div></article>').join(''):'<p class="muted">'+(showVisited?'Aún no hay clientes visitados.':'No quedan clientes pendientes para esta ruta.')+'</p>';}}else{$('routeClients').innerHTML='';}if(showVisited){$('visitedSales').classList.remove('hidden');$('visitedBack').classList.remove('hidden');document.querySelectorAll('.review-visited').forEach(b=>b.onclick=()=>renderReviewForClient(b.dataset.id));document.querySelectorAll('.edit-visited-sale').forEach(b=>b.onclick=()=>openClientSaleForEdit(b.dataset.id));document.querySelectorAll('.reprint-last').forEach(b=>b.onclick=()=>{const s=latestSalesForClient(b.dataset.id)[0];if(s){renderPrint(s);window.print()}});document.querySelectorAll('.view-client-sales').forEach(b=>b.onclick=()=>{renderVisitedSales(b.dataset.id);$('visitedSales').scrollIntoView({behavior:'smooth',block:'start'})})}else{$('visitedSales').classList.add('hidden');$('visitedBack').classList.add('hidden')}document.querySelectorAll('.select-client').forEach(b=>b.onclick=()=>openClientCart(b.dataset.id));document.querySelectorAll('.mark-visited').forEach(b=>b.onclick=()=>markClientVisited(b.dataset.id));if($('visitedButton'))$('visitedButton').textContent='Visitados ('+visitedIds().length+')';if(selectedClientId)renderCart()}
function renderReviewForClient(id){const c=clientById(id);const sale=latestSalesForClient(id)[0];const box=$('visitedReview');if(!box||!c)return;if(!sale){box.innerHTML='<div class="review-card"><div class="kicker">REVISAR PEDIDO</div><h3>'+esc(c.name)+'</h3><p class="muted">Este cliente no tiene una venta registrada.</p></div>';box.classList.remove('hidden');return}const items=(sale.items||[]).filter(i=>Number(i.qty||0)>0);box.innerHTML='<div class="review-card"><div class="section-title"><div><div class="kicker">REVISAR PEDIDO</div><h3>'+esc(c.name)+'</h3><p class="muted">Venta #'+esc(sale.folio)+' · '+esc(sale.fecha)+'</p></div><button class="secondary close-review" type="button">Cerrar</button></div><div class="review-list">'+(items.length?items.map(i=>'<div class="review-item"><span>'+esc(i.desc||'Producto')+'</span><strong>'+esc(i.qty)+' unidades</strong></div>').join(''):'<p class="muted">La venta no contiene productos.</p>')+'</div></div>';box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});const close=box.querySelector('.close-review');if(close)close.onclick=()=>{box.classList.add('hidden');box.innerHTML='';showVisited=false;selectedClientId='';showCartTray=false;showView('home')}}function openClientSaleForEdit(id){const c=clientById(id);if(!c)return;const sale=latestSalesForClient(id)[0];if(!sale){openClientCart(id);return}selectedClientId=c.id;editingSaleId=sale.id;cart=[];(sale.items||[]).forEach(i=>{const p=productById(i.productId)||productById(i.baseProductId);if(p){const existing=cart.find(x=>String(x.productId)===String(p.id));if(existing)existing.qty+=Number(i.qty||0);else cart.push({productId:p.id,qty:Number(i.qty||0)})}});draftProductId='';draftQty='';showCartTray=true;$('cartClientName').textContent=c.name;$('cartClientMeta').textContent=(c.address||'Sin dirección')+' · EDITANDO VENTA #'+sale.folio;$('cartSection').classList.remove('hidden');$('cartSearchName').value='';$('cartCategory').value='';$('saleStatus').textContent='Venta existente abierta. Puedes agregar o quitar productos y guardar para reemplazarla.';renderHome();renderCart();setTimeout(()=>$('cartSection').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function openClientCart(id){const c=clientById(id);if(!c)return;editingSaleId='';selectedClientId=c.id;cart=[];draftProductId='';draftQty='';showCartTray=false;$('cartClientName').textContent=c.name;$('cartClientMeta').textContent=(c.address||'Sin dirección')+' · Semana '+(c.routeWeek||'—')+' · '+(c.routeDay||'Sin día');$('cartSection').classList.remove('hidden');$('cartSearchName').value='';$('cartCategory').value='';renderHome();renderCart();setTimeout(()=>$('cartSection').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function cartProductMatches(p){const q=norm($('cartSearchName').value),cat=$('cartCategory').value;return(!cat||p.category===cat)&&(!q||norm(p.name).includes(q)||norm(p.color||'').includes(q))}
function cartStockBadge(p,remaining){const n=Math.max(0,Number(remaining??p?.stock)||0);if(n===0)return '<b class="stock-badge stock-zero">0 · SIN STOCK</b>';if(n<=5)return '<b class="stock-badge stock-low">'+n+' · STOCK BAJO</b>';return '<b class="stock-badge stock-ok">'+n+' · STOCK OK</b>'}
function renderCart(){
  if(!selectedClientId)return;
  const selectedCat=$('cartCategory').value;
  const active=getProducts().filter(p=>p.active);
  const cats=[...new Set(active.map(p=>p.category))];
  $('cartCategory').innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  $('cartCategory').value=selectedCat;
  const q=norm($('cartSearchName').value);
  const qWords=q.split(/\s+/).filter(Boolean);
  const suggestions=q?active.filter(p=>{
    const big=q==='bigtime'||q==='big time';
    if(big&&!['bigtime','bigtime-ultra'].includes(p.variantKey))return false;
    if(selectedCat&&p.category!==selectedCat)return false;
    const n=norm(p.name),col=norm(p.color||'');
    const words=n.split(/[^a-z0-9]+/).filter(Boolean);
    const colorWords=col.split(/[^a-z0-9]+/).filter(Boolean);
    const nameMatch=qWords.every(w=>words.some(x=>x.startsWith(w)));
    const colorMatch=qWords.every(w=>colorWords.some(x=>x.startsWith(w)));
    return nameMatch||colorMatch;
  }).sort((a,b)=>{
    const an=norm(a.name),bn=norm(b.name),ac=norm(a.color||''),bc=norm(b.color||'');
    const score=x=>{
      const n=norm(x.name),col=norm(x.color||'');
      const words=n.split(/[^a-z0-9]+/).filter(Boolean);
      const colorWords=col.split(/[^a-z0-9]+/).filter(Boolean);
      if(n===q)return 0;
      if(n.startsWith(q))return 1;
      if(qWords.every(w=>words.some(x=>x.startsWith(w))))return 2;
      if(col===q)return 3;
      if(qWords.every(w=>colorWords.some(x=>x.startsWith(w))))return 4;
      return 5;
    };
    return score(a)-score(b)||an.localeCompare(bn,'es',{sensitivity:'base'})||ac.localeCompare(bc,'es',{sensitivity:'base'});
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
  document.querySelectorAll('.delete-line').forEach(btn=>btn.onclick=()=>{cart=cart.filter(i=>String(i.productId)!==String(btn.dataset.id));renderCart();});
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
    if(qty+used-current>Number(currentDraft.stock||0))return;
    if(existing)existing.qty+=qty;else cart.push({productId:currentDraft.id,qty});
    draftProductId='';draftQty='';$('cartSearchName').value='';$('saleStatus').textContent='';renderCart();$('cartSearchName').focus();
  };
  let total=0;
  cart.forEach(i=>{const p=productById(i.productId);if(p)total+=effectivePrice(p,i.qty).price*i.qty;});
  $('cartTotal').textContent=money(total);
}
function changeCart(id,delta){const p=productById(id);if(!p)return;let i=cart.find(x=>String(x.productId)===String(id));const next=(i?i.qty:0)+delta;const stockKey=p.baseProductId||p.id;const used=cart.reduce((a,x)=>{const q=productById(x.productId);return a+(q&&(q.baseProductId||q.id)===stockKey?Number(x.qty||0):0)},0);if(next<=0){cart=cart.filter(x=>String(x.productId)!==String(id))}else if(next<=p.stock-used){if(i)i.qty=next;else cart.push({productId:p.id,qty:next})}else{return}$('saleStatus').textContent='';renderCart()}
function showPromos(id){const p=productById(id);if(!p)return;const lines=(p.promotions||[]).map(x=>'Desde '+x.minQty+' unidades → '+money(x.price)).join('\n');alert((p.name||'Producto')+'\n\n'+(lines||'No hay promociones programadas.')+'\n\nLa promoción se aplica automáticamente al alcanzar la cantidad.')}
function cartData(){const items=cart.map(i=>{const p=productById(i.productId);if(!p)return null;const ep=effectivePrice(p,i.qty);return{productId:p.id,baseProductId:p.baseProductId||p.id,desc:p.name,flavor:p.flavor||'',qty:i.qty,price:ep.price,purchasePrice:p.pricePurchase,promotion:ep.applied||null}}).filter(Boolean);return{items,total:items.reduce((a,i)=>a+i.qty*i.price,0),cost:items.reduce((a,i)=>a+i.qty*i.purchasePrice,0)}}
function openSaveOptions(){if(!cartData().items.length){$('saleStatus').textContent='Agrega productos al carrito.';return}$('saveOptions').classList.remove('hidden')}
function closeSaveOptions(){$('saveOptions').classList.add('hidden')}
function finalizeSale(printAfter){const c=clientById(selectedClientId);if(!c)return;const d=cartData();if(!d.items.length){closeSaveOptions();return}const ps=getRawProducts();const sales=getSales();const oldSale=editingSaleId?sales.find(s=>String(s.id)===String(editingSaleId)):null;if(oldSale){(oldSale.items||[]).forEach(i=>{const baseId=i.baseProductId||i.productId;const p=ps.find(x=>String(x.id)===String(baseId));if(p)p.stock=Number(p.stock||0)+Number(i.qty||0)})}d.items.forEach(i=>{const baseId=i.baseProductId||i.productId;const p=ps.find(x=>String(x.id)===String(baseId));if(p)p.stock=Math.max(0,Number(p.stock||0)-Number(i.qty||0))});if(!writeArray('zipperProductos',ps)){closeSaveOptions();return}let sale,folio;if(oldSale){folio=oldSale.folio;sale={...oldSale,fecha:localDate(),clienteId:c.id,cliente:c.name,ruta:c.route||'',routeWeek:c.routeWeek||'',routeDay:c.routeDay||'',items:d.items,total:d.total,cost:d.cost,profit:d.total-d.cost};const ix=sales.findIndex(s=>String(s.id)===String(oldSale.id));if(ix>=0)sales[ix]=sale}else{folio=Math.max(0,...sales.map(s=>Number(s.folio)||0))+1;sale={id:uid(),folio,fecha:localDate(),clienteId:c.id,cliente:c.name,ruta:c.route||'',routeWeek:c.routeWeek||'',routeDay:c.routeDay||'',items:d.items,total:d.total,cost:d.cost,profit:d.total-d.cost};sales.push(sale)}if(writeArray('zipperComprobantes',sales)){markVisited(c.id);closeSaveOptions();cart=[];draftProductId='';draftQty='';showCartTray=false;editingSaleId='';renderInventory();$('saleStatus').textContent=(oldSale?(printAfter?'Venta modificada e impresión enviada. ':'Venta modificada correctamente. '):(printAfter?'Venta guardada e impresión enviada. ':'Venta guardada correctamente. '))+'Folio #'+folio;renderPrint(sale);if(printAfter)window.print();selectedClientId='';$('cartSection').classList.add('hidden');renderHome();}}
function saveSale(){openSaveOptions()}
function printSale(){openSaveOptions()}
function saleRouteWeek(s){const c=s&&s.clienteId?clientById(s.clienteId):null;const v=s?.routeWeek||c?.routeWeek||'';return String(v)==='1'?'A':String(v)==='2'?'B':String(v).toUpperCase()||'Sin ruta'}
function saleRouteDay(s){const c=s&&s.clienteId?clientById(s.clienteId):null;return String(s?.routeDay||c?.routeDay||'Sin día')}
function isoWeekInfo(dateStr){const d=new Date(String(dateStr||'')+'T12:00:00');if(Number.isNaN(d.getTime()))return null;const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day+3);const year=d.getFullYear(),first=new Date(year,0,4,12),week=1+Math.round(((d-first)/86400000-3+((first.getDay()+6)%7))/7);return{year,week}}
function cashFilteredSales(){const rf=$('statRouteFilter')?.value||'',df=$('statDayFilter')?.value||'';return getSales().filter(s=>(!rf||saleRouteWeek(s)===rf)&&(!df||saleRouteDay(s)===df))}
function statsPeriodRows(){return cashFilteredSales().filter(s=>periodMatch(saleDate(s),statPeriod))}
function renderCash(){const today=getSales().filter(s=>saleDate(s)===localDate());const sales=today.reduce((a,s)=>a+saleTotal(s),0),cost=today.reduce((a,s)=>a+saleCost(s),0);$('cashSales').textContent=money(sales);$('cashCost').textContent=money(cost);$('cashProfit').textContent=money(sales-cost);renderStats();renderGeneralTotal()}
function renderStats(){
  const rows=statsPeriodRows(),total=rows.reduce((a,s)=>a+saleTotal(s),0),cost=rows.reduce((a,s)=>a+saleCost(s),0),profit=total-cost,tickets=rows.length,avg=tickets?total/tickets:0;
  let previous=0;
  if(statPeriod==='day'){const d=new Date(localDate()+'T12:00:00');d.setDate(d.getDate()-1);const key=d.toISOString().slice(0,10);previous=cashFilteredSales().filter(s=>saleDate(s)===key).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='week'){const end=new Date(localDate()+'T12:00:00');end.setDate(end.getDate()-7);const start=new Date(end);start.setDate(start.getDate()-6);previous=cashFilteredSales().filter(s=>{const d=new Date(saleDate(s)+'T12:00:00');return d>=start&&d<=end}).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='month'){const d=new Date(localDate()+'T12:00:00');d.setMonth(d.getMonth()-1);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');previous=cashFilteredSales().filter(s=>saleDate(s).slice(0,7)===key).reduce((a,s)=>a+saleTotal(s),0)}
  else if(statPeriod==='year'){const key=String(Number(localDate().slice(0,4))-1);previous=cashFilteredSales().filter(s=>saleDate(s).slice(0,4)===key).reduce((a,s)=>a+saleTotal(s),0)}
  const growth=previous?((total-previous)/previous*100):null;
  $('statsOutput').innerHTML='<div class="stats-kpis"><div><span>Ventas</span><strong>'+money(total)+'</strong></div><div><span>Invertido</span><strong>'+money(cost)+'</strong></div><div><span>Ganancia</span><strong>'+money(profit)+'</strong></div><div><span>Comprobantes</span><strong>'+tickets+'</strong></div><div><span>Ticket promedio</span><strong>'+money(avg)+'</strong></div><div><span>Variación</span><strong>'+ (growth===null?'—':(growth>=0?'+':'')+growth.toFixed(1)+'%')+'</strong><small>vs. período anterior</small></div></div>';
  const out={};
  if(statType==='client')rows.forEach(s=>{const k=s.cliente||'Sin cliente';if(!out[k])out[k]={qty:0,total:0,cost:0};out[k].qty++;out[k].total+=saleTotal(s);out[k].cost+=saleCost(s)});
  else if(statType==='route')rows.forEach(s=>{const k=saleRouteWeek(s);if(!out[k])out[k]={qty:0,total:0,cost:0};out[k].qty++;out[k].total+=saleTotal(s);out[k].cost+=saleCost(s)});
  else if(statType==='product')rows.forEach(s=>(s.items||[]).forEach(i=>{const k=i.desc||'Producto';if(!out[k])out[k]={qty:0,total:0,cost:0};out[k].qty+=Number(i.qty||0);out[k].total+=Number(i.qty||0)*Number(i.price||0);out[k].cost+=Number(i.qty||0)*Number(i.purchasePrice||0)}));
  else rows.forEach(s=>{const k=saleRouteDay(s);if(!out[k])out[k]={qty:0,total:0,cost:0};out[k].qty++;out[k].total+=saleTotal(s);out[k].cost+=saleCost(s)});
  const arr=Object.entries(out).map(([k,v])=>({...v,name:k,profit:v.total-v.cost})).sort((a,b)=>b.total-a.total);
  const heading=statType==='day'?'Ventas por día de ruta':statType==='route'?'Ventas por ruta (A/B)':statType==='client'?'Ventas por cliente':'Productos más vendidos';
  $('statsOutput').innerHTML+='<div class="stats-subtitle">'+heading+'</div>'+(arr.length?arr.map(v=>'<div class="stat-line"><div><strong>'+esc(v.name)+'</strong><small>'+v.qty+(statType==='product'?' unidades':' comprobantes')+' · Ganancia '+money(v.profit)+'</small></div><strong>'+money(v.total)+'</strong></div>').join(''):'<p class="muted">No hay datos para esta selección.</p>');
  renderStatsChart();
}
function chartData(){
  const rows=cashFilteredSales(),mode=$('chartMode')?.value||'annual',out={};
  const add=(k,s)=>out[k]=(out[k]||0)+saleTotal(s);
  if(mode==='annual')rows.forEach(s=>add(saleDate(s).slice(0,4)||'Sin año',s));
  else if(mode==='route')rows.forEach(s=>add(saleRouteWeek(s),s));
  else if(mode==='day')rows.forEach(s=>add(saleRouteDay(s),s));
  else if(mode==='weekByYear'){const info=isoWeekInfo($('statsCompareDate')?.value||localDate());rows.forEach(s=>{const x=isoWeekInfo(saleDate(s));if(x&&info&&x.week===info.week)add(String(x.year),s)})}
  else{const keys=[];const now=new Date(localDate()+'T12:00:00');for(let i=11;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i*7);const inf=isoWeekInfo(d);keys.push(inf.year+'-S'+String(inf.week).padStart(2,'0'))}rows.forEach(s=>{const x=isoWeekInfo(saleDate(s));if(x){const k=x.year+'-S'+String(x.week).padStart(2,'0');if(keys.includes(k))add(k,s)}});return keys.map(k=>({label:k,value:out[k]||0}))}
  return Object.entries(out).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'es',{numeric:true})).map(([label,value])=>({label,value}));
}
function renderStatsChart(){
  const el=$('statsChart');if(!el)return;const data=chartData();if(!data.length){el.innerHTML='<p class="muted">No hay ventas suficientes para graficar.</p>';return}
  const max=Math.max(...data.map(x=>x.value),1),w=760,h=250,pad=42,bw=Math.max(18,Math.min(58,(w-pad*2)/data.length-10));
  const bars=data.map((x,i)=>{const x0=pad+i*((w-pad*2)/data.length)+(((w-pad*2)/data.length)-bw)/2,y=205-(x.value/max)*155,hh=205-y;return '<rect x="'+x0.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" rx="5" class="chart-bar"></rect><text x="'+(x0+bw/2).toFixed(1)+'" y="224" text-anchor="middle" class="chart-label">'+esc(String(x.label).slice(0,12))+'</text><text x="'+(x0+bw/2).toFixed(1)+'" y="'+Math.max(15,y-6).toFixed(1)+'" text-anchor="middle" class="chart-value">'+esc(money(x.value))+'</text>'}).join('');
  el.innerHTML='<div class="chart-title">Ventas por '+(($('chartMode')?.selectedOptions[0]?.textContent)||'período')+'</div><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Gráfico de ventas">'+bars+'<line x1="'+pad+'" y1="205" x2="'+(w-pad)+'" y2="205" class="chart-axis"></line></svg>';
}
function renderGeneralTotal(){const rows=cashFilteredSales().filter(s=>periodMatch(saleDate(s),totalPeriod)),t=rows.reduce((a,s)=>a+saleTotal(s),0);$('generalTotal').textContent=money(t);$('generalTotalMeta').textContent=rows.length+' comprobantes · filtros de ruta/día aplicados.'}function resetProductForm(){editingProductId=null;editingProductVariant='';currentPromos=[];$('productFormTitle').textContent='Ingreso de producto nuevo';$('productStockLabel').textContent='Stock inicial';$('productStockHelp').textContent='Cantidad disponible al ingresar el producto.';$('productName').value='';$('productBuy').value='';$('productSell').value='';$('productStock').value='';$('productStatus').textContent='';$('cancelProduct').classList.add('hidden');if($('deleteProduct'))$('deleteProduct').classList.add('hidden');renderPromoRows()}
function renderProductForm(){renderCategoriesOptions();$('productStockLabel').textContent=editingProductId?'Agregar unidades al stock':'Stock inicial';$('productStockHelp').textContent=editingProductId?'Stock actual: '+(getRawProducts().find(x=>String(x.id)===String(editingProductId))?.stock??0)+'. Las unidades ingresadas se sumarán automáticamente.':'Cantidad disponible al ingresar el producto.';}
function renderCategoriesOptions(){const cats=getCategories();$('productCategory').innerHTML=cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('')}
function renderPromoRows(){$('promoRows').innerHTML=currentPromos.map((p,i)=>'<div class="promo-row"><input aria-label="Cantidad" type="number" min="1" step="1" value="'+esc(p.minQty)+'" data-promo-min="'+i+'" placeholder="Cantidad"><input aria-label="Precio oferta" type="number" min="0" step="1" value="'+esc(p.price)+'" data-promo-price="'+i+'" placeholder="Precio oferta"><span class="promo-tag">OFERTA</span><button data-promo-del="'+i+'" type="button">Eliminar</button></div>').join('');document.querySelectorAll('[data-promo-min]').forEach(e=>e.oninput=()=>currentPromos[Number(e.dataset.promoMin)].minQty=Number(e.value));document.querySelectorAll('[data-promo-price]').forEach(e=>e.oninput=()=>currentPromos[Number(e.dataset.promoPrice)].price=Number(e.value));document.querySelectorAll('[data-promo-del]').forEach(e=>e.onclick=()=>{currentPromos.splice(Number(e.dataset.promoDel),1);renderPromoRows()})}
function saveProduct(){const name=$('productName').value.trim(),buy=Number($('productBuy').value),sell=Number($('productSell').value),enteredStock=Math.max(0,Number($('productStock').value)||0),category=$('productCategory').value;if(!name||!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0||!category){$('productStatus').textContent='Completa nombre, compra, venta y categoría.';return}const ps=getRawProducts();const clean=currentPromos.filter(p=>Number(p.minQty)>0&&Number.isFinite(Number(p.price))).map(p=>({minQty:Number(p.minQty),price:Number(p.price),label:'Desde '+p.minQty+' unidades: '+money(p.price)}));if(editingProductId){const p=ps.find(x=>String(x.id)===String(editingProductId));if(p){if(editingProductVariant){p.promotions=clean}else Object.assign(p,{name,pricePurchase:buy,price:sell,stock:Number(p.stock||0)+enteredStock,category,promotions:clean})}}else ps.push({id:uid(),name,pricePurchase:buy,price:sell,stock:enteredStock,category,active:true,promotions:clean});if(writeArray('zipperProductos',ps)){resetProductForm();renderInventory();$('productStatus').textContent='Producto guardado.'}}
function editProduct(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const raw=getRawProducts().find(x=>String(x.id)===String(rawId));if(!raw)return;editingProductId=raw.id;editingProductVariant=p.baseProductId?norm(p.flavor||p.color||''):'';currentPromos=(raw.promotions||[]).map(x=>({...x}));$('productFormTitle').textContent='Editar producto'+(editingProductVariant?' · '+p.name:'');$('productName').value=raw.name;$('productBuy').value=raw.pricePurchase;$('productSell').value=raw.price;$('productStock').value='';renderCategoriesOptions();$('productStockLabel').textContent=editingProductVariant?'Stock / datos del producto':'Agregar unidades al stock';$('productStockHelp').textContent=editingProductVariant?'La fotografía se guardará solo para esta variante.':'Stock actual: '+Number(raw.stock||0)+'. Las unidades que ingreses aquí se sumarán automáticamente.';$('productCategory').value=raw.category;renderPromoRows();$('cancelProduct').classList.remove('hidden');$('deleteProduct').classList.remove('hidden');window.scrollTo(0,0)}
function deleteProduct(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const raw=getRawProducts().find(x=>String(x.id)===String(rawId));if(!raw)return;if(p.baseProductId){const key=norm(p.flavor||p.color||'');if(!key)return;if(!confirm('¿Borrar solo "'+p.name+'" del catálogo?\\n\\nEl resto de las variantes quedará intacto.'))return;raw.disabledVariants={...(raw.disabledVariants||{}),[key]:true};if(writeArray('zipperProductos',getRawProducts().map(x=>String(x.id)===String(rawId)?raw:x))){resetProductForm();renderInventory();$('productStatus').textContent='Producto borrado del catálogo.'}return}if(!confirm('¿Borrar definitivamente el producto "'+p.name+'"?\\n\\nEsta acción no se puede deshacer.'))return;const ps=getRawProducts().filter(x=>String(x.id)!==String(rawId));if(writeArray('zipperProductos',ps)){resetProductForm();renderInventory();$('productStatus').textContent='Producto borrado.'}}function renderInventory(){const q=norm($('productSearch').value);const ps=getProducts().filter(p=>!q||norm(p.name).includes(q));$('inventoryList').innerHTML=ps.length?ps.map(p=>{const cls=p.stock<=0?'stock-zero':p.stock<=5?'stock-low':'stock-ok';return'<article class="inventory-row">'+'<div class="inventory-main"><strong>'+esc(p.name)+'</strong><span>'+esc(p.category)+' · Venta '+money(p.price)+' · Compra '+money(p.pricePurchase)+'</span><span>Promociones: '+((p.promotions||[]).length?'Sí':'No')+'</span></div><span class="stock-badge '+cls+'">'+(p.stock<=0?'0 · SIN STOCK':p.stock<=5?p.stock+' · POCO STOCK':'STOCK '+p.stock)+'</span><div class="inventory-actions"><button class="secondary edit-product" data-id="'+esc(p.id)+'" type="button">Editar</button><button class="secondary adjust-stock" data-id="'+esc(p.id)+'" type="button">Stock</button></div></article>'}).join(''):'<p class="muted">No hay productos.</p>';document.querySelectorAll('.edit-product').forEach(b=>b.onclick=()=>editProduct(b.dataset.id));document.querySelectorAll('.adjust-stock').forEach(b=>b.onclick=()=>adjustStock(b.dataset.id))}
function adjustStock(id){const p=productById(id);if(!p)return;const rawId=p.baseProductId||p.id;const v=prompt('Nuevo stock para '+p.name,p.stock);if(v===null)return;const n=Number(v);if(!Number.isFinite(n)||n<0)return;const ps=getRawProducts();const x=ps.find(z=>String(z.id)===String(rawId));if(!x)return;x.stock=Math.floor(n);writeArray('zipperProductos',ps);renderInventory()}
function renderCategories(){renderCategoriesOptions();$('categoryList').innerHTML=getCategories().map(c=>'<span class="chip">'+esc(c)+'</span>').join('')}

function resetClientForm(){editingClientId=null;$('clientFormTitle').textContent='Nuevo cliente';$('clientName').value='';$('clientRut').value='';$('clientPhone').value='569 ';$('clientAddress').value='';$('clientWeek').value='A';$('clientDay').value='';$('clientValidation').textContent='';$('clientValidation').className='validation';$('cancelClient').classList.add('hidden')}
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
  if(!validateClientField(true))return;const name=$('clientName').value.trim(),address=$('clientAddress').value.trim();if(!name||!address){$('clientValidation').textContent='Nombre y dirección son obligatorios.';return}const rut=$('clientRut').value.trim().toUpperCase(),cs=getClients();if(rut&&cs.some(c=>c.rut===rut&&String(c.id)!==String(editingClientId))){$('clientValidation').textContent='Ese RUT ya está registrado.';return}const data={name,rut,phone:($('clientPhone').value.replace(/\D/g,'')==='569'?'':$('clientPhone').value.replace(/\D/g,'')),address,route:'',routeWeek:$('clientWeek').value,routeDay:$('clientDay').value,active:true};if(editingClientId){const c=cs.find(x=>String(x.id)===String(editingClientId));if(c)Object.assign(c,data)}else cs.push({id:uid(),...data});if(writeArray('zipperClientes',cs)){resetClientForm();renderClients();renderHome()}}
function editClient(id){const c=clientById(id);if(!c)return;editingClientId=c.id;$('clientFormTitle').textContent='Editar cliente';$('clientName').value=c.name;$('clientRut').value=c.rut;$('clientPhone').value=formatPhone(c.phone);$('clientAddress').value=c.address;$('clientWeek').value=c.routeWeek||'1';$('clientDay').value=c.routeDay||'';$('cancelClient').classList.remove('hidden');validateClientField(false);window.scrollTo(0,0)}
function renderClients(){const all=getClients();const qn=norm($('clientSearchName').value),q=norm($('clientSearchAddress').value),w=$('filterWeek').value,d=$('filterDay').value;let rows=all.filter(c=>c.active!==false&&(!qn||norm(c.name).includes(qn))&&(!q||norm(c.address).includes(q))&&(!w||String(c.routeWeek)===String(w))&&(!d||norm(c.routeDay)===norm(d)));rows.sort((a,b)=>a.name.localeCompare(b.name,'es'));$('clientList').innerHTML=rows.length?rows.map(c=>'<article class="client-row"><div><strong>'+esc(c.name)+'</strong><span>'+esc(c.address)+'</span><span>Tel: '+esc(c.phone||'Sin teléfono')+' · RUT: '+esc(c.rut||'Sin RUT')+'</span><span>'+esc(c.route||'Sin ruta')+' · Semana '+esc(c.routeWeek||'—')+' · '+esc(c.routeDay||'Sin día')+'</span></div><div class="actions-small"><button class="secondary edit-client" data-id="'+esc(c.id)+'" type="button">Editar</button><button class="primary client-sale" data-id="'+esc(c.id)+'" type="button">Vender</button></div></article>').join(''):'<p class="muted">No hay clientes para esta selección.</p>';document.querySelectorAll('.edit-client').forEach(b=>b.onclick=()=>editClient(b.dataset.id));document.querySelectorAll('.client-sale').forEach(b=>b.onclick=()=>{showView('home');openClientCart(b.dataset.id)})}

function renderHistory(){const from=$('historyFrom').value,to=$('historyTo').value;if(historyType==='sales'){const rows=getSales().filter(s=>(!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to)).sort((a,b)=>saleDate(b).localeCompare(saleDate(a)));$('historyOutput').innerHTML=rows.length?rows.map(s=>'<article class="history-row"><div><strong>#'+esc(s.folio)+' · '+esc(s.cliente)+'</strong><span>'+esc(s.fecha)+' · '+esc(s.ruta||'Sin ruta')+' · '+(s.items||[]).length+' líneas</span></div><div class="actions-small"><strong>'+money(saleTotal(s))+'</strong><button class="secondary print-history" data-id="'+esc(s.id)+'" type="button">Imprimir</button></div></article>').join(''):'<p class="muted">No hay ventas en este período.</p>'}else if(historyType==='clients'){const sums={};getSales().forEach(s=>{if((!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to)){const k=s.cliente||'Sin cliente';sums[k]=(sums[k]||0)+saleTotal(s)}});const rows=Object.entries(sums).sort((a,b)=>b[1]-a[1]);$('historyOutput').innerHTML=rows.length?rows.map(x=>'<article class="history-row"><div><strong>'+esc(x[0])+'</strong><span>Total acumulado del período</span></div><strong>'+money(x[1])+'</strong></article>').join(''):'<p class="muted">No hay movimientos.</p>'}else{const sums={};getSales().forEach(s=>{if((!from||saleDate(s)>=from)&&(!to||saleDate(s)<=to))(s.items||[]).forEach(i=>{const k=i.desc||'Producto';if(!sums[k])sums[k]={qty:0,total:0,profit:0};sums[k].qty+=Number(i.qty||0);sums[k].total+=Number(i.qty||0)*Number(i.price||0);sums[k].profit+=Number(i.qty||0)*(Number(i.price||0)-Number(i.purchasePrice||0))})});const rows=Object.entries(sums).sort((a,b)=>b[1].qty-a[1].qty);$('historyOutput').innerHTML=rows.length?rows.map(x=>'<article class="history-row"><div><strong>'+esc(x[0])+'</strong><span>'+x[1].qty+' unidades · Ganancia '+money(x[1].profit)+'</span></div><strong>'+money(x[1].total)+'</strong></article>').join(''):'<p class="muted">No hay movimientos de productos.</p>'}document.querySelectorAll('.print-history').forEach(b=>b.onclick=()=>{const s=getSales().find(x=>String(x.id)===String(b.dataset.id));if(s){renderPrint(s);window.print()}})}

function renderPrint(s){$('printArea').innerHTML='<div class="receipt"><h2>DISTRIBUIDORA ZIPPER</h2><div>Comprobante #'+esc(s.folio)+' · '+esc(s.fecha)+'</div><div style="margin:6px 0"><strong>'+esc(s.cliente)+'</strong></div>'+(s.items||[]).map(i=>'<div class="line"><span>'+esc(i.qty)+' × '+esc(i.desc)+(i.promotion?' · OFERTA':'')+'</span><strong>'+money(Number(i.qty)*Number(i.price))+'</strong></div>').join('')+'<div class="total"><span>TOTAL</span><strong>'+money(saleTotal(s))+'</strong></div></div>'}
function addCategory(){const n=$('newCategory').value.trim();if(!n)return;const cs=getCategories();if(cs.some(x=>norm(x)===norm(n))){$('categoryStatus').textContent='Esa categoría ya existe.';return}const saved=readArray('zipperCategorias').filter(x=>String(x).trim());const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(n));saved.push(n);writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);$('newCategory').value='';$('categoryStatus').textContent='Categoría creada.';renderCategories()}
function renameCategory(oldName,next){if(!next||norm(next)===norm(oldName))return;const cs=getCategories();if(cs.some(x=>norm(x)===norm(next))){alert('Ya existe una categoría con ese nombre.');return}const saved=readArray('zipperCategorias').filter(x=>String(x).trim());const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(next));const si=saved.findIndex(x=>norm(x)===norm(oldName));if(si>=0)saved[si]=next;else saved.push(next);if(!removed.some(x=>norm(x)===norm(oldName)))removed.push(oldName);const ps=getRawProducts();ps.forEach(p=>{if(norm(p.category)===norm(oldName))p.category=next});writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);writeArray('zipperProductos',ps);renderCategories();renderInventory();renderCategoriesOptions();$('categoryStatus').textContent='Categoría modificada.'}
function editCategory(oldName){const n=prompt('Nuevo nombre para la categoría:',oldName);if(n!==null)renameCategory(oldName,n.trim())}
function deleteCategory(name){if(norm(name)==='otros'){alert('La categoría Otros no se puede eliminar porque funciona como respaldo.');return}const used=getRawProducts().some(p=>norm(p.category)===norm(name));if(!confirm('¿Eliminar la categoría "'+name+'"?'+(used?' Los productos que la usan pasarán a "Otros".':'')))return;const saved=readArray('zipperCategorias').filter(x=>norm(x)!==norm(name));const removed=readArray('zipperCategoriasEliminadas').filter(x=>norm(x)!==norm(name));removed.push(name);const ps=getRawProducts();ps.forEach(p=>{if(norm(p.category)===norm(name))p.category='Otros'});writeArray('zipperCategorias',saved);writeArray('zipperCategoriasEliminadas',removed);writeArray('zipperProductos',ps);renderCategories();renderInventory();renderCategoriesOptions();$('categoryStatus').textContent='Categoría eliminada.'}
function renderCategories(){renderCategoriesOptions();const cs=getCategories();$('categoryList').innerHTML=cs.length?cs.map(c=>'<div class="category-admin-row"><input value="'+esc(c)+'" data-category-input="'+esc(c)+'"><div class="category-admin-actions"><button class="secondary edit-category" data-category="'+esc(c)+'" type="button">Modificar</button><button class="secondary delete-category" data-category="'+esc(c)+'" type="button">Eliminar</button></div></div>').join(''):'<p class="muted">No hay categorías.</p>';document.querySelectorAll('.edit-category').forEach(b=>b.onclick=()=>{const n=document.querySelector('[data-category-input="'+CSS.escape(b.dataset.category)+'"]')?.value.trim();renameCategory(b.dataset.category,n||b.dataset.category)});document.querySelectorAll('.delete-category').forEach(b=>b.onclick=()=>deleteCategory(b.dataset.category))}


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
document.addEventListener('click',guardClientNavigation,true);function bind(){bindNav();$('routeStart').onclick=()=>setRouteSession($('homeWeek').value,$('homeDay').value);$('visitedButton').onclick=()=>{showVisited=!showVisited;renderHome()};$('visitedBack').onclick=()=>{showVisited=false;renderHome()};$('otherRoute').onclick=()=>{exceptionSearch=!exceptionSearch;$('otherRoute').textContent=exceptionSearch?'Cerrar búsqueda especial':'Buscar otro cliente de otra ruta';renderHome()};$('homeWeek').onchange=renderHome;$('homeDay').onchange=renderHome;$('homeName').oninput=renderHome;$('homeAddress').oninput=renderHome;$('closeCart').onclick=()=>{$('cartSection').classList.add('hidden');selectedClientId='';cart=[];draftProductId='';draftQty='';showCartTray=false;renderHome()};$('saveSale').onclick=saveSale;$('saveOnly').onclick=()=>finalizeSale(false);$('saveAndPrint').onclick=()=>finalizeSale(true);$('cancelSave').onclick=closeSaveOptions;$('cartSearchName').oninput=()=>{if(draftProductId&&!draftQty)draftProductId='';renderCart()};$('cartCategory').onchange=()=>{if(draftProductId&&!draftQty)draftProductId='';renderCart()};$('toggleCartTray').onclick=()=>{showCartTray=!showCartTray;renderCart()};$('otherWeek').onchange=renderHome;$('otherDay').onchange=renderHome;$('otherName').oninput=renderHome;$('otherAddress').oninput=renderHome;
document.querySelectorAll('#statType button').forEach(b=>b.onclick=()=>{statType=b.dataset.type;document.querySelectorAll('#statType button').forEach(x=>x.classList.toggle('active',x===b));renderStats()});document.querySelectorAll('#statPeriod button').forEach(b=>b.onclick=()=>{statPeriod=b.dataset.period;document.querySelectorAll('#statPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderStats()});document.querySelectorAll('#totalPeriod button').forEach(b=>b.onclick=()=>{totalPeriod=b.dataset.period;document.querySelectorAll('#totalPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderGeneralTotal()});
$('addPromo').onclick=()=>{currentPromos.push({minQty:1,price:0});renderPromoRows()};$('saveProduct').onclick=saveProduct;$('deleteProduct').onclick=()=>{if(editingProductId)deleteProduct(editingProductId)};$('cancelProduct').onclick=()=>{resetProductForm();renderInventory();document.getElementById('inventoryList').scrollIntoView({behavior:'smooth',block:'start'});};$('refreshInventory').onclick=renderInventory;$('saveCategory').onclick=addCategory;$('closeCategoryAdmin').onclick=()=>{$('categoryAdminPanel').classList.add('hidden')};$('openCategoryAdmin').onclick=()=>{$('categoryAdminPanel').classList.toggle('hidden');renderCategories();};
$('newClient').onclick=resetClientForm;$('saveClient').onclick=saveClient;$('cancelClient').onclick=resetClientForm;$('clientSearchName').oninput=renderClients;$('clientSearchAddress').oninput=renderClients;$('productSearch').oninput=renderInventory;$('filterWeek').onchange=renderClients;$('filterDay').onchange=renderClients;bindImmediateValidation('clientRut');bindImmediateValidation('clientPhone');$('clientRut').oninput=e=>{e.target.value=e.target.value.toUpperCase().replace(/[^0-9K]/g,'').slice(0,9)};$('clientPhone').oninput=e=>{e.target.value=formatPhone(e.target.value)};
document.querySelectorAll('#historyType button').forEach(b=>b.onclick=()=>{historyType=b.dataset.history;document.querySelectorAll('#historyType button').forEach(x=>x.classList.toggle('active',x===b));renderHistory()});$('historyFrom').onchange=renderHistory;$('historyTo').onchange=renderHistory}
bind();
migrateVariantInventory();
repairUltraVariants();
applyInventoryUpdate();
resetProductForm();resetClientForm();renderHome();renderCash();renderInventory();renderClients();renderHistory();
loadSeed();
