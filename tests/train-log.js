/* Self-training veri musluğu testi (kendi kendine yeter: node tests/train-log.js)
   trainLog (core.js) — ML ranker (Paket D) için tercih verisi biriktiren yerel günlük.
   1) localStorage YOKSA record() sessizce no-op (false) — motor/testler çökmez.
   2) localStorage stub'ı VARSA kayıt yazılır; count/all/toJSONL çalışır.
   3) RING BUFFER: MAX=20 kayıt sınırı — 25 kayıt → en eski 5 düşer, son 20 kalır.
   4) BAYT sınırı: şişkin state tek kayıtta >BIG_ONE ise state'siz özet (stateOmitted).
   5) JSONL export: satır başına GEÇERLİ JSON; satır sayısı = kayıt sayısı.
   6) clear() günlüğü boşaltır.
*/
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  ✗',msg);} };

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  cloneNode(){ return stubEl(this.tag); },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.getComputedStyle=()=>({display:'none'});

/* localStorage BİLEREK tanımsız bırakılır → 1. vaka no-op guard'ı doğrulanır.
   Sonra stub enjekte edilir (JS Map ile birebir localStorage sözleşmesi). */
const src=extractAppScript();

eval(src+`
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]; closed=true;
courtyards=[]; editHistory=[]; redoHistory=[]; generate();

/* ===== 1) localStorage YOK → sessiz no-op ===== */
ok(typeof localStorage==='undefined', 'kurulum: localStorage tanımsız (headless)');
ok(trainLog.record('svg')===false, '1) localStorage yoksa record() no-op (false)');
ok(trainLog.count()===0, '1) localStorage yoksa count()=0');
ok(trainLog.toJSONL()==='', '1) localStorage yoksa JSONL boş');

/* ===== localStorage stub enjekte et (Map tabanlı, gerçek sözleşme) ===== */
var __store={};
globalThis.localStorage={
  getItem(k){ return Object.prototype.hasOwnProperty.call(__store,k)?__store[k]:null; },
  setItem(k,v){ __store[k]=String(v); },
  removeItem(k){ delete __store[k]; }
};

/* ===== 2) kayıt yazılır ===== */
ok(trainLog.record('svg')===true, '2) stub varken record() yazar (true)');
ok(trainLog.count()===1, '2) count()=1');
var recs=trainLog.all();
ok(recs.length===1 && recs[0].ev==='accept', '2) kayıt ev=accept');
ok(recs[0].kind==='svg', '2) kind=svg korunur');
ok(Array.isArray(recs[0].spec) && recs[0].spec.length===1, '2) spec (unitSpecs kopyası) taşınır');
ok(recs[0].edits && typeof recs[0].edits.n==='number', '2) edits özeti (n) taşınır');
ok(typeof recs[0].t==='string' && /T.*Z$/.test(recs[0].t), '2) t ISO zaman damgası');
ok(recs[0].state && recs[0].state.plan, '2) state (stateSnapshot) gömülür (normal boyut)');

/* farklı kind'lar da kabul ediliyor */
trainLog.record('png'); trainLog.record('dxf'); trainLog.record('render');
ok(trainLog.count()===4, '2) png/dxf/render kayıtları eklendi (4)');
ok(trainLog.all().map(r=>r.kind).join(',')==='svg,png,dxf,render', '2) kind sırası (FIFO)');

/* ===== 3) RING BUFFER: MAX=20 ===== */
trainLog.clear();
for(var i=0;i<25;i++) trainLog.record('svg');
ok(trainLog.count()===20, '3) 25 kayıt → MAX 20 ile sınırlı');
/* en eski düştü, en yeni kaldı: kayıtlar zaman-sıralı ekleniyor → ilk 5 atılmış olmalı.
   (state olduğundan ayırt etmek için spec'e bir işaret koyalım) */
trainLog.clear();
for(var j=0;j<25;j++){ unitSpecs=[{oda:1,salon:1,ensuite:false,acik:false,adet:1,__seq:j}]; trainLog.record('svg'); }
var seqs=trainLog.all().map(r=>r.spec[0].__seq);
ok(seqs.length===20 && seqs[0]===5 && seqs[19]===24, '3) ring: en eski 5 düştü, son 20 (5..24) kaldı');

/* ===== 4) BAYT sınırı: dev tek kayıt → state'siz özet ===== */
trainLog.clear();
/* stateSnapshot'ı geçici olarak >1MB döndürecek şekilde sarmala */
var __origSnap=stateSnapshot;
var __big='x'.repeat(1100*1024);   // ~1.1MB tek alan → BIG_ONE (1MB) aşar
stateSnapshot=function(){ return {v:1, plan:{}, __bloat:__big}; };
trainLog.record('svg');
stateSnapshot=__origSnap;
var big=trainLog.all()[0];
ok(big && big.state===undefined && big.stateOmitted===true, '4) tek kayıt >1MB → state atlandı (stateOmitted)');
ok(big.kind==='svg' && big.spec, '4) state atlansa da özet (kind/spec) kaydedilir');

/* ===== 5) JSONL export biçimi ===== */
trainLog.clear();
unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
trainLog.record('svg'); trainLog.record('render');
var jsonl=trainLog.toJSONL();
var lines=jsonl.split('\\n');
ok(lines.length===2, '5) JSONL satır sayısı = kayıt sayısı (2)');
var allValid=true; lines.forEach(function(l){ try{ var o=JSON.parse(l); if(o.ev!=='accept') allValid=false; }catch(e){ allValid=false; } });
ok(allValid, '5) her JSONL satırı geçerli JSON (ev=accept)');

/* ===== 6) clear ===== */
ok(trainLog.clear()===true, '6) clear() true');
ok(trainLog.count()===0, '6) clear sonrası count=0');
ok(trainLog.toJSONL()==='', '6) clear sonrası JSONL boş');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm eğitim-günlüğü testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
