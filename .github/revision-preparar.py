import json,re,sys
from pathlib import Path
root=Path(sys.argv[1])
iso=r"""// Vista de revisión: usa una COPIA de los datos. Nunca escribe en los datos reales de la app.
(function(){
  var real=window.localStorage,P='zipperRevision:',META='zipperRevisionMeta:copiado';
  var skip=/^(zipperStorageMode|zipperFirebaseOutbox|zipperSellerCatalogVersion|zipperSeller_|zipperStorageRecoveryFailed)/;
  try{
    if(real.getItem(META)===null){
      var all=[];for(var i=0;i<real.length;i++)all.push(real.key(i));
      all.forEach(function(k){if(k&&k.indexOf('zipper')===0&&k.indexOf(P)!==0&&k.indexOf('zipperRevisionMeta')!==0&&!skip.test(k))real.setItem(P+k,real.getItem(k))});
      real.setItem(META,new Date().toISOString());
    }
  }catch(e){console.warn('Revisión: no se pudo copiar los datos',e)}
  function keys(){var a=[];for(var i=0;i<real.length;i++){var k=real.key(i);if(k&&k.indexOf(P)===0)a.push(k.slice(P.length))}return a}
  var api={
    getItem:function(k){return real.getItem(P+k)},
    setItem:function(k,v){real.setItem(P+k,String(v))},
    removeItem:function(k){real.removeItem(P+k)},
    clear:function(){keys().forEach(function(k){real.removeItem(P+k)})},
    key:function(i){var a=keys();return i<a.length?a[i]:null}
  };
  var store=new Proxy({},{
    get:function(t,p){if(p==='length')return keys().length;if(Object.prototype.hasOwnProperty.call(api,p))return api[p];if(typeof p==='string'){var v=real.getItem(P+p);return v===null?undefined:v}return undefined},
    set:function(t,p,v){api.setItem(p,v);return true},
    deleteProperty:function(t,p){api.removeItem(p);return true},
    has:function(t,p){return Object.prototype.hasOwnProperty.call(api,p)||real.getItem(P+p)!==null},
    ownKeys:function(){return keys()},
    getOwnPropertyDescriptor:function(t,p){var v=real.getItem(P+p);return v===null?undefined:{value:v,writable:true,enumerable:true,configurable:true}}
  });
  Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return store}});
  window.zipperRevisionReset=function(){if(!window.confirm('¿Volver a copiar los datos actuales de la app? Se pierde lo que probaste aquí.'))return;keys().forEach(function(k){real.removeItem(P+k)});real.removeItem(META);location.reload()};
  document.addEventListener('DOMContentLoaded',function(){
    var b=document.createElement('div');b.className='revision-banner';
    b.innerHTML='<b>VISTA DE REVISIÓN</b><span>Copia de tus datos · lo que hagas aquí no cambia la app real</span><button type="button" onclick="zipperRevisionReset()">↺ Recopiar datos</button>';
    document.body.insertBefore(b,document.body.firstChild);
  });
})();
"""
(root/'revision-aislamiento.js').write_text(iso)
css='\n.revision-banner{position:sticky;top:0;z-index:30000;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;background:#7c3aed;color:#fff;padding:8px 12px;font-size:12px}.revision-banner b{font-size:13px;letter-spacing:.5px}.revision-banner button{margin-left:auto;background:#fff;color:#5b21b6;border:0;border-radius:999px;padding:4px 10px;font-weight:800;font-size:12px;min-height:0}\n'
(root/'tema-colores.css').write_text((root/'tema-colores.css').read_text()+css)
html=(root/'index.html').read_text()
html=re.sub(r'<head>','<head><script src="revision-aislamiento.js"></script>',html,count=1)
html=html.replace('<title>','<title>REVISIÓN · ',1)
(root/'index.html').write_text(html)
sw=root/'sw.js'
sw.write_text(sw.read_text().replace("const CACHE_NAME = 'zipper-app-","const CACHE_NAME = 'zipper-revision-").replace("key.startsWith('zipper-app-')","key.startsWith('zipper-revision-')"))
m=root/'manifest.json'
d=json.loads(m.read_text());d.update({'id':'./zipper-revision','name':'Zipper Revisión','short_name':'Zipper Revisión','start_url':'./','scope':'./'})
m.write_text(json.dumps(d,ensure_ascii=False,indent=2))
# Sin Firebase en la revisión: nada de esta copia puede subirse a la nube real.
(root/'firebase-cloud.js').write_text("window.zipperFirebaseLoadError='desactivado en la vista de revisión (solo copia local)';\n")
for name in ['vendedor.html','seller-admin.html']:
    p=root/name
    if p.exists(): p.unlink()
assert 'revision-aislamiento.js' in html and "zipper-revision-" in sw.read_text()
print('revision ok')
