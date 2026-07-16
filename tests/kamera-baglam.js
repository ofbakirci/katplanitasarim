/* KAMERA-BAGLAM (İş 1) — KAMERA/DRONE BAĞLAM DAMGASI + FİLTRE (headless, THREE'siz).
   view3d.js camCtxMatch(): camList/extCams öğeleri {__floor,__block} damgası taşır (oluşturulduğu
   kat/blok bağlamı). exportCameras/exportExteriorCameras/snapCameraThumbs YALNIZ CANLI bağlama (activeFloor/
   activeBlock) eşleşen öğeleri işler; damgasız (legacy) kayıt HER bağlamda görünür (geriye-uyum).
   getCameras/getExteriorCameras (dışa API) DEĞİŞMEZ — HER ZAMAN tam liste. id numaralandırması ORİJİNAL
   camList/extCams konumuna göre SABİT (filtre id'yi kaydırmaz — mesken paket-eşleştirme + İş 2 blok-başına
   yakalama bunun üstüne kurulu). Ayrıca İş 4: drone aimed roundtrip + MUTLAK yükseklik klempi (setExteriorCameras).

   THREE/WebGL YOK → gizmo/snapshot görsel yolu test edilmez (preview'de kanıtlanır); burada SALT-VERİ
   filtre/damga/klemp mantığı assert edilir. MOTOR MANTIĞINI DEĞİŞTİRMEZ.

   TEKNİK NOT: exportCameras/camViewObj worldToPx üzerinden CANLI `scene.__cx/__cz`'yi okur — normalde
   yalnız THREE tabanlı buildScene kurar. camSceneStubForTest(map) minimal salt-veri güdüğü kurar/söker;
   YALNIZ exportCameras/snapCameraThumbs çağrısını SARMALAR — camListForTest/extCamsForTest/setExteriorCameras
   gibi liste-DEĞİŞTİREN çağrılar renderCamGizmos/renderExtGizmos'u tetikler (THREE gerekir) → onlardan ÖNCE
   güdük SÖKÜLÜR (scene=null → o yollar zaten "sahne yok" guard'ıyla no-op kalır, mevcut testlerin deseni).

   Kullanım: node tests/kamera-baglam.js */
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
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true,
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }
function stubOn(){ run(`window.View3D.camSceneStubForTest(__MAP0);`); }
function stubOff(){ run(`window.View3D.camSceneStubForTest(null);`); }

/* API erişilebilir mi */
const hasApi = run(`!!(window.View3D && window.View3D.camListForTest && window.View3D.extCamsForTest
  && window.View3D.camSceneStubForTest && window.View3D.exportCameras && window.View3D.exportExteriorCameras
  && window.View3D.getCameras && window.View3D.getExteriorCameras && window.View3D.setExteriorCameras)`);
chk(hasApi, 'View3D İş1 test API (camListForTest/extCamsForTest/camSceneStubForTest/exportCameras/exportExteriorCameras) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* basit tek-blok plan (exportCameras map gerektirir) */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='3';
  document.getElementById('katYuk').value='2.9';
  bodrumSayisi=0; villaFloors=null; activeFloor=0; blocks=null; activeBlock=0; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:20,y:0},{x:20,y:14},{x:0,y:14}]; closed=true;
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  __MAP0=buildFloorplanMap();
`);
chk(!!ctx.__MAP0, 'ön-koşul: buildFloorplanMap() null değil');

/* ═══ 1) DAMGA + FİLTRE: bağlam A (blok0) / bağlam B (blok1) / legacy (damgasız) karışık camList ═══ */
run(`
  activeFloor=0; activeBlock=0;
  window.View3D.camListForTest([
    {pos:{x:1,y:1.6,z:1}, target:{x:2,y:1,z:2}, lens:24, height:'eye', __floor:0, __block:0},   // bağlam A (aktif)
    {pos:{x:3,y:1.6,z:3}, target:{x:4,y:1,z:4}, lens:24, height:'eye', __floor:0, __block:1},   // bağlam B (farklı blok)
    {pos:{x:5,y:1.6,z:5}, target:{x:6,y:1,z:6}, lens:24, height:'eye'}                           // legacy (damgasız)
  ]);
`);
const injected = run(`window.View3D.camListForTest()`);
chk(Array.isArray(injected) && injected.length===3, 'camListForTest enjeksiyonu 3 kamera taşıyor: '+(injected&&injected.length));

// bağlam A (activeBlock=0) aktifken: A-damgalı + legacy görünür (2), B-damgalı FİLTRELENİR
stubOn();
const expA = run(`window.View3D.exportCameras(__MAP0)`);
const thumbsA = run(`window.View3D.snapCameraThumbs()`);
stubOff();
chk(Array.isArray(expA) && expA.length===2, 'bağlam A (blok0) aktifken exportCameras 2 döner (A+legacy): '+(expA&&expA.length));
chk(expA && expA[0] && expA[0].id==='cam1', 'İD SABİT: bağlam-A kamerası (orijinal camList[0]) id=cam1: '+(expA&&expA[0]&&expA[0].id));
chk(expA && expA[1] && expA[1].id==='cam3', 'İD SABİT: legacy kamera (orijinal camList[2]) id=cam3 (filtre sonrası YENİDEN NUMARALANMAZ): '+(expA&&expA[1]&&expA[1].id));
chk(Array.isArray(thumbsA) && thumbsA.length===2, 'snapCameraThumbs bağlam A: 2 döner (aynı filtre): '+(thumbsA&&thumbsA.length));

// bağlam B'ye geç (activeBlock=1): B-damgalı + legacy görünür (2), A-damgalı FİLTRELENİR — id'ler DEĞİŞMEZ
run(`activeBlock=1;`);
stubOn();
const expB = run(`window.View3D.exportCameras(__MAP0)`);
stubOff();
chk(Array.isArray(expB) && expB.length===2, 'bağlam B (blok1) aktifken exportCameras 2 döner (B+legacy): '+(expB&&expB.length));
chk(expB && expB[0] && expB[0].id==='cam2', 'İD SABİT: bağlam-B kamerası (orijinal camList[1]) id=cam2: '+(expB&&expB[0]&&expB[0].id));
chk(expB && expB[1] && expB[1].id==='cam3', 'İD SABİT: legacy kamera bağlam B\'de de id=cam3 (aynı fiziksel kamera): '+(expB&&expB[1]&&expB[1].id));

// getCameras (dışa API): DEĞİŞMEZ — bağlamdan bağımsız HER ZAMAN tam liste (3). Scene/worldToPx GEREKMEZ.
const full = run(`window.View3D.getCameras()`);
chk(Array.isArray(full) && full.length===3, 'getCameras (dışa API) bağlam-filtresiz TAM liste döner (3): '+(full&&full.length));
chk(full && full[0] && full[0].id==='cam1' && full[1].id==='cam2' && full[2].id==='cam3',
    'getCameras id şeması exportCameras ile AYNI (cam1/cam2/cam3) — pkgMergeCam id-eşleştirmesi için şart');

// legacy damgasız kayıt HER bağlamda görünür (bağlam A'da da B'de de mevcuttu — yukarıda ikisinde de kanıtlandı)
run(`activeFloor=0; activeBlock=0; window.View3D.camListForTest([]);`);   // temizle (scene zaten null — güvenli)

/* ═══ 2) extCams (drone) İÇİN AYNI FİLTRE — exportExteriorCameras (scene/worldToPx GEREKMEZ, stub şart değil) ═══ */
run(`
  activeBlock=0;
  window.View3D.extCamsForTest([
    {pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24, __floor:0, __block:0},   // bağlam A
    {pos:{x:-8,y:26,z:-8}, target:{x:16,y:5,z:8}, lens:35, __floor:0, __block:1}    // bağlam B
  ]);
`);
const extA = run(`window.View3D.exportExteriorCameras('faithful')`);
chk(Array.isArray(extA) && extA.length===1 && extA[0].id==='ext1', 'drone: bağlam A aktifken yalnız ext1 (blok0) döner: '+JSON.stringify(extA&&extA.map(c=>c.id)));
run(`activeBlock=1;`);
const extB = run(`window.View3D.exportExteriorCameras('faithful')`);
chk(Array.isArray(extB) && extB.length===1 && extB[0].id==='ext2', 'drone: bağlam B aktifken yalnız ext2 (blok1) döner: '+JSON.stringify(extB&&extB.map(c=>c.id)));
const extFull = run(`window.View3D.getExteriorCameras()`);
chk(Array.isArray(extFull) && extFull.length===2, 'getExteriorCameras (dışa API) bağlam-filtresiz TAM liste (2): '+(extFull&&extFull.length));
run(`activeBlock=0; window.View3D.extCamsForTest([]);`);   // temizle

/* ═══ 3) İş 4a: DRONE aimed ROUNDTRIP (setExteriorCameras → getExteriorCameras/exportExteriorCameras) ═══ */
run(`window.View3D.setExteriorCameras([
  {pos:{x:10,y:12,z:10}, target:{x:0,y:2,z:0}, lens:24, aimed:true},
  {pos:{x:-10,y:12,z:-10}, target:{x:0,y:2,z:0}, lens:24}
]);`);
const aimedGeo = run(`window.View3D.getExteriorCameras()`);
chk(aimedGeo && aimedGeo[0] && aimedGeo[0].aimed===true, 'İş4a: aimed:true roundtrip korunur (getExteriorCameras): '+(aimedGeo&&aimedGeo[0]&&aimedGeo[0].aimed));
chk(aimedGeo && aimedGeo[1] && aimedGeo[1].aimed===false, 'İş4a: aimed belirtilmeyen drone → false (merkez-takip varsayılan): '+(aimedGeo&&aimedGeo[1]&&aimedGeo[1].aimed));
const aimedExp = run(`window.View3D.exportExteriorCameras('faithful')`);
chk(aimedExp && aimedExp[0] && aimedExp[0].aimed===true, 'İş4a: aimed exportExteriorCameras çıktısına da düşer: '+(aimedExp&&aimedExp[0]&&aimedExp[0].aimed));

/* ═══ 4) İş 4b: MUTLAK yükseklik klempi (bina bağlamından BAĞIMSIZ — extBox yok, generate() öncesi bile çalışır) ═══ */
run(`window.View3D.setExteriorCameras([{pos:{x:0,y:999,z:0}, target:{x:0,y:0,z:0}, lens:24}]);`);
const yHigh = run(`window.View3D.getExteriorCameras()[0].pos.y`);
chk(yHigh===500, 'İş4b: y=999 mutlak tavana (500) klemplenir: '+yHigh);
run(`window.View3D.setExteriorCameras([{pos:{x:0,y:30,z:0}, target:{x:0,y:0,z:0}, lens:24}]);`);
const yMid = run(`window.View3D.getExteriorCameras()[0].pos.y`);
chk(yMid===30, 'İş4b: y=30 (makul değer) AYNEN kalır — bina-bağlamlı dar klempe (extDroneYRange) TABİ DEĞİL: '+yMid);
run(`window.View3D.setExteriorCameras([{pos:{x:0,y:-40,z:0}, target:{x:0,y:0,z:0}, lens:24}]);`);
const yNeg = run(`window.View3D.getExteriorCameras()[0].pos.y`);
chk(yNeg===0.5, 'İş4b: negatif y mutlak tabana (0.5) klemplenir: '+yNeg);
run(`window.View3D.clearExteriorCameras();`);

/* ═══ İş D8: KAMERA ADIMI ŞERİDİ — yalnız canlı bağlamın kameraları listelenir + bağlam değişince seçim bırakılır ═══ */
run(`activeFloor=0; activeBlock=0; window.View3D.camListForTest([
  {pos:{x:1,y:1.6,z:1}, target:{x:2,y:1,z:2}, lens:24, __floor:0, __block:0},
  {pos:{x:3,y:1.6,z:3}, target:{x:4,y:1,z:4}, lens:24, __floor:0, __block:1},
  {pos:{x:5,y:1.6,z:5}, target:{x:6,y:1,z:6}, lens:24}
]);`);
const visA = run(`JSON.stringify(window.View3D.camVisibleIdxForTest())`);
chk(visA==='[0,2]', 'İşD8: bağlam A(kat0/blok0) şeridi = A-kamerası + legacy (orijinal indeksler [0,2]): '+visA);
run(`activeBlock=1;`);
const visB = run(`JSON.stringify(window.View3D.camVisibleIdxForTest())`);
chk(visB==='[1,2]', 'İşD8: bağlam B(blok1) şeridi = B-kamerası + legacy ([1,2]) — numara YENİDEN VERİLMEZ: '+visB);
const selKal = run(`window.View3D.camClampSelForTest(1)`);
chk(selKal===1, 'İşD8: seçim bağlamda görünür kameradaysa (idx1, B) KORUNUR: '+selKal);
run(`activeBlock=0;`);
const selBirak = run(`window.View3D.camClampSelForTest(1)`);
chk(selBirak===-1, 'İşD8: bağlam A\'ya dönünce B-kamerası seçimi otomatik BIRAKILIR (-1): '+selBirak);
const selLegacy = run(`window.View3D.camClampSelForTest(2)`);
chk(selLegacy===2, 'İşD8: legacy (damgasız) kamera seçimi her bağlamda korunur: '+selLegacy);
run(`window.View3D.camClampSelForTest(-1); window.View3D.camListForTest([]); activeFloor=0; activeBlock=0;`);

function report(){
  console.log('\nKAMERA-BAGLAM (İş 1+4+D8): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
