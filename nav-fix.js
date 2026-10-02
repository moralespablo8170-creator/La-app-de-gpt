(()=>{
  const views=['homeView','newView','historyView','clientsView','productsView'];
  const ids={homeTab:'homeView',newTab:'newView',historyTab:'historyView',clientsTab:'clientsView',productsTab:'productsView'};
  function go(id){
    views.forEach(v=>{const e=document.getElementById(v);if(e)e.classList.toggle('hidden',v!==id)});
    Object.keys(ids).forEach(t=>{const e=document.getElementById(t);if(e)e.classList.toggle('active',ids[t]===id)});
    window.scrollTo(0,0);
    try{
      if(id==='newView'&&typeof newClient==='function')newClient();
      if(id==='historyView'&&typeof showHistory==='function')showHistory();
      if(id==='clientsView'&&typeof showClients==='function')showClients();
      if(id==='productsView'&&typeof showProducts==='function')showProducts();
    }catch(e){}
  }
  function bind(){
    document.documentElement.classList.add('nav-v33');
    const all=[...document.querySelectorAll('.tabs .tab')];
    all.forEach(b=>{
      b.style.pointerEvents='auto';
      b.style.touchAction='manipulation';
      b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const id=ids[b.id];if(id)go(id)},true);
      b.addEventListener('touchend',e=>{e.preventDefault();e.stopImmediatePropagation();const id=ids[b.id];if(id)go(id)},true);
    });
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('.tabs .tab');
      if(!b)return;
      e.preventDefault();e.stopPropagation();
      const id=ids[b.id];if(id)go(id);
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();