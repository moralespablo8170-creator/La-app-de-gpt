import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fragment=src.slice(src.indexOf('function confirmDebtPayment('),src.indexOf("let cashRange='day'"));
assert(fragment.includes('function confirmDebtPayment('));
const cases=[
 ['cash-valid','200','cash',500,false,true],
 ['too-high','600','cash',500,false,false],
 ['zero','0','cash',500,false,false],
 ['decimal','1.5','cash',500,false,false],
 ['invalid-method','200','other',500,false,false],
 ['storage-failure','200','transfer',500,true,false]
];
for(const [name,value,method,debt,fail,expected] of cases){
 let rows=[],closed=false,rendered=false;
 const dom={debtPaymentAmount:{value},debtPaymentMethod:{value:method},debtPaymentError:{textContent:''},cashPaymentsToday:null};
 const context={pendingDebtPayment:{clientId:'c'},clientDebt:()=>debt,$:id=>dom[id]||null,money:n=>'$'+n,clientById:()=>({name:'C'}),getPayments:()=>rows,uid:()=> 'p',localDate:()=> '2026-10-11',writeArray:(key,items)=>{if(fail)return false;rows=items;return true},closeDebtPayment:()=>{closed=true},renderCash:()=>{rendered=true},renderHistory:()=>{},document:{}};
 new Function(...Object.keys(context),fragment+'confirmDebtPayment()')(...Object.values(context));
 const saved=closed&&rendered&&rows.length===1;
 assert.equal(saved,expected,name);
 if(fail)assert.match(dom.debtPaymentError.textContent,/No se pudo guardar/);
}
console.log('Six debt payment validation and storage scenarios passed.');
