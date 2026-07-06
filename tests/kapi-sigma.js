/* R4-4 — Kapı segment-sığma guard (headless).
   1) doorRunBounds/doorFitWidth birim davranışı: sürekli koşu sınırı + dar segmentte mevzuat
      minimumuna daraltma + min bile sığmazsa 0 (kapı yok).
   2) Bütünsel: standart bir plan üret, buildFloorplanMap().doors[] her kapının SPAN'ı bağlı olduğu
      duvar SEGMENTİNE (kapının aday kenar koşusuna) sığar — width_m <= segment uzunluğu.
   Kullanım: node tests/kapi-sigma.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; console.log('  ✓ '+m); } else { fail++; console.log('  ✗ '+m); } }

const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
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
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));

// --- 1) birim: doorRunBounds + doorFitWidth ---
const unit = new vm.Script(`(function(){
  const out = {};
  // yatay 1m (2 hücre) koşu: kenarlar x=10 ve x=10.5, y=5
  const edges1 = [{x:10,y:5,h:1},{x:10.5,y:5,h:1}];
  const e1 = {x:10,y:5,h:1};
  const rb1 = doorRunBounds(e1, edges1);
  out.rb1 = rb1;                                  // beklenen lo=10, hi=11 (uzunluk 1.0)
  // oda iç kapısı (kind:'inner', reg tip yatak) — istenen 0.9, 1m koşuda daralır (0.9 e+0.45 ortalı taşar → 0.8'e in)
  const drInner = { e:e1, edges:edges1, kind:'inner', reg:{type:'yatak'} };
  out.fitInner = doorFitWidth(drInner);
  out.spInner = doorFitSpan(drInner);
  // daire girişi (kind:'unit') 1m koşuda 1.0: e+0.45 ortalı taşar → segmente KAYDIRILIR (düşmez), span run içinde
  const drUnit = { e:e1, edges:edges1, kind:'unit' };
  out.fitUnit = doorFitWidth(drUnit);
  out.spUnit = doorFitSpan(drUnit);
  // 0.5m koşu (tek hücre): 1.0 daire girişi min 1.0 bile sığmaz → null (düşer)
  const edgesTiny = [{x:10,y:5,h:1}];
  out.fitTiny = doorFitWidth({ e:{x:10,y:5,h:1}, edges:edgesTiny, kind:'unit' });
  // geniş koşu: 5 hücre (2.5m) → istenen tam 0.9 korunur, e+0.45 ortalı
  const edgesW = [{x:10,y:5,h:1},{x:10.5,y:5,h:1},{x:11,y:5,h:1},{x:11.5,y:5,h:1},{x:12,y:5,h:1}];
  const drWide = { e:{x:11,y:5,h:1}, edges:edgesW, kind:'inner', reg:{type:'yatak'} };
  out.fitWide = doorFitWidth(drWide);
  out.rbWide = doorRunBounds({x:11,y:5,h:1}, edgesW);   // lo=10, hi=12.5
  out.spWide = doorFitSpan(drWide);                    // ortalanmış e+0.45 → c0=0, c1=0.9
  return JSON.stringify(out);
})()`, { filename:'kapi-unit.js' });
const u = JSON.parse(unit.runInContext(ctx));

ok(u.rb1 && Math.abs(u.rb1.lo-10)<1e-6 && Math.abs(u.rb1.hi-11)<1e-6, '1m koşu sınırı lo=10 hi=11 (uzunluk 1.0)');
ok(Math.abs(u.fitInner-0.9)<1e-6, 'oda iç kapısı 1m segmentte 0.9 KAYDIRILARAK korundu (net='+u.fitInner+')');
ok(u.spInner && (10+u.spInner.c0)>=10-1e-6 && (10+u.spInner.c1)<=11+1e-6, 'kaydırılan oda kapısı span run [10,11] İÇİNDE (taşmıyor)');
ok(Math.abs(u.fitUnit-1.0)<1e-6, 'daire girişi 1m segmentte KAYDIRILARAK 1.0 korundu (düşmedi, net='+u.fitUnit+')');
// kaydırılan 1.0 kapı span'ı [10,11] run'ının İÇİNDE (JAMB payıyla): c0>=lo-e, c1<=hi-e
ok(u.spUnit && (10+u.spUnit.c0)>=10-1e-6 && (10+u.spUnit.c1)<=11+1e-6, 'kaydırılan daire girişi span run [10,11] İÇİNDE');
ok(u.fitTiny===0, '0.5m tek-hücre koşuda daire girişi (min 1.0) sığmaz → 0 (kapı konmaz)');
ok(Math.abs(u.fitWide-0.9)<1e-6, 'geniş koşuda oda kapısı tam 0.9 korundu (daralma yok)');
ok(u.rbWide && Math.abs(u.rbWide.lo-10)<1e-6 && Math.abs(u.rbWide.hi-12.5)<1e-6, 'geniş koşu sınırı lo=10 hi=12.5');
ok(u.spWide && Math.abs(u.spWide.c0-0)<1e-6 && Math.abs(u.spWide.c1-0.9)<1e-6, 'geniş koşuda span e+0.45 ortalı (c0=0 c1=0.9)');

// --- 2) bütünsel: standart plan → hiçbir export kapı SPAN'ı segmentini AŞMAZ ---
const integ = new vm.Script(`(function(){
  pts = [{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}];
  closed = true;
  unitSpecs = [{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  customCutsZ = null; unitLayout = {}; balconies = [];
  doorOverrides = {}; extraDoors = []; doorHidden = {};
  generate();
  const drs = computeDoors().filter(d=>d&&d.status==='ok'&&d.e);
  let overflow = 0, total = 0, narrowed = 0, dropped = 0;
  drs.forEach(d=>{
    const rb = doorRunBounds(d.e, d.edges);
    const want = doorWidthM(d), sp = doorFitSpan(d);
    if(!sp){ dropped++; return; }
    const fit = sp.c1 - sp.c0;
    if(fit < want-1e-6) narrowed++;
    if(rb){
      total++;
      const ax = d.e.h ? d.e.x : d.e.y;
      // span (e+c0 .. e+c1) segment [lo,hi] İÇİNDE mi (kaydırma sonrası taşma OLMAMALI)
      if(ax+sp.c0 < rb.lo - 1e-6 || ax+sp.c1 > rb.hi + 1e-6) overflow++;
    }
  });
  return JSON.stringify({ n:drs.length, total, overflow, narrowed, dropped });
})()`, { filename:'kapi-integ.js' });
const g = JSON.parse(integ.runInContext(ctx));
ok(g.overflow===0, 'standart planda hiçbir kapı span segment sınırını AŞMIYOR ('+g.total+' kapı denetlendi, taşan='+g.overflow+')');
ok(g.dropped===0, 'standart planda kapı düşmedi (dropped='+g.dropped+'); daralan='+g.narrowed);

console.log('');
if(fail){ console.log('KAPI-SIGMA: '+pass+' geçti, '+fail+' HATA'); process.exit(1); }
console.log('KAPI-SIGMA: '+pass+' geçti, 0 hata');
