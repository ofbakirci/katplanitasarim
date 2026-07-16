/* DIS-GIRIS-KAPI (İş Ç4) — dış cephe BİNA GİRİŞ KAPILARI: saf çıkarım testi (headless, THREE'siz).
   Kullanıcı isteği: "dış cephelerde bina kapılarını görsek keşke, önemli". Zincir:
   extDoorSpans (view3d.js — map.doors → dış kontur kenar spanları; carveRing pencere projeksiyonuyla
   AYNI eşik dili: dik mesafe <=0.35, net bindirme >0.4) + extDoorFallbackSpan (veri yokken en uzun
   kenar ortası — buildEntranceNiche çapası) → buildExtEntryDoors mesh'i (aktif blok + diğer blokların
   ZEMİN cephesi; üst kat protolarına kapı GİRMEZ).

   THREE/WebGL YOK → buildExtEntryDoors mesh kısmı test edilmez (preview'de kanıtlanır); burada
   mesh-ÖNCESİ span çıkarımı + güvenli düşüş + gerçek plan verisi (konut/ticari) hattı assert edilir.

   Kullanım: node tests/dis-giris-kapi.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:3, katYuk:2.9 });
const ctx = vm.createContext({
  console, matchMedia:()=>({matches:false}),
  document: dom.document,
  window: { addEventListener(){}, matchMedia:()=>({matches:false}), View3D:null },
  XMLSerializer:function(){ this.serializeToString=()=>''; },
  Image:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true, alert:()=>{},
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

function report(){
  console.log('\nDIS-GIRIS-KAPI (İş Ç4): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`!!(window.View3D && window.View3D.extDoorSpansForTest && window.View3D.extDoorFallbackSpanForTest)`);
chk(hasApi, 'View3D.extDoorSpansForTest + extDoorFallbackSpanForTest erişilebilir');
if(!hasApi){ report(); process.exit(1); }

const EPS = 1e-6;
function near(a, b){ return Math.abs(a-b) < 1e-3; }   // toFixed(3) yuvarlaması → 1e-3 tolerans

/* ---- 1) SAF ÇIKARIM — sentetik map (mpp=1, origin 0,0 → px == metre) + 16x12 dikdörtgen kontur ----
   Kenar indeksi: 0=güney (0,0)→(16,0) · 1=doğu · 2=kuzey · 3=batı (0,12)→(0,0). */
run(`
  __CONT=[[0,0],[16,0],[16,12],[0,12]];
  __mkMap=function(doors){ return { scale:{metersPerPixel:1, origin_px:[0,0]}, doors:doors }; };
  __spans=function(doors,cont){ return window.View3D.extDoorSpansForTest(__mkMap(doors), cont||__CONT); };
`);

// (1a) bina girişi güney cephede — tek span, doğru kenar/t0/t1/kind/width_m
const sA = run(`__spans([{kind:'entry',blocked:false,width_m:1.5,p0_px:[7,0],p1_px:[8.5,0]}])`);
chk(Array.isArray(sA) && sA.length===1, '(1a) cephe üstündeki entry kapısı TEK span üretir (öbür kenarlara sızmaz): ' + JSON.stringify(sA));
chk(sA[0] && sA[0].edge===0 && near(sA[0].t0,7) && near(sA[0].t1,8.5), '(1a) span kenar-yerel metrede doğru (edge=0, t0=7, t1=8.5): ' + JSON.stringify(sA[0]));
chk(sA[0] && sA[0].kind==='entry' && near(sA[0].width_m,1.5), '(1a) kind + width_m veriden taşınır (entry / 1.5)');

// (1b) İÇ daire kapısı (normal apartman: koridorda) — dik-mesafe eşiğini geçemez, ELENİR
chk(run(`__spans([{kind:'unit_entry',blocked:false,width_m:1.0,p0_px:[5,6],p1_px:[5.9,6]}]).length===0`),
    '(1b) koridor içindeki unit_entry (dik mesafe 6m) ELENİR — apartman daire kapıları cepheye sızmaz');

// (1c) dış kenara OTURAN unit_entry (villa deseni) — batı kenarında span (kenar yönü (0,12)→(0,0))
const sC = run(`__spans([{kind:'unit_entry',blocked:false,width_m:0.9,p0_px:[0,4],p1_px:[0,4.9]}])`);
chk(sC.length===1 && sC[0].edge===3 && near(sC[0].t0,7.1) && near(sC[0].t1,8) && sC[0].kind==='unit_entry',
    '(1c) cepheye oturan unit_entry (villa) ALINIR — edge=3, t=[7.1,8]: ' + JSON.stringify(sC));

// (1d) filtre: iç oda kapısı (room) + blocked çekirdek kapısı cephede olsa bile ALINMAZ
chk(run(`__spans([{kind:'room',blocked:false,width_m:0.9,p0_px:[3,0],p1_px:[3.9,0]}]).length===0`),
    '(1d) kind=room (iç kapı) cephe üstünde bile alınmaz');
chk(run(`__spans([{kind:'entry',blocked:true,width_m:1.5,p0_px:[7,0],p1_px:[8.5,0]}]).length===0`),
    '(1d) blocked=true kapı alınmaz (çekirdek kapı sözleşmesi)');

// (1e) dik-mesafe eşiği carveRing diliyle aynı: 0.35 içi ALINIR, dışı ELENİR
chk(run(`__spans([{kind:'entry',blocked:false,width_m:1.5,p0_px:[7,0.3],p1_px:[8.5,0.3]}]).length===1`),
    '(1e) cepheden 0.30m içerideki kapı (<=0.35 eşik) hâlâ projekte edilir');
chk(run(`__spans([{kind:'entry',blocked:false,width_m:1.5,p0_px:[7,0.5],p1_px:[8.5,0.5]}]).length===0`),
    '(1e) 0.50m sapma eşiği aşar → elenir');

// (1f) köşe kıymığı: kenara net bindirme 0.2m (<=0.4 eşiği) → span üretmez (kıymık kapı yok)
chk(run(`__spans([{kind:'entry',blocked:false,width_m:1.5,p0_px:[15.8,0],p1_px:[17.3,0]}]).length===0`),
    '(1f) köşede kırpılan kapı (net bindirme 0.2m) kıymık span üretmez');

// (1g) savunma: p0_px eksik kapı atlanır; geçerli+geçersiz karışımda yalnız geçerli döner
const sG = run(`__spans([{kind:'entry',blocked:false,width_m:1.5,p1_px:[8.5,0]},
                          {kind:'entry',blocked:false,width_m:1.5,p0_px:[2,0],p1_px:[3.5,0]}])`);
chk(sG.length===1 && near(sG[0].t0,2) && near(sG[0].t1,3.5), '(1g) p0_px eksik kapı atlanır, geçerli olan kalır: ' + JSON.stringify(sG));

// (1h) bekçiler: map/doors/kontur yoksa boş dizi (istisna değil)
chk(run(`window.View3D.extDoorSpansForTest(__mkMap([]), __CONT).length===0`), '(1h) doors boş → []');
chk(run(`window.View3D.extDoorSpansForTest(__mkMap([{kind:'entry',blocked:false,p0_px:[7,0],p1_px:[8.5,0]}]), [[0,0],[16,0]]).length===0`),
    '(1h) kontur <3 köşe → []');

// (1i) ölçek sözleşmesi: metersPerPixel + origin_px px2m ile uygulanır (mpp=0.05, origin=[40,20])
const sI = run(`window.View3D.extDoorSpansForTest(
  { scale:{metersPerPixel:0.05, origin_px:[40,20]},
    doors:[{kind:'entry',blocked:false,width_m:1.5,p0_px:[180,20],p1_px:[210,20]}] }, __CONT)`);
chk(sI.length===1 && sI[0].edge===0 && near(sI[0].t0,7) && near(sI[0].t1,8.5),
    '(1i) px2m ölçeği doğru uygulanır (mpp=0.05, origin [40,20] → t=[7,8.5]): ' + JSON.stringify(sI));

/* ---- 2) GÜVENLİ DÜŞÜŞ — extDoorFallbackSpan (konut katta computeDoors ext üretmez → kapı yine çizilsin) ---- */
const fA = run(`window.View3D.extDoorFallbackSpanForTest(__CONT)`);
chk(!!fA && fA.edge===0 && fA.kind==='entry' && fA.fallback===true,
    '(2a) 16x12 kontur → İLK en uzun kenar (edge=0, buildEntranceNiche çapası) + fallback damgası: ' + JSON.stringify(fA));
chk(!!fA && near(fA.t0,7.25) && near(fA.t1,8.75) && near(fA.width_m,1.5),
    '(2a) kapı kenar ORTASINDA, bina girişi standardı 1.5m (t=[7.25,8.75])');
chk(run(`window.View3D.extDoorFallbackSpanForTest([[0,0],[1,0],[1,1],[0,1]])===null`),
    '(2b) kapı sığmayacak kadar küçük kontur (en uzun kenar <1.2m) → null (kapı çizilmez)');
chk(run(`window.View3D.extDoorFallbackSpanForTest(null)===null && window.View3D.extDoorFallbackSpanForTest([[0,0],[5,0]])===null`),
    '(2b) null / <3 köşe kontur → null (bekçi)');
const fC = run(`window.View3D.extDoorFallbackSpanForTest([[0,0],[2,0],[2,1.5],[0,1.5]])`);
chk(!!fC && near(fC.width_m,0.9) && near(fC.t0,0.55) && near(fC.t1,1.45),
    '(2c) dar cephede genişlik 0.9m tabanına klemplenir (2m kenar → w=0.9, ortalı): ' + JSON.stringify(fC));

/* ---- 3) GERÇEK VERİ HATTI — canlı plan üret, buildFloorplanMap().doors ile uçtan uca ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='3';
  document.getElementById('bodrumSayisi').value='0';
  bodrumSayisi=0; villaOffset=0;
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  katKullanim='konut'; generate();
  __KMAP=buildFloorplanMap();
  __PCONT=pts.map(function(p){ return [p.x,p.y]; });
`);
const kOk = run(`!!(__KMAP && Array.isArray(__KMAP.doors) && __KMAP.doors.length>0)`);
chk(kOk, '(3a) ön-koşul: konut planı map.doors taşıyor');
chk(run(`__KMAP.doors.every(function(d){ return d.kind!=='entry'; })`),
    '(3a) konut katta kind=entry kapı YOK (doors.js ext yalnız konut-dışı katta) — fallback bunun için var');
// Ç4b: konut katta kapı verisi yok AMA gerçek giriş APARTMAN HOLÜnün cepheye değdiği kenardan
//   SENTEZLENİR (synth:true, 1.5m, kind entry) — kullanıcı kanıtı: fallback (en-uzun-kenar ortası)
//   kapıyı "yanlış yere" koyuyordu. Daire/oda kapıları yine cepheye SIZMAZ (dik-mesafe eler).
const kSpans = run(`window.View3D.extDoorSpansForTest(__KMAP, __PCONT)`);
chk(Array.isArray(kSpans) && kSpans.length===1 && kSpans[0].synth===true && kSpans[0].kind==='entry',
    '(3a) konut planında giriş HOL-cepheden sentezlenir (tek entry, synth): ' + JSON.stringify(kSpans));
chk(kSpans.length===1 && (kSpans[0].t1-kSpans[0].t0)>=1.2 && (kSpans[0].t1-kSpans[0].t0)<=1.5+EPS,
    '(3a) sentez giriş genişliği ~1.5m (PAİY md.39 bina giriş minimumu)');
chk(run(`!!window.View3D.extDoorFallbackSpanForTest(__PCONT)`),
    '(3a) hol-cephesiz durum için güvenli-düşüş kapısı hâlâ dönebilir (son basamak)');
// kontur verilmezse hook canlı pts konturuna (extBuildingOutline) düşer — aynı sonuç
chk(run(`JSON.stringify(window.View3D.extDoorSpansForTest(__KMAP))===JSON.stringify(window.View3D.extDoorSpansForTest(__KMAP, __PCONT))`),
    '(3b) ForTest hook kontursuz çağrıda canlı pts konturuna düşer (extBuildingOutline) — sonuç birebir');

// ticari zemin: gerçek bina girişi (gh) + dükkân girişleri (gd) → entry span'ları cepheye oturur
//   (planner konut-dışı düzeni yalnız floorsOn() iken kurar → katAyri + villaFloors şart; ticari-kat.js deseni)
run(`
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(totalFloors()).fill(null); activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
  villaFloors[zeminIdx()]=stateSnapshot(true);
  katKullanim='ticari'; generate();
  __TMAP=buildFloorplanMap();
`);
chk(run(`!!(__TMAP && (__TMAP.doors||[]).some(function(d){ return d.kind==='entry' && !d.blocked; }))`),
    '(3c) ön-koşul: ticari zemin map.doors kind=entry taşıyor (bina/dükkân girişi)');
const tSpans = run(`window.View3D.extDoorSpansForTest(__TMAP, __PCONT)`);
chk(Array.isArray(tSpans) && tSpans.length>=1, '(3c) ticari zeminde cephe kapı span\'ları çıkar: ' + (tSpans&&tSpans.length));
chk(tSpans.every(function(s){ return s.kind==='entry' || s.kind==='unit_entry'; }),
    '(3c) tüm span\'lar cephe kapısı türünde (entry/unit_entry — room/çekirdek sızmaz)');
const contLens = [16,12,16,12];
chk(tSpans.every(function(s){ return s.t0>=-EPS && s.t1<=contLens[s.edge]+EPS && (s.t1-s.t0)>0.4; }),
    '(3c) her span kendi kenarının İÇİNDE ve net genişliği >0.4m (kıymık yok): ' + JSON.stringify(tSpans));
chk(tSpans.some(function(s){ return s.kind==='entry'; }),
    '(3c) en az bir bina/dükkân girişi (entry) cephede — kullanıcının istediği görünürlük veriden geliyor');

report();
process.exit(fail?1:0);
