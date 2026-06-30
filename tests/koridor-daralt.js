/* KOPUK KORİDOR DARALTMA: çekirdeğin (merdiven/asansör) ortadan ikiye böldüğü
   APARTMAN HOLÜ tek-parça DEĞİLDİR (2 component). Eski guard regConnected(donor)
   mutlak bağlılığa baktığı için kopuk koridor SONSUZA DEK daraltılamıyordu
   (handle yalnız büyütüyordu). Fix: moveWallStep parça-sayısı DELTA'sına bakar —
   daraltma yalnız EK bir parça doğuruyorsa reddedilir. Vaka: kat-plani-47 kuzey holü. */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const src=require('./support/app-js').readAppScript();
let fails=0;
const F=m=>{ fails++; console.log('  [FAIL]', m); };

eval(src + `
console.log('--- Kopuk koridor daraltma ---');

/* === 6x5 sentetik plan: çekirdek dikey koridoru ortadan ikiye böler ===
   c0=salon(D0)  c1-3=koridor (r0,1,4,5) + çekirdek (r2,3)  c4=salon(D1) */
const COLS=5, ROWS=6;
const mk=(id,name,type,unit,cells)=>({id,name,type,unit,cells:cells.slice()});
const cor=mk(0,'APARTMAN HOLÜ','koridor',-1,[1,2,3,6,7,8, 21,22,23,26,27,28]);
const core=mk(1,'ASANSÖR','asansor',-1,[11,12,13,16,17,18]);
const s0=mk(2,'SALON','salon',0,[0,5,10,15,20,25]);
const s1=mk(3,'SALON','salon',1,[4,9,14,19,24,29]);
plan={
  rows:ROWS, cols:COLS, minX:0, minY:0,
  inside:new Array(ROWS*COLS).fill(1),
  cm:new Array(ROWS*COLS).fill(-1),
  regions:[cor,core,s0,s1],
  unitObjs:[
    {spec:{oda:1,salon:1}, rooms:[s0], antre:s0},
    {spec:{oda:1,salon:1}, rooms:[s1], antre:s1}
  ]
};
plan.regions.forEach(g=>g.cells.forEach(i=>plan.cm[i]=g.id));
plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));

// 1) regComponentCount doğru sayar
if(regComponentCount(s0)!==1) F('bağlı salon = 1 parça olmalı, oldu '+regComponentCount(s0));
if(regComponentCount(cor)!==2) F('çekirdek-bölünmüş koridor = 2 parça olmalı, oldu '+regComponentCount(cor));
if(regComponentCount({cells:[]})!==0) F('boş bölge = 0 parça olmalı');
if(regConnected(cor)) F('kopuk koridor regConnected=true olmamalı (test ön-koşulu)');

plan.wallRuns=computeWallRuns();
// koridor (id 0) ile salon arasındaki dikey duvar (üst parça)
const rn=plan.wallRuns.find(r=>!r.horiz && (r.a===0||r.b===0) && r.lo<2);
if(!rn){ F('koridor-salon duvarı bulunamadı'); }
else {
  // donör koridor olacak yönü seç (dir>0 → donor=regions[b]; dir<0 → donor=regions[a])
  const dir = (rn.b===0)? 1 : -1;
  const before=cor.cells.length, compsBefore=regComponentCount(cor);
  const res=moveWallStep(rn, dir);
  if(!res) F('KOPUK koridor daraltılamadı (regresyon: tek-yönlü handle)');
  if(cor.cells.length>=before) F('koridor hücre vermedi (daralmadı)');
  if(regComponentCount(cor)>compsBefore) F('daraltma koridoru EK parçaya böldü (guard ihlali)');
  // bütünlük: hücre kaybı/çift sahiplik yok
  let tot=0; const seen=new Set();
  plan.regions.forEach(g=>g.cells.forEach(i=>{ tot++;
    if(seen.has(i)) F('hücre iki bölgede: '+i); seen.add(i);
    if(plan.cm[i]!==g.id) F('cm tutarsız @ '+i); }));
  if(tot!==ROWS*COLS) F('hücre kaybı: '+tot+'/'+(ROWS*COLS));
}

// 2) BÜYÜTME hep çalışmalıydı (donör = bağlı salon) — asimetri kalmasın
plan.wallRuns=computeWallRuns();
const rg=plan.wallRuns.find(r=>!r.horiz && (r.a===0||r.b===0) && r.lo<2);
if(rg){ const dir=(rg.b===0)? -1 : 1; const before=cor.cells.length;
  moveWallStep(rg, dir);
  if(cor.cells.length<=before) F('koridor büyütme çalışmadı'); }

console.log(fails? '':'  ✓ TÜM DENETİMLER GEÇTİ');
`);

if(fails){ console.log('FAIL: '+fails); process.exit(1); }
