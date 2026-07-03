/* A7 — checks.js kural registry'sinin makine-okunur yüzeyini doğrular.
   checks-metin.js davranışı (metin/severity/sıra) donarken, bu test kural-tablosu
   sözleşmesini denetler:
     1) CHECK_RULES dizi; her giriş KARARLI ASCII id + run(fonksiyon); id'ler benzersiz.
     2) checkRuleIds() = rule id + subIds düz listesi (D/DXF/ML tüketici vokabülleri).
     3) collectChecks() döndürdüğü HER satırda {id,s,t,reg,unit,action} alanları var;
        id boş değil ve checkRuleIds() kümesinde (metin-ayrıştırmasız filtre garantisi).
     4) severity yalnız ok|bad|info.
   Girdi seti snapshot/checks-metin ile aynı — çok-satırlı senaryolar (bad içeren)
   kapsama için seçilir. Motor determinist; başarısızlık = sözleşme ihlali.
*/
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const SCENARIOS = [
  { id:'apt-21x18', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[21,0],[21,18],[0,18]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:false,acik:false,adet:1}] },
  { id:'deep-48x27', binaTipi:'apartman', katSayisi:6, katYuk:2.9,
    pts:[[0,0],[48,0],[48,27],[0,27]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:true,acik:true,adet:2}] },
  { id:'villa-5+1', binaTipi:'villa', katSayisi:2, katYuk:2.9,
    pts:[[0,0],[14,0],[14,11],[0,11]],
    specs:[{oda:5,salon:1,ensuite:true,acik:false,adet:1}] },
];

function runScenario(sc){
  const dom = installDom({ binaTipi:sc.binaTipi, katSayisi:sc.katSayisi, katYuk:sc.katYuk });
  const ctx = vm.createContext({
    console, matchMedia:()=>({matches:false}),
    document: dom.document,
    window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
    XMLSerializer:function(){ this.serializeToString=()=>''; },
    Image:function(){}, Blob:function(){},
    URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
    localStorage:{ getItem(){return null;}, setItem(){} },
    requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout,
    navigator:{ userAgent:'node' }
  });
  scriptSources().forEach(({ source, filename }) => {
    new vm.Script(source, { filename }).runInContext(ctx);
  });
  ctx.__PTS = sc.pts.map(p=>({ x:p[0], y:p[1] }));
  ctx.__SPECS = sc.specs;
  new vm.Script(`
    pts = __PTS; closed = true;
    unitSpecs = __SPECS.map(s=>({...s}));
    customCutsZ = null; unitLayout = {}; balconies = [];
    doorOverrides = {}; extraDoors = []; doorHidden = {}; editHistory = [];
    if (typeof villaFloors !== 'undefined') villaFloors = null;
    if (typeof activeFloor !== 'undefined') activeFloor = 0;
    generate();
    __OUT = { rows: collectChecks(), ids: checkRuleIds(),
              rulesShape: CHECK_RULES.map(r=>({ id:r.id, hasRun:typeof r.run==='function', subIds:r.subIds||null })) };
  `, { filename:`registry-${sc.id}.js` }).runInContext(ctx);
  return ctx.__OUT;
}

let fail = 0;
const err = (m)=>{ console.log('  FAIL '+m); fail++; };
const ASCII_ID = /^[A-Z][A-Z0-9_]*$/; // KARARLI ASCII id konvansiyonu

// Registry biçim denetimi (senaryodan bağımsız — ilk senaryo yeter, hepsinde aynı).
const first = runScenario(SCENARIOS[0]);
const seen = new Set();
first.rulesShape.forEach(r=>{
  if(!ASCII_ID.test(r.id)) err(`kural id ASCII/kararlı değil: ${JSON.stringify(r.id)}`);
  if(!r.hasRun) err(`kural ${r.id} run fonksiyonu yok`);
  if(seen.has(r.id)) err(`yinelenen kural id: ${r.id}`); seen.add(r.id);
  (r.subIds||[]).forEach(x=>{ if(!ASCII_ID.test(x)) err(`subId ASCII değil (${r.id}): ${JSON.stringify(x)}`); });
});
console.log(`  OK  registry ${first.rulesShape.length} kural, id'ler ASCII+benzersiz`);

// Her senaryo: satır sözleşmesi + id kümesi kapsaması.
for(const sc of SCENARIOS){
  const out = sc.id===SCENARIOS[0].id ? first : runScenario(sc);
  const idSet = new Set(out.ids);
  let rows=0, badId=0, badShape=0, badSev=0;
  out.rows.forEach(o=>{ rows++;
    if(!('id' in o)||!('s' in o)||!('t' in o)||!('reg' in o)||!('unit' in o)||!('action' in o)) badShape++;
    if(o.id==null||!idSet.has(o.id)) badId++;
    if(o.s!=='ok'&&o.s!=='bad'&&o.s!=='info') badSev++;
  });
  if(badShape) err(`${sc.id}: ${badShape} satırda {id,s,t,reg,unit,action} alanı eksik`);
  if(badId)    err(`${sc.id}: ${badId} satırda id boş veya registry dışı`);
  if(badSev)   err(`${sc.id}: ${badSev} satırda geçersiz severity`);
  if(!badShape&&!badId&&!badSev) console.log(`  OK  ${sc.id}: ${rows} satır — hepsi id'li (registry içinde) + biçim + severity geçerli`);
}

if(fail){ console.error(`\n${fail} registry sözleşme ihlali.`); process.exit(1); }
console.log('\nkural registry sözleşmesi geçti.');
