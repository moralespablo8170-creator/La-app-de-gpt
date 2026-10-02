(()=>{
  function show(id,tabId){
    const views=['homeView','newView','historyView','clientsView','productsView'];
    views.forEach(v=>{const el=document.getElementById(v);if(el)el.classList.toggle('hidden',v!==id)});
    document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active'));
    const tab=document.getElementById(tabId);if(tab)tab.classList.add('active');
    window.scrollTo(0,0);
  }
  function goHome(){show('homeView','homeTab');}
  function goNew(){show('newView','newTab');try{if(typeof newClient==='function')newClient()}catch(e){}}
  function goHistory(){show('historyView','historyTab');try{if(typeof showHistory==='function')showHistory()}catch(e){}}
  function goClients(){show('clientsView','clientsTab');try{if(typeof showClients==='function')showClients()}catch(e){}}
  function goProducts(){show('productsView','productsTab');try{if(typeof showProducts==='function')showProducts()}catch(e){}}
  function bind(){
    const map={homeTab:goHome,newTab:goNew,historyTab:goHistory,clientsTab:goClients,productsTab:goProducts};
    Object.entries(map).forEach(([id,fn])=>{const b=document.getElementById(id);if(b)b.onclick=e=>{e.preventDefault();e.stopPropagation();fn()}});
    const dash={dashboardNew:goNew,dashboardHistory:goHistory,dashboardSeeAll:goHistory,dashboardClientsBtn:goClients,dashboardTodayHistory:goHistory,dashboardTodayHistory2:goHistory};
    Object.entries(dash).forEach(([id,fn])=>{const b=document.getElementById(id);if(b)b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();fn()})});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
