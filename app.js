const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n||0);
$('fecha').value=new Date().toISOString().slice(0,10);
$('folio').value=Number(localStorage.getItem('zipperFolio')||1);
function addItem(data={}){const row=document.createElement('div');row.className='item';row.innerHTML=\`
<label>Producto<input class="desc" placeholder="Descripción" value="\${data.desc||''}"></label>
<label>Cant.<input class="qty" type="number" min="1" value="\${data.qty||1}"></label>
<label>Precio<input class="price" type="number" min="0" value="\${data.price||0}"></label>
<button class="remove" type="button">×</button>\`;
row.querySelectorAll('input').forEach(i=>i.addEventListener('input',updateTotal));
row.querySelector('.remove').onclick=()=>{row.remove();updateTotal()};
$('items').appendChild(row);updateTotal()}
function updateTotal(){let total=0;document.querySelectorAll('.item').forEach(r=>total+=(Number(r.querySelector('.qty').value)||0)*(Number(r.querySelector('.price').value)||0));$('total').textContent=money(total);return total}
function collect(){return{cliente:$('cliente').value.trim(),fecha:$('fecha').value,folio:Number($('folio').value),vendedor:$('vendedor').value.trim(),observaciones:$('observaciones').value.trim(),items:[...document.querySelectorAll('.item')].map(r=>({desc:r.querySelector('.desc').value.trim(),qty:Number(r.querySelector('.qty').value)||0,price:Number(r.querySelector('.price').value)||0})),total:updateTotal()}}
$('addBtn').onclick=()=>addItem();
$('saveBtn').onclick=()=>{const data=collect();if(!data.cliente){$('status').textContent='Ingresa el nombre del cliente.';return}const saved=JSON.parse(localStorage.getItem('zipperComprobantes')||'[]');saved.push({...data,id:Date.now()});localStorage.setItem('zipperComprobantes',JSON.stringify(saved));localStorage.setItem('zipperFolio',String(data.folio+1));$('status').textContent=\`Comprobante #\${data.folio} guardado correctamente.\`;$('folio').value=data.folio+1};
$('clearBtn').onclick=()=>{if(!confirm('¿Limpiar el comprobante actual?'))return;$('cliente').value='';$('vendedor').value='';$('observaciones').value='';$('items').innerHTML='';addItem();$('status').textContent=''};
$('printBtn').onclick=()=>window.print();addItem();