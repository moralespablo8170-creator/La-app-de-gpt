import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const route=src.slice(src.indexOf('function clientRoute('),src.indexOf('function defaultPromos('));
const save=src.slice(src.indexOf('function saveClient('),src.indexOf('function deleteClient('));
assert(route.includes('function setClientRoute(')&&save.includes('function saveClient('));
const cases=[
 {name:'move to other day',id:'b',day:'Martes',position:1,before:[['a','Lunes',1],['b','Lunes',2],['c','Lunes',3],['d','Martes',1]],after:[['a','Lunes',1],['b','Martes',1],['c','Lunes',2],['d','Martes',2]]},
 {name:'move down',id:'b',day:'Lunes',position:3,before:[['a','Lunes',1],['b','Lunes',2],['c','Lunes',3]],after:[['a','Lunes',1],['b','Lunes',3],['c','Lunes',2]]},
 {name:'move up',id:'c',day:'Lunes',position:1,before:[['a','Lunes',1],['b','Lunes',2],['c','Lunes',3]],after:[['a','Lunes',2],['b','Lunes',3],['c','Lunes',1]]},
 {name:'insert new',id:'x',day:'Lunes',position:2,before:[['a','Lunes',1],['b','Lunes',2],['c','Lunes',3]],after:[['a','Lunes',1],['b','Lunes',3],['c','Lunes',4],['x','Lunes',2]]}
];
for(const t of cases){
 let clients=t.before.map(([id,day,position])=>({id,name:id,address:'address '+id,routeWeek:'A',routeDay:day,routePosition:position}));
 const dom={clientName:{value:t.id},clientAddress:{value:'address '+t.id},clientRut:{value:''},clientWeek:{value:'A'},clientDay:{value:t.day},clientPosition:{value:String(t.position)},clientBusinessName:{value:''},clientComuna:{value:''},clientObservations:{value:''},clientSendInvoice:{checked:false},clientPhone:{value:''},clientSearchName:{value:''},clientSearchAddress:{value:''},clientValidation:{textContent:''}};
 const ctx={normalizeClientFields:()=>{},validateClientField:()=>true,$:id=>dom[id],getClients:()=>clients,editingClientId:t.id==='x'?'':t.id,uid:()=>t.id,norm:x=>String(x||'').toLowerCase(),writeArray:(key,rows)=>{clients=rows;return true},resetClientForm:()=>{},renderClients:()=>{},renderHome:()=>{},window:{scrollTo:()=>{}},setTimeout:()=>{}};
 new Function(...Object.keys(ctx),route+save+'saveClient()')(...Object.values(ctx));
 const actual=clients.map(c=>[c.id,c.routeAssignments?.A?.day||c.routeDay,c.routeAssignments?.A?.position||c.routePosition]);
 assert.deepEqual(actual,t.after,t.name);
}
console.log('Four client route move and insert scenarios passed.');
