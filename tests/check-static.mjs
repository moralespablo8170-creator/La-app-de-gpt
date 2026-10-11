import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('app.js'),backup=read('herramientas.js'),migration=read('route-position-migration-b.js'),verifier=read('tests/verificador-respaldo-aislado.html');
for(const [name,source] of [['app.js',app],['herramientas.js',backup],['route-position-migration-b.js',migration]]){
 new Function(source); console.log('Syntax OK:',name);
}
assert.match(app,/function finalizeSale\(/);
assert.match(app,/function saveClient\(/);
assert.match(app,/function clientRoute\(/);
assert.match(backup,/function validateZipperBackup\(/);
assert.match(backup,/function restoreZipperBackup\(/);
assert.match(verifier,/referencia cliente inexistente/);
assert.match(verifier,/referencia venta inexistente/);
const rows=JSON.parse(migration.match(/const rows=(\[.*?\]);let clients=/s)?.[1]||'null');
assert.equal(rows.length,79);
const slots=new Set(),counts={};
for(const [day,requested,name] of rows){
 let p=Number(requested);while(slots.has(day+'|'+p))p++;
 slots.add(day+'|'+p);counts[name]=(counts[name]||0)+1;
}
assert.equal(slots.size,79);
assert.equal(counts.nvo,2);
assert.match(migration,/const unassigned=genericName\?\[\]:/);
assert.match(migration,/if\(clients.some\(c=>c&&c.routeAssignments&&c.routeAssignments.B\)\)/);
console.log('All static checks passed');
