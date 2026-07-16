/* DRONE-BAGLAM (İş D1-D7) — DIŞ (drone) bağlam damgası + blok-filtre + merkez çapası + paket damga
   roundtrip (headless, THREE'siz).
   Kök nedenler (kanıtlı): (1) stampCamCtx drone'lara da __floor damgalıyordu; camCtxMatch kat eşitliği
   istediğinden İÇ kamera adımında kat değişince drone gizmo/export/thumb filtrelerinden düşüyordu.
   (2) scene.__cx/__cz her buildScene'de yeniden hesaplanır; drone pos sahne-uzayında sabit kaldığından
   merkez değişince binaya göre kayıyordu. (3) setCameras/setExteriorCameras gelen damgayı stampCamCtx
   ile eziyordu (çok-bloklu paket açılışında kameralar tek bağlama yığılırdı).
   Düzeltmeler: stampExtCamCtx (__block + __cx/__cz, __floor YOK) · extCtxMatch (yalnız blok; dış modda
   extBlockView, 'all'=herkes; legacy=her yerde) · reanchorExtCams (eski→yeni merkez farkı pos/target'a) ·
   setExteriorCameras/setCameras gelen damgayı KORUR.

   THREE/WebGL YOK → gizmo/snapshot görsel yolu test edilmez (preview'de kanıtlanır); burada SALT-VERİ
   damga/filtre/çapa mantığı assert edilir. exteriorMode headless'ta gerçekten açılamaz →
   extExteriorModeRawForTest yalnız bayrağı çevirir (extCtxMatch salt-veri okur; kabuk kurulmaz).

   Kullanım: node tests/drone-baglam.js */
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

const hasApi = run(`!!(window.View3D && window.View3D.extCamsForTest && window.View3D.extCtxMatchForTest
  && window.View3D.extExteriorModeRawForTest && window.View3D.reanchorExtCamsForTest
  && window.View3D.deriveShowcaseDrones && window.View3D.setExteriorCameras && window.View3D.setCameras)`);
chk(hasApi, 'View3D İşD test API (extCtxMatchForTest/extExteriorModeRawForTest/reanchorExtCamsForTest) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* basit tek-blok plan (buildFloorplanMap fixture'ı — bazı yollar plan ister) */
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

/* ═══ (a) DAMGA: extCams push (deriveShowcaseDrones) → __floor YOK, __block = aktif blok ═══ */
run(`activeFloor=1; activeBlock=1; window.View3D.clearExteriorCameras();`);
const nDrone = run(`window.View3D.deriveShowcaseDrones()`);
chk(nDrone===1, 'İşD1: deriveShowcaseDrones 1 drone yerleştirdi: '+nDrone);
const stamped = run(`window.View3D.extCamsForTest()[0]`);
chk(stamped && !('__floor' in stamped), 'İşD1: drone damgasında __floor YOK (kat kavramı drone\'a uygulanmaz): '+JSON.stringify(stamped&&stamped.__floor));
chk(stamped && stamped.__block===1, 'İşD1: drone __block = aktif blok (1): '+(stamped&&stamped.__block));
chk(stamped && stamped.__cx==null, 'İşD1: sahne yokken merkez çapası YAZILMAZ (legacy — ilk buildScene taşımadan damgalar): '+(stamped&&stamped.__cx));
run(`window.View3D.clearExteriorCameras(); activeFloor=0; activeBlock=0;`);

/* ═══ (b) extCtxMatch: legacy · 'all' · tekil · null görünüm · kat-değişimi drone'u düşürmez ═══ */
// legacy (damgasız) her görünümde eşleşir — iç modda da, dış 'all' / tekil görünümde de
chk(run(`window.View3D.extCtxMatchForTest({pos:{x:0,y:5,z:0}})`)===true, 'İşD2: legacy (damgasız) drone İÇ modda eşleşir');
run(`window.View3D.extExteriorModeRawForTest(true); window.View3D.extBlockViewForTest('all');`);
chk(run(`window.View3D.extCtxMatchForTest({pos:{x:0,y:5,z:0}})`)===true, "İşD2: legacy drone 'all' görünümünde de eşleşir");
chk(run(`window.View3D.extCtxMatchForTest({__block:5})`)===true, "İşD2: 'Tümü' görünümünde FARKLI-blok drone'u da görünür (site render kadrajı)");
run(`window.View3D.extBlockViewForTest(1);`);
chk(run(`window.View3D.extCtxMatchForTest({__block:1})`)===true, 'İşD2: tekil görünümde (blok 1) eşleşen drone görünür');
chk(run(`window.View3D.extCtxMatchForTest({__block:0})`)===false, 'İşD2: tekil görünümde (blok 1) BAŞKA blok drone\'u gizlenir');
run(`window.View3D.extBlockViewForTest(null);`);   // varsayılan görünüm → activeBlock (0)
chk(run(`window.View3D.extCtxMatchForTest({__block:0})`)===true, 'İşD2: null (varsayılan) görünüm → activeBlock (0) drone\'u görünür');
chk(run(`window.View3D.extCtxMatchForTest({__block:1})`)===false, 'İşD2: null görünümde başka-blok drone\'u gizlenir');
run(`window.View3D.extExteriorModeRawForTest(false); window.View3D.extBlockViewForTest(2);`);
chk(run(`window.View3D.extCtxMatchForTest({__block:2})`)===false, 'İşD2: İÇ modda extBlockView OKUNMAZ — activeBlock (0) belirler (blok-2 drone gizli)');
run(`window.View3D.extBlockViewForTest(null);`);

/* ═══ (b2) REVIEW-R1: damga GÖRÜNÜM bloğunu izler — view-only blok görünümünde konan drone o bloğa ait ═══ */
run(`activeBlock=0; window.View3D.extExteriorModeRawForTest(true); window.View3D.extBlockViewForTest(1);`);
const stView = run(`window.View3D.stampExtCamCtxForTest({pos:{x:1,y:5,z:1}})`);
chk(stView && stView.__block===1, 'R1: dış modda TEKİL görünümde (blok 1, activeBlock 0) damga = GÖRÜNÜM bloğu (1): '+(stView&&stView.__block));
chk(run(`window.View3D.extCtxMatchForTest({__block:1})`)===true, 'R1: aynı görünümde yeni konan drone ANINDA görünür (kondu-kayboldu regresyonu yok)');
run(`window.View3D.extBlockViewForTest('all');`);
const stAll = run(`window.View3D.stampExtCamCtxForTest({pos:{x:1,y:5,z:1}})`);
chk(stAll && stAll.__block===0, "R1: 'Tümü' görünümünde damga = activeBlock (0): "+(stAll&&stAll.__block));
run(`window.View3D.extExteriorModeRawForTest(false); window.View3D.extBlockViewForTest(null);`);
const stIc = run(`window.View3D.stampExtCamCtxForTest({pos:{x:1,y:5,z:1}})`);
chk(stIc && stIc.__block===0, 'R1: İÇ modda damga = activeBlock (0) — eski davranış aynen: '+(stIc&&stIc.__block));

// kat değişimi exportExteriorCameras'tan drone DÜŞÜRMEZ (yeni damga + ESKİ __floor'lu kayıt ikisi de)
run(`
  activeBlock=0; activeFloor=0;
  window.View3D.extCamsForTest([
    {pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24, __block:0},                 // yeni damga (İş D1)
    {pos:{x:-8,y:26,z:-8}, target:{x:16,y:5,z:8}, lens:35, __floor:0, __block:0}      // ESKİ kayıt (stampCamCtx dönemi, __floor'lu)
  ]);
  activeFloor=2;
`);
const expFloorChange = run(`window.View3D.exportExteriorCameras('faithful').map(function(c){return c.id;})`);
chk(Array.isArray(expFloorChange) && expFloorChange.length===2 && expFloorChange[0]==='ext1' && expFloorChange[1]==='ext2',
    'İşD2: activeFloor DEĞİŞİNCE drone export\'tan DÜŞMEZ (yeni damga + eski __floor\'lu kayıt): '+JSON.stringify(expFloorChange));
// blok değişimi ise HÂLÂ filtreler (drone blok-bağlamlı kalır)
run(`activeBlock=1;`);
const expBlockChange = run(`window.View3D.exportExteriorCameras('faithful').length`);
chk(expBlockChange===0, 'İşD2: activeBlock değişince başka-blok drone\'ları filtrelenir (blok damgası çalışır): '+expBlockChange);
run(`activeBlock=0; activeFloor=0; window.View3D.extCamsForTest([]);`);

/* ═══ (c) setExteriorCameras: __floor SİLER, __block KORUR, __cx/__cz taşır ═══ */
run(`window.View3D.setExteriorCameras([
  {pos:{x:10,y:12,z:10}, target:{x:0,y:2,z:0}, lens:24, aimed:true, __floor:2, __block:1, __cx:5, __cz:3},
  {pos:{x:-10,y:12,z:-10}, target:{x:0,y:2,z:0}, lens:24}
]);`);
const impCams = run(`window.View3D.extCamsForTest()`);
chk(impCams[0] && !('__floor' in impCams[0]), 'İşD3: setExteriorCameras gelen __floor\'u SİLER (drone\'da anlamsız): '+(impCams[0]&&impCams[0].__floor));
chk(impCams[0] && impCams[0].__block===1, 'İşD3: gelen __block damgası KORUNUR (paket geri-yükleme): '+(impCams[0]&&impCams[0].__block));
chk(impCams[0] && impCams[0].__cx===5 && impCams[0].__cz===3, 'İşD3: gelen __cx/__cz merkez çapası KORUNUR: '+(impCams[0]&&impCams[0].__cx)+'/'+(impCams[0]&&impCams[0].__cz));
chk(impCams[0] && impCams[0].aimed===true, 'İşD3: aimed davranışı aynen (İş4a regresyonu yok)');
chk(impCams[1] && impCams[1].__block===0, 'İşD3: damgasız gelen aktif bloğa (0) damgalanır: '+(impCams[1]&&impCams[1].__block));
chk(impCams[1] && impCams[1].__cx==null, 'İşD3: sahne yokken çapa YAZILMAZ (ilk buildScene taşımadan damgalar): '+(impCams[1]&&impCams[1].__cx));
// blok-filtre export'ta: aktif blok 0 iken __block:1 drone dışarıda kalır, tam liste API'si değişmez
const impExp = run(`window.View3D.exportExteriorCameras('faithful').map(function(c){return c.id;})`);
chk(impExp.length===1 && impExp[0]==='ext2', 'İşD3: aktif blok 0 iken __block:1 drone export\'a girmez (id SABİT ext2): '+JSON.stringify(impExp));
chk(run(`window.View3D.getExteriorCameras().length`)===2, 'İşD3: getExteriorCameras (dışa API) TAM liste (2) — değişmedi');
run(`window.View3D.clearExteriorCameras();`);

/* ═══ (d) reanchorExtCams: eski→yeni merkez farkı pos+target'a; legacy taşınmaz, damgalanır ═══ */
run(`
  window.View3D.extCamsForTest([
    {pos:{x:10,y:12,z:10}, target:{x:0,y:2,z:0}, lens:24, __block:0, __cx:5, __cz:3},   // eski merkez (5,3) çerçevesinden
    {pos:{x:-8,y:20,z:-8}, target:{x:0,y:2,z:0}, lens:24, __block:0}                    // legacy (çapasız)
  ]);
  window.View3D.camSceneStubForTest(__MAP0);   // scene={__cx:0,__cz:0,...} — yeni merkez (0,0)
`);
const rean = run(`window.View3D.reanchorExtCamsForTest()`);
run(`window.View3D.camSceneStubForTest(null);`);
chk(rean[0] && rean[0].pos.x===15 && rean[0].pos.z===13, 'İşD4: çapali drone pos eski-yeni merkez farkı (dx=5,dz=3) kadar taşındı: '+JSON.stringify(rean[0]&&rean[0].pos));
chk(rean[0] && rean[0].target.x===5 && rean[0].target.z===3, 'İşD4: target da AYNI farkla taşındı (bakış bağıl korunur): '+JSON.stringify(rean[0]&&rean[0].target));
chk(rean[0] && rean[0].__cx===0 && rean[0].__cz===0, 'İşD4: çapa yeni merkeze güncellendi (0,0)');
chk(rean[1] && rean[1].pos.x===-8 && rean[1].pos.z===-8, 'İşD4: legacy (çapasız) drone TAŞINMADI: '+JSON.stringify(rean[1]&&rean[1].pos));
chk(rean[1] && rean[1].__cx===0 && rean[1].__cz===0, 'İşD4: legacy drone mevcut merkezle damgalandı (bundan sonrası izlenir)');
run(`window.View3D.extCamsForTest([]);`);

/* ═══ (e) İş D6: setCameras (İÇ kamera import'u) gelen damgayı KORUR, damgasızı aktif bağlama damgalar ═══ */
run(`
  activeFloor=0; activeBlock=0;
  window.View3D.setCameras([
    {pos:{x:1,y:1.6,z:1}, target:{x:2,y:1,z:2}, lens:24, height:'eye', __floor:2, __block:1},
    {pos:{x:3,y:1.6,z:3}, target:{x:4,y:1,z:4}, lens:24, height:'eye'}
  ]);
`);
const camImp = run(`window.View3D.camListForTest()`);
chk(camImp[0] && camImp[0].__floor===2 && camImp[0].__block===1,
    'İşD6: setCameras gelen __floor/__block damgasını KORUR (çok-bloklu paket kameraları tek bağlama yığılmaz): '+JSON.stringify({f:camImp[0]&&camImp[0].__floor,b:camImp[0]&&camImp[0].__block}));
chk(camImp[1] && camImp[1].__floor===0 && camImp[1].__block===0,
    'İşD6: damgasız gelen kamera aktif bağlama (kat0/blok0) damgalanır — mevcut davranış: '+JSON.stringify({f:camImp[1]&&camImp[1].__floor,b:camImp[1]&&camImp[1].__block}));
run(`window.View3D.camListForTest([]);`);

/* ═══ (g) İş D7: HAM-GET API'leri paket roundtrip'i için damga alanlarını TAŞIR ═══
   (render payload'ları exportCameras/exportExteriorCameras DEĞİŞMEDİ — damga oraya girmez) */
run(`
  activeFloor=0; activeBlock=0;
  window.View3D.camListForTest([
    {pos:{x:1,y:1.6,z:1}, target:{x:2,y:1,z:2}, lens:24, height:'eye', __floor:2, __block:1},
    {pos:{x:3,y:1.6,z:3}, target:{x:4,y:1,z:4}, lens:24, height:'eye'}
  ]);
  window.View3D.extCamsForTest([
    {pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24, aimed:true, __block:1, __cx:5, __cz:3},
    {pos:{x:-8,y:26,z:-8}, target:{x:16,y:5,z:8}, lens:35}
  ]);
`);
const getC = run(`window.View3D.getCameras()`);
chk(getC[0] && getC[0].__floor===2 && getC[0].__block===1, 'İşD7: getCameras damgayı taşır (__floor/__block): '+JSON.stringify({f:getC[0]&&getC[0].__floor,b:getC[0]&&getC[0].__block}));
chk(getC[1] && getC[1].__floor===null && getC[1].__block===null, 'İşD7: damgasız kamera getCameras\'ta null/null (kararlı şema): '+JSON.stringify({f:getC[1]&&getC[1].__floor,b:getC[1]&&getC[1].__block}));
const getE = run(`window.View3D.getExteriorCameras()`);
chk(getE[0] && getE[0].__block===1 && getE[0].__cx===5 && getE[0].__cz===3, 'İşD7: getExteriorCameras damgayı taşır (__block/__cx/__cz): '+JSON.stringify({b:getE[0]&&getE[0].__block,cx:getE[0]&&getE[0].__cx,cz:getE[0]&&getE[0].__cz}));
chk(getE[0] && !('__floor' in getE[0]), 'İşD7: getExteriorCameras __floor TAŞIMAZ (drone\'da kat kavramı yok)');
chk(getE[1] && getE[1].__block===null && getE[1].__cx===null, 'İşD7: damgasız drone getExteriorCameras\'ta null (kararlı şema)');
// render payload'una damga SIZMAZ (mevcut sözleşme aynen)
run(`window.View3D.camSceneStubForTest(__MAP0);`);
const expPayload = run(`window.View3D.exportCameras(__MAP0)`);
run(`window.View3D.camSceneStubForTest(null);`);
chk(expPayload.every(function(o){ return !('__floor' in o) && !('__block' in o); }), 'İşD7: exportCameras (render payload) __ alanı taşımaz — şema DEĞİŞMEDİ');
const expPayloadExt = run(`window.View3D.exportExteriorCameras('faithful')`);
chk(expPayloadExt.every(function(o){ return !('__block' in o) && !('__cx' in o) && !('__cz' in o); }), 'İşD7: exportExteriorCameras (render payload) __ alanı taşımaz — şema DEĞİŞMEDİ');
run(`window.View3D.camListForTest([]); window.View3D.extCamsForTest([]);`);

function report(){
  console.log('\nDRONE-BAGLAM (İş D1-D7): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
