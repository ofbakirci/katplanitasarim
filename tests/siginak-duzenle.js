/* U4 — SIĞINAK KATI DÜZENLENEBİLİR: konut-dışı katta (katKullanim!=='konut')
   daireye bağlı oda yoktur (unitObjs boş) → eski computeWallRuns "en az bir taraf
   daire odası" kuralı HİÇBİR duvarı sürüklenebilir kılmıyordu ("sığınak alanını
   düzenleyemiyoruz"). Fix: konut-dışı katta çekirdek/koridor DIŞINDAKİ iki bölge
   (sığınak↔otopark) sınırı sürüklenebilir. Konut katı byte-aynı kalmalı. */
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
console.log('--- Sığınak katı düzenlenebilir ---');

/* === 6x5 sığınak katı: sol yarı SIĞINAK, sağ yarı OTOPARK, orta 1 sütun ASANSÖR ===
   c0,c1 = siginak · c2 = çekirdek (asansör) · c3,c4 = otopark ; unitObjs BOŞ. */
const COLS=5, ROWS=6;
const mk=(id,name,type,cells)=>({id,name,type,cells:cells.slice()});
const cells=(c0,c1)=>{ const a=[]; for(let r=0;r<ROWS;r++)for(let c=c0;c<=c1;c++)a.push(r*COLS+c); return a; };
const sg =mk(0,'SIĞINAK','siginak', cells(0,1));
const core=mk(1,'ASANSÖR','asansor', cells(2,2));
const op =mk(2,'OTOPARK','otopark', cells(3,4));
plan={
  rows:ROWS, cols:COLS, minX:0, minY:0, katKullanim:'siginak',
  inside:new Array(ROWS*COLS).fill(1),
  cm:new Array(ROWS*COLS).fill(-1),
  regions:[sg,core,op], unitObjs:[]
};
plan.regions.forEach(g=>g.cells.forEach(i=>plan.cm[i]=g.id));
plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));

// 1) computeWallRuns sığınak↔otopark sınırını çıkarmıyor (çekirdek araya girdiği için
//    doğrudan komşu değiller) → sığınak↔çekirdek yasak, ama sığınak İÇ hücrelerle...
//    Bu düzende siginak(c1) ile core(c2), core(c2) ile otopark(c3) komşu; ikisi de çekirdek → yasak.
//    Bu yüzden çekirdeği ortadan çıkarıp sığınak-otopark KOMŞU olan ikinci vakayı da kur.
let runs=computeWallRuns();
// çekirdek her iki tarafı da kilitler → bu düzende sürüklenebilir duvar OLMAMALI (çekirdek değişmez)
if(runs.some(r=>plan.regions[r.a].type==='asansor'||plan.regions[r.b].type==='asansor'))
  F('çekirdek duvarı sürüklenebilir çıktı (değişmezlik ihlali)');

// === 2. vaka: çekirdeksiz, sığınak(c0-1) ↔ otopark(c2-4) DOĞRUDAN komşu ===
const sg2 =mk(0,'SIĞINAK','siginak', cells(0,1));
const op2 =mk(1,'OTOPARK','otopark', cells(2,4));
plan.regions=[sg2,op2]; plan.unitObjs=[];
plan.cm=new Array(ROWS*COLS).fill(-1);
plan.regions.forEach(g=>g.cells.forEach(i=>plan.cm[i]=g.id));
plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));

runs=computeWallRuns();
const rn=runs.find(r=>!r.horiz && ((plan.regions[r.a].type==='siginak'&&plan.regions[r.b].type==='otopark')||(plan.regions[r.a].type==='otopark'&&plan.regions[r.b].type==='siginak')));
if(!rn){ F('sığınak↔otopark duvarı sürüklenebilir çıkmadı (U4 kök neden — düzeltilmemiş)'); }
else {
  // sığınağı büyüt (otoparktan şerit al) — dir seç: donor otopark olmalı
  const dir = (plan.regions[rn.b].type==='otopark')? 1 : -1;
  const sgBefore=sg2.cells.length;
  const res=moveWallStep(rn, dir);
  if(!res) F('sığınak-otopark duvarı kaydırılamadı (moveWallStep reddetti)');
  if(sg2.cells.length<=sgBefore) F('sığınak büyümedi (şerit aktarılamadı)');
  // bütünlük
  let tot=0; const seen=new Set();
  plan.regions.forEach(g=>g.cells.forEach(i=>{ tot++;
    if(seen.has(i)) F('hücre iki bölgede: '+i); seen.add(i);
    if(plan.cm[i]!==g.id) F('cm tutarsız @ '+i); }));
  if(tot!==ROWS*COLS) F('hücre kaybı: '+tot+'/'+(ROWS*COLS));
}

// === UI-İPUCU-2 I1: SIĞINAK↔KORİDOR sınırı da sürüklenebilir + İKİ YÖN simetrik ===
//   6x7: sol c0-1 SIĞINAK · orta c2-3 KORİDOR (apartman holü, 2 sütun geniş) · sağ c4-6 OTOPARK.
//   Eski U4'te koridor sınırı KİLİTLİYDİ → sığınak yalnız otopark duvarında (tek yön) düzenleniyordu.
//   Şimdi sığınak↔koridor de sürüklenebilir; hem büyütme hem küçültme (iki yön) çalışmalı.
//   (Koridor 2 sütun ki tek şerit onu tümüyle YUTMASIN — canAbsorb koridoru zaten korur.)
{
  const WCOLS=7;
  const wcells=(c0,c1)=>{ const a=[]; for(let r=0;r<ROWS;r++)for(let c=c0;c<=c1;c++)a.push(r*WCOLS+c); return a; };
  const sg3 =mk(0,'SIĞINAK','siginak', wcells(0,1));
  const kor3=mk(1,'APARTMAN HOLÜ','koridor', wcells(2,3));
  const op3 =mk(2,'OTOPARK','otopark', wcells(4,6));
  const mkPlan=()=>{ plan={ rows:ROWS, cols:WCOLS, minX:0, minY:0, katKullanim:'siginak',
    inside:new Array(ROWS*WCOLS).fill(1), cm:new Array(ROWS*WCOLS).fill(-1),
    regions:[sg3,kor3,op3], unitObjs:[] };
    sg3.cells=wcells(0,1); kor3.cells=wcells(2,3); op3.cells=wcells(4,6);
    plan.regions.forEach(g=>g.cells.forEach(i=>plan.cm[i]=g.id));
    plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY)); };
  const findSgKor=()=>computeWallRuns().find(r=>!r.horiz && ((plan.regions[r.a].type==='siginak'&&plan.regions[r.b].type==='koridor')||(plan.regions[r.a].type==='koridor'&&plan.regions[r.b].type==='siginak')));
  mkPlan();
  const sgKor=findSgKor();
  if(!sgKor) F('sığınak↔koridor duvarı sürüklenebilir çıkmadı (I1 — tek yön kısıtı sürüyor)');
  else {
    // GROW sığınak: a=siginak ise +1
    const b4=sg3.cells.length;
    if(!moveWallStep(sgKor, plan.regions[sgKor.a].type==='siginak'? +1 : -1)) F('sığınak koridora doğru BÜYÜTÜLEMEDİ (I1 grow)');
    if(sg3.cells.length<=b4) F('sığınak büyümedi (koridordan şerit alamadı)');
    // reset + SHRINK sığınak (koridor büyür): ters yön simetrik olmalı
    mkPlan();
    const sgKor2=findSgKor();
    const b5=sg3.cells.length;
    if(!moveWallStep(sgKor2, plan.regions[sgKor2.a].type==='siginak'? -1 : +1)) F('sığınak koridor yönünde KÜÇÜLTÜLEMEDİ (I1 — hâlâ tek yön)');
    if(sg3.cells.length>=b5) F('sığınak küçülmedi (I1 shrink — simetri yok)');
  }
  // planı I4 için (ROWS*COLS düzenine) geri döndürmeye gerek yok — I4 kendi parking'ini kurar
}

// 3) KONUT katı REGRESYON: katKullanim konut olunca hol-hol düzenlenmez (eski davranış)
const h0=mk(0,'APARTMAN HOLÜ','koridor', cells(0,1));
const h1=mk(1,'APARTMAN HOLÜ','koridor', cells(2,4));
plan.regions=[h0,h1]; plan.unitObjs=[]; plan.katKullanim='konut';
plan.cm=new Array(ROWS*COLS).fill(-1);
plan.regions.forEach(g=>g.cells.forEach(i=>plan.cm[i]=g.id));
plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));
if(computeWallRuns().length) F('konut katında hol-hol duvarı sürüklenebilir çıktı (regresyon)');

// === UI-İPUCU-2 I4: ÜST ÜSTE PARK ENGELİ — yeni park mevcut park yeriyle çakışamaz ===
{
  plan.parking={ bays:[ {x:0,y:0,w:2.5,h:5,ang:0} ], aisles:[], vertical:false, manual:true };
  // (a) tam üst üste → çakışır
  if(!bayOverlapsExisting({x:0,y:0,w:2.5,h:5,ang:0}, -1)) F('I4: birebir üst üste park çakışma sezilmedi');
  // (b) yarım kaydırılmış (2.5 genişlikte 1.25 örtüşme) → çakışır
  if(!bayOverlapsExisting({x:1.25,y:0,w:2.5,h:5,ang:0}, -1)) F('I4: kısmi örtüşen park çakışma sezilmedi');
  // (c) tam bitişik ama ayrık (x=2.5, kenar kenara) → çakışmaz
  if(bayOverlapsExisting({x:2.5,y:0,w:2.5,h:5,ang:0}, -1)) F('I4: bitişik-ayrık park yanlışlıkla çakıştı');
  // (d) skip kendini atlar (taşımada) → çakışmaz
  if(bayOverlapsExisting({x:0,y:0,w:2.5,h:5,ang:0}, 0)) F('I4: skip=0 kendi park yerini çakışma saydı');
}

console.log(fails? '':'  ✓ TÜM DENETİMLER GEÇTİ');
`);

if(fails){ console.log('FAIL: '+fails); process.exit(1); }
