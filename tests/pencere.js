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

/* 8) CEPHE-2 C3 — AVLU PENCERELERİ: avluya bakan yaşam-odası cepheleri de pencere alır.
   Avlusuz plan BİREBİR eski (courtyard=0); avlulu planda cw<avi>_<ei>_<seg> key'li pencereler doğar,
   export windows[]'e girer, generate() sıfırlar (auto set). */
const c3 = run(`(function(){
  // avlusuz referans
  pts=[{x:0,y:0},{x:40,y:0},{x:40,y:18},{x:0,y:18}]; closed=true; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}]; generate();
  const baseN=computeWindows().length, baseCy=computeWindows().filter(w=>w.cyt).length;
  // avlu ekle (snapshot 9. senaryoyla aynı merkez avlu)
  courtyards=[{poly:[{x:15,y:6},{x:25,y:6},{x:25,y:12},{x:15,y:12}]}]; generate();
  const ws=computeWindows(); const cy=ws.filter(w=>w.cyt);
  const keyOk = cy.every(w=>/^cw\\d+_\\d+_\\d+$/.test(w.key));
  const allOk = cy.every(w=>w.status==='ok'&&w.e && typeof w.e.x==='number');
  const rtOk = cy.every(w=>['salon','yatak','mutfak'].indexOf(w.roomType)>=0);
  // export'a girdi mi
  const m=buildFloorplanMap(); const expN=m.windows.length;
  // avlu penceresi width/parapet override (panel düzenlemesi) + gizle (çift-tık sil) çalışır mı
  const k=cy[0].key;
  windowOverrides[k]={w:2.5, full:true};
  const editRec=computeWindows().find(w=>w.key===k);
  const editW=editRec?winWidthM(editRec):0, editFull=editRec?editRec.full:false;
  windowOverrides={}; windowHidden[k]=true;
  const hiddenGone=!computeWindows().find(w=>w.key===k);
  windowHidden={};
  // generate() sıfırlar mı (override koy, üret, temizlensin)
  windowOverrides[k]={w:2.5}; generate();
  const afterGen=Object.keys(windowOverrides).length;
  // avluyu kaldır → courtyard pencere 0 + boundary set baz sayıya döner
  courtyards=[]; generate();
  const backN=computeWindows().length, backCy=computeWindows().filter(w=>w.cyt).length;
  return { baseN, baseCy, cyN:cy.length, keyOk, allOk, rtOk, expN, wsN:ws.length, afterGen, backN, backCy,
    editW, editFull, hiddenGone };
})()`);
ok(Math.abs(c3.editW-2.5)<1e-6 && c3.editFull===true, 'C3: avlu penceresi width/full override (panel) uygulanır');
ok(c3.hiddenGone, 'C3: avlu penceresi windowHidden ile silinir (çift-tık)');
ok(c3.baseCy===0, 'C3: avlusuz planda avlu penceresi YOK (courtyard=0)');
ok(c3.cyN>0, 'C3: avlulu planda avlu penceresi üretilir ('+c3.cyN+')');
ok(c3.keyOk, 'C3: avlu penceresi key deseni cw<avi>_<ei>_<seg>');
ok(c3.allOk, 'C3: her avlu penceresi status=ok + e{} (x/y çözülü)');
ok(c3.rtOk, 'C3: avlu penceresi yaşam-odasına (salon/yatak/mutfak) komşu');
ok(c3.expN===c3.wsN, 'C3: export windows[] avlu pencerelerini de içerir ('+c3.expN+'='+c3.wsN+')');
ok(c3.afterGen===0, 'C3: generate() avlu penceresi override'+"'"+'unu da sıfırlar (auto set)');
ok(c3.backCy===0 && c3.backN===c3.baseN, 'C3: avlu kaldırılınca avlu penceresi 0 + boundary set BİREBİR eski ('+c3.backN+'='+c3.baseN+')');

/* 9) CEPHE-2 C1 — BLOK HARİTASI (yan-etkisiz): bir snapshot'tan tam buildFloorplanMap; canlı state BOZULMAZ. */
const c1 = run(`(function(){
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]; generate();
  const snap=stateSnapshot(false);
  const liveWin=computeWindows().length, livePtsX=pts[0].x, livePlanRows=plan.rows;
  const bmap=(typeof blockFloorplanMap==='function')?blockFloorplanMap(snap):null;
  const liveIntact = computeWindows().length===liveWin && pts[0].x===livePtsX && plan.rows===livePlanRows;
  return { has:!!bmap, wins:bmap?bmap.windows.length:0, units:bmap?bmap.units.length:0,
    doors:bmap?bmap.doors.length:0, liveIntact,
    shape: bmap&&bmap.windows.length? (Array.isArray(bmap.windows[0].p0_px)&&typeof bmap.windows[0].width_m==='number') : false };
})()`);
ok(c1.has, 'C1: blockFloorplanMap snapshot'+"'"+'tan map üretir');
ok(c1.wins>0 && c1.units===4, 'C1: blok map pencere ('+c1.wins+') + daire ('+c1.units+') taşır');
ok(c1.shape, 'C1: blok map windows[] şeması (p0_px + width_m)');
ok(c1.liveIntact, 'C1: blockFloorplanMap CANLI 2B state'+"'"+'i BOZMAZ (pencere/pts/plan aynı)');

/* 10) CEPHE-2 C2 — ZEMİN cephe: groundFloorSnapshot katAyri + zemin ticari'de zemin snapshot'ını döndürür. */
const c2 = run(`(function(){
  const ka=document.getElementById('katAyri'); if(ka) ka.checked=true;
  bodrumSayisi=0; villaOffset=0;
  document.getElementById('katSayisi').value='3';
  pts=[{x:0,y:0},{x:30,y:0},{x:30,y:14},{x:0,y:14}]; closed=true; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2}]; generate();
  const konut=stateSnapshot(true);
  const ticari=JSON.parse(JSON.stringify(konut)); ticari.plan.katKullanim='ticari';
  villaFloors=[ticari, stateSnapshot(true), stateSnapshot(true)]; activeFloor=1;   // aktif kat ZEMİN DEĞİL
  const gf=(typeof groundFloorSnapshot==='function')?groundFloorSnapshot():null;
  const gmap=(gf&&typeof blockFloorplanMap==='function')?blockFloorplanMap(gf.snap):null;
  // temizle (diğer testlere sızmasın)
  villaFloors=null; activeFloor=0; if(ka) ka.checked=false;
  return { has:!!gf, usage:gf?gf.usage:null, isGround:gf?gf.isGround:null,
    mapOk:!!gmap, mapWins:gmap?gmap.windows.length:0 };
})()`);
ok(c2.has && c2.isGround, 'C2: groundFloorSnapshot katAyri+aktif≠zemin'+"'"+'de zemin snapshot'+"'"+'ı döndürür');
ok(c2.usage==='ticari', 'C2: zemin kat kullanımı (ticari) taşınır');
ok(c2.mapOk && c2.mapWins>0, 'C2: zemin snapshot'+"'"+'tan cephe map'+"'"+'i üretilir ('+c2.mapWins+' pencere)');

/* 11) ELLE PENCERE TİP-BAĞIMSIZ: winEdgeNear üstündeki eski yorum ("yalnız yaşam-odasına
   komşu kenar") koddan kopuktu — elle ekleme (extraWindows) tip filtresi TAŞIMAZ, otomatik
   öneri listesi (habit: salon/yatak/mutfak) ayrıdır. Apartman holü (koridor) dış sınıra değen
   bir kenar bulunup oraya extraWindows ile pencere eklenir → computeWindows'ta status='ok'. */
const b = run(`(function(){
  document.getElementById('katSayisi').value='5';
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:3}];
  pts=[{x:0,y:0},{x:20,y:0},{x:20,y:13},{x:0,y:13}]; closed=true; courtyards=[];
  generate();
  // koridor (apartman holü) dış sınıra değen kenarı bul (probe: iç normal yönünde 0.35 m)
  let edge=null;
  for(let ei=0; ei<pts.length && !edge; ei++){
    const g=winEdgeGeom(ei); if(!g||g.len<1.6) continue;
    for(let t=0.3; t<=g.len-0.3; t+=0.25){
      const rg=_winRegAt(g.A.x+g.ux*t+g.nx*0.35, g.A.y+g.uy*t+g.ny*0.35);
      if(rg && rg.type==='koridor'){ edge={ei,t}; break; }
    }
  }
  if(!edge) return {found:false};
  const before=computeWindows().length;
  extraWindows.push({ei:edge.ei, t:edge.t, w:1.6});
  const rec=computeWindows().find(w=>w.i!=null);
  extraWindows=[];
  return { found:true, before, status:rec?rec.status:null, hasE:!!(rec&&rec.e) };
})()`);
ok(b.found, 'B: standart apartman planında apartman holü (koridor) dış sınıra değen kenar bulundu (test kurulumu geçerli)');
ok(b.status==='ok', 'B: yaşam-odası olmayan (koridor) kenara elle eklenen pencere de status=ok (tip-bağımsız)');
ok(b.hasE, 'B: elle eklenen pencere e{} çözülü döner');

console.log('PENCERE: ' + pass + ' geçti, ' + fail + ' hata');
if (fail) process.exit(1);
