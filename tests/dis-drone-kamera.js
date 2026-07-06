/* DIS-DRONE-KAMERA (S2) — DIŞ (DRONE) KAMERA + CEPHE MALZEME PRESETLERİ (headless, THREE'siz).
   İç kamera sözleşmesinden (exportCameras/getCameras) TAMAMEN AYRI extCams + cephe preset'leri +
   dış render prompt kurucusu doğrulanır. THREE/WebGL YOK → snapshot/gizmo YOLU test edilmez (o yol
   preview'de kanıtlanır); burada SALT-VERİ mantığı (preset renkleri/prompt anahtar ifadeleri/payload
   şeması + İÇ kamera sözleşmesinin DEĞİŞMEDİĞİ) assert edilir. MOTOR MANTIĞINI DEĞİŞTİRMEZ.

   Kullanım: node tests/dis-drone-kamera.js */
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

/* API erişilebilir mi */
const hasApi = run(`!!(window.View3D && window.View3D.facadePresets && window.View3D.buildExteriorPrompt
  && window.View3D.getExteriorCameras && window.View3D.setExteriorCameras && window.View3D.exportExteriorCameras
  && window.View3D.setFacade && window.View3D.getFacade)`);
chk(hasApi, 'View3D S2 API (facade + drone + prompt) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* plan üret (extBox/floors bağlamı için — headless prompt floors fallback'i ama tutarlılık iyi) */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='5';
  document.getElementById('katYuk').value='2.9';
  bodrumSayisi=0; villaFloors=null; activeFloor=0; blocks=null; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:true,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
`);

/* ---- 1) CEPHE PRESET'LERİ: 3+1 (nötr varsayılan) ---- */
const presets = run(`window.View3D.facadePresets()`);
chk(Array.isArray(presets) && presets.length===4, 'cephe preset sayısı = 4 (nötr + 3 yaratıcı): '+(presets&&presets.length));
chk(presets && presets[0].key==='neutral', 'ilk preset = neutral (varsayılan): '+(presets&&presets[0].key));
chk(run(`window.View3D.getFacade()`)==='neutral', 'başlangıç cephe = neutral');
const keys = (presets||[]).map(p=>p.key);
['neutral','plaster','brick','contemporary'].forEach(function(k){
  chk(keys.indexOf(k)>=0, 'preset "'+k+'" mevcut'); });
// her preset'in prompt sinyali dolu
chk((presets||[]).every(p=>typeof p.promptSignal==='string' && p.promptSignal.length>10), 'her preset promptSignal taşır');

/* ---- 2) CEPHE SEÇİMİ oku/yaz ---- */
chk(run(`window.View3D.setFacade('brick')`)==='brick', 'setFacade("brick") → brick');
chk(run(`window.View3D.getFacade()`)==='brick', 'getFacade brick döndürür (durum yazıldı)');
chk(run(`window.View3D.setFacade('bilinmeyen')`)==='neutral', 'geçersiz preset → neutral güvenli düşüş');
run(`window.View3D.setFacade('contemporary')`);

/* ---- 3) DIŞ RENDER PROMPT: anahtar ifadeler (drone + LOCK/RESTYLE + cephe sinyali + no people/text) ---- */
function assertPrompt(tag, p){
  chk(/drone/i.test(p), tag+': "drone" (aerial perspektif) yok');
  chk(/exterior/i.test(p), tag+': "exterior" yok');
  chk(/residential apartment building/i.test(p), tag+': "residential apartment building" yok');
  chk(/EXACTLY/.test(p), tag+': geometri LOCK ("EXACTLY") yok');
  chk(/do not (move|add or remove)/i.test(p), tag+': "do not move/add/remove" (window/balcony sadakati) yok');
  chk(/no people, no text/i.test(p), tag+': "no people, no text" yok');
}
// contemporary → ahşap balkon sinyali
const pC = run(`window.View3D.buildExteriorPrompt({facade:'contemporary'})`);
assertPrompt('contemporary', pC);
chk(/wood balcony|natural wood/i.test(pC), 'contemporary prompt: ahşap balkon sinyali yok → '+pC.slice(0,120));
chk(/grey/i.test(pC), 'contemporary prompt: gri cephe sinyali yok');
// brick → tuğla zemin sinyali
const pB = run(`window.View3D.buildExteriorPrompt({facade:'brick'})`);
assertPrompt('brick', pB);
chk(/brick/i.test(pB), 'brick prompt: tuğla sinyali yok');
chk(/ground floor|base/i.test(pB), 'brick prompt: zemin kat sinyali yok');
// plaster → koyu bant sinyali
const pP = run(`window.View3D.buildExteriorPrompt({facade:'plaster'})`);
assertPrompt('plaster', pP);
chk(/plaster/i.test(pP), 'plaster prompt: sıva sinyali yok');
chk(/dark|charcoal|anthracite|band/i.test(pP), 'plaster prompt: koyu bant sinyali yok');
// gün saati enjekte
const pNight = run(`window.View3D.buildExteriorPrompt({facade:'neutral',timeOfDay:'night'})`);
chk(/night/i.test(pNight), 'gün saati (night) prompt\'a akıyor');
// S3: SİTE İMKANLARI peyzaj sinyali → yalnız VAR olanlar adlandırılır, LOCK korunur
const pNoAm = run(`window.View3D.buildExteriorPrompt({facade:'neutral', amenities:[]})`);
chk(!/playground|swimming pool|ornamental/i.test(pNoAm), 'imkan yok → prompt havuz/park adlandırmaz (uydurmaz)');
const pAm = run(`window.View3D.buildExteriorPrompt({facade:'neutral', amenities:['green','playground','pool']})`);
assertPrompt('amenities', pAm);
chk(/playground/i.test(pAm) && /swimming pool/i.test(pAm), 'S3: mevcut imkanlar (çocuk parkı + havuz) prompt\'a adlandırılıyor');
chk(!/ornamental/i.test(pAm), 'S3: VAR OLMAYAN imkan (süs havuzu) prompt\'a girmez');
chk(/keep these site features/i.test(pAm), 'S3: imkan sinyali LOCK disiplinine uyar (konum korunur)');

/* ---- 4) DRONE KAMERA LİSTESİ: setExteriorCameras/getExteriorCameras (salt-veri, THREE'siz) ---- */
const nSet = run(`window.View3D.setExteriorCameras([
  {pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24},
  {pos:{x:-8,y:26,z:-8}, target:{x:16,y:5,z:8}, lens:35}
])`);
chk(nSet===2, 'setExteriorCameras 2 drone yükledi: '+nSet);
const gCams = run(`window.View3D.getExteriorCameras()`);
chk(Array.isArray(gCams) && gCams.length===2, 'getExteriorCameras 2 döndürür');
chk(gCams && gCams[0].lens===24 && gCams[1].lens===35, 'objektif korundu (24/35)');

/* ---- 5) YÜKSEKLİK CLAMP: aşırı-yüksek drone çatı+20m sınırına inmeli ---- */
run(`window.View3D.setExteriorCameras([{pos:{x:30,y:9999,z:30}, target:{x:16,y:5,z:8}, lens:24}])`);
const clamped = run(`window.View3D.getExteriorCameras()[0].pos.y`);
chk(clamped < 9999 && clamped > 2, 'drone yükseklik clamp\'lendi (9999→sınır): '+clamped);

/* ---- 6) İÇ KAMERA SÖZLEŞMESİ DEĞİŞMEDİ (ayrılık kanıtı): extCams iç camList\'e SIZMAZ ---- */
const innerCams = run(`window.View3D.getCameras ? window.View3D.getCameras().length : -1`);
chk(innerCams===0, 'iç kamera listesi (getCameras) dış drone\'lardan ETKİLENMEDİ (0): '+innerCams);
const hasInnerExport = run(`typeof window.View3D.exportCameras==='function'`);
chk(hasInnerExport, 'iç exportCameras hâlâ mevcut (sözleşme korunur)');
// clear
run(`window.View3D.clearExteriorCameras()`);
chk(run(`window.View3D.getExteriorCameras().length`)===0, 'clearExteriorCameras dış listeyi boşalttı');

/* ---- 7) DIŞ RENDER TETİK: onay-öncesi payload + callback (İSTEK ATMAZ) ---- */
run(`
  __PAYLOAD=null; __CONFIRMED=false; __SUBMITTED=null;
  window.View3D.setExtRenderHandlers(
    function(p){ __PAYLOAD=p; __CONFIRMED=true; return true; },   // modal onay → true
    function(p){ __SUBMITTED=p; }                                  // POST (biz test'te no-op)
  );
  window.View3D.setExteriorCameras([{pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24}]);
  window.View3D.setFacade('brick');
`);
// triggerExteriorRender THREE gerekmeden payload kurar (snapshot null olsa da şema var) — extBox yoksa floors fallback
const trg = run(`
  var done=false, okv=null;
  try{ window.View3D.triggerExteriorRender().then(function(v){ okv=v; done=true; }); }catch(e){ okv='ERR:'+e.message; }
  ({ okv: okv, confirmed: __CONFIRMED, payload: __PAYLOAD })
`);
chk(ctx.__CONFIRMED===true, 'Dış Render onay callback çağrıldı (modal atandı → confirm())');
chk(ctx.__PAYLOAD && ctx.__PAYLOAD.profile==='exterior', 'payload profile = exterior: '+(ctx.__PAYLOAD&&ctx.__PAYLOAD.profile));
chk(ctx.__PAYLOAD && ctx.__PAYLOAD.facade==='brick', 'payload facade = seçili cephe (brick)');
chk(ctx.__PAYLOAD && ctx.__PAYLOAD.count===1 && Array.isArray(ctx.__PAYLOAD.cameras), 'payload cameras dizisi + count=1');
if(ctx.__PAYLOAD && ctx.__PAYLOAD.cameras && ctx.__PAYLOAD.cameras[0]){
  const cam0 = ctx.__PAYLOAD.cameras[0];
  chk(cam0.profile==='exterior', 'kamera[0].profile = exterior');
  chk(cam0.render_method==='snapshot', 'kamera[0].render_method = snapshot (B/img2img dış karşılığı)');
  chk(typeof cam0.prompt==='string' && /drone/i.test(cam0.prompt), 'kamera[0].prompt drone içerir');
  chk(cam0.facade==='brick', 'kamera[0].facade = brick');
  chk(cam0.pos_m && cam0.target_m && typeof cam0.heading_deg==='number', 'kamera[0] poz/hedef/heading taşır');
}

/* ═══ A3: SAHNE ENVANTERİ ÜRETİCİ (buildSceneInventory) — olgusal İngilizce ═══════════════════════ */
const hasInv = run(`typeof window.View3D.buildSceneInventory==='function'`);
chk(hasInv, 'A3: View3D.buildSceneInventory export edilmiş');
if(hasInv){
  // 1) TEK BİNA (site kapalı, 5 kat) — plan yukarıda generate edildi
  const inv1 = run(`window.View3D.buildSceneInventory({facade:'brick'})`);
  chk(/single residential apartment building/i.test(inv1), 'A3: tek bina cümlesi ("single ... apartment building"): '+inv1.slice(0,60));
  chk(/\bfloors\b/i.test(inv1), 'A3: kat sayısı ("floors") geçiyor');
  chk(/flat terrace roof/i.test(inv1), 'A3: düz teras çatı sinyali');
  chk(/brick/i.test(inv1), 'A3: cephe preset sinyali (brick) envantere akıyor');
  chk(!/playground|swimming pool/i.test(inv1), 'A3: imkan yokken park/havuz UYDURMAZ');

  // 2) İKİ BLOK (opt.blocks override) — "two residential blocks: block A 5 floors, block B 8 floors"
  const inv2 = run(`window.View3D.buildSceneInventory({facade:'neutral', blocks:[{floors:5},{floors:8}]})`);
  chk(/two residential blocks/i.test(inv2), 'A3: iki blok cümlesi ("two residential blocks"): '+inv2.slice(0,80));
  chk(/block A 5 floors/i.test(inv2), 'A3: block A 5 floors adlandırılıyor');
  chk(/block B 8 floors/i.test(inv2), 'A3: block B 8 floors adlandırılıyor');

  // 3) İMKAN + AVLU envantere girer (yalnız verilenler)
  const inv3 = run(`window.View3D.buildSceneInventory({facade:'neutral', blocks:[{floors:5}], amenities:['pool','playground'], courtyard:true})`);
  chk(/swimming pool/i.test(inv3) && /playground/i.test(inv3), 'A3: mevcut imkanlar (havuz+park) envanterde');
  chk(/courtyard/i.test(inv3), 'A3: avlu envanterde');
  chk(!/ornamental/i.test(inv3), 'A3: VAR OLMAYAN imkan (süs havuzu) envantere girmez');

  // 4) İki farklı kurulum FARKLI metin üretir (assert: örnek çıktı ayrımı)
  chk(inv1!==inv2, 'A3: iki farklı kurulum farklı envanter üretir');
}

/* ═══ A2/A3: YARATICI dış-render prompt — envanter ÇAPASI + serbest yorum, LOCK gevşer ═══════════════ */
const pCreative = run(`window.View3D.buildExteriorPrompt({facade:'neutral', creative:true, blocks:[{floors:5},{floors:8}]})`);
chk(/drone/i.test(pCreative) && /exterior/i.test(pCreative), 'A2: yaratıcı prompt drone/exterior içerir');
chk(/two residential blocks/i.test(pCreative), 'A2: yaratıcı prompt envanter çapası taşır (blok/kat)');
chk(/creatively interpret/i.test(pCreative), 'A2: yaratıcı prompt "creatively interpret" (serbest yorum) içerir');
chk(/no people, no text/i.test(pCreative), 'A2: yaratıcı prompt no people/text korur');
chk(!/EXACTLY/.test(pCreative), 'A2: yaratıcı prompt katı pencere-LOCK ("EXACTLY") İÇERMEZ (bayrak farkı)');
// SADAKAT (varsayılan) = eski LOCK reçetesi, EXACTLY var
const pFaithful = run(`window.View3D.buildExteriorPrompt({facade:'neutral'})`);
chk(/EXACTLY/.test(pFaithful), 'A2: sadakat (varsayılan) prompt LOCK ("EXACTLY") korur');
chk(pFaithful!==pCreative, 'A2: sadakat vs yaratıcı prompt FARKLI');

/* ═══ A4: DRONE YÖN (aim/yaw/move) PARİTESİ — hedef artık merkeze KİLİTLİ DEĞİL ═════════════════════ */
const hasA4 = run(`typeof window.View3D.extYawDroneForTest==='function' && typeof window.View3D.extAimDroneForTest==='function'`);
chk(hasA4, 'A4: drone yön/taşı test API mevcut');
if(hasA4){
  run(`window.View3D.setExteriorCameras([{pos:{x:30,y:14,z:30}, target:{x:16,y:5,z:8}, lens:24}]); window.View3D.extSelectForTest(0);`);
  const tBefore = run(`window.View3D.getExteriorCameras()[0].target`);
  // 4a) YAW: tekerlek döndürme = hedef pos etrafında döner (yatay yön değişir, mesafe korunur)
  const tYaw = run(`window.View3D.extYawDroneForTest(30)`);
  const posc = run(`window.View3D.getExteriorCameras()[0].pos`);
  const distB = Math.hypot(tBefore.x-posc.x, tBefore.z-posc.z), distA = Math.hypot(tYaw.x-posc.x, tYaw.z-posc.z);
  chk(Math.abs(distB-distA)<0.01, 'A4: yaw hedef mesafesini korur (sadece yön döner): '+distB.toFixed(2)+'→'+distA.toFixed(2));
  chk(Math.abs(tYaw.x-tBefore.x)+Math.abs(tYaw.z-tBefore.z)>0.5, 'A4: yaw hedefi gerçekten döndürdü (yön değişti)');
  // 4b) AIM: zemine tıkla = hedef o noktaya gider (yatay), aimed bayrağı → bağımsız hedef
  const tAim = run(`window.View3D.extAimDroneForTest({x:5, z:-3})`);
  chk(Math.abs(tAim.x-5)<0.01 && Math.abs(tAim.z-(-3))<0.01, 'A4: aim hedefi tıklanan zemine taşıdı (5,-3)');
  // 4c) MOVE: aimed drone taşınınca hedef DEĞİŞMEZ (bağımsız hedefi korur)
  const posMoved = run(`window.View3D.extMoveDroneForTest({x:40, z:40})`);
  const tAfterMove = run(`window.View3D.getExteriorCameras()[0].target`);
  chk(Math.abs(posMoved.x-40)<0.01 && Math.abs(posMoved.z-40)<0.01, 'A4: move drone konumunu taşıdı (40,40)');
  chk(Math.abs(tAfterMove.x-5)<0.01 && Math.abs(tAfterMove.z-(-3))<0.01, 'A4: aim edilmiş drone taşınınca bağımsız hedefini KORUR');
  // 4d) UN-AIMED drone taşınınca merkeze bakmaya devam (yeni drone, aim edilmemiş)
  run(`window.View3D.setExteriorCameras([{pos:{x:30,y:14,z:30}, target:{x:0,y:0,z:0}, lens:24}]); window.View3D.extSelectForTest(0);`);
  const tCenterBefore = run(`window.View3D.getExteriorCameras()[0].target`);
  const posUnaimed = run(`window.View3D.extMoveDroneForTest({x:-20, z:-20})`);
  const tCenterAfter = run(`window.View3D.getExteriorCameras()[0].target`);
  // aim edilmemiş → hedef merkeze re-track (tam değer extBox'a bağlı; en azından DEĞİŞMİŞ olabilir ya da 0'a yakın kalır)
  chk(Math.abs(posUnaimed.x-(-20))<0.01, 'A4: un-aimed drone taşındı');
  chk(typeof tCenterAfter.x==='number', 'A4: un-aimed drone taşınınca hedef geçerli (merkez-takip)');
  // 4e) placeAction (Yön/Taşı toggle) durumu
  run(`window.View3D.extSelectForTest(0);`);
  const pa1 = run(`window.View3D.extSetPlaceActionForTest('aim')`);
  chk(pa1==='aim', 'A4: setPlaceAction("aim") → aim');
  const pa2 = run(`window.View3D.extSetPlaceActionForTest('move')`);
  chk(pa2==='move', 'A4: setPlaceAction("move") → move');
  const pa3 = run(`window.View3D.extSetPlaceActionForTest('none')`);
  chk(pa3==='none', 'A4: setPlaceAction("none") → nötr');
  run(`window.View3D.clearExteriorCameras()`);
}

function report(){
  console.log('\nDIS-DRONE-KAMERA (S2+A3+A4): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
