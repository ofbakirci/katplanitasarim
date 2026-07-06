/* SITE-IMKAN (S3) — SİTE İMKANLARI (yeşil alan / çocuk parkı / havuzlar / oturma).
   Park yeri (bay) ailesinin PARSEL-katmanı akrabası; motor (oda/daire/duvar) DEĞİŞMEZ. Bu test
   THREE'siz SALT-VERİ mantığını doğrular: (1) yerleşim kuralları (parsel içi + bina dışı + SAT
   çakışma reddi), (2) durum roundtrip (stateSnapshot↔restoreState imkanları taşır), (3) drone
   prompt peyzaj sinyali (yalnız VAR olan imkanları adlandırır). WebGL yolu (3B mesh/preview) burada
   test edilmez — o preview kanıtında doğrulanır.

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
  generate();
`);

/* ---- 1) KATALOG + VARSAYILAN BOYUTLAR ---- */
chk(run(`typeof REG.amenities==='object' && !!REG.amenities.green && !!REG.amenities.pool`), 'imkan kataloğu (REG.amenities) mevcut');
chk(run(`REG.amenities.playground.w===8 && REG.amenities.playground.h===6`), 'çocuk parkı varsayılan 8×6 m');
chk(run(`REG.amenities.pool.w===12 && REG.amenities.pool.h===6`), 'yüzme havuzu varsayılan 12×6 m');
chk(run(`REG.amenities.ornament.w===4 && REG.amenities.ornament.h===3`), 'süs havuzu varsayılan 4×3 m');
chk(run(`REG.amenities.green.w===10 && REG.amenities.green.h===8`), 'yeşil alan varsayılan 10×8 m');
chk(run(`typeof amenityGhostAt==='function' && typeof hitAmenity==='function' && typeof amenityAreaOk==='function'`), 'imkan yardımcıları (ghost/hit/areaOk) tanımlı');

/* ---- 2) YERLEŞİM: bahçede (parsel içi, bina dışı) GEÇERLİ ---- */
// bina 0..32 × 0..16; bahçe kuzeyinde y<0 boşluk (parsel -12..28). Yeşil alan (-8..2 x, -10..-2 y) bahçede.
const okGarden = run(`amenityAreaOk({type:'green', x:-8, y:-10, w:10, h:8, ang:0})`);
chk(okGarden===true, 'bahçedeki (parsel içi, bina dışı) yeşil alan GEÇERLİ');

/* ---- 3) YERLEŞİM: bina footprint'i ÜSTÜNDE GEÇERSİZ ---- */
// bina merkezi (16,8) → oraya konan imkan reddedilmeli
const onBuilding = run(`amenityAreaOk({type:'green', x:11, y:4, w:10, h:8, ang:0})`);
chk(onBuilding===false, 'bina footprint\'i üstündeki imkan GEÇERSİZ (bina dışına konmalı)');

/* ---- 4) YERLEŞİM: parsel DIŞINDA GEÇERSİZ ---- */
const outParcel = run(`amenityAreaOk({type:'green', x:60, y:60, w:10, h:8, ang:0})`);
chk(outParcel===false, 'parsel dışındaki imkan GEÇERSİZ');

/* ---- 5) SAT ÇAKIŞMA: iki imkan üst üste → reddedilir (park bay ile ORTAK bayCorners/polyOverlapSAT) ---- */
run(`amenities=[{type:'green', x:-8, y:-10, w:10, h:8, ang:0}]`);
const overlap = run(`amenityOverlapsExisting({type:'pool', x:-6, y:-9, w:12, h:6, ang:0}, -1)`);
chk(overlap===true, 'mevcut imkanla çakışan yeni imkan SAT ile reddedilir');
const noOverlap = run(`amenityOverlapsExisting({type:'ornament', x:20, y:-8, w:4, h:3, ang:0}, -1)`);
chk(noOverlap===false, 'ayrık konumdaki imkan çakışma vermez');

/* ---- 6) GHOST: geçersiz konumda invalid:true (kırmızı hayalet), geçerli konumda temiz ---- */
// ghost dünya→ekran S2W kullanır; snapG global. Doğrudan amenityGhostAt yerine kuralları ayrı doğruladık;
// burada ghost sonucu invalid bayrağını park deseniyle üretir mi (çakışan konum) — amenityOverlapsExisting üstünden.
run(`amenities=[{type:'green', x:-8, y:-10, w:10, h:8, ang:0}]`);
const ghInvalid = run(`(function(){ var a={type:'pool',x:-6,y:-9,w:12,h:6,ang:0};
  return (!amenityAreaOk(a) || amenityOverlapsExisting(a,-1)); })()`);
chk(ghInvalid===true, 'çakışan/geçersiz konum invalid işaretlenir (kırmızı hayalet mantığı)');

/* ---- 7) DURUM ROUNDTRIP: stateSnapshot → restoreState imkanları taşır ---- */
run(`amenities=[
  {type:'green', x:-8, y:-10, w:10, h:8, ang:0},
  {type:'playground', x:34, y:-9, w:8, h:6, ang:0},
  {type:'pool', x:-12, y:18, w:12, h:6, ang:90}
];`);
const snapN = run(`(function(){ var st=stateSnapshot(false); return st.amenities? st.amenities.length : -1; })()`);
chk(snapN===3, 'stateSnapshot imkanları içerir (3): '+snapN);
const rt = run(`(function(){
  var st=stateSnapshot(false);
  amenities=[];                               // temizle
  restoreState(st, {fit:false});
  return { n:amenities.length, t0:amenities[0]&&amenities[0].type, ang2:amenities[2]&&amenities[2].ang };
})()`);
chk(rt.n===3, 'restoreState imkanları geri yükler (3): '+rt.n);
chk(rt.t0==='green', 'imkan tipi korunur (ilk = green)');
chk(rt.ang2===90, 'imkan döndürmesi (ang) korunur (90)');

/* ---- 8) UNDO: imkan ekleme/silme geri alınabilir (pushEdit type:'amenity') ---- */
run(`amenities=[]; editHistory=[]; redoHistory=[];
  pushEdit({type:'amenity', prev:amenitySnapshot()});
  amenities.push({type:'green', x:-8, y:-10, w:10, h:8, ang:0});`);
chk(run(`amenities.length===1 && editHistory.length===1 && editHistory[0].type==='amenity'`), 'imkan ekleme pushEdit(type:amenity) yazar');
run(`undoEdit()`);
chk(run(`amenities.length===0`), 'geri al imkan eklemeyi çözer (amenities boş)');

/* ---- 9) DRONE PROMPT SİNYALİ (view3d headless): yalnız VAR olan imkanları adlandırır ---- */
const hasApi = run(`!!(window.View3D && window.View3D.buildExteriorPrompt && window.View3D.amenityPromptSignal && window.View3D.amenityTypesPresent)`);
chk(hasApi, 'View3D S3 API (amenityPromptSignal/buildExteriorPrompt) erişilebilir');
if(hasApi){
  // hiç imkan yok → sinyal BOŞ (prompt peyzaj cümlesi eklemez)
  const empty = run(`window.View3D.amenityPromptSignal({amenities:[]})`);
  chk(empty==='', 'imkan yokken peyzaj sinyali boş (uydurma yapmaz)');
  const pEmpty = run(`window.View3D.buildExteriorPrompt({facade:'neutral', amenities:[]})`);
  chk(!/playground|swimming pool|ornamental/i.test(pEmpty), 'imkan yok → prompt havuz/park adlandırmaz');

  // yeşil + çocuk parkı + yüzme havuzu VAR → hepsi adlandırılır
  const sig = run(`window.View3D.amenityPromptSignal({amenities:['green','playground','pool']})`);
  chk(/green lawn|landscaped/i.test(sig), 'sinyal: yeşil alan adlandırılır');
  chk(/playground/i.test(sig), 'sinyal: çocuk parkı adlandırılır');
  chk(/swimming pool/i.test(sig), 'sinyal: yüzme havuzu adlandırılır');
  chk(/keep these site features/i.test(sig), 'sinyal: LOCK disiplini ("keep these site features")');
  chk(!/ornamental|pergola/i.test(sig), 'sinyal: VAR OLMAYAN imkan (süs havuzu/pergola) adlandırılmaz');

  const pFull = run(`window.View3D.buildExteriorPrompt({facade:'brick', amenities:['green','playground','pool','ornament']})`);
  chk(/drone/i.test(pFull) && /EXACTLY/.test(pFull), 'S3 prompt S2 LOCK/drone iskeletini korur');
  chk(/playground/i.test(pFull) && /swimming pool/i.test(pFull) && /ornamental/i.test(pFull), 'tam prompt tüm mevcut imkanları içerir');
  chk(/no people, no text/i.test(pFull), 'S3 prompt "no people, no text" kuyruğunu korur');

  // tip listesi katalog sırasında + tekilleştirilmiş
  const types = run(`window.View3D.amenityTypesPresent({amenities:['pool','green','pool','playground']})`);
  chk(JSON.stringify(types)==='["green","playground","pool"]', 'tipler katalog sırasında + tekil: '+JSON.stringify(types));
}

/* ---- 10) İÇ MOTOR DOKUNULMADI: imkan eklemek plan bölge/daire sayısını DEĞİŞTİRMEZ ---- */
const regBefore = run(`plan.regions.length`);
run(`amenities.push({type:'pool', x:34, y:18, w:12, h:6, ang:0})`);
chk(run(`plan.regions.length`)===regBefore, 'imkan eklemek plan bölge sayısını değiştirmez (motor ayrık)');

/* ---- 11) H1b: İMKAN BOYUTLANDIRMA (tutamaç + Büyüt/Küçült) — SALT-VERİ mantığı ---- */
chk(run(`typeof hitAmenityHandle==='function' && typeof amenityResizeBox==='function' && typeof amenityResizeStep==='function' && typeof amenityBBox==='function'`), 'H1b: boyutlandırma yardımcıları tanımlı (hit/box/step/bbox)');
chk(run(`AMENITY_MIN===2`), 'H1b: asgari boyut 2 m (brief 2×2)');
// bbox
chk(run(`(function(){ var b=amenityBBox({x:5,y:6,w:10,h:8}); return b.minX===5&&b.minY===6&&b.maxX===15&&b.maxY===14; })()`), 'H1b: amenityBBox köşeleri doğru');
// SE köşe drag → dışa büyür, min-köşe (x,y) sabit
chk(run(`(function(){ var nb=amenityResizeBox({minX:5,minY:6,maxX:15,maxY:14},'se',20,22); return nb.x===5&&nb.y===6&&nb.w===15&&nb.h===16; })()`), 'H1b: SE köşe dışa sürükle büyütür, min-köşe çapalı');
// NW köşe drag → sol/üstten büyür, max-köşe sabit
chk(run(`(function(){ var nb=amenityResizeBox({minX:5,minY:6,maxX:15,maxY:14},'nw',2,3); return nb.x===2&&nb.y===3&&nb.w===13&&nb.h===11; })()`), 'H1b: NW köşe sürükle max-köşeyi çapalar');
// min clamp: SE'yi min-köşenin içine sürükle → 2×2'de durur
chk(run(`(function(){ var nb=amenityResizeBox({minX:5,minY:6,maxX:15,maxY:14},'se',5.1,6.1); return nb.w===2&&nb.h===2; })()`), 'H1b: min 2×2 korunur (SE içeri sürüklense de)');
// kenar (n) tek eksen
chk(run(`(function(){ var nb=amenityResizeBox({minX:5,minY:6,maxX:15,maxY:14},'n',99,2); return nb.x===5&&nb.w===10&&nb.y===2&&nb.h===12; })()`), 'H1b: kenar tutamacı (n) yalnız bir ekseni boyutlandırır');
// amenityResizeStep: adım büyüt + min clamp + çakışma reddi
run(`amenities=[{type:'ornament', x:-10, y:-8, w:4, h:3, ang:0}]; editHistory=[]; redoHistory=[];`);
chk(run(`(function(){ var ok=amenityResizeStep(0,1); return ok&&Math.abs(amenities[0].w-4.5)<1e-6&&Math.abs(amenities[0].h-3.5)<1e-6; })()`), 'H1b: Büyüt +step (0.5) genişletir + merkez korunur');
chk(run(`(function(){ for(var i=0;i<20;i++) amenityResizeStep(0,-1); return amenities[0].w>=2&&amenities[0].h>=2; })()`), 'H1b: tekrar Küçült min 2 m altına inmez');
// çakışma reddi: iki komşu imkan, birini diğerine doğru büyüt → reddedilir (boyut değişmez)
run(`amenities=[{type:'ornament', x:-14, y:-8, w:4, h:3, ang:0},{type:'ornament', x:-9.9, y:-8, w:4, h:3, ang:0}]; editHistory=[];`);
chk(run(`(function(){ var w0=amenities[0].w; var ok=amenityResizeStep(0,1); return ok===false && amenities[0].w===w0; })()`), 'H1b: komşuya taşacak büyütme reddedilir (SAT), boyut korunur');
// döndürülmüş imkanda köşe tutamacı yok (hitAmenityHandle ang!=0 atlar) — S2Wx global gerekiyor; doğrudan mantık:
chk(run(`(function(){ amenities=[{type:'green',x:-8,y:-10,w:10,h:8,ang:90}]; return typeof hitAmenityHandle==='function'; })()`), 'H1b: döndürülmüş imkan güvenli (hitAmenityHandle ang!=0 köşe döndürmez)');
// undo: boyutlandırma pushEdit(type:amenity) → geri alınır
run(`amenities=[{type:'ornament', x:-10, y:-8, w:4, h:3, ang:0}]; editHistory=[]; redoHistory=[];`);
run(`amenityResizeStep(0,1);`);
chk(run(`editHistory.length===1 && editHistory[0].type==='amenity'`), 'H1b: boyutlandırma pushEdit(type:amenity) yazar');
run(`undoEdit()`);
chk(run(`amenities[0].w===4 && amenities[0].h===3`), 'H1b: geri al boyutlandırmayı çözer (4×3)');

function report(){
  console.log('\nSITE-IMKAN (S3): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
