// Owner-only controls for assigning a client's weekly route to a seller.
(() => {
  let profile = null;
  let sellers = [];
  const $ = id => document.getElementById(id);
  const readClients = () => {
    try { const rows=JSON.parse(localStorage.getItem('zipperClientes')||'[]'); return Array.isArray(rows)?rows:[]; }
    catch (_) { return []; }
  };
  const editingId = () => {
    try { return window.eval('editingClientId'); } catch (_) { return null; }
  };
  const setStatus = message => { const node=$('sellerRouteStatus'); if(node) node.textContent=message||''; };
  const currentClient = () => {
    const id=editingId();
    return id==null?null:readClients().find(row=>String(row.id)===String(id))||null;
  };
  const fillRoute = () => {
    const sellerId=$('sellerRouteSeller')?.value;
    const week=$('sellerRouteWeek')?.value||'A';
    const route=currentClient()?.sellerRoutes?.[sellerId]?.[week];
    if(route){
      $('sellerRouteDay').value=route.day||'';
      $('sellerRoutePosition').value=Number(route.position)<999999?route.position:'';
    }else{
      $('sellerRouteDay').value='';
      $('sellerRoutePosition').value='';
    }
  };
  const show = async () => {
    const box=$('sellerRouteBox');
    const active=!!profile&&profile.role==='owner'&&localStorage.getItem('zipperStorageMode')==='cloud';
    if(!box)return;
    box.classList.toggle('hidden',!active);
    if(!active){sellers=[];return;}
    const select=$('sellerRouteSeller');
    try{
      sellers=await window.zipperFirebaseCloud.listMembers();
      const previous=select.value;
      select.innerHTML='<option value="">Elegir vendedor…</option>'+sellers.map(item=>'<option value="'+String(item.uid).replace(/[&<>"']/g,'')+'">'+String(item.displayName||item.email||item.uid).replace(/[&<>"']/g,'')+'</option>').join('');
      if(sellers.some(item=>item.uid===previous))select.value=previous;
      if(!sellers.length)setStatus('Todavía no hay perfiles de vendedor activos. Créalo en Authentication y en members.');
    }catch(error){setStatus(error.message||'No se pudieron cargar los vendedores.');}
  };
  const applyAssignment = (clientId,sellerId,week,day,position) => {
    const rows=readClients();
    const client=rows.find(row=>String(row.id)===String(clientId));
    if(!client)throw new Error('No se encontró el cliente guardado.');
    const routes=client.sellerRoutes&&typeof client.sellerRoutes==='object'?client.sellerRoutes:{};
    const sellerRoutes={...routes,[sellerId]:{...(routes[sellerId]||{}),[week]:{day,position}}};
    client.sellerRoutes=sellerRoutes;
    client.assignedSellerUids=[...new Set([...(Array.isArray(client.assignedSellerUids)?client.assignedSellerUids:[]).map(String),sellerId])];
    localStorage.setItem('zipperClientes',JSON.stringify(rows));
  };
  const init = () => {
    const save=$('saveClient');
    if(save)save.addEventListener('click',event=>{
      const sellerId=$('sellerRouteSeller')?.value||'';
      if(!profile||profile.role!=='owner'||localStorage.getItem('zipperStorageMode')!=='cloud'||!sellerId)return;
      const week=$('sellerRouteWeek').value||'A';
      const day=$('sellerRouteDay').value;
      if(!day){setStatus('Elige el día de la ruta del vendedor antes de guardar.');event.preventDefault();event.stopImmediatePropagation();return;}
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus('');
      const before=readClients();
      let id=editingId();
      try { window.saveClient(); } catch(error) { setStatus(error.message||'No se pudo guardar el cliente.'); return; }
      const after=readClients();
      if(id==null){
        const prior=new Set(before.map(row=>String(row.id)));
        id=(after.find(row=>!prior.has(String(row.id)))||{}).id;
        if(id==null){
          setStatus('El formulario no guardó un cliente nuevo. Revisa los campos obligatorios.');
          return;
        }
      }else if(!after.some(row=>String(row.id)===String(id))){
        setStatus('El formulario no guardó el cliente. Revisa los campos obligatorios.');
        return;
      }
      try{
        applyAssignment(id,sellerId,week,day,Math.max(1,parseInt($('sellerRoutePosition').value,10)||999999));
        setStatus('Cliente y ruta del vendedor guardados.');
        setTimeout(()=>{if(typeof window.renderClients==='function')window.renderClients();},0);
      }catch(error){setStatus(error.message||'No se pudo guardar la asignación.');}
    },true);
    $('sellerRouteSeller')?.addEventListener('change',fillRoute);
    $('sellerRouteWeek')?.addEventListener('change',fillRoute);
    document.addEventListener('click',event=>{
      if(event.target.closest('.edit-client'))setTimeout(fillRoute,0);
      if(event.target.closest('#newClient'))setTimeout(()=>{if($('sellerRouteSeller'))$('sellerRouteSeller').value='';fillRoute();setStatus('');},0);
    },true);
    window.addEventListener('zipper-cloud-profile',event=>{
      profile=event.detail?.profile||null;
      show();
    });
    if(window.zipperFirebaseCloud?.listMembers)show();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
