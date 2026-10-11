import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const route=src.slice(src.indexOf('function clientRoute('),src.indexOf('function defaultPromos('));
const fn=src.slice(src.indexOf('function deleteClient('),src.indexOf('function editClient('));
assert(route.includes('function setClientRoute(')&&fn.includes('function deleteClient('));
for(const scenario of ['blocked-sale','blocked-payment','delete-and-reorder']){
 let clients=[{id:'a',name:'Ana',routeWeek:'A',routeDay:'Lunes',routePosition:1},{id:'b',name:'Beto',routeWeek:'A',routeDay:'Lunes',routePosition:2},{id:'c',name:'Cata',routeWeek:'A',routeDay:'Lunes',routePosition:3}];
 let saved=false,confirmed=false;
 const dom={clientValidation:{textContent:'',className:''},clientSearchName:{value:'x'},clientSearchAddress:{value:'x'}};
 const $=id=>dom[id]||(dom[id]={});
 const context={clientById:id=>clients.find(x=>x.id===id),getSales:()=>scenario==='blocked-sale'?[{clienteId:'b'}]:[],getPayments:()=>scenario==='blocked-payment'?[{clienteId:'b'}]:[],getClients:()=>clients,confirmDelete:(a,b,callback)=>{confirmed=true;callback()},writeArray:(key,rows)=>{clients=rows;saved=true;return true},norm:x=>String(x).toLowerCase(),resetClientForm:()=>{},renderClients:()=>{},renderHome:()=>{},window:{scrollTo:()=>{}},setTimeout:()=>{},$};
 new Function(...Object.keys(context),route+fn+"deleteClient('b')")(...Object.values(context));
 if(scenario==='delete-and-reorder'){
  assert(saved&&confirmed);
  assert.deepEqual(clients.map(c=>[c.id,c.routeAssignments?.A?.position||c.routePosition]),[['a',1],['c',2]]);
 }else{
  assert(!saved&&!confirmed);
  assert.equal(clients.length,3);
 }
}
console.log('Three client deletion and route-reordering scenarios passed.');
