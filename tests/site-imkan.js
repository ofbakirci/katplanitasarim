/* SITE-IMKAN (S3) — SİTE İMKANLARI (yeşil alan / çocuk parkı / havuzlar / oturma), POLİGON MODELİ.
   Park yeri (bay) ailesinin PARSEL-katmanı akrabası ama artık VEKTÖR DİKDÖRTGEN değil, YAPI SINIRI
   deseninde POLİGON: tip seç → köşe köşe çiz → ilk köşeye dönerek kapat → o alan imkan (üçgen havuz
   serbest). Şema {type, pts:[{x,y}...]}, x/y/w/h = pts'ten türetilen bbox. Bu test THREE'siz SALT-VERİ
   mantığını doğrular: (1) poligon yerleşim kuralları (parsel içi + bina dışı + poligon-poligon çakışma
   reddi), (2) çizim/kapatma akışı (amenitySnapPoint + amenityFinishDraw), (3) tek-köşe + gövde
   düzenleme veri yolu, (4) durum roundtrip + pts DERİN kopya (paylaşım yok), (5) eski dikdörtgen
   kaydı yükleme köprüsü (pts yoksa 4-köşe), (6) drone prompt peyzaj sinyali (yalnız VAR olan tipler).
   WebGL yolu (3B mesh/preview) burada test edilmez — o preview kanıtında doğrulanır.

   Kullanım: node tests/site-imkan.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
const ctx = vm.createContext({
  console, matchMedia:()=>({matches:false}),
  document: dom.document,
  window: { addEventListener(){}, matchMedia:()=>({matches:false}), View3D:null },
  XMLSerializer:function(){ this.serializeToString=()=>''; },
  Image:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true,
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

/* ---- plan üret: 32×16 bina, geniş parsel (60×40) → bahçe var ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='5';
  document.getElementById('katYuk').value='2.9';
  bodrumSayisi=0; villaFloors=null; activeFloor=0; blocks=null; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:true,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  parcelPts=[{x:-14,y:-12},{x:46,y:-12},{x:46,y:28},{x:-14,y:28}]; parcelClosed=true;
  amenities=[]; balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[]; redoHistory=[];
  mode='draw'; amenityDrawPts=[]; amenityDrawHover=null; hoverAmenity=null; hoverAmenityVert=null;
  pxPerM=1; panX=0; panY=0;
  generate();
`);

/* ---- 1) KATALOG + VARSAYILAN BOYUTLAR (REG.amenities değişmedi) ---- */
chk(run(`typeof REG.amenities==='object' && !!REG.amenities.green && !!REG.amenities.pool`), 'imkan kataloğu (REG.amenities) mevcut');
chk(run(`REG.amenities.playground.w===8 && REG.amenities.playground.h===6`), 'çocuk parkı varsayılan 8×6 m');
chk(run(`REG.amenities.pool.w===12 && REG.amenities.pool.h===6`), 'yüzme havuzu varsayılan 12×6 m');
chk(run(`REG.amenities.green.w===10 && REG.amenities.green.h===8`), 'yeşil alan varsayılan 10×8 m');

/* ---- 2) POLİGON YARDIMCILARI tanımlı ---- */
chk(run(`typeof amenityClone==='function' && typeof amenityBBoxSync==='function' && typeof amenityRectToPts==='function' && typeof amenityLoad==='function' && typeof amenityCentroid==='function'`),
  'poligon veri yardımcıları (clone/bboxSync/rectToPts/load/centroid) tanımlı');
chk(run(`typeof amenityPolyPts==='function' && typeof amenityPolysOverlap==='function' && typeof hitAmenity==='function' && typeof hitAmenityVert==='function' && typeof amenityAreaOk==='function' && typeof amenitySnapPoint==='function' && typeof amenityFinishDraw==='function'`),
  'poligon etkileşim yardımcıları (polyPts/polysOverlap/hit/hitVert/areaOk/snapPoint/finishDraw) tanımlı');

/* ---- 3) amenityBBoxSync: pts → eksen-hizalı bbox türetir (x/y/w/h) ---- */
chk(run(`(function(){ var a={type:'green', pts:[{x:-8,y:-10},{x:4,y:-10},{x:4,y:-2},{x:-8,y:-2}]};
  amenityBBoxSync(a); return a.x===-8 && a.y===-10 && a.w===12 && a.h===8 && a.ang===0; })()`), 'amenityBBoxSync bbox türetir (x/y/w/h + ang=0)');

/* ---- 4) YÜKLEME KÖPRÜSÜ: eski dikdörtgen {x,y,w,h,ang:0} → 4-köşe pts, bbox birebir korunur ---- */
chk(run(`(function(){ var p=amenityRectToPts({x:5,y:6,w:10,h:8,ang:0});
  return p.length===4 && p[0].x===5 && p[0].y===6 && p[2].x===15 && p[2].y===14; })()`), 'amenityRectToPts 4-köşe üretir (eksen-hizalı)');
chk(run(`(function(){ var c=amenityLoad({type:'pool', x:0, y:-0.5, w:21.5, h:8, ang:0});
  return c.pts.length===4 && c.x===0 && c.y===-0.5 && c.w===21.5 && c.h===8; })()`), 'amenityLoad: pts yoksa köprü kurar + bbox birebir korunur (round-trip güvenli)');

/* ---- 5) amenityCentroid: üçgen alan-ağırlıklı centroid ---- */
chk(run(`(function(){ var c=amenityCentroid([{x:0,y:0},{x:6,y:0},{x:0,y:6}]);
  return Math.abs(c.x-2)<1e-9 && Math.abs(c.y-2)<1e-9; })()`), 'amenityCentroid üçgen centroid (2,2)');

/* ---- 6) YERLEŞİM: bahçede (parsel içi, bina dışı) poligon GEÇERLİ ---- */
chk(run(`amenityAreaOk({type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]})`), 'bahçedeki dörtgen imkan GEÇERLİ');
chk(run(`amenityAreaOk({type:'pool', pts:[{x:-8,y:-10},{x:2,y:-10},{x:-3,y:-3}]})`), 'bahçedeki ÜÇGEN havuz GEÇERLİ (üçgen serbest)');

/* ---- 7) YERLEŞİM: bina footprint'i ÜSTÜNDE GEÇERSİZ ---- */
chk(run(`amenityAreaOk({type:'green', pts:[{x:8,y:4},{x:24,y:4},{x:24,y:12},{x:8,y:12}]})===false`), 'bina footprint\'i üstündeki imkan GEÇERSİZ');
// köşeleri bina dışı ama ORTASI binaya taşan poligon → ızgara örneği yakalar
chk(run(`amenityAreaOk({type:'green', pts:[{x:-2,y:8},{x:34,y:8},{x:34,y:9},{x:-2,y:9}]})===false`), 'ortası binaya taşan ince şerit GEÇERSİZ (ızgara örneği yakalar)');

/* ---- 8) YERLEŞİM: parsel DIŞINDA GEÇERSİZ ---- */
chk(run(`amenityAreaOk({type:'green', pts:[{x:60,y:60},{x:70,y:60},{x:70,y:68},{x:60,y:68}]})===false`), 'parsel dışındaki imkan GEÇERSİZ');

/* ---- 9) POLİGON ÇAKIŞMA: üst üste iki poligon → reddedilir; ayrık → geçer; üçgen kapsanır ---- */
run(`amenities=[{type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]}]; amenities.forEach(amenityBBoxSync);`);
chk(run(`amenityOverlapsExisting({type:'pool', pts:[{x:-6,y:-9},{x:6,y:-9},{x:6,y:-3},{x:-6,y:-3}]}, -1)===true`), 'çakışan yeni poligon reddedilir');
chk(run(`amenityOverlapsExisting({type:'ornament', pts:[{x:20,y:-8},{x:24,y:-8},{x:24,y:-5},{x:20,y:-5}]}, -1)===false`), 'ayrık poligon çakışma vermez');
chk(run(`amenityPolysOverlap([{x:0,y:0},{x:10,y:0},{x:0,y:10}],[{x:2,y:2},{x:8,y:2},{x:2,y:8}])===true`), 'iç içe üçgen çakışması yakalanır');
chk(run(`amenityPolysOverlap([{x:0,y:0},{x:4,y:0},{x:0,y:4}],[{x:10,y:10},{x:14,y:10},{x:10,y:14}])===false`), 'ayrık üçgenler çakışmaz');

/* ---- 10) hitAmenity: poligon içi dünya noktası → index; hitAmenityVert: köşe tutamacı ---- */
run(`amenities=[{type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]}]; amenities.forEach(amenityBBoxSync);`);
chk(run(`(function(){ pxPerM=1; panX=0; panY=0; return hitAmenity(-3,-6)===0; })()`), 'hitAmenity poligon içi noktayı bulur (index 0)');
chk(run(`hitAmenity(30,30)===null`), 'hitAmenity poligon dışını null döner');
chk(run(`(function(){ var v=hitAmenityVert(-8,-10); return v && v.i===0 && v.vi===0; })()`), 'hitAmenityVert köşe tutamacını bulur (i0,vi0)');
chk(run(`hitAmenityVert(30,30)===null`), 'hitAmenityVert köşe uzağında null');

/* ---- 11) ÇİZİM AKIŞI: amenitySnapPoint (0,5 ızgara + kapatma) ---- */
run(`mode='amenity'; amenityType='green'; amenityDrawPts=[]; pxPerM=1; panX=0; panY=0;`);
chk(run(`(function(){ var p=amenitySnapPoint(4.3,5.7); return p.x===4.5 && p.y===5.5 && !p.closing; })()`), 'amenitySnapPoint 0,5 m ızgaraya yapışır');
chk(run(`(function(){ amenityDrawPts=[{x:0,y:0},{x:6,y:0},{x:6,y:6}]; var p=amenitySnapPoint(0.2,0.1);
  return p.closing===true && p.x===0 && p.y===0; })()`), 'amenitySnapPoint ilk köşeye yakın → closing (kapat)');
chk(run(`(function(){ amenityDrawPts=[{x:0,y:0},{x:6,y:0}]; var p=amenitySnapPoint(0.1,0.1); return !p.closing; })()`), 'amenitySnapPoint 3 köşeden az → closing YOK');

/* ---- 12) amenityFinishDraw: geçerli poligon eklenir (pushEdit), geçersiz iptal ---- */
run(`amenities=[]; editHistory=[]; redoHistory=[]; mode='amenity'; amenityType='pool';
  amenityDrawPts=[{x:-8,y:-10},{x:2,y:-10},{x:-3,y:-3}];`);   // üçgen havuz, bahçede
run(`amenityFinishDraw();`);
chk(run(`amenities.length===1 && amenities[0].type==='pool' && amenities[0].pts.length===3`), 'amenityFinishDraw geçerli ÜÇGEN havuzu ekler (pts=3)');
chk(run(`amenities[0].w>0 && amenities[0].h>0`), 'eklenen imkan bbox türevi güncel (w/h>0)');
chk(run(`editHistory.length===1 && editHistory[0].type==='amenity'`), 'amenityFinishDraw pushEdit(type:amenity) yazar');
chk(run(`amenityDrawPts.length===0`), 'kapatınca çizim state sıfırlanır');
// geçersiz: bina üstüne çizilen poligon eklenmez
run(`amenities=[]; editHistory=[]; mode='amenity'; amenityType='green';
  amenityDrawPts=[{x:8,y:4},{x:24,y:4},{x:24,y:12},{x:8,y:12}]; amenityFinishDraw();`);
chk(run(`amenities.length===0 && editHistory.length===0 && amenityDrawPts.length===0`), 'bina üstü poligon eklenmez + çizim sıfırlanır (geçersiz iptal)');

/* ---- 13) DURUM ROUNDTRIP: stateSnapshot → restoreState pts taşır ---- */
run(`amenities=[
  {type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]},
  {type:'pool',  pts:[{x:-12,y:18},{x:0,y:18},{x:-6,y:26}]},
  {type:'playground', pts:[{x:34,y:-9},{x:42,y:-9},{x:42,y:-3},{x:34,y:-3}]}
]; amenities.forEach(amenityBBoxSync);`);
const snapN = run(`(function(){ var st=stateSnapshot(false); return st.amenities? st.amenities.length : -1; })()`);
chk(snapN===3, 'stateSnapshot imkanları içerir (3): '+snapN);
const rt = run(`(function(){
  var st=stateSnapshot(false);
  amenities=[];
  restoreState(st, {fit:false});
  return { n:amenities.length, t0:amenities[0]&&amenities[0].type,
           tri:amenities[1]&&amenities[1].pts.length, p0:amenities[0].pts[0] };
})()`);
chk(rt.n===3, 'restoreState imkanları geri yükler (3): '+rt.n);
chk(rt.t0==='green', 'imkan tipi korunur (ilk = green)');
chk(rt.tri===3, 'üçgen havuz köşe sayısı korunur (pts=3)');
chk(rt.p0.x===-8 && rt.p0.y===-10, 'poligon köşe koordinatı birebir korunur');

/* ---- 14) DERİN KOPYA TUZAĞI: snapshot pts, canlı imkanla REFERANS paylaşmaz ---- */
chk(run(`(function(){
  amenities=[{type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]}]; amenities.forEach(amenityBBoxSync);
  var snap=amenitySnapshot();
  snap[0].pts[0].x=999;
  return amenities[0].pts[0].x===-8;   // canlı DEĞİŞMEDİ → paylaşım yok
})()`), 'amenitySnapshot pts DERİN kopya (snapshot düzenlemesi canlıyı bozmaz)');
chk(run(`(function(){
  amenities=[{type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]}]; amenities.forEach(amenityBBoxSync);
  var st=stateSnapshot(false);
  st.amenities[0].pts[0].y=777;
  return amenities[0].pts[0].y===-10;  // state kopyası ayrı
})()`), 'stateSnapshot pts DERİN kopya (io yaz dalı paylaşım yapmaz)');

/* ---- 15) UNDO: gövde tık silme + tek-köşe düzenleme geri alınır (type:'amenity') ---- */
run(`amenities=[]; editHistory=[]; redoHistory=[];
  pushEdit({type:'amenity', prev:amenitySnapshot()});
  amenities.push(amenityBBoxSync({type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]}));`);
chk(run(`amenities.length===1 && editHistory.length===1 && editHistory[0].type==='amenity'`), 'imkan ekleme pushEdit(type:amenity) yazar');
run(`undoEdit()`);
chk(run(`amenities.length===0`), 'geri al imkan eklemeyi çözer (amenities boş)');
// tek-köşe düzenleme undo: pts derin geri gelir
run(`amenities=[amenityBBoxSync({type:'green', pts:[{x:-8,y:-10},{x:2,y:-10},{x:2,y:-2},{x:-8,y:-2}]})]; editHistory=[]; redoHistory=[];
  pushEdit({type:'amenity', prev:amenitySnapshot()});
  amenities[0].pts[1].x=5; amenityBBoxSync(amenities[0]);`);
run(`undoEdit()`);
chk(run(`amenities[0].pts[1].x===2 && amenities[0].w===10`), 'geri al köşe düzenlemeyi çözer (pts + bbox eski hâle)');

/* ---- 16) DRONE PROMPT SİNYALİ (view3d headless): yalnız VAR olan imkanları adlandırır (DEĞİŞMEDİ) ---- */
const hasApi = run(`!!(window.View3D && window.View3D.buildExteriorPrompt && window.View3D.amenityPromptSignal && window.View3D.amenityTypesPresent)`);
chk(hasApi, 'View3D S3 API (amenityPromptSignal/buildExteriorPrompt) erişilebilir');
if(hasApi){
  const empty = run(`window.View3D.amenityPromptSignal({amenities:[]})`);
  chk(empty==='', 'imkan yokken peyzaj sinyali boş (uydurma yapmaz)');
  const sig = run(`window.View3D.amenityPromptSignal({amenities:['green','playground','pool']})`);
  chk(/green lawn|landscaped/i.test(sig), 'sinyal: yeşil alan adlandırılır');
  chk(/playground/i.test(sig), 'sinyal: çocuk parkı adlandırılır');
  chk(/swimming pool/i.test(sig), 'sinyal: yüzme havuzu adlandırılır');
  chk(/keep these site features/i.test(sig), 'sinyal: LOCK disiplini ("keep these site features")');
  chk(!/ornamental|pergola/i.test(sig), 'sinyal: VAR OLMAYAN imkan (süs havuzu/pergola) adlandırılmaz');
  const types = run(`window.View3D.amenityTypesPresent({amenities:['pool','green','pool','playground']})`);
  chk(JSON.stringify(types)==='["green","playground","pool"]', 'tipler katalog sırasında + tekil: '+JSON.stringify(types));
}

/* ---- 17) İÇ MOTOR DOKUNULMADI: imkan eklemek plan bölge/daire sayısını DEĞİŞTİRMEZ ---- */
const regBefore = run(`plan.regions.length`);
run(`amenities.push(amenityBBoxSync({type:'pool', pts:[{x:34,y:18},{x:44,y:18},{x:44,y:24},{x:34,y:24}]}))`);
chk(run(`plan.regions.length`)===regBefore, 'imkan eklemek plan bölge sayısını değiştirmez (motor ayrık)');

function report(){
  console.log('\nSITE-IMKAN (S3, poligon): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
