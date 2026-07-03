/* A7 — checks.js metin/severity/sıra regresyon testi (kural-tablosu refactor'unun HAKEMİ).
   Sabit girdi setiyle generate() koşar ve collectChecks() TAM çıktısını
   tests/fixtures/checks-baseline.json ile karşılaştırır. Denetim MANTIĞI/eşikleri/
   metinleri/sıralaması refactor sırasında DEĞİŞMEZ → bu fixture BİREBİR aynı kalmalı.

   Yakalanan alanlar her satır için: {s, t, reg, unit, action}. Bunlar davranışın
   parmak izi (severity + panelde görünen metin + tıklanabilir bölge/daire referansı +
   B7 eylem meta'sı) ve refactor'un korumak ZORUNDA olduğu yüzey. Kural registry'nin
   ilerideki `id` alanı BİLİNÇLİ olarak yakalanmaz (additive; refactor öncesi yoktu →
   fixture'ı kirletmemeli). Sıra da fixture'a gömülüdür (collectChecks sonda severity'ye
   göre stable-sort eder; aynı severity içinde ekleme sırası korunur).

   Senaryolar snapshot-regression.js ile AYNI (aynı KNOWN-GOOD girdiler, taze vm context).

   Kullanım:
     node tests/checks-metin.js            # baseline'a karşı doğrula (fark = hata, exit 1)
     node tests/checks-metin.js --write     # baseline'ı YENİDEN yaz (SADECE bilinçli güncelleme)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const BASELINE = path.join(__dirname, 'fixtures', 'checks-baseline.json');

// Sabit girdi seti — snapshot-regression.js ile birebir aynı (tek doğru kaynak orası;
// burada davranışın METİN yüzeyi donuyor, orada sayısal parmak izi).
const SCENARIOS = [
  { id:'std-32x16', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[32,0],[32,16],[0,16]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}] },
  { id:'apt-21x18', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[21,0],[21,18],[0,18]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:false,acik:false,adet:1}] },
  { id:'L-shape', binaTipi:'apartman', katSayisi:8, katYuk:2.9,
    pts:[[0,0],[14,0],[14,9],[34,9],[34,17],[0,17]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:3},{oda:1,salon:1,ensuite:false,acik:true,adet:4}] },
  { id:'deep-48x27', binaTipi:'apartman', katSayisi:6, katYuk:2.9,
    pts:[[0,0],[48,0],[48,27],[0,27]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:true,acik:true,adet:2}] },
  { id:'villa-5+1', binaTipi:'villa', katSayisi:2, katYuk:2.9,
    pts:[[0,0],[14,0],[14,11],[0,11]],
    specs:[{oda:5,salon:1,ensuite:true,acik:false,adet:1}] },
  { id:'single-unit', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[16,0],[16,12],[0,12]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:1}] },
  { id:'comb-40x12', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[40,0],[40,12],[0,12]],
    specs:[{oda:2,salon:1,ensuite:false,acik:true,adet:3},{oda:1,salon:1,ensuite:false,acik:false,adet:2}] },
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
    __OUT = (function(){
      // collectChecks() = runChecks()'in ham veri kaynağı (runChecks yalnız + renderChecks).
      // Yalnız davranış-koruyan alanları yakala; ilerideki additive 'id' bilinçli dışarıda.
      return (collectChecks()||[]).map(o=>({
        s:o.s, t:o.t,
        reg:(o.reg==null?null:o.reg),
        unit:(o.unit==null?null:o.unit),
        action:(o.action==null?null:o.action)
      }));
    })();
  `, { filename:`checks-${sc.id}.js` }).runInContext(ctx);
  return ctx.__OUT;
}

const WRITE = process.argv.includes('--write');
const results = {};
for (const sc of SCENARIOS) results[sc.id] = runScenario(sc);

if (WRITE){
  fs.mkdirSync(path.dirname(BASELINE), { recursive:true });
  fs.writeFileSync(BASELINE, JSON.stringify(results, null, 2) + '\n');
  console.log('checks baseline yazıldı ->', path.relative(process.cwd(), BASELINE));
  for (const id in results){ const r=results[id];
    let bad=0,ok=0,info=0; r.forEach(o=>{ if(o.s==='bad')bad++; else if(o.s==='ok')ok++; else info++; });
    console.log(`  ${id}: satir=${r.length} bad=${bad} ok=${ok} info=${info}`); }
  process.exit(0);
}

if (!fs.existsSync(BASELINE)){
  console.error("checks baseline yok; önce: node tests/checks-metin.js --write");
  process.exit(2);
}
const golden = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
let fail = 0;
for (const sc of SCENARIOS){
  const g = golden[sc.id], n = results[sc.id];
  if (!g){ console.log(`  [yeni] ${sc.id} baseline'da yok`); fail++; continue; }
  if (JSON.stringify(g)===JSON.stringify(n)){
    let bad=0; n.forEach(o=>{ if(o.s==='bad')bad++; });
    console.log(`  OK  ${sc.id} (satir=${n.length} bad=${bad})`);
  } else {
    fail++; console.log(`  FARK ${sc.id}`);
    const max=Math.max(g.length,n.length);
    for(let i=0;i<max;i++){
      if(JSON.stringify(g[i])!==JSON.stringify(n[i]))
        console.log(`      satir[${i}]:\n        golden: ${JSON.stringify(g[i])}\n        yeni:   ${JSON.stringify(n[i])}`);
    }
  }
}
if (fail){
  console.error(`\n${fail} senaryo checks-baseline'dan SAPTI (metin/severity/sıra değişti → refactor davranışı bozdu; bilinçliyse --write).`);
  process.exit(1);
}
console.log(`\n${SCENARIOS.length} senaryo checks-baseline ile birebir.`);
