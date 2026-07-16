/* KAT-CEPHE-BLOK (İş K1) — DİĞER blokların dış cephesi kat-başına: veri hattı testi (headless, THREE'siz).
   Kök neden (kanıtlı): buildExterior "DİĞER BLOKLAR" dalı fMap'i yalnız bsnap.plan TOP-LEVEL'dan
   (o blok en son terk edildiğindeki TEK kat) türetip stackShell'e floorProtos'SUZ geçiyordu → o tek
   katın cephesi bloğun TÜM katlarına klonlanıyordu (canlı repro: B'nin zemini ticari → "Tümü"
   görünümünde B'nin 5 katı da penceresiz dükkân cephesi). Oysa blocks[i].floors = villaFloors.slice()
   (io.js stateSnapshot) her katın TAM ikizini zaten taşıyordu — kimse okumuyordu.
   Düzeltme zinciri: floorSigOfSnap (floorLayoutSig'in saf çekirdeği, app.js) + blockZeminIdxOf
   (zeminIdx'in snapshot ikizi, app.js) + extBlockFloorPlans (view3d.js — kat-başına kaynak seçimi;
   GERÇEK buildExterior others.fulls yolu ve extBlockFloorPlansForTest AYNI fonksiyonu kullanır).

   THREE/WebGL YOK → buildExtFloorGroup/stackShell mesh kısmı test edilmez (preview'de kanıtlanır);
   burada mesh-ÖNCESİ kaynak-seçim + imza + zemin-ofseti hattı assert edilir.

   Kullanım: node tests/kat-cephe-blok.js */
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
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true, alert:()=>{},
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

function report(){
  console.log('\nKAT-CEPHE-BLOK (İş K1): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`!!(window.View3D && window.View3D.extBlockFloorPlansForTest)`);
chk(hasApi, 'View3D.extBlockFloorPlansForTest erişilebilir');
const hasHelpers = run(`typeof floorSigOfSnap==='function' && typeof blockZeminIdxOf==='function' && typeof floorLayoutSig==='function'`);
chk(hasHelpers, 'floorSigOfSnap/blockZeminIdxOf app.js\'te tanımlı (window\'a da açık: '+run(`!!(window.floorSigOfSnap&&window.blockZeminIdxOf)`)+')');
if(!hasApi || !hasHelpers){ report(); process.exit(fail?1:0); }

/* ---- kurulum: 3 katlı apartman (bodrumsuz), katları ayrı planla açık (kat-cephe-grup.js fixture deseni) ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='3';
  document.getElementById('bodrumSayisi').value='0';
  bodrumSayisi=0; villaOffset=0;
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  document.getElementById('katAyri').checked=true;
  katKullanim='konut';
  villaFloors=new Array(totalFloors()).fill(null);
  activeFloor=zeminIdx();
  villaFloors[activeFloor]=stateSnapshot(true);
  villaFloors[1]=JSON.parse(JSON.stringify(villaFloors[0]));
  villaFloors[1].balconies=[{ ei:0, t0:4, t1:10, depth:1.5 }];
  villaFloors[1].doors={ ov:{ '__kat-cephe-blok-test__':{h:true,x:0,y:0} }, extra:[], hidden:{} };
  villaFloors[2]=JSON.parse(JSON.stringify(villaFloors[1]));
`);

/* ---- 1) floorSigOfSnap === floorLayoutSig (delege — davranış byte-aynı) ---- */
chk(run(`floorSigOfSnap(villaFloors[1])===floorLayoutSig(1)`), '(1) floorSigOfSnap(villaFloors[1]) === floorLayoutSig(1) (aktif blok, k!==activeFloor)');
chk(run(`floorSigOfSnap(villaFloors[2])===floorLayoutSig(2)`), '(1) floorSigOfSnap(villaFloors[2]) === floorLayoutSig(2)');
chk(run(`floorSigOfSnap(stateSnapshot(true))===floorLayoutSig(activeFloor)`), '(1) aktif kat: floorSigOfSnap(stateSnapshot(true)) === floorLayoutSig(activeFloor)');
chk(run(`floorSigOfSnap(null)===null && floorSigOfSnap({})===null`), '(1) plansız/boş snapshot → null (floorLayoutSig ziyaret-edilmemiş kuralıyla aynı)');
chk(run(`floorLayoutSig(1)!==floorLayoutSig(0) && floorLayoutSig(1)===floorLayoutSig(2)`), '(1) imza ayrımı korunur: sig(0)!==sig(1), sig(1)===sig(2) (kapı-ov farkı / birebir klon)');

/* ---- 2) blockZeminIdxOf: snapshot ui.bodrumSayisi → zemin ofseti ---- */
chk(run(`blockZeminIdxOf({ui:{bodrumSayisi:'2'}})`)===2, '(2) blockZeminIdxOf bodrumSayisi=\'2\' → 2');
chk(run(`blockZeminIdxOf({ui:{bodrumSayisi:'0'}})`)===0, '(2) bodrumsuz → 0');
chk(run(`blockZeminIdxOf({})===0 && blockZeminIdxOf(null)===0 && blockZeminIdxOf({ui:{}})===0`), '(2) eski/eksik kayıt (ui/alan yok) → 0 (güvenli düşüş)');

/* ---- 3) extBlockFloorPlansForTest: floors dizili snap → doğru k eşlemesi + has/sig ---- */
const snapA = run(`__SNAPA=stateSnapshot(false); __SNAPA`);   // floorsOn açık → katAyri + activeFloor + floors taşır
chk(!!snapA && snapA.katAyri===true && Array.isArray(snapA.floors) && snapA.floors.length===3,
    '(3) ön-koşul: stateSnapshot(false) floors dizisini taşıyor (blocks[i] biçimi): '+(snapA&&snapA.floors&&snapA.floors.length));
const plansA = run(`window.View3D.extBlockFloorPlansForTest(__SNAPA, 3)`);
chk(Array.isArray(plansA) && plansA.length===3, '(3) fFloors=3 → 3 giriş: '+(plansA&&plansA.length));
chk(plansA[0] && plansA[0].k===0 && plansA[1].k===1 && plansA[2].k===2, '(3) bodrumsuz blokta k eşlemesi 0/1/2: '+JSON.stringify(plansA.map(function(e){return e.k;})));
chk(plansA.every(function(e){ return e.has===true && e.sig!=null; }), '(3) her katın kaynağı VAR (has=true, sig dolu)');
const sigsLive = run(`[floorLayoutSig(0),floorLayoutSig(1),floorLayoutSig(2)]`);
chk(plansA[0].sig===sigsLive[0] && plansA[1].sig===sigsLive[1] && plansA[2].sig===sigsLive[2],
    '(3) kat imzaları canlı floorLayoutSig ile birebir (kaynak = floors[k] snapshot\'ı)');
chk(plansA[0].sig!==plansA[1].sig && plansA[1].sig===plansA[2].sig,
    '(3) zemin AYRI imza (balkonsuz), 1.-2. kat AYNI imza (tip-kat proto paylaşımı buradan): zemin!==üst, üst===üst');
chk(plansA.every(function(e){ return !('st' in e); }), '(3) ForTest çıktısı st (snapshot) alanını TAŞIMAZ (yalnız k/has/sig)');

/* ---- 4) floors'suz snap → hepsi has=false (mevcut tekil-proto fallback yolu) ---- */
run(`__SNAPB=JSON.parse(JSON.stringify(__SNAPA)); delete __SNAPB.floors;`);
const plansB = run(`window.View3D.extBlockFloorPlansForTest(__SNAPB, 3)`);
chk(Array.isArray(plansB) && plansB.length===3 && plansB.every(function(e){ return e.has===false && e.sig===null; }),
    '(4) floors\'suz snap (katAyri kapalı blok / eski kayıt) → hepsi has=false → çağıran BYTE-AYNI tekil-proto yoluna düşer: '+JSON.stringify(plansB.map(function(e){return e.has;})));
chk(plansB[0].k===0 && plansB[2].k===2, '(4) k eşlemesi fallback\'te de korunur (0..2)');

/* ---- 5) BODRUMLU vaka — kullanıcının gerçek paketi deseni: 2 bodrum + 4 üst kat (6 kat dizisi),
   ui.bodrumSayisi='2', activeFloor=3, fFloors=4 → k=2..5 (zemin ofseti zi=2) ---- */
run(`
  var base=stateSnapshot(true);
  var s2=JSON.parse(JSON.stringify(base));                        // zemin (k=2) — kendine özgü imza
  s2.doors={ ov:{ '__zemin-ayrik__':{h:true,x:0,y:0} }, extra:[], hidden:{} };
  var s3=JSON.parse(JSON.stringify(base));                        // 1.-3. kat (k=3,4,5) — aynı imza (tip kat)
  __SNAPC={ ui:{ binaTipi:'apartman', katSayisi:'4', katYuk:'2.9', bodrumSayisi:'2' },
    katAyri:true, activeFloor:3,
    pts:base.pts, plan:base.plan,
    floors:[null, null, s2, s3, JSON.parse(JSON.stringify(s3)), JSON.parse(JSON.stringify(s3))] };
`);
const plansC = run(`window.View3D.extBlockFloorPlansForTest(__SNAPC, 4)`);
chk(Array.isArray(plansC) && plansC.length===4, '(5) fFloors=4 → 4 giriş (yalnız zemin-üstü katlar): '+(plansC&&plansC.length));
chk(plansC[0] && plansC[0].k===2 && plansC[1].k===3 && plansC[2].k===4 && plansC[3].k===5,
    '(5) zemin ofseti DOĞRU (zi=2): k eşlemesi 2/3/4/5 — bodrumlar atlanır: '+JSON.stringify(plansC.map(function(e){return e.k;})));
chk(plansC.every(function(e){ return e.has===true && e.sig!=null; }), '(5) 6-kat dizisinde zemin-üstü 4 katın hepsi kaynaklı (has=true)');
chk(plansC[0].sig!==plansC[1].sig, '(5) zemin (k=2, kapı-ov farklı) ÜST katlardan AYRI imzada — ticari-zemin klonlama bug\'ının veri-hattı kanıtı');
chk(plansC[1].sig===plansC[2].sig && plansC[2].sig===plansC[3].sig, '(5) k=3,4,5 AYNI imza (tek proto\'dan klonlanacak tip katlar)');

/* ---- 6) kısmi eksik kat + aktif-kat top-level kaynağı ---- */
run(`__SNAPD=JSON.parse(JSON.stringify(__SNAPC)); __SNAPD.floors[4]=null;`);   // k=4 ziyaret edilmemiş
const plansD = run(`window.View3D.extBlockFloorPlansForTest(__SNAPD, 4)`);
chk(plansD[2] && plansD[2].k===4 && plansD[2].has===false && plansD[0].has===true && plansD[1].has===true && plansD[3].has===true,
    '(6) ziyaret edilmemiş kat (floors[4]=null) has=false (stackShell fallback\'ine düşer), diğerleri dolu: '+JSON.stringify(plansD.map(function(e){return e.has;})));
run(`__SNAPE=JSON.parse(JSON.stringify(__SNAPC)); __SNAPE.floors=[null,null,null,null,null,null];`);   // yalnız top-level dolu
const plansE = run(`window.View3D.extBlockFloorPlansForTest(__SNAPE, 4)`);
chk(plansE[1] && plansE[1].k===3 && plansE[1].has===true,
    '(6) floors[activeFloor] boş ama top-level snap dolu → aktif kat (k=3) top-level\'dan kaynaklanır (savunmacı ikinci kaynak)');
chk(plansE[0].has===false && plansE[2].has===false && plansE[3].has===false,
    '(6) aktif-olmayan katlar top-level\'dan KAYNAKLANMAZ (tek katın herkese klonlanması bug\'ı geri gelmez)');

report();
process.exit(fail?1:0);
