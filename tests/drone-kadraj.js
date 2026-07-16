/* DRONE-KADRAJ (Ç5) — KADRAJ-FARKINDA DIŞ PROMPT (headless, THREE'siz).
   KÖK NEDEN (render-debug 2026-07-16, kullanıcının canlı oturumu): dış prompt kameradan BAĞIMSIZ sabitti —
   kadraj ne olursa olsun "a N-storey ... building, aerial drone perspective looking down" diyordu. Aynı
   oturumda ext1/ext3 (tek kütle, kadraja sığmış) İYİ çıkarken ext2'de drone iki blok ARASINDA + YATAY
   durunca metin (tekil bina + tepeden bakış) referansla ÇELİŞTİ → model snapshot'ı attı, üç blokluk
   jenerik site uydurdu. Üç istekte prompt/parametre BİREBİR aynıydı; tek değişken kadrajdı.
   Burada assert edilen: (1) extFramingCalc SAF projeksiyonu (pitch sınıfı + kadrajdaki blok + kırpılma),
   (2) prompt'un o çıkarımı metne çevirmesi, (3) SÖZLEŞME: cam/framing YOKSA çıktı BYTE-AYNI (eski
   çağrılar + mevcut testler korunur). THREE/WebGL YOK → snapshot yolu preview'de kanıtlanır.

   Kullanım: node tests/drone-kadraj.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:4, katYuk:2.9 });
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

const hasApi = run(`!!(window.View3D && window.View3D.extFramingForTest && window.View3D.buildExteriorPrompt)`);
chk(hasApi, 'View3D Ç5 API (extFramingForTest + buildExteriorPrompt) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ---- 1) SAF KADRAJ MATEMATİĞİ (extFramingCalc) ---- */
// 12×12 tek blok, merkezde, 4 kat × 2.9 = 11.6m yüksek. Kamera hep bu bloğa bakar.
const ONE = `[{poly:[[-6,-6],[6,-6],[6,6],[-6,6]], h:11.6}]`;

// 1a) YÜKSEK + tepeden bakan drone → aerial (pitch>=30)
const frAer = run(`window.View3D.extFramingForTest({pos:{x:0,y:40,z:40}, target:{x:0,y:6,z:0}, fov_deg:74}, ${ONE})`);
chk(frAer.pitch_deg > 30, 'Ç5: yüksek/tepeden drone → pitch>30 (' + frAer.pitch_deg + ')');
chk(frAer.view === 'aerial', 'Ç5: pitch>=30 → view=aerial');
chk(frAer.inFrame === 1, 'Ç5: tek blok kadrajda → inFrame=1');

// 1b) ALÇAK + yatay drone (ext2 vakası) → low; "aerial" DEMEZ
const frLow = run(`window.View3D.extFramingForTest({pos:{x:0,y:6,z:40}, target:{x:0,y:5.5,z:0}, fov_deg:74}, ${ONE})`);
chk(frLow.pitch_deg < 12, 'Ç5: yatay drone → pitch<12 (' + frLow.pitch_deg + ')');
chk(frLow.view === 'low', 'Ç5: pitch<12 → view=low (ext2 vakası)');

// 1c) ARA açı → elevated
const frMid = run(`window.View3D.extFramingForTest({pos:{x:0,y:16,z:40}, target:{x:0,y:6,z:0}, fov_deg:74}, ${ONE})`);
chk(frMid.view === 'elevated', 'Ç5: 12<=pitch<30 → view=elevated (' + frMid.pitch_deg + ')');

// 1d) SIRTINI DÖNEN kamera → blok kadraj dışı (inFrame=0). Kamera arkası z<=0 elenir.
const frBack = run(`window.View3D.extFramingForTest({pos:{x:0,y:8,z:40}, target:{x:0,y:8,z:120}, fov_deg:74}, ${ONE})`);
chk(frBack.inFrame === 0, 'Ç5: sırtı dönük kamera → inFrame=0 (kadraj dışı blok sayılmaz)');

// 1e) YANA bakan kamera (blok kadrajın dışında kalır) → inFrame=0
const frSide = run(`window.View3D.extFramingForTest({pos:{x:0,y:8,z:40}, target:{x:200,y:8,z:40}, fov_deg:54}, ${ONE})`);
chk(frSide.inFrame === 0, 'Ç5: bloğa bakmayan kamera → inFrame=0');

// 1f) KIRPILMA: bloğun dibinde/içinde → kütle kadrajı taşar (cropped=true)
const frCrop = run(`window.View3D.extFramingForTest({pos:{x:0,y:5,z:8}, target:{x:0,y:5,z:0}, fov_deg:74}, ${ONE})`);
chk(frCrop.inFrame === 1 && frCrop.cropped === true, 'Ç5: kadrajı taşan kütle → cropped=true');

// 1g) UZAK + geniş kadraj → kırpılma YOK
const frFull = run(`window.View3D.extFramingForTest({pos:{x:0,y:40,z:60}, target:{x:0,y:6,z:0}, fov_deg:74}, ${ONE})`);
chk(frFull.inFrame === 1 && frFull.cropped === false, 'Ç5: kadraja tam sığan kütle → cropped=false (ext1 vakası)');

// 1h) İKİ BLOK arasında yatay drone (ext2 dizilimi: iki kütle + aradan bakış) → inFrame=2
const TWO = `[{poly:[[-26,-6],[-14,-6],[-14,6],[-26,6]], h:11.6},{poly:[[14,-6],[26,-6],[26,6],[14,6]], h:11.6}]`;
const frTwo = run(`window.View3D.extFramingForTest({pos:{x:0,y:6,z:44}, target:{x:0,y:5.5,z:0}, fov_deg:74}, ${TWO})`);
chk(frTwo.inFrame === 2, 'Ç5: iki blok kadrajda → inFrame=2 (ext2 dizilimi)');
chk(frTwo.view === 'low', 'Ç5: ext2 dizilimi + yatay drone → view=low');

// 1i) TOTAL sayaç: kadrajda olmayan blok da toplamda görünür (teşhis için)
chk(frBack.total === 1, 'Ç5: total = verilen blok sayısı (kadraj dışı dâhil)');

// 1j) DEJENERE girdiler → çökmez, güvenli döner
const frNull = run(`window.View3D.extFramingForTest(null, ${ONE})`);
chk(frNull && frNull.inFrame === 0, 'Ç5: cam yok → güvenli boş çıkarım (çökmez)');
const frNoBlk = run(`window.View3D.extFramingForTest({pos:{x:0,y:40,z:40}, target:{x:0,y:6,z:0}, fov_deg:74}, [])`);
chk(frNoBlk && frNoBlk.inFrame === 0 && frNoBlk.total === 0, 'Ç5: blok yok → güvenli boş çıkarım');
// tam TEPEDEN bakış (forward=(0,-1,0)) → sağ vektör dejenere; NaN üretmemeli
const frTop = run(`window.View3D.extFramingForTest({pos:{x:0,y:60,z:0}, target:{x:0,y:0,z:0}, fov_deg:74}, ${ONE})`);
chk(frTop.view === 'aerial' && !isNaN(frTop.inFrame), 'Ç5: tam tepeden bakış dejenere sağ-vektörde NaN üretmez');

/* ---- 2) PROMPT: kadraj çıkarımı METNE dönüyor mu (framing enjeksiyonu) ---- */
const pLow = run(`window.View3D.buildExteriorPrompt({facade:'neutral', framing:{view:'low', inFrame:2, cropped:true, total:2}})`);
chk(/almost level with the horizon/.test(pLow), 'Ç5: view=low → "camera almost level" cümlesi');
chk(/NOT a top-down aerial view/.test(pLow), 'Ç5: view=low → tepeden-bakış AÇIKÇA reddedilir');
chk(!/aerial drone perspective looking down/.test(pLow), 'Ç5: view=low → çelişen "aerial looking down" metni GİRMEZ (ext2 kök nedeni)');
chk(/two \d+-storey residential apartment blocks/.test(pLow), 'Ç5: inFrame=2 → özne ÇOĞUL ("two blocks")');
chk(!/of a \d+-storey residential apartment building,/.test(pLow), 'Ç5: inFrame=2 → tekil "a building" öznesi GİRMEZ');
chk(/stays cropped by the edge/.test(pLow), 'Ç5: cropped=true → kırpılmayı koru cümlesi');
chk(/do not add any building that is not in the input/.test(pLow), 'Ç5: cropped=true → uydurma blok yasağı (ext2 üç-blok hatası)');
// LOCK + cephe + kapanış cümleleri kadrajlı yolda da AYNEN durur (C5-R dersi: LOCK ayrı ve dokunulmaz)
chk(/EXACTLY as in the input/.test(pLow), 'Ç5: kadrajlı yolda LOCK cümlesi KORUNUR');
chk(/NEWLY BUILT and well maintained/.test(pLow), 'Ç5: kadrajlı yolda "yeni yapılmış" çapası KORUNUR');
chk(/no people, no text/.test(pLow), 'Ç5: kadrajlı yolda kapanış (no people/text) KORUNUR');
chk(/Facade material:/.test(pLow), 'Ç5: kadrajlı yolda cephe malzemesi KORUNUR');

const pAer = run(`window.View3D.buildExteriorPrompt({facade:'neutral', framing:{view:'aerial', inFrame:1, cropped:false, total:1}})`);
chk(/aerial drone perspective looking down/.test(pAer), 'Ç5: view=aerial → "aerial looking down" cümlesi');
chk(/of a \d+-storey residential apartment building/.test(pAer), 'Ç5: inFrame=1 → özne TEKİL ("a building")');
chk(!/stays cropped by the edge/.test(pAer), 'Ç5: cropped=false → kırpma cümlesi GİRMEZ');

const pElev = run(`window.View3D.buildExteriorPrompt({facade:'neutral', framing:{view:'elevated', inFrame:3, cropped:false, total:3}})`);
chk(/just above roof height/.test(pElev), 'Ç5: view=elevated → "çatı üstü" cümlesi');
chk(/3 \d+-storey residential apartment blocks/.test(pElev), 'Ç5: inFrame=3 → özne "3 blocks"');

/* ---- 3) SÖZLEŞME: cam/framing YOKSA çıktı BYTE-AYNI (geriye dönük) ---- */
const pOld = run(`window.View3D.buildExteriorPrompt({facade:'neutral'})`);
chk(/of a \d+-storey residential apartment building, aerial drone perspective looking down at an angle/.test(pOld),
  'Ç5 SÖZLEŞME: framing/cam yoksa ESKİ sabit metin (byte-aynı) döner');
chk(!/almost level|stays cropped by the edge|two \d+-storey/.test(pOld),
  'Ç5 SÖZLEŞME: kamerasız çağrıya kadraj cümlesi SIZMAZ');
// creative dalı Ç5'ten etkilenmez (A2/A3 sözleşmesi)
const pCreat = run(`window.View3D.buildExteriorPrompt({facade:'neutral', creative:true, framing:{view:'low', inFrame:2, cropped:true, total:2}})`);
chk(/creatively interpret/.test(pCreat) && !/almost level/.test(pCreat),
  'Ç5 SÖZLEŞME: creative dalı kadrajdan ETKİLENMEZ (A2/A3 aynen)');

function report(){
  console.log('\nDRONE-KADRAJ (Ç5): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
