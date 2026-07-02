/* A5 — perf-smoke: generate() faz-faz süre profili (DİAGNOSTİK, STRICT DEĞİL).
   ESİK KOYMAZ — CI süre varyansı false-red üretir. Amaç: KPTA_PROFILE
   enstrümantasyonunu gerçek girdilerle koşup faz sürelerini basmak (ilk perf haritası).
   run-all strict listesinde YOK; `npm run test:diagnostics` ile ya da doğrudan
   `node tests/perf-smoke.js` ile koşulur.

   Not: KPTA_PROFILE=false iken çıktı BİREBİR korunmalı (davranış farkı yok) — o kapı
   tests/snapshot-regression.js'te; bu dosya yalnız süre ölçer, çıktı doğrulamaz. */
'use strict';
const vm = require('vm');
const { performance } = require('perf_hooks');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

// 48×27 derin blok (onarım zinciri stresi) + 32×16 standart apartman.
const SCENARIOS = [
  { id:'deep-48x27', katSayisi:6,
    pts:[[0,0],[48,0],[48,27],[0,27]],
    specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:4},{oda:2,salon:1,ensuite:true,acik:true,adet:2}] },
  { id:'std-32x16', katSayisi:5,
    pts:[[0,0],[32,0],[32,16],[0,16]],
    specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}] },
];
const RUNS = 3;

function makeCtx(sc){
  const dom = installDom({ binaTipi:'apartman', katSayisi:sc.katSayisi, katYuk:2.9 });
  const ctx = vm.createContext({
    console, matchMedia:()=>({matches:false}), performance,
    document: dom.document,
    window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
    XMLSerializer:function(){ this.serializeToString=()=>''; },
    Image:function(){}, Blob:function(){},
    URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
    localStorage:{ getItem(){return null;}, setItem(){} },
    requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout,
    navigator:{ userAgent:'node' }
  });
  scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
  ctx.__PTS = sc.pts.map(p=>({ x:p[0], y:p[1] }));
  ctx.__SPECS = sc.specs;
  return ctx;
}

for(const sc of SCENARIOS){
  console.log(`\n[PERF-SMOKE] ${sc.id} (${RUNS} kez)`);
  const ctx = makeCtx(sc);
  for(let i=0;i<RUNS;i++){
    new vm.Script(`
      KPTA_PROFILE=true;
      pts = __PTS; closed = true;
      unitSpecs = __SPECS.map(s=>({...s}));
      customCutsZ = null; unitLayout = {}; balconies = [];
      doorOverrides = {}; extraDoors = []; doorHidden = {}; editHistory = [];
      if (typeof villaFloors !== 'undefined') villaFloors = null;
      if (typeof activeFloor !== 'undefined') activeFloor = 0;
      generate();
    `, { filename:`perf-${sc.id}-${i}.js` }).runInContext(ctx);
  }
}
console.log('\nperf-smoke tamamlandi (eşik yok — süreler yukarıda).');
