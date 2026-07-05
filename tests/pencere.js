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

/* 7) SUNUM-4A B2: BALKON span'inde pencere OLMAMALI (balkon kapısı ↔ pencere çakışması).
   Aynı cephe kenarına balkon eklenince o aralıkta otomatik pencere üretilmez; balkon kaldırılınca geri gelir.
   autoWindows balcony span'ini _subtractSpans ile çıkarır (kenar-parametrizasyonu balkBase ile aynı). */
const b2 = run(`(function(){
  // taze standart plan (balkonsuz referans)
  pts=[{x:0,y:0},{x:20,y:0},{x:20,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:1}];
  balconies=[]; generate();
  function edgeWins(ei){ return computeWindows().filter(w=>w.status==='ok'&&w.e&&w.ei===ei)
    .map(w=>({t:w.e.t, s:w.e.t-w.w/2, e:w.e.t+w.w/2})); }
  const before=edgeWins(0);
  // alt cepheye (ei=0) balkon: kenar-boyu [6,10]
  balconies=[{ei:0, t0:6, t1:10, depth:1.5}];
  const after=edgeWins(0);
  // balkon span (± PAD 0.30) → [5.7, 10.3]; hiçbir pencere bununla ÖRTÜŞMEMELİ
  const overlap=after.filter(w=>!(w.e<=5.7||w.s>=10.3)).length;
  // balkonu kaldır → set eski haline (adet) dönmeli
  balconies=[]; const restored=edgeWins(0);
  return { beforeN:before.length, afterOverlap:overlap, afterN:after.length, restoredN:restored.length };
})()`);
ok(b2.beforeN>0, 'B2: balkonsuz alt cephede otomatik pencere var (referans '+b2.beforeN+')');
ok(b2.afterOverlap===0, 'B2: balkon span icinde pencere YOK (cakisma '+b2.afterOverlap+')');
ok(b2.restoredN===b2.beforeN, 'B2: balkon kaldırılınca pencere seti geri gelir ('+b2.restoredN+'='+b2.beforeN+')');

console.log('PENCERE: ' + pass + ' geçti, ' + fail + ' hata');
if (fail) process.exit(1);
