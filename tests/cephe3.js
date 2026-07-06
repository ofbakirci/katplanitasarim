/* CEPHE-3 — dış kabuk mimari artikülasyonu (çıkma / çatı / cephe-detay prompt) HEADLESS testi.
   THREE/WebGL YOK → SALT-VERİ + saf-matematik doğrulanır (mesh/geometri yolu preview'de kanıtlanır):
     Ç1 ÇIKMA: offsetPolygon dışa-ofset matematiği (dikdörtgen büyür, alan artar, avlu ters) +
       çıkma/çatı state roundtrip (stateSnapshot.ui → restoreState, blok/kat başına).
     Ç3 ÇATI: roofType state roundtrip + sahne envanteri "hipped tile roof" olgusu.
     Ç4 PROMPT: sadakat prompt cephe-detay cümlesi (LOCK cümlesine DOKUNMADAN) + yaratıcı envanter
       çıkma/çatı olgusu ("projecting upper floors" / "hipped tile roof"); LOCK/RESTYLE ayrımı korunur.
   MOTOR MANTIĞINI DEĞİŞTİRMEZ (plan üretimi byte-aynı — snapshot-regression ayrı doğrular).

   Kullanım: node tests/cephe3.js */
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
const hasApi = run(`!!(window.View3D && window.View3D.offsetPolygonForTest && window.View3D.buildExteriorPrompt && window.View3D.buildSceneInventory)`);
chk(hasApi, 'View3D CEPHE-3 API (offsetPolygon + prompt + envanter) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ═══ Ç1: ÇIKMA OFSET MATEMATİĞİ (offsetPolygon) ═══════════════════════════════════════ */
// 1) dikdörtgen dışa-ofset d=1 → her kenar 1m dışarı, bbox her yönde +1 (10×6 → 12×8)
const rect = [[0,0],[10,0],[10,6],[0,6]];
const off1 = run(`window.View3D.offsetPolygonForTest(${JSON.stringify(rect)}, 1, false)`);
chk(Array.isArray(off1) && off1.length===4, 'offset dikdörtgen 4 köşe döndürür');
if(off1 && off1.length===4){
  let mnx=1e9,mnz=1e9,mxx=-1e9,mxz=-1e9;
  off1.forEach(p=>{ mnx=Math.min(mnx,p[0]); mnz=Math.min(mnz,p[1]); mxx=Math.max(mxx,p[0]); mxz=Math.max(mxz,p[1]); });
  chk(Math.abs(mnx-(-1))<1e-6 && Math.abs(mnz-(-1))<1e-6, 'çıkma: sol-alt köşe (-1,-1) (dışa-ofset): '+mnx+','+mnz);
  chk(Math.abs(mxx-11)<1e-6 && Math.abs(mxz-7)<1e-6, 'çıkma: sağ-üst köşe (11,7) (dışa-ofset): '+mxx+','+mxz);
  // alan büyüdü (çıkma = dışa taşma)
  const areaOf=poly=>{ let a=0; for(let i=0;i<poly.length;i++){ const p=poly[i],q=poly[(i+1)%poly.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a)/2; };
  chk(areaOf(off1) > areaOf(rect), 'çıkma: ofset poligon alanı BÜYÜR (dışa taşma): '+areaOf(off1)+' > '+areaOf(rect));
}
// 2) d=0 → değişmez (kimlik)
const off0 = run(`window.View3D.offsetPolygonForTest(${JSON.stringify(rect)}, 0, false)`);
chk(JSON.stringify(off0)===JSON.stringify(rect.map(p=>[p[0],p[1]])) || (off0.length===4), 'çıkma d=0: poligon değişmez (kimlik)');
// 3) L-plan (içbükey köşeli) → hâlâ kapalı poligon (köşe sayısı korunur), taşma tutarlı
const Lplan = [[0,0],[12,0],[12,4],[6,4],[6,10],[0,10]];
const offL = run(`window.View3D.offsetPolygonForTest(${JSON.stringify(Lplan)}, 1, false)`);
chk(Array.isArray(offL) && offL.length===Lplan.length, 'çıkma: L-plan ofset köşe sayısı korunur (kapalı): '+(offL&&offL.length));
// 4) avlu deliği (inward=true) → delik KÜÇÜLÜR = üst kat duvarı avlu boşluğuna doğru öne gelir (çıkma avluya taşar)
const court = [[2,2],[6,2],[6,5],[2,5]];
const offC = run(`window.View3D.offsetPolygonForTest(${JSON.stringify(court)}, 1, true)`);
if(offC && offC.length===4){
  const areaOf=poly=>{ let a=0; for(let i=0;i<poly.length;i++){ const p=poly[i],q=poly[(i+1)%poly.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a)/2; };
  const aC=areaOf(court), aOff=areaOf(offC);
  chk(aOff<aC, 'çıkma: avlu deliği (inward) ofsetlenince KÜÇÜLÜR (üst kat duvarı avlu boşluğuna öne gelir): '+aOff+' < '+aC);
}

/* ═══ Ç1/Ç3: ÇIKMA + ÇATI STATE ROUNDTRIP (stateSnapshot.ui → restoreState) ═══════════════ */
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
// varsayılan: çıkma kapalı + teras
chk(run(`typeof cikmaOn!=='undefined' && cikmaOn===false`), 'Ç1: cikmaOn varsayılan KAPALI');
chk(run(`typeof roofType!=='undefined' && roofType==='teras'`), 'Ç3: roofType varsayılan teras');
// çıkma aç + kırma çatı + snapshot al
run(`cikmaOn=true; cikmaD=1.2; roofType='kirma'; __ST=stateSnapshot(false);`);
const st = ctx.__ST;
chk(st && st.ui && st.ui.cikmaOn==='1', 'Ç1: snapshot.ui.cikmaOn="1" (çıkma açık kaydı): '+(st&&st.ui&&st.ui.cikmaOn));
chk(st && st.ui && parseFloat(st.ui.cikmaD)===1.2, 'Ç1: snapshot.ui.cikmaD=1.2: '+(st&&st.ui&&st.ui.cikmaD));
chk(st && st.ui && st.ui.roofType==='kirma', 'Ç3: snapshot.ui.roofType=kirma: '+(st&&st.ui&&st.ui.roofType));
// sıfırla → restoreState geri yükler
run(`cikmaOn=false; cikmaD=0.7; roofType='teras'; restoreState(__ST,{fit:false});`);
chk(run(`cikmaOn===true`), 'Ç1: restoreState çıkma açık geri yükledi');
chk(run(`Math.abs(cikmaD-1.2)<1e-6`), 'Ç1: restoreState çıkma derinliği (1.2) geri yükledi: '+run(`cikmaD`));
chk(run(`roofType==='kirma'`), 'Ç3: restoreState kırma çatı geri yükledi');
// çıkma derinliği REG.cikmaMax ile sınırlı (aşırı değer clamp)
run(`cikmaOn=true; cikmaD=99; __ST2=stateSnapshot(false); cikmaD=0.7; roofType='teras'; restoreState(__ST2,{fit:false});`);
chk(run(`cikmaD <= (REG.cikmaMax||1.5)+1e-6`), 'Ç1: çıkma derinliği REG.cikmaMax ile clamp\'lenir: '+run(`cikmaD`));
// eski kayıt (ui'de çıkma/çatı YOK) → varsayılan (geri-uyum)
run(`
  var _old=JSON.parse(JSON.stringify(__ST)); delete _old.ui.cikmaOn; delete _old.ui.cikmaD; delete _old.ui.roofType;
  cikmaOn=true; roofType='kirma'; restoreState(_old,{fit:false});
`);
chk(run(`cikmaOn===false && roofType==='teras'`), 'Ç1/Ç3: eski kayıt (alan yok) → varsayılan teras/kapalı (geri-uyum)');

/* ═══ Ç4: SADAKAT PROMPT — cephe-detay cümlesi (LOCK cümlesine DOKUNMADAN) ═══════════════ */
const pF = run(`window.View3D.buildExteriorPrompt({facade:'neutral'})`);
chk(/EXACTLY/.test(pF), 'Ç4: sadakat prompt LOCK ("EXACTLY") KORUNUR');
chk(/do not move, add or remove any window, balcony or floor/i.test(pF), 'Ç4: sadakat LOCK cümlesi bozulmadı');
chk(/realistic facade detailing that does not change the massing/i.test(pF), 'Ç4: cephe-detay zenginleştirme cümlesi EKLENDİ');
chk(/window reveals and sills/i.test(pF) && /balcony railings/i.test(pF), 'Ç4: söve/denizlik + korkuluk detayı');
chk(/roof edge and drip details/i.test(pF), 'Ç4: çatı kenar/damla detayı');
chk(/discreet AC units/i.test(pF), 'Ç4: gizli klima detayı');
chk(/no people, no text/i.test(pF), 'Ç4: no people/text korunur');
// cephe-detay cümlesi LOCK ile ÇELİŞMEZ (as long as ... moved/added/removed disiplini)
chk(/as long as no window, balcony or floor is moved, added or removed/i.test(pF), 'Ç4: detay cümlesi LOCK disiplinine bağlı (massing dokunulmaz)');

/* ═══ Ç4: YARATICI ENVANTER — çıkma / çatı olgusu ═══════════════════════════════════════ */
// düz teras + çıkma yok (varsayılan olgu)
const invFlat = run(`window.View3D.buildSceneInventory({facade:'neutral', blocks:[{floors:5}], roof:'teras', cikma:false})`);
chk(/flat terrace roof/i.test(invFlat), 'Ç3: teras seçiliyken envanter "flat terrace roof"');
chk(!/hipped/i.test(invFlat), 'Ç3: teras seçiliyken "hipped" YOK');
chk(!/project outward/i.test(invFlat), 'Ç1: çıkma yokken "project outward" YOK');
// kırma çatı + çıkma açık → olgular envantere girer
const invHip = run(`window.View3D.buildSceneInventory({facade:'neutral', blocks:[{floors:5}], roof:'kirma', cikma:true})`);
chk(/hipped tile roof/i.test(invHip), 'Ç3: kırma çatı seçiliyken envanter "hipped tile roof": '+invHip.slice(0,80));
chk(/upper floors project outward/i.test(invHip), 'Ç1: çıkma açıkken envanter "upper floors project outward"');
chk(invFlat!==invHip, 'Ç1/Ç3: teras/düz vs kırma/çıkma FARKLI envanter üretir');
// yaratıcı prompt bu envanteri ÇAPA olarak taşır (LOCK gevşer ama olgu bağlanır)
const pCreat = run(`window.View3D.buildExteriorPrompt({facade:'neutral', creative:true, blocks:[{floors:5}], roof:'kirma', cikma:true})`);
chk(/hipped tile roof/i.test(pCreat), 'Ç4: yaratıcı prompt çatı olgusunu (hipped tile roof) taşır');
chk(/project outward/i.test(pCreat), 'Ç4: yaratıcı prompt çıkma olgusunu (project outward) taşır');
chk(!/EXACTLY/.test(pCreat), 'Ç4: yaratıcı prompt katı LOCK ("EXACTLY") İÇERMEZ (Sadakat envanter-bayrağı ayrımı)');
// SADAKAT envanteri çıkma/çatı bayrağını İÇERMEZ (img2img kütleyi zaten gösterir; envanter kapalı)
chk(!/hipped tile roof|project outward/i.test(pF), 'Ç4: SADAKAT prompt envanter olgusu (çıkma/çatı bayrağı) taşımaz — bayrak KAPALI');

function report(){
  console.log('\nCEPHE-3 (Ç1 çıkma + Ç3 çatı + Ç4 prompt): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
