import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const a=src.indexOf('function visitedIds()'),b=src.indexOf('function uid()',a);
assert(a>=0&&b>a);
const fragment=src.slice(a,b);
for(const [before,id,after] of [
 [['a','b'],'c',['c','a','b']],
 [['a','b','c'],'b',['b','a','c']],
 [['a','b','b','c'],'b',['b','a','c']]
]){
 let rows=before.slice();
 const readArray=()=>rows;
 const writeArray=(key,value)=>{assert.equal(key,'zipperVisitados-2026-10-11');rows=value;return true};
 new Function('readArray','writeArray','localDate',fragment+'markVisited('+JSON.stringify(id)+')')(readArray,writeArray,()=> '2026-10-11');
 assert.deepEqual(rows,after);
}
console.log('Three visit order and duplicate scenarios passed.');
