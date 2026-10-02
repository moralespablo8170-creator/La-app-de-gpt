(function(){
  function addPhotoControls(){
    const list=document.getElementById('productList');
    if(!list)return;
    list.querySelectorAll('.product-list-card').forEach(card=>{
      if(card.querySelector('.product-photo-upload'))return;
      const placeholder=card.querySelector('.product-list-placeholder');
      if(!placeholder)return;
      const edit=card.querySelector('.edit-product');
      if(!edit)return;
      const id=edit.dataset.id;
      placeholder.classList.add('product-photo-upload');
      placeholder.setAttribute('role','button');
      placeholder.setAttribute('tabindex','0');
      placeholder.setAttribute('title','Agregar o cambiar foto');
      placeholder.innerHTML='<span>＋</span><small>Foto</small>';
      const open=()=>{
        const input=document.createElement('input');
        input.type='file';
        input.accept='image/*';
        input.setAttribute('aria-label','Seleccionar foto del producto');
        input.style.display='none';
        document.body.appendChild(input);
        input.onchange=()=>{
          const file=input.files&&input.files[0];
          if(!file){input.remove();return}
          if(!file.type.startsWith('image/')){alert('Selecciona una foto o archivo de imagen.');input.remove();return}
          const reader=new FileReader();
          reader.onload=()=>{
            try{
              const products=JSON.parse(localStorage.getItem('zipperProductos')||'[]');
              const product=products.find(p=>String(p.id)===String(id));
              if(!product){input.remove();return}
              product.image=reader.result;
              localStorage.setItem('zipperProductos',JSON.stringify(products));
              if(typeof renderProducts==='function')renderProducts();
              if(typeof renderCatalog==='function')renderCatalog();
            }catch(e){alert('No se pudo guardar la imagen en este dispositivo.')}
            input.remove();
          };
          reader.onerror=()=>{alert('No se pudo leer la imagen.');input.remove()};
          reader.readAsDataURL(file);
        };
        input.click();
      };
      placeholder.addEventListener('click',open);
      placeholder.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    });
  }
  const observer=new MutationObserver(addPhotoControls);
  window.addEventListener('load',()=>{
    addPhotoControls();
    const list=document.getElementById('productList');
    if(list)observer.observe(list,{childList:true,subtree:true});
  });
})();