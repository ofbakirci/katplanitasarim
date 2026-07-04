/* A1 — Snapshot-regresyon testi (Paket A güvenlik ağı, EN KRİTİK).
   Sabit bir girdi setiyle generate() koşar ve motor çıktısının sayısal parmak izini
   tests/fixtures/snapshot-baseline.json ile karşılaştırır. Motor DETERMİNİST olduğu için
   BİREBİR eşitlik beklenir; herhangi bir fark = ya regresyon ya da bilinçli baseline
   güncellemesi. A2 (sihirli sayılar → REG) ve A4 (alan tek-kaynak) gibi "davranış
   değiştirmeyen" refactor'lar bu teste karşı SIFIR fark üretmeli.

   Her senaryo, mevcut testlerden alınan KNOWN-GOOD girdi kurulumudur (room-edit / visualL /
   villa-test). Amaç "doğru" spec seçmek değil; motorun bugün ÜRETTİĞİNİ dondurmaktır — girdi
   determinist olduğu sürece baseline geçerlidir. Her senaryo TAZE bir vm context'inde koşar
   (senaryolar arası state sızıntısı yok).

   Kullanım:
     node tests/snapshot-regression.js            # baseline'a karşı doğrula (fark = hata, exit 1)
     node tests/snapshot-regression.js --write     # baseline'ı YENİDEN yaz (SADECE bilinçli taban güncellemesi)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const BASELINE = path.join(__dirname, 'fixtures', 'snapshot-baseline.json');

// Sabit girdi seti. pts = [x,y] metre köşeleri; specs = daire programları (oda/salon/ensuite/acik/adet).
const SCENARIOS = [
  // 32×16 standart apartman (room-edit.js kurulumu) — 2×(2+1 ensuite) + 2×(1+1 açık).
  { id:'std-32x16', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[32,0],[32,16],[0,16]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}] },
  // 21×18 dar-derin — 4×(3+1) + 1×(2+1); daire-başı ~75 m² sıkışık dağıtım.
  { id:'apt-21x18', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[21,0],[21,18],[0,18]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:false,acik:false,adet:1}] },
  // L-şekil (visualL.js kurulumu) — girintili footprint, koridor/etiket-çapası stresi.
  { id:'L-shape', binaTipi:'apartman', katSayisi:8, katYuk:2.9,
    pts:[[0,0],[14,0],[14,9],[34,9],[34,17],[0,17]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:3},{oda:1,salon:1,ensuite:false,acik:true,adet:4}] },
  // 48×27 derin blok — büyük footprint, çok-daire dağıtım + onarım zinciri stresi.
  { id:'deep-48x27', binaTipi:'apartman', katSayisi:6, katYuk:2.9,
    pts:[[0,0],[48,0],[48,27],[0,27]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:true,acik:true,adet:2}] },
  // Villa 5+1 (villa-test.js kurulumu) — orta-sofa, tek daire, iki kat.
  { id:'villa-5+1', binaTipi:'villa', katSayisi:2, katYuk:2.9,
    pts:[[0,0],[14,0],[14,11],[0,11]],
    specs:[{oda:5,salon:1,ensuite:true,acik:false,adet:1}] },
  // Tek daire / kat — en sade yol (dağıtım/çekirdek etkileşimi minimal).
  { id:'single-unit', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[16,0],[16,12],[0,12]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:1}] },
  // 40×12 sığ (komb) — düşük derinlik → komb/cephe-payı karar dallarını tetikler.
  { id:'comb-40x12', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[0,0],[40,0],[40,12],[0,12]],
    specs:[{oda:2,salon:1,ensuite:false,acik:true,adet:3},{oda:1,salon:1,ensuite:false,acik:false,adet:2}] },
  // kat-52 küçük kat (K1/K2/K3) — ~140 m² EĞİK 4-köşe, 1+1 ×2. Küçük-kat kompakt çekirdek
  // + çift-yüklü koridor yolunu (trySmallFloorCore) donmuş tutar; band koridor İSRAF vakası.
  { id:'kat52-kucuk', binaTipi:'apartman', katSayisi:5, katYuk:2.9,
    pts:[[-8.048,4],[9.449,4],[9.049,-4],[-8.448,-4]],
    specs:[{oda:1,salon:1,ensuite:false,acik:false,adet:2}] },
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
      const round = v => +(+v).toFixed(2);
      const regions = plan.regions.map(g=>({
        name:g.name, type:g.type, unit:g.unit,
        area:round(g.area), w:round(g.bw), h:round(g.bh),
        minSide:round(g.minSide), cells:g.cells.length
      }));
      // Daire başına toplam alan (unitObjs sırasıyla) — M=0.5 → hücre=0.25 m².
      const units = (plan.unitObjs||[]).map(u=>{
        let c=0; u.rooms.forEach(g=>c+=g.cells.length); return round(c*0.25);
      });
      let doors=0;
      try { doors=(typeof computeDoors==='function'?computeDoors():[])
        .filter(d=>d&&d.status==='ok'&&d.e).length; } catch(e){ doors=-1; }
      let bad=0, info=0;
      try { (runChecks()||[]).forEach(w=>{ const s=(w&&w.s)||'ok';
        if(s==='bad')bad++; else if(s==='info')info++; }); } catch(e){ bad=-1; }
      return { grid:{rows:plan.rows,cols:plan.cols}, regionCount:regions.length,
               regions, units, doors, bad, info };
    })();
  `, { filename:`scenario-${sc.id}.js` }).runInContext(ctx);
  return ctx.__OUT;
}

function reportDiff(g, n){
  ['grid','regionCount','units','doors','bad','info'].forEach(f=>{
    if(JSON.stringify(g[f])!==JSON.stringify(n[f]))
      console.log(`      ${f}: ${JSON.stringify(g[f])} -> ${JSON.stringify(n[f])}`);
  });
  const gr=g.regions||[], nr=n.regions||[], max=Math.max(gr.length,nr.length);
  for(let i=0;i<max;i++){
    if(JSON.stringify(gr[i])!==JSON.stringify(nr[i]))
      console.log(`      bölge[${i}]: ${JSON.stringify(gr[i])} -> ${JSON.stringify(nr[i])}`);
  }
}

const WRITE = process.argv.includes('--write');
const results = {};
for (const sc of SCENARIOS) results[sc.id] = runScenario(sc);

if (WRITE){
  fs.mkdirSync(path.dirname(BASELINE), { recursive:true });
  fs.writeFileSync(BASELINE, JSON.stringify(results, null, 2) + '\n');
  console.log('baseline yazıldı ->', path.relative(process.cwd(), BASELINE));
  for (const id in results){ const r=results[id];
    console.log(`  ${id}: bölge=${r.regionCount} daire=[${r.units}] kapı=${r.doors} bad=${r.bad} info=${r.info}`); }
  process.exit(0);
}

if (!fs.existsSync(BASELINE)){
  console.error("baseline yok; önce: node tests/snapshot-regression.js --write");
  process.exit(2);
}
const golden = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
let fail = 0;
for (const sc of SCENARIOS){
  const g = golden[sc.id], n = results[sc.id];
  if (!g){ console.log(`  [yeni] ${sc.id} baseline'da yok`); fail++; continue; }
  if (JSON.stringify(g)===JSON.stringify(n)){
    console.log(`  OK  ${sc.id} (bölge=${n.regionCount} daire=[${n.units}] kapı=${n.doors} bad=${n.bad})`);
  } else {
    fail++; console.log(`  FARK ${sc.id}`); reportDiff(g, n);
  }
}
if (fail){
  console.error(`\n${fail} senaryo baseline'dan SAPTI (regresyon ya da bilinçli değişiklik ise --write).`);
  process.exit(1);
}
console.log(`\n${SCENARIOS.length} senaryo baseline ile birebir.`);
