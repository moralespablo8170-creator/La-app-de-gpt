/* B111 - Semana B desde ZZZ 2(1).xlsx */
(function(){
const VERSION='route-position-excel-B-ZZZ2-2';
function run(){
if(localStorage.getItem('zipperRoutePositionMigrationB')===VERSION)return;
if(!localStorage.getItem('zipperSeedVersion')){setTimeout(run,300);return;}

const normLocal=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const key=v=>normLocal(v).replace(/[^a-z0-9]/g,'');
const rows=[["Martes",1,"barbara vecina"],["Martes",2,"marlen"],["Martes",3,"denisse / bastian"],["Martes",4,"michel"],["Martes",5,"cristian"],["Martes",6,"olegario / danilo"],["Martes",7,"rosa"],["Martes",8,"felipe meza"],["Martes",9,"zully ( alexandra)"],["Martes",10,"luis"],["Martes",11,"cristobal"],["Martes",12,"cristian pronto copete"],["Martes",13,"cesar senitz"],["Martes",14,"zully"],["Martes",15,"juan madrid"],["Martes",16,"camila rudy"],["Martes",17,"felipe  ( fabian) hijo"],["Martes",18,"marta huentemilla"],["Martes",19,"elizabeht"],["Martes",20,"Raúl Valenzuela"],["Martes",21,"Jessica Jara"],["Martes",22,"Fernando"],["Martes",4,"angel vecino michel"],["Martes",9,"yesenia"],["Martes",23,"cristina"],["Miércoles",1,"Luis Morales"],["Miércoles",2,"rudy"],["Miércoles",3,"ricardo segura"],["Miércoles",4,"carolina"],["Miércoles",5,"rosita (erika )"],["Miércoles",6,"denis"],["Miércoles",7,"andres"],["Miércoles",8,"luis ( la 30 )"],["Miércoles",9,"ivon"],["Miércoles",10,"solange"],["Miércoles",11,"camila / cristian 32"],["Miércoles",12,"carolina/araceli"],["Miércoles",13,"caren torres"],["Miércoles",14,"mileidis"],["Miércoles",15,"cecy"],["Miércoles",16,"barbara"],["Miércoles",17,"antonio"],["Miércoles",18,"margarita/camila"],["Miércoles",19,"manuel espinoza"],["Miércoles",20,"manuel fernandez"],["Miércoles",21,"pamela lillo"],["Miércoles",22,"barbon leo"],["Jueves",1,"Cristina rosario Albrecht urbano"],["Jueves",2,"Raul Muñoz López"],["Jueves",3,"carmen"],["Jueves",4,"omar / jobanca"],["Jueves",5,"nvo"],["Jueves",6,"samanta pe"],["Jueves",7,"ivan"],["Jueves",8,"hector braulio"],["Jueves",9,"julian ( acacios)"],["Jueves",10,"daniel  (alfalfal)"],["Jueves",11,"manuel"],["Jueves",12,"maritza espinoza"],["Jueves",13,"ivan cruces"],["Jueves",14,"nva central"],["Jueves",15,"maria teresa"],["Jueves",16,"reinaldo"],["Jueves",17,"jorge"],["Jueves",18,"geraldin"],["Jueves",15,"sayuri"],["Jueves",20,"ultimo ojo"],["Viernes",1,"maria eugenia"],["Viernes",2,"luzmira del Carmen"],["Viernes",3,"Carmen Oyanedel"],["Viernes",4,"Gloria  Sandoval"],["Viernes",5,"Claudio  Fernández"],["Viernes",6,"nvo"],["Viernes",7,"gonzalo"],["Viernes",8,"Richard"],["Viernes",9,"marco"],["Viernes",10,"sandra jacquline"],["Viernes",11,"teresa"],["Viernes",12,"alicia sepulveda"]];let clients=[];try{clients=JSON.parse(localStorage.getItem('zipperClientes')||'[]')}catch(e){clients=[]}if(!Array.isArray(clients))clients=[];
const usedByDay={},lastByDay={};rows.forEach(r=>{const day=r[0],requested=Number(r[1]),name=String(r[2]).trim();usedByDay[day]||(usedByDay[day]=new Set());lastByDay[day]||(lastByDay[day]=0);let pos=requested;while(usedByDay[day].has(pos)||pos<=lastByDay[day])pos=lastByDay[day]+1;usedByDay[day].add(pos);lastByDay[day]=pos;
// Priorizar coincidencia exacta de nombre, día y posición. Nunca elegir
// arbitrariamente el primer homónimo: Cecy y otros pueden ser locales distintos.
const sameDay=clients.filter(x=>key(x.name)===key(name)&&x.routeAssignments?.B&&normLocal(x.routeAssignments.B.day)===normLocal(day));
let c=sameDay.find(x=>Number(x.routeAssignments.B.position)===pos);
// No reasignar una ficha existente a otra posición solo por coincidir el nombre.
if(!c&&sameDay.length>0)return; // Ya existe en este día: no crear otro registro ni cambiar su posición.
if(!c){
 const unassigned=clients.filter(x=>key(x.name)===key(name)&&!x.routeAssignments?.B);
 if(unassigned.length===1)c=unassigned[0];
 if(unassigned.length>1)return; // No mezclar homónimos sin RUT o dirección.
}
if(!c){c={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),name,rut:'',phone:'',address:'',razonSocial:'',comuna:'',active:true,route:'',routeWeek:'B',routeDay:day,routePosition:pos,routeAssignments:{B:{day,position:pos}}};clients.push(c)}else{c.routeAssignments=c.routeAssignments&&typeof c.routeAssignments==='object'?c.routeAssignments:{};c.routeAssignments.B={day,position:pos};if(!c.routeWeek||c.routeWeek==='B'){c.routeWeek='B';c.routeDay=day;c.routePosition=pos}}});
localStorage.setItem('zipperClientes',JSON.stringify(clients));localStorage.setItem('zipperRoutePositionMigrationB',VERSION);try{if(typeof renderClients==='function')renderClients();if(typeof renderHome==='function')renderHome()}catch(e){}
}
run();
})();