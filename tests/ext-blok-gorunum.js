/* EXT-BLOK-GORUNUM (İş 3) — extBlockView KORUMA: getExtBlockView/setExtBlockView PUBLIC API (headless, THREE'siz).
   Kök neden (kanıtlı): buildScene (view3d.js ~1245) HER rebuildFromEngine çağrısında extBlockView'i null'a
   (varsayılana) resetler. mesken/02_PROTOTIP captureRenderFrames'in İş 2 blok döngüsü (her switchBlock'ta
   rebuildFromEngine çağırır) bu resetı TEKRARLAR — kullanıcının F4 "Tümü"/tek-blok GÖRÜNTÜ seçimi sessizce
   kaybolurdu. Düzeltme: View3D.getExtBlockView()/setExtBlockView(v) public API, prototip'te
   başta-oku/sonra-geri-uygula deseniyle.

   THREE/WebGL YOK → exteriorMode gerçekten AÇILAMAZ (setExteriorMode scene ister, headless'ta scene=null) →
   genuine setExtBlockView REBUILD yolu burada test edilmez (preview'de kanıtlanır). Bu dosya headless-test
   edilebilir yüzeyi doğrular: (a) getExtBlockView ham extBlockView state'ini extBlockViewForTest ile PAYLAŞIR
   (ayrı/gölge state YOK), (b) buildScene'in S1 resetini extBlockViewForTest(null) ile simüle eder, (c) public
   setExtBlockView'in "exteriorMode kapalıyken no-op" guard'ı KORUNUYOR (mevcut F4 sözleşmesi kırılmadı).

   Kullanım: node tests/ext-blok-gorunum.js */
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

const hasApi = run(`!!(window.View3D && window.View3D.extBlockViewForTest && window.View3D.getExtBlockView && window.View3D.setExtBlockView)`);
chk(hasApi, 'View3D.extBlockViewForTest + getExtBlockView/setExtBlockView (İş3a) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ---- kurulum: 2-bloklu site (dis-gorunum.js F4 fixture'ıyla aynı desen) ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='5';
  document.getElementById('katYuk').value='2.9';
  bodrumSayisi=0; villaFloors=null; activeFloor=0; blocks=null; courtyards=[];
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  var sm=document.getElementById('siteMod'); if(sm){ sm.checked=true; }
  blocks=[{ pts:pts.map(function(p){return {x:p.x,y:p.y};}), ui:{katSayisi:'5',katYuk:'2.9'}, plan:{} },
          { pts:[{x:40,y:0},{x:60,y:0},{x:60,y:16},{x:40,y:16}], ui:{katSayisi:'4',katYuk:'2.9'}, plan:{} }];
  activeBlock=0;
`);

/* ---- 1) extBlockViewForTest('all') → getExtBlockView TEK KAYNAKTAN okur (ayrı/gölge state yok) ---- */
run(`window.View3D.extBlockViewForTest('all');`);
chk(run(`window.View3D.getExtBlockView()`)==='all', "İş3a: extBlockViewForTest('all') sonrası getExtBlockView()==='all'");
// extOtherBlocks() aktif bloğu (0) hariç tutar (o zaten ana yoldan tam kurulur — dis-gorunum.js F4 ile aynı
//   sözleşme) → 2 bloklu sitede 'all' ile fulls=[1] (yalnız AKTİF-OLMAYAN blok), ghosts=[] beklenir.
const clsAll = run(`window.View3D.extBlockViewForTest(undefined)`);   // sadece OKU (set etmeden) — sınıflamayı doğrula
chk(clsAll && clsAll.view==='all' && clsAll.activeIsFull===true && clsAll.fulls.length===1 && clsAll.ghosts.length===0,
    "İş3a: 'all' sınıflaması — aktif-olmayan blok da tam, hayalet yok: "+JSON.stringify(clsAll));

/* ---- 2) belirli blok (1) seç → getExtBlockView aynı ham değeri okur ---- */
run(`window.View3D.extBlockViewForTest(1);`);
chk(run(`window.View3D.getExtBlockView()`)===1, 'İş3a: extBlockViewForTest(1) sonrası getExtBlockView()===1');

/* ---- 3) S1 buildScene RESET SİMÜLASYONU: buildScene ~1245 extBlockView'i null'lar (THREE gerektirir,
   headless'ta genuine buildScene çağrılamaz) — extBlockViewForTest(null) AYNI ETKİYİ (ham state=null) verir. ---- */
run(`window.View3D.extBlockViewForTest(null);`);
chk(run(`window.View3D.getExtBlockView()`)===null, 'İş3a: reset simülasyonu sonrası getExtBlockView()===null (S1 varsayılanı)');
const clsDef = run(`window.View3D.extBlockViewForTest(undefined)`);
chk(clsDef && clsDef.activeIsFull===true && clsDef.fulls.length===0 && clsDef.ghosts.length===1,
    'İş3a: null (varsayılan) sınıflaması — aktif blok tam + diğeri hayalet: '+JSON.stringify(clsDef));

/* ---- 4) GUARD: exteriorMode headless'ta GERÇEKTEN açılamaz (scene yok) → public setExtBlockView NO-OP.
   "exteriorMode kapalıyken set no-op — mevcut guard korunur" (İş3a) regresyonu burada yakalanır: guard
   kaldırılırsa bu testler THREE olmadan çökerdi/extBlockView'i sessizce değiştirirdi. ---- */
chk(run(`window.View3D.isExteriorMode()`)===false, 'ön-koşul: exteriorMode kapalı (headless, scene yok — gerçek açılış imkansız)');
run(`window.View3D.setExtBlockView('all');`);
chk(run(`window.View3D.getExtBlockView()`)===null, "İş3a: exteriorMode kapalıyken public setExtBlockView('all') GUARD'LI NO-OP (hâlâ null)");
run(`window.View3D.setExtBlockView(2);`);
chk(run(`window.View3D.getExtBlockView()`)===null, 'İş3a: exteriorMode kapalıyken setExtBlockView(2) de NO-OP (hâlâ null)');
run(`window.View3D.setExtBlockView(null);`);
chk(run(`window.View3D.getExtBlockView()`)===null, 'İş3a: setExtBlockView(null) NO-OP ama parametre tipi olarak KABUL edilir (atmaz) — "null da geçerli değer"');

/* ---- temizle ---- */
run(`window.View3D.extBlockViewForTest(null); blocks=null; var _sm=document.getElementById('siteMod'); if(_sm) _sm.checked=false;`);

function report(){
  console.log('\nEXT-BLOK-GORUNUM (İş 3): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
