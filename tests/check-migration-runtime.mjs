import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const script=fs.readFileSync(new URL('../route-position-migration-b.js',import.meta.url),'utf8');
function run(seed=[],version=null){
 const store=new Map([['zipperSeedVersion','seed-ready'],['zipperClientes',JSON.stringify(seed)]]);
 if(version)store.set('zipperRoutePositionMigrationB',version);
 const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 const crypto={randomUUID:(()=>{let i=0;return ()=>String(++i).padStart(12,'0')})()};
 vm.runInNewContext(script,{localStorage,crypto,setTimeout:()=>{throw Error('Unexpected timer')}},{timeout:3000});
 return {clients:JSON.parse(store.get('zipperClientes')),version:store.get('zipperRoutePositionMigrationB'),store};
}
const key=x=>String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const fresh=run();
assert.equal(fresh.clients.length,79,'all Semana B entries must be created');
const slots=fresh.clients.map(c=>c.routeAssignments.B.day+'|'+c.routeAssignments.B.position);
assert.equal(new Set(slots).size,79,'route positions must be unique');
const placeholders=fresh.clients.filter(c=>key(c.name)==='nvo');
assert.equal(placeholders.length,2,'separate provisional locations');
assert.deepEqual(placeholders.map(c=>c.routeAssignments.B.day).sort(),['Jueves','Viernes']);
const protectedData=[{id:'existing',name:'Denisse / Bastian',routeAssignments:{B:{day:'Martes',position:3}},notes:'historical'}];
assert.equal(JSON.stringify(run(protectedData).clients),JSON.stringify(protectedData),'existing B routes must not be overwritten');
const provisional=[{id:'unassigned',name:'nvo',routeAssignments:{},notes:'keep'}];
const result=run(provisional);
assert.equal(result.clients.length,80,'two provisional routes must be distinct from unassigned existing record');
assert.equal(result.clients[0].id,'unassigned');
assert.equal(result.clients[0].notes,'keep');
assert.equal(result.clients[0].routeAssignments.B,undefined);
const twice=run(fresh.clients,fresh.version);
assert.equal(JSON.stringify(twice.clients),JSON.stringify(fresh.clients),'migration must be idempotent');
console.log('Migration runtime scenarios passed: fresh, unique slots, placeholders, protected existing, unassigned, idempotence.');
