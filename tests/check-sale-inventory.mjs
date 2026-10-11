import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const a=src.indexOf('function finalizeSale('),b=src.indexOf('function saveSale(',a);
assert(a>=0&&b>a,'finalizeSale not found');
const fn=src.slice(a,b);
function scenario({stock,qty,editing=false,partial=false,failPayment=false,failSale=false}){
 const storage={zipperProductos:[{id:'p1',name:'P',stock,price:100,pricePurchase:60}],zipperComprobantes:editing?[{id:'s1',folio:1,fecha:'2026-10-11',clienteId:'c1',items:[{productId:'p1',qty:2,price:100,purchasePrice:60}],routeWeek:'A',routeDay:'Lunes'}]:[],zipperPagos:[]};
 const dom={salePaymentMethod:{value:partial?'partial':'cash'},salePartialAmount:{value:partial?'100':''},salePartialMethod:{value:'cash'},saleStatus:{textContent:''},cartSection:{classList:{add(){}}}};
 const c={id:'c1',name:'Client',routeWeek:'A',routeDay:'Lunes',routeAssignments:{A:{day:'Lunes',position:1}}};
 const state={selectedClientId:'c1',cart:[{productId:'p1',qty}],editingSaleId:editing?'s1':'',draftProductId:'',draftQty:'',showCartTray:false};
 const setup=`const $=k=>dom[k]||(dom[k]={textContent:'',classList:{add(){}}});let {selectedClientId,cart,editingSaleId,draftProductId,draftQty,showCartTray}=state;const clientById=id=>c;const cartData=()=>({items:[{productId:'p1',baseProductId:'p1',qty:scenario.qty,price:100,purchasePrice:60}],total:scenario.qty*100,cost:scenario.qty*60});const productById=id=>storage.zipperProductos.find(p=>p.id===id);const closeSaveOptions=()=>{};const getRawProducts=()=>JSON.parse(JSON.stringify(storage.zipperProductos));const getSales=()=>JSON.parse(JSON.stringify(storage.zipperComprobantes));const viewedRoute=()=>({week:'A',day:'Lunes'});const clientRoute=(x,w)=>x.routeAssignments[w];const saleDate=s=>s.fecha;const localDate=()=> '2026-10-11';const getPayments=()=>storage.zipperPagos;const saleItemStockId=i=>i.productId;const readArray=k=>JSON.parse(JSON.stringify(storage[k]));const writeArray=(k,v)=>{if((k==='zipperPagos'&&scenario.failPayment)||(k==='zipperComprobantes'&&scenario.failSale))return false;storage[k]=JSON.parse(JSON.stringify(v));return true};const uid=()=> 's-new';const markVisited=()=>{};const renderInventory=()=>{};const renderPrint=()=>{};const renderHome=()=>{};const openReceiptPreview=()=>{};const alert=()=>{};`;
 new Function('dom','storage','c','state','scenario',setup+fn+';finalizeSale(false)')(dom,storage,c,state,{qty,failPayment,failSale});
 return {storage,dom};
}
const normal=scenario({stock:5,qty:2});assert.equal(normal.storage.zipperProductos[0].stock,3);assert.equal(normal.storage.zipperComprobantes.length,1);
const insufficient=scenario({stock:1,qty:2});assert.equal(insufficient.storage.zipperProductos[0].stock,1);assert.equal(insufficient.storage.zipperComprobantes.length,0);
const edited=scenario({stock:3,qty:4,editing:true});assert.equal(edited.storage.zipperProductos[0].stock,1);assert.equal(edited.storage.zipperComprobantes.length,1);assert.equal(edited.storage.zipperComprobantes[0].id,'s1');
const failedPayment=scenario({stock:5,qty:2,partial:true,failPayment:true});assert.equal(failedPayment.storage.zipperProductos[0].stock,5);assert.equal(failedPayment.storage.zipperComprobantes.length,0);assert.equal(failedPayment.storage.zipperPagos.length,0);
const failedSale=scenario({stock:5,qty:2,failSale:true});assert.equal(failedSale.storage.zipperProductos[0].stock,5);assert.equal(failedSale.storage.zipperComprobantes.length,0);
console.log('Five finalizeSale integration scenarios passed, including failed writes and rollback.');
