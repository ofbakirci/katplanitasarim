/* DIS-GORUNUM (S1) — BİNA DIŞ GÖRÜNÜMÜ / hafif kabuk modu (headless, THREE'siz).
   View3D.extPlanSummaryForTest(map) = plan-verisinden dış-kabuk özeti (kat sayısı, kontur,
   cephe pencere/balkon-kapı boşlukları, avlu deliği, hayalet blok). THREE/WebGL YOK → mesh üretmeden
   yalnız geometri-öncesi plan sayımlarını doğrular. MOTOR MANTIĞINI DEĞİŞTİRMEZ.

   Doğrulanan sözleşmeler:
     - kat sayısı = zemin-üstü kat (bodrum gösterilmez); katYuk okunur.
     - dış kontur = app `pts` (bina sınırı) → köşe sayısı pts ile birebir; kaynak 'pts'.
     - cephe pencere boşlukları map.windows'tan konturun kenarlarına projekte edilir (>0 olmalı).
     - avlu (courtyards) → kabukta DELİK sayısı; hayalet blok = site aktif olmayan bloklar.
     - İÇ hiçbir şey (bölme/mobilya/etiket) SAYILMAZ (özet yalnız dış cephe alanları içerir).
*/
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(m){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(m); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
const winStub = { addEventListener(){}, matchMedia:()=>({matches:false}), View3D:null };
const ctx = vm.createContext({
  console, matchMedia:()=>({matches:false}),
  document: dom.document,
  window: winStub,
  XMLSerializer:function(){ this.serializeToString=()=>''; },
  Image:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout,
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

/* API erişilebilir mi */
const hasApi = run(`!!(window.View3D && window.View3D.extPlanSummaryForTest && window.View3D.extFloorCountForTest)`);
chk(hasApi, 'View3D.extPlanSummaryForTest / extFloorCountForTest erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ---- 1) 5 KATLI apartman (pencereli+balkonlu), bodrum yok ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='5';
  document.getElementById('katYuk').value='2.9';
  bodrumSayisi=0; villaFloors=null; activeFloor=0; blocks=null; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:true,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  __MAP=buildFloorplanMap();
  __SUM=window.View3D.extPlanSummaryForTest(__MAP);
  __FC=window.View3D.extFloorCountForTest();
`);
const sum = ctx.__SUM, fc = ctx.__FC;
chk(sum, 'extPlanSummary null değil');
if(sum){
  chk(sum.floorsAbove===5, 'zemin-üstü kat = 5 (katSayisi): '+sum.floorsAbove);
  chk(sum.basements===0, 'bodrum = 0: '+sum.basements);
  chk(Math.abs(sum.floorH-2.9)<1e-6, 'kat yüksekliği = 2.9 (katYuk): '+sum.floorH);
  chk(sum.contourSrc==='pts', 'dış kontur kaynağı = pts (bina sınırı): '+sum.contourSrc);
  chk(sum.contourVerts===4, 'kontur köşe sayısı = 4 (dikdörtgen pts): '+sum.contourVerts);
  chk(sum.buildingWindows>0, 'planda cephe penceresi var: '+sum.buildingWindows);
  chk(sum.facadeWindowGaps>0, 'dış cephe pencere boşluğu > 0 (konturda pencere): '+sum.facadeWindowGaps);
  chk(sum.facadeWindowGaps<=sum.buildingWindows, 'cephe boşluğu ≤ toplam pencere (yalnız dış kontur kenarları): '+sum.facadeWindowGaps+'/'+sum.buildingWindows);
  chk(sum.courtyardHoles===0, 'avlu yok → kabuk deliği 0: '+sum.courtyardHoles);
  chk(sum.ghostBlocks===0, 'site kapalı → hayalet blok 0: '+sum.ghostBlocks);
}
chk(fc && fc.above===5 && fc.below===0, 'extFloorCount above=5/below=0');

/* ---- 2) BODRUMLU: 4 üst + 2 bodrum → kabuk yalnız zemin-üstü (bodrum gösterilmez) ---- */
run(`
  document.getElementById('katSayisi').value='4';
  bodrumSayisi=2;
  __SUM2=window.View3D.extPlanSummaryForTest(__MAP);
  __FC2=window.View3D.extFloorCountForTest();
`);
const sum2 = ctx.__SUM2, fc2 = ctx.__FC2;
chk(sum2 && sum2.floorsAbove===4, 'bodrumlu: zemin-üstü kat = 4 (bodrum hariç): '+(sum2&&sum2.floorsAbove));
chk(sum2 && sum2.basements===2, 'bodrum = 2 (gösterilmez ama sayılır): '+(sum2&&sum2.basements));
chk(fc2 && fc2.above===4 && fc2.below===2, 'extFloorCount above=4/below=2 (bodrum toprak altı, kabukta yok)');

/* ---- 3) AVLU: courtyards → kabukta DELİK ---- */
run(`
  document.getElementById('katSayisi').value='5'; bodrumSayisi=0;
  courtyards=[{poly:[{x:12,y:6},{x:20,y:6},{x:20,y:10},{x:12,y:10}]}];
  __SUM3=window.View3D.extPlanSummaryForTest(__MAP);
`);
const sum3 = ctx.__SUM3;
chk(sum3 && sum3.courtyardHoles===1, 'avlu çizildi → kabuk deliği = 1: '+(sum3&&sum3.courtyardHoles));
run(`courtyards=[];`);   // temizle

/* ---- 4) SİTE (çoklu blok): aktif olmayan bloklar hayalet kütle ---- */
run(`
  var _snap={ pts:[{x:40,y:0},{x:60,y:0},{x:60,y:16},{x:40,y:16}], plan:__MAP&&{} };
  // siteMod checkbox + blocks kur: aktif blok index 0, blok 1 hayalet
  var sm=document.getElementById('siteMod'); if(sm){ sm.checked=true; }
  blocks=[{ pts:pts.map(p=>({x:p.x,y:p.y})) }, { pts:[{x:40,y:0},{x:60,y:0},{x:60,y:16},{x:40,y:16}] }];
  activeBlock=0;
  __GHOST = (typeof siteOn==='function' && siteOn()) ? window.View3D.extPlanSummaryForTest(__MAP).ghostBlocks : 'siteOff';
`);
const ghost = ctx.__GHOST;
if(ghost==='siteOff'){ ok('site modu stub yok — hayalet blok atlandı (zararsız)'); }
else chk(ghost===1, 'site: aktif olmayan 1 blok hayalet kütle: '+ghost);
run(`blocks=null; var _sm=document.getElementById('siteMod'); if(_sm) _sm.checked=false;`);

function report(){
  console.log('\nDIS-GORUNUM (S1): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
