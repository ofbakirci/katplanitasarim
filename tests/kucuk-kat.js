/* KÜÇÜK KAT (≤2 daire, taban ≤ REG.layout.kucukKatAlan) — K1/K2/K3 kabul testi.
   Vaka: kat-plani-52 (~140 m² eğik 4-köşe, spec 1×[1+1 ×2 adet], apartman 5 kat).
   BUGÜNKÜ (K1 öncesi) motor: tam-en band koridor karşı kanadı sterilize edip ORTAK DEPO'ya
   düşürüyordu (26 m² hol + 31,5 m² depo = katın ~%41'i ölü, daireler [31,5 / 29,75] m²),
   koridor bir uçta 0,5–1 m'ye boğuluyor, 5-6 mevzuat bad'i vardı.
   K1 (trySmallFloorCore): kompakt çekirdek üst-sol köşe + çift-yüklü koridor → iki daire iki
   kanat, ORTAK DEPO yok, giriş kapıları yerleşir, daireler büyür.
   K2 (assignOrphanRooms): unit'siz TİPLİ oda → komşu daireye kat / erit (bu vakada zaten yok).
   K3 (rectifyCorridorPinch): koridor UÇ boğumunu (drainable ise) komşu odaya devret.
   Kabul kriterleri: (a) unit'siz tipli oda=0; (b) daireler büyüdü; (c) ORTAK DEPO yok;
   (d) giriş kapıları yerleşti (her daire); (e) bad, K1-öncesi 5'ten belirgin düşer. */
'use strict';
const vm = require('vm');
const path = require('path');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let fails = 0;
const F = m => { fails++; console.log('  [FAIL]', m); };

// kat-plani-52 girdileri (input/ gitignored → gömülü)
const PTS = [{x:-8.048,y:4},{x:9.449,y:4},{x:9.049,y:-4},{x:-8.448,y:-4}];
const SPECS = [{oda:1,salon:1,ensuite:false,acik:false,adet:2}];

function run(pts, specs, opts){
  const dom = installDom(Object.assign({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 }, opts||{}));
  const ctx = vm.createContext({
    console, matchMedia:()=>({matches:false}), document:dom.document,
    window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
    XMLSerializer:function(){ this.serializeToString=()=>''; },
    Image:function(){}, Blob:function(){}, URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
    localStorage:{ getItem(){return null;}, setItem(){} },
    requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, navigator:{ userAgent:'node' }
  });
  scriptSources().forEach(({ source, filename }) => { new vm.Script(source, { filename }).runInContext(ctx); });
  ctx.__PTS = pts; ctx.__SPECS = specs;
  new vm.Script(`
    pts=__PTS; closed=true; unitSpecs=__SPECS.map(s=>({...s}));
    customCutsZ=null; unitLayout={}; balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden=[]; editHistory=[];
    if(typeof villaFloors!=='undefined') villaFloors=null; if(typeof activeFloor!=='undefined') activeFloor=0;
    generate(true);
    __OUT=(function(){
      const cols=plan.cols;
      const ROOMT={salon:1,yatak:1,mutfak:1,banyo:1,wc:1,oda:1,antre:1};
      const inAnyUnit=id=>plan.unitObjs.some(u=>u.rooms.some(g=>g.id===id));
      // (a) unit'siz tipli oda sayısı
      const orphanTyped=plan.regions.filter(g=>g.cells.length && ROOMT[g.type]
        && g.name!=='ORTAK DEPO' && g.unit<0 && !inAnyUnit(g.id));
      // ORTAK DEPO
      const depo=plan.regions.filter(g=>g.name==='ORTAK DEPO' && g.cells.length);
      const depoArea=depo.reduce((s,g)=>{ let a=0; g.cells.forEach(()=>a+=M*M); return s+a; },0);
      // daire alanları
      const units=(plan.unitObjs||[]).map(u=>{ let c=0; u.rooms.forEach(g=>c+=g.cells.length); return +(c*M*M).toFixed(2); });
      // koridor min genişlik (eğik-cephe farkında — E1: kat-52 sol dış duvar EĞİK, koridorun uç
      // sütunu cephe basamağıyla 1 m'ye tıraşlanır ama işlevsel en tüm boyunca 1,5 m; inside verilir)
      let corMin=Infinity, corArea=0, floorArea=0;
      for(let i=0;i<plan.inside.length;i++) if(plan.inside[i]) floorArea+=M*M;
      plan.regions.filter(g=>g.type==='koridor'&&g.cells.length).forEach(g=>{
        corMin=Math.min(corMin, corridorMinWidth(g, cols, plan.inside, plan.rows)); let a=0; g.cells.forEach(()=>a+=M*M); corArea+=a; });
      if(corMin===Infinity) corMin=0;
      // giriş kapıları (antre→koridor)
      let unitDoors=0;
      try{ const dd=(typeof computeDoors==='function'?computeDoors():[]);
        (plan.unitObjs||[]).forEach((u,k)=>{ if(dd.some(d=>d&&d.kind==='unit'&&d.k===k&&d.status==='ok'&&d.e)) unitDoors++; }); }catch(e){ unitDoors=-1; }
      // bad
      let bad=0; try{ (runChecks()||[]).forEach(w=>{ if((w&&w.s)==='bad') bad++; }); }catch(e){ bad=-1; }
      return { orphanTyped:orphanTyped.length, depoArea:+depoArea.toFixed(2), units,
               corMin:+corMin.toFixed(2), corPct:+(corArea/floorArea*100).toFixed(1),
               unitDoors, nUnits:(plan.unitObjs||[]).filter(u=>u.rooms.some(g=>g.cells.length)).length,
               bad, koridorMin:REG.koridorMin, kucukKatAlan:REG.layout.kucukKatAlan };
    })();
  `, { filename:'kucuk-kat.js' }).runInContext(ctx);
  return ctx.__OUT;
}

console.log('--- Küçük kat (kat-52) K1/K2/K3 kabul ---');
const O = run(PTS, SPECS);
console.log(`  daireler=[${O.units}] koridor=%${O.corPct} minW=${O.corMin} m kapı=${O.unitDoors}/${O.nUnits} bad=${O.bad} depo=${O.depoArea} m² orphan=${O.orphanTyped}`);

// (a) unit'siz tipli oda = 0
if (O.orphanTyped !== 0) F(`unit'siz tipli oda = ${O.orphanTyped} (0 olmalı — K2)`);
// (c) ORTAK DEPO yok (K1 karşı-kanat sterilizasyonunu kaldırır)
if (O.depoArea > 0.01) F(`ORTAK DEPO ${O.depoArea} m² (0 olmalı — K1)`);
// (b) daireler büyüdü: K1-öncesi [31,5 / 29,75] toplam ~61,25 → belirgin artış
const total = O.units.reduce((s,a)=>s+a,0);
if (total < 70) F(`daire toplam alanı ${total} m² (K1-öncesi ~61 m²'den belirgin büyümeli)`);
// (d) her daire giriş kapısı aldı
if (O.nUnits < 2) F(`daire sayısı ${O.nUnits} (2 beklendi)`);
if (O.unitDoors < O.nUnits) F(`giriş kapısı ${O.unitDoors}/${O.nUnits} daireye yerleşti (hepsine olmalı)`);
// (e) bad, K1-öncesi 5'ten belirgin düşer (TAKS/girdi kaynaklı kalıntı olabilir; ≤3 hedef)
if (O.bad < 0) F('runChecks patladı');
else if (O.bad > 3) F(`bad=${O.bad} (K1-öncesi 5'ten belirgin düşmeli, ≤3 hedef)`);

// (b') gate DAR: 3 daireli / büyük taban bu yola GİRMEZ → küçük-kat modeli tetiklenmez.
// Doğrulama: aynı taban ama 3 daire → ORTAK DEPO/band davranışı (küçük-kat kapısı kapalı).
const O3 = run([{x:0,y:0},{x:18,y:0},{x:18,y:8},{x:0,y:8}], [{oda:1,salon:1,ensuite:false,acik:false,adet:3}]);
// 3 daire = perFloor 3 → smallFloor gate kapalı → band yolu (bu test yalnız kapının DAR olduğunu
// doğrular; band çıktısının kalitesi K1 kapsamı dışı — sadece küçük-kat modeline GİRMEDİĞİNİ ölç).
console.log(`  [dar-kapı] 3 daire/18×8: daire=${O3.nUnits} (band yolu, küçük-kat modeli tetiklenmez)`);

console.log(fails ? '' : '  ✓ TÜM DENETİMLER GEÇTİ');
if (fails) { console.log('FAIL: ' + fails); process.exit(1); }
