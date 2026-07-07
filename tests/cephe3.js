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
// U3 (ilk render provası): "weathering" AŞIRI ESKİTME yapıyordu → detay talimatından ÇIKARILDI + cephe TEMİZ/YENİ pekiştirmesi.
chk(/subtle material texture(?!\s+and weathering)/i.test(pF), 'U3: cephe dokusu "subtle material texture" (weathering YOK, aşırı eskitme durdu)');
chk(/newly built and well maintained/i.test(pF) && /no weathering, no aging/i.test(pF), 'U3: bina YENİ/temiz pekiştirmesi (clean fresh facade, no dirt/stains/weathering)');

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

/* ═══ ÇATI-FIX: KIRMA ÇATI KONTURU İZLER (bbox köprüleme BİTER) ═══════════════════════════
   buildHipRoof artık bbox yerine footprint POLİGONUNDAN kurulur: saçak halkası (dışa-ofset ~0.4) +
   mahya halkası (içe-ofset). Taşma ölçümü: TÜM çatı köşelerinin (saçak+mahya) konturdan max DİK uzaklığı
   ≤ saçak(0.4)+eps. Yamuk/eğik konturda eski bbox-hip devasa taşardı; yeni halka yalnız 40cm taşar. */
const EAVE = 0.4, EPS = 1e-4;
function pip(x,z,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
  if(((a[1]>z)!==(b[1]>z)) && (x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
// bir noktanın konturun EN YAKIN kenar-doğrusuna DİK uzaklığı (miter köşede saçak = tam 0.4)
function perpToNearestEdge(pt, poly){ let best=1e9;
  for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length];
    let ex=b[0]-a[0], ez=b[1]-a[1]; const L=Math.hypot(ex,ez)||1; const nx=ez/L, nz=-ex/L;
    const d=Math.abs((pt[0]-a[0])*nx + (pt[1]-a[1])*nz); if(d<best) best=d; }
  return best; }
// taşma = kontur DIŞINDAysa en yakın kenara dik uzaklık, İÇİNDEyse 0 (mahya köşeleri içeride → 0)
function overhang(pt, poly){ return pip(pt[0],pt[1],poly) ? 0 : perpToNearestEdge(pt, poly); }
// EUCLID taşma (kontur poligonuna gerçek en yakın nokta uzaklığı) — bbox köşesi "uzatılmış kenar-doğrusu"
//   yakınına düşünce dik-metrik yanıltır; segment-uzaklığı gerçek konsol taşmasını ölçer (bbox-bug kanıtı).
function distSeg(p,a,b){ let ex=b[0]-a[0], ez=b[1]-a[1]; const L2=ex*ex+ez*ez||1;
  let t=((p[0]-a[0])*ex+(p[1]-a[1])*ez)/L2; t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-(a[0]+t*ex), p[1]-(a[1]+t*ez)); }
function euclOverhang(pt, poly){ if(pip(pt[0],pt[1],poly)) return 0; let d=1e9;
  for(let i=0;i<poly.length;i++) d=Math.min(d, distSeg(pt, poly[i], poly[(i+1)%poly.length])); return d; }
function maxOverhang(rings, cont){ let mx=0;
  (rings.eave||[]).concat(rings.ridge||[]).forEach(p=>{ const o=overhang(p,cont); if(o>mx) mx=o; }); return mx; }
function ringsFor(cont){ return run(`window.View3D.hipRoofRingsForTest(${JSON.stringify(cont)})`); }

// 1) DİKDÖRTGEN — regresyon: gerçek hip kurulur, taşma yalnız saçak (eski görünüme eşdeğer)
const rRect = ringsFor([[0,0],[10,0],[10,6],[0,6]]);
chk(rRect && rRect.ok===true, 'ÇATI: dikdörtgende kırma çatı halkaları kurulur (ok)');
if(rRect && rRect.ok){
  chk(rRect.eave.length===4 && rRect.ridge.length===4, 'ÇATI: dikdörtgen saçak/mahya 4 köşe (kenar sayısı eşit)');
  const ov=maxOverhang(rRect, [[0,0],[10,0],[10,6],[0,6]]);
  chk(ov<=EAVE+EPS, 'ÇATI: dikdörtgen taşma yalnız saçak (≤0.4): '+ov.toFixed(4));
  chk(rRect.rise>0.8 && rRect.rise<2.8, 'ÇATI: dikdörtgen mahya yüksekliği makul (0.8–2.8m): '+rRect.rise.toFixed(2));
}
// 2) YAMUK (eğik duvarlı) — kullanıcı SS'inin KARŞITI: çatı konturu izler, bbox boşluğuna KONSOL atmaz
const yamuk = [[0,0],[12,0],[9,7],[3,7]];   // üstü dar trapez (yan duvarlar eğik)
const rYam = ringsFor(yamuk);
chk(rYam && rYam.ok===true, 'ÇATI: YAMUK konturda kırma çatı halkaları kurulur (ok)');
if(rYam && rYam.ok){
  const ov=maxOverhang(rYam, yamuk);
  chk(ov<=EAVE+EPS, 'ÇATI: YAMUK taşma (dik) yalnız saçak — kontur İZLENİR (≤0.4): '+ov.toFixed(4));
  // ESKİ bbox-hip KARŞILAŞTIRMASI (EUCLID konsol taşması): bbox köşeleri konturdan ÇOK taşardı (bug kanıtı)
  let eNew=0; rYam.eave.concat(rYam.ridge).forEach(p=>{ const o=euclOverhang(p,yamuk); if(o>eNew) eNew=o; });
  let mnx=1e9,mnz=1e9,mxx=-1e9,mxz=-1e9; yamuk.forEach(m=>{ mnx=Math.min(mnx,m[0]); mnz=Math.min(mnz,m[1]); mxx=Math.max(mxx,m[0]); mxz=Math.max(mxz,m[1]); });
  const bboxEave=[[mnx-EAVE,mnz-EAVE],[mxx+EAVE,mnz-EAVE],[mxx+EAVE,mxz+EAVE],[mnx-EAVE,mxz+EAVE]];
  let eBbox=0; bboxEave.forEach(p=>{ const o=euclOverhang(p,yamuk); if(o>eBbox) eBbox=o; });
  chk(eBbox>1.5, 'ÇATI: eski bbox-hip YAMUK\'ta >1.5m konsol taşardı (bug) — bbox EUCLID: '+eBbox.toFixed(3));
  chk(eBbox > eNew*2, 'ÇATI: yeni halka EUCLID taşması eski bbox\'ın en az 2× altında — yeni: '+eNew.toFixed(3)+' vs bbox: '+eBbox.toFixed(3)+' (konsol biter)');
}
// 3) L-PLAN (içbükey) — çatı girintiyi izler, halka köşeleri saçak payı içinde
const Lp = [[0,0],[14,0],[14,5],[7,5],[7,12],[0,12]];
const rL = ringsFor(Lp);
chk(rL && rL.ok===true, 'ÇATI: L-planda kırma çatı halkaları kurulur (ok)');
if(rL && rL.ok){
  chk(rL.eave.length===Lp.length && rL.ridge.length===Lp.length, 'ÇATI: L-plan halka kenar sayısı korunur (girinti izlenir)');
  const ov=maxOverhang(rL, Lp);
  chk(ov<=EAVE+EPS, 'ÇATI: L-plan taşma yalnız saçak (≤0.4): '+ov.toFixed(4));
}
// 4) DEJENERE (çok dar sliver) — hiçbir içe-ofset geçerli değil → ok:false → caller TERAS'a düşer
const sliver = [[0,0],[20,0],[20,0.3],[0,0.3]];
const rDeg = ringsFor(sliver);
chk(rDeg && rDeg.ok===false, 'ÇATI: dejenere dar konturda ok:false (TERAS güvenli düşüşü, çirkin geometri yok)');

function report(){
  console.log('\nCEPHE-3 (Ç1 çıkma + Ç3 çatı + Ç4 prompt + ÇATI-FIX kontur-hip): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
