/* PENCERE — cephe penceresi ilk-sınıf nesne (kapının ikizi) testleri.
   Kapsam: otomatik varsayılan set · override (taşı+boyut) · ekle/sil · gizle ·
   generate() sıfırlama · snapshot/restore gidiş-dönüş · export windows[] şeması.
   MOTOR MANTIĞINI DEĞİŞTİRMEZ; yalnız computeWindows/buildFloorplanMap çağırır. */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; } else { fail++; console.error('  ✗ ' + m); } }

const dom = installDom();
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
  navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));

function run(code){ return new vm.Script(code).runInContext(ctx); }

/* standart 32×16 plan üret (snapshot senaryosuyla aynı kurulum) */
run(`
  document.getElementById('binaTipi').value='apartman';
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  generate();
`);

/* 1) OTOMATİK varsayılan set: cephe pencereleri üretilir, hepsi 'ok' + e{} */
const auto = run(`(function(){ const ws=computeWindows(); return {n:ws.length, allOk:ws.every(w=>w.status==='ok'&&w.e), keys:ws.map(w=>w.key)}; })()`);
ok(auto.n > 0, 'otomatik pencere set boş (>0 bekleniyor, üretilen: '+auto.n+')');
ok(auto.allOk, 'her otomatik pencere status=ok + e{} taşımalı');
ok(auto.keys.every(k=>/^w\d+_\d+$/.test(k)), 'otomatik pencere key deseni w<ei>_<seg>');

/* 2) OVERRIDE: genişlik + yükseklik + parapet + tam boy — computeWindows/winXM yansıtmalı */
const ov = run(`(function(){
  const k=computeWindows()[0].key;
  windowOverrides[k]={w:2.2, height:1.8, sill:0.4};
  const r=computeWindows().find(w=>w.key===k);
  const a={ w:winWidthM(r), h:winHeightM(r), s:winSillM(r) };
  windowOverrides[k]={full:true};
  const r2=computeWindows().find(w=>w.key===k);
  const b={ full:r2.full, h:winHeightM(r2), s:winSillM(r2) };
  delete windowOverrides[k];
  return {a,b};
})()`);
ok(Math.abs(ov.a.w-2.2)<1e-6, 'override genişlik 2.2 uygulanmalı (bulunan '+ov.a.w+')');
ok(Math.abs(ov.a.h-1.8)<1e-6, 'override yükseklik 1.8 uygulanmalı');
ok(Math.abs(ov.a.s-0.4)<1e-6, 'override parapet 0.4 uygulanmalı');
ok(ov.b.full===true && ov.b.s===0, 'tam boy cam → parapet 0');
ok(ov.b.h>2.0, 'tam boy cam → yükseklik duvar boyu (>2 m)');

/* 3) EKLE (extraWindows) + SİL (hidden) */
const addDel = run(`(function(){
  const before=computeWindows().length;
  extraWindows.push({ei:0, t:5, w:1.6});
  const afterAdd=computeWindows().length;
  const extra=computeWindows().find(w=>w.i!=null);
  const k=computeWindows().find(w=>w.i==null).key;
  windowHidden[k]=true;
  const afterHide=computeWindows().length;
  extraWindows=[]; windowHidden={};
  return {before, afterAdd, extraOk:!!(extra&&extra.status==='ok'), afterHide, restored:computeWindows().length};
})()`);
ok(addDel.afterAdd === addDel.before+1, 'extraWindows push → +1 pencere');
ok(addDel.extraOk, 'eklenen pencere status=ok');
ok(addDel.afterHide === addDel.before, 'windowHidden → otomatik pencere düşer (-1)');
ok(addDel.restored === addDel.before, 'temizlenince set eski sayıya döner');

/* 4) SNAPSHOT/RESTORE gidiş-dönüş: pencere düzenlemeleri korunur */
const roundtrip = run(`(function(){
  const k=computeWindows()[0].key;
  windowOverrides[k]={w:2.5, full:true};
  extraWindows.push({ei:2, t:8, sill:0.2});
  const st=stateSnapshot(false);
  // boz
  windowOverrides={}; extraWindows=[]; windowHidden={};
  restoreState(JSON.parse(JSON.stringify(st)));
  const ovBack=windowOverrides[k];
  const extraBack=extraWindows.length;
  return { ovW:ovBack&&ovBack.w, ovFull:ovBack&&ovBack.full, extraBack };
})()`);
ok(roundtrip.ovW===2.5 && roundtrip.ovFull===true, 'snapshot→restore windowOverrides korunmalı');
ok(roundtrip.extraBack===1, 'snapshot→restore extraWindows korunmalı');

/* 5) generate() SIFIRLAR (kapı sözleşmesiyle aynı) */
const reset = run(`(function(){
  windowOverrides={x:1}; extraWindows=[{ei:0,t:3}]; windowHidden={y:true};
  generate();
  return { ov:Object.keys(windowOverrides).length, ex:extraWindows.length, hi:Object.keys(windowHidden).length };
})()`);
ok(reset.ov===0 && reset.ex===0 && reset.hi===0, 'generate() pencere düzenlemelerini sıfırlamalı');

/* 6) EXPORT windows[]: additive şema (width_m/height_m/sill_m/full + p0/p1 px+norm) */
const exp = run(`(function(){
  const m=buildFloorplanMap();
  const w=m.windows;
  const d0=m.doors&&m.doors[0];
  return { hasArr:Array.isArray(w), n:w.length,
    shape:w.length? (typeof w[0].width_m==='number' && typeof w[0].height_m==='number' && typeof w[0].sill_m==='number'
      && Array.isArray(w[0].p0_px) && Array.isArray(w[0].p0_norm) && ('full' in w[0])) : false,
    doorsIntact:!!(d0 && typeof d0.width_m==='number' && Array.isArray(d0.p0_px)) };
})()`);
ok(exp.hasArr, 'buildFloorplanMap.windows dizi olmalı');
ok(exp.n>0, 'export windows[] boş olmamalı ('+exp.n+')');
ok(exp.shape, 'export penceresi width_m/height_m/sill_m/full + p0/p1 px+norm taşımalı');
ok(exp.doorsIntact, 'export doors[] şeması BOZULMAMALI (additive)');

/* 7) SUNUM-5 S4 (eski B2 rafine): balkon kenarında yalnız ODA→BALKON KAPI SPAN'İ pencereden dışlanır
   (balkonun TÜM cephe aralığı DEĞİL). Böylece:
     - Kapı span'i (tm ± 0.45 ± PAD) İÇİNDE pencere OLMAZ (kapı↔pencere çakışması korunur).
     - GENİŞ balkonda kapının YANINDA (kalan segment ≥ pencere-min) pencere ÜRETİLİR (kullanıcı düzeltmesi).
     - DAR balkonda kapı yanı segment kısa → pencere doğmaz (min-genişlik kapısı otomatik hallediyor).
     - Balkon kaldırılınca set eski haline döner. */
const s4 = run(`(function(){
  pts=[{x:0,y:0},{x:20,y:0},{x:20,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:1}];
  balconies=[]; generate();
  function edgeWins(ei){ return computeWindows().filter(w=>w.status==='ok'&&w.e&&w.ei===ei)
    .map(w=>({t:w.e.t, s:w.e.t-w.w/2, e:w.e.t+w.w/2})); }
  const before=edgeWins(0);
  // GENİŞ balkon alt cephe (ei=0), kenar-boyu [4,14] (10 m) → kapı tm=9 (±0.45±0.30 = [8.25,9.75])
  balconies=[{ei:0, t0:4, t1:14, depth:1.5}];
  const excl=(typeof _balkSpansOnEdge==='function')?_balkSpansOnEdge(0):[];
  const wide=edgeWins(0);
  // kapı span'i [8.25,9.75] ile ÖRTÜŞEN pencere olmamalı
  const doorOverlap=wide.filter(w=>!(w.e<=8.25||w.s>=9.75)).length;
  // balkon gövdesi [4,14] içinde ama kapı-DIŞI pencere VAR mı (geniş balkon → kapı yanı pencere)
  const besideDoor=wide.filter(w=>w.t>4&&w.t<14&&(w.e<=8.25||w.s>=9.75)).length;
  // DAR balkon: [9,11] (2 m) → kapı tm=10 [9.25,10.75]; kapı yanı 0.55 m < pencere-min → pencere YOK
  balconies=[{ei:0, t0:9, t1:11, depth:1.5}];
  const narrow=edgeWins(0);
  const narrowInBody=narrow.filter(w=>w.t>9&&w.t<11).length;
  balconies=[]; const restored=edgeWins(0);
  return { beforeN:before.length, excl:excl, doorOverlap:doorOverlap, besideDoor:besideDoor,
    narrowInBody:narrowInBody, restoredN:restored.length };
})()`);
ok(s4.beforeN>0, 'S4: balkonsuz alt cephede otomatik pencere var (referans '+s4.beforeN+')');
ok(s4.excl.length===1 && Math.abs(s4.excl[0][0]-8.25)<0.01 && Math.abs(s4.excl[0][1]-9.75)<0.01,
   'S4: dışlama YALNIZ kapı span'+"'"+'i (tm±0.45±0.30=[8.25,9.75]), balkon geneli değil ('+JSON.stringify(s4.excl)+')');
ok(s4.doorOverlap===0, 'S4: kapı span'+"'"+'i icinde pencere YOK (cakisma '+s4.doorOverlap+')');
ok(s4.besideDoor>0, 'S4: GENIS balkonda kapı YANINDA pencere URETILIR ('+s4.besideDoor+')');
ok(s4.narrowInBody===0, 'S4: DAR balkonda kapı yanı pencere YOK (min-genislik kapısı; '+s4.narrowInBody+')');
ok(s4.restoredN===s4.beforeN, 'S4: balkon kaldırılınca pencere seti geri gelir ('+s4.restoredN+'='+s4.beforeN+')');

console.log('PENCERE: ' + pass + ' geçti, ' + fail + ' hata');
if (fail) process.exit(1);
