/* salonu DOĞRUDAN 'SALON + MUTFAK'a çevirme (mutfaksız dairede, openKitchenDirect) + retype
   simetrisi + geri al testi — node tests/salon-mutfak-cevir.js (tests/acik-mutfak.js deseni). */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={};
const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();

const integrity=()=>{ let ins=0; plan.inside.forEach(v=>ins+=v);
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  let cmOk=true;
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(plan.cm[i]!==g.id) cmOk=false; }));
  return tot===ins && cmOk; };
const mutfakYokVar=k=>runChecks().some(m=>m.id==='MUTFAK_YOK'&&m.unit===k);

/* ayrı mutfaklı daire bul → mutfağı ELLE (openKitchen'i ATLAYARAK) salona kat: spec.acik
   false KALIR → "mutfaksız daire, ayrı mutfak istendi ama yerleştirilemedi" senaryosunun
   sentetik ikizi (gerçekte dar ayak izinde generate()'in mutfağı sığdıramadığı vaka). */
const k=plan.unitObjs.findIndex(u=>u.rooms.some(g=>g.type==='mutfak'&&g.cells.length)
  && u.rooms.some(g=>g.type==='salon'&&g.cells.length));
T('ayrı mutfaklı daire var', k>=0);
const u=plan.unitObjs[k];
const salon=u.rooms.find(g=>g.type==='salon'&&g.cells.length);
const mut=u.rooms.find(g=>g.type==='mutfak'&&g.cells.length);
const mutCells=mut.cells.length, salonCells=salon.cells.length, salonName=salon.name;
mut.cells.forEach(i=>{ plan.cm[i]=salon.id; salon.cells.push(i); });
mut.cells=[];
u.rooms=u.rooms.filter(o=>o!==mut);
calcRegionMetrics(salon, plan.cols, plan.minX, plan.minY);
calcRegionMetrics(mut, plan.cols, plan.minX, plan.minY);
plan.wallRuns=computeWallRuns();
T('sentetik mutfaksız kurulum: MUTFAK_YOK bad', mutfakYokVar(k));
T('sentetik kurulum bütünlüğü', integrity());

const specBefore=u.spec, histLen=editHistory.length;

/* --- (i) openKitchenDirect: mutfaksız + acik:false → true --- */
const r1=openKitchenDirect(salon);
T('openKitchenDirect true', r1===true);
T('bütünlük', integrity());
T('salon adı SALON + MUTFAK', salon.name==='SALON + MUTFAK');
T('spec.acik=true (kopya)', u.spec.acik===true && u.spec!==specBefore);
T('MUTFAK_YOK söndü', !mutfakYokVar(k));
T('geçmişe yazıldı', editHistory.length===histLen+1);
T('hücreler taşınmadı', salon.cells.length===salonCells+mutCells);

/* --- (ii) mutfak VARKEN çağrı → false (başka, dokunulmamış ayrı-mutfaklı daire) --- */
const k2=plan.unitObjs.findIndex((o,i)=>i!==k && o.rooms.some(g=>g.type==='mutfak'&&g.cells.length)
  && o.rooms.some(g=>g.type==='salon'&&g.cells.length));
T('ikinci ayrı-mutfaklı daire var (kontrol)', k2>=0);
if(k2>=0){
  const salon2=plan.unitObjs[k2].rooms.find(g=>g.type==='salon'&&g.cells.length);
  T('mutfak varken openKitchenDirect false', openKitchenDirect(salon2)===false);
}

/* --- (iii) ikinci çağrı (aynı salon, zaten SALON + MUTFAK) → false --- */
T('ikinci çağrı (zaten açık) false', openKitchenDirect(salon)===false);

/* --- (iv) geri al --- */
T('undoEdit true', undoEdit());
T('geri al: bütünlük', integrity());
T('geri al: salon adı döndü', salon.name===salonName);
T('geri al: spec döndü', u.spec===specBefore);
T('geri al: MUTFAK_YOK geri geldi', mutfakYokVar(k));

/* --- (v) retype ile SALON'a dönüş simetrisi: açık mutfaktan düz SALON'a --- */
openKitchenDirect(salon);
T('yeniden açık mutfak', salon.name==='SALON + MUTFAK' && u.spec.acik===true);
const salonDef=RETYPE.find(d=>d.name==='SALON');
T('retype(SALON) true', retypeRoom(salon, salonDef)===true);
T('retype sonrası ad SALON', salon.name==='SALON');
T('retype sonrası spec.acik=false (simetri)', u.spec.acik===false);
T('retype sonrası MUTFAK_YOK geri geldi', mutfakYokVar(k));

console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
`);
