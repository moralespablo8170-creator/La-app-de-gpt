(()=>{
  function hideViews(){
    ['homeView','newView','historyView','clientsView','productsView'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.classList.add('hidden');
    });
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  }
  function show(id,tabId){hideViews();const v=document.getElementById(id);if(v)v.classList.remove('hidden');const t=document.getElementById(tabId);if(t)t.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}
  function goHome(){show('homeView','homeTab');if(typeof window.renderDashboard==='function')window.renderDashboard();}
  function goNew(){show('newView','newTab');if(typeof window.newReceipt==='function')window.newReceipt();}
  function goHistory(){show('historyView','historyTab');if(typeof window.history==='function')window.history();}
  function goClients(){show('clientsView','clientsTab');if(typeof window.renderClients==='function')window.renderClients();}
  function goProducts(){show('productsView','productsTab');if(typeof window.renderProducts==='function')window.renderProducts();if(typeof window.renderCategoryOptions==='function')window.renderCategoryOptions();}
  function bind(id,fn){const e=document.getElementById(id);if(e)e.addEventListener('click',e=>{e.preventDefault();fn();});}
  function init(){
    bind('homeTab',goHome);bind('newTab',goNew);bind('historyTab',goHistory);bind('clientsTab',goClients);bind('productsTab',goProducts);
    bind('dashboardNew',goNew);bind('dashboardHistory',goHistory);bind('dashboardClientsBtn',goClients);bind('dashboardSeeAll',goHistory);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
