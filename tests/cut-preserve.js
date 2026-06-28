/* Daire sınırı (CUT) sürüklemede elle oda düzenini koruma testi — node tests/cut-preserve.js
   Turuncu daire-ayırıcı tutamacı sürüklenince generate(true) tüm daireleri sıfırdan dizerdi
   (eklenen/silinen odalar uçardı). Düzeltme: footprint'i DEĞİŞMEYEN dairelerin elle düzeni
   restoreEditedFootprints ile geri kurulur; yalnız sınıra komşu 2 daire yeniden dizilir. */
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

const snap=u=>u.rooms.filter(g=>g.cells.length).map(g=>g.name+':'+g.cells.length).sort().join(' | ');
const fpKey=u=>{const c=[];u.rooms.forEach(g=>g.cells.forEach(i=>c.push(i)));return c.sort((a,b)=>a-b).join(',');};
const integrity=()=>{ let ins=0; for(let i=0;i<plan.inside.length;i++) if(plan.inside[i]) ins++;
  let tot=0; const seen=new Set(); let ok=true;
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(seen.has(i)) ok=false; seen.add(i); if(plan.cm[i]!==g.id) ok=false; }));
  plan.regions.forEach(g=>tot+=g.cells.length);
  return ok && tot===ins; };

T('üretim: çok daireli (2 kuşak) + cut var', plan.unitObjs.length>=4 && customCutsZ && customCutsZ.some(a=>a&&a.length));
T('üretim: bütünlük', integrity());

/* 4 daireyi de elle düzenle: salona banyo oy + bir yatak odasını sil */
plan.unitObjs.forEach((u,k)=>{
  const salon=u.rooms.find(g=>g.type==='salon'&&g.cells.length);
  if(salon) addRoom(salon, ROOM_ADD.find(d=>d.type==='banyo'&&!d.eb));
  const bed=u.rooms.find(g=>g.type==='yatak'&&g.cells.length);
  if(bed) removeRoom(bed);
});
T('elle düzenleme: bütünlük', integrity());
const editedCount=plan.unitObjs.filter(u=>u.rooms.some(g=>g.type==='banyo'&&g.cells.length<=12)).length;
T('elle düzenleme: en az 1 daire değişti', editedCount>=1);

const fpBefore=plan.unitObjs.map(fpKey);
const sigBefore=plan.unitObjs.map(snap);

/* === SINIR SÜRÜKLEME (uygulamadaki cut jesti birebir) === */
const preUnits=captureUnitFootprints();   // mousedown
T('yakalama: preUnits dolu', Array.isArray(preUnits) && preUnits.length===plan.unitObjs.length);
const zi=customCutsZ.findIndex(a=>a&&a.length);
customCutsZ[zi][0]+=1.0;                   // mousemove: cut'ı 1 m kaydır
generate(true);
restoreEditedFootprints(preUnits);         // mousemove/finishDrag restore
T('cut sürükleme: bütünlük', integrity());

/* footprint'i değişmeyen daireler elle düzeni korumalı; değişenler (sınıra komşu) yeniden dizilmeli */
const fpAfter=plan.unitObjs.map(fpKey);
const sigAfter=plan.unitObjs.map(snap);
let preserved=0, relaid=0, lost=0;
plan.unitObjs.forEach((u,k)=>{
  const j=fpBefore.indexOf(fpAfter[k]);
  if(j>=0){ if(sigAfter[k]===sigBefore[j]) preserved++; else lost++; }
  else relaid++;
});
T('footprint değişmeyen daireler korundu (kayıp yok)', lost===0);
T('en az 1 daire elle düzeni korudu', preserved>=1);
T('sınıra komşu daireler yeniden dizildi', relaid>=1);

/* GERİ AL: cut girdisi preUnits taşır (undoEdit 'cut' dalı) → pre-drag elle düzen tam geri gelmeli.
   undoEdit akışı: customCutsZ=e.cuts; generate(true); restoreEditedFootprints(e.preUnits). */
const prevCuts=customCutsZ.map(a=>a?a.slice():null); prevCuts[zi][0]-=1.0;
customCutsZ=prevCuts; generate(true); restoreEditedFootprints(preUnits);
T('geri al: bütünlük', integrity());
const sigUndo=plan.unitObjs.map(snap);
let undoOk=true;
plan.unitObjs.forEach((u,k)=>{ if(fpKey(u)===fpBefore[k] && sigUndo[k]!==sigBefore[k]) undoOk=false; });
T('geri al: tüm daireler pre-drag elle düzene döndü', undoOk);

/* DÜZENLEME YOKKEN: restore no-op olmalı (oto sonuç değişmemeli, çökmemeli) */
generate(); // taze oto plan
const autoSig=plan.unitObjs.map(snap);
const pre2=captureUnitFootprints();
const zi2=customCutsZ.findIndex(a=>a&&a.length);
customCutsZ[zi2][0]+=1.0; generate(true);
const beforeRestore=plan.unitObjs.map(snap);
restoreEditedFootprints(pre2);
const afterRestore=plan.unitObjs.map(snap);
T('düzenleme yokken: restore oto sonucu bozmaz', JSON.stringify(beforeRestore)===JSON.stringify(afterRestore));
T('düzenleme yokken: bütünlük', integrity());
`);

console.log(fail? '✗ '+fail+' hata, '+pass+' başarılı' : '✓ cut-koruma testleri geçti ('+pass+')');
process.exit(fail?1:0);
