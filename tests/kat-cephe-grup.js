/* KAT-CEPHE-GRUP (İş B2+B6) — kat-başına DIŞ CEPHE veri hattı: headless sınıflama + snapshot testi
   (THREE'siz — yalnız mesh-ÖNCESİ veri yolunu doğrular, buildExterior'ın THREE gerektiren mesh kısmı
   test EDİLMEZ, bkz. buildExteriorForTest hiçbir headless testte çağrılmaz).

   View3D.floorFacadeGroupsForTest() = floorGroupsForTest'in dış-cephe ikizi: TÜM katları (kullanım
   filtresi YOK) floorLayoutSig eşitliğine göre ARDIŞIK gruplar; grup başına TEMSİLCİ kat indeksi (rep).
   floorSnapshotAt(k) (app.js) = floorState'in TAM-stateSnapshot ikizi; blockFloorplanMap(floorSnapshotAt(k))
   o katın KENDİ (yan-etkisiz) cephe haritasını üretir — buildExterior'ın kat-başına proto kurulumunun
   (İş B3) temel veri hattı budur.

   Kapsam:
     (i)  zemin (balkonsuz, kendi kapı imzasıyla) + 1./2. kat (balkonlu, AYNI imza — literal klon)
          → floorFacadeGroupsForTest 2 grup döndürür: [0] ve [1,2] (ARDIŞIK + aynı imza birleşir).
     (ii) grupların idxs toplamı totalFloors() ile eşleşir (kat kaybolmadı/çoğalmadı); rep = grubun İLK kat indeksi.
     (iii) blockFloorplanMap(floorSnapshotAt(0)).balconies boş; floorSnapshotAt(1)/(2) ile kurulan map'lerde
          balkon VAR (zemin ile üst katlar arasındaki cephe farkı, per-kat veri hattından doğru okunuyor).

   Çalıştır: node tests/kat-cephe-grup.js */
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
  console.log('\nKAT-CEPHE-GRUP (İş B2+B6): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`!!(window.View3D && window.View3D.floorFacadeGroupsForTest)`);
chk(hasApi, 'View3D.floorFacadeGroupsForTest erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }
const hasHelpers = run(`typeof floorSnapshotAt==='function' && typeof blockFloorplanMap==='function' && typeof floorLayoutSig==='function'`);
chk(hasHelpers, 'floorSnapshotAt/blockFloorplanMap/floorLayoutSig app.js\'te tanımlı');
if(!hasHelpers){ report(); process.exit(fail?1:0); }

/* ---- kurulum: 3 katlı apartman (bodrumsuz), katları ayrı planla açık, zemin canlı üretildi (BALKONSUZ) ---- */
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
`);

const totalFloorsN = run(`totalFloors()`);
chk(totalFloorsN===3, 'kurulum: totalFloors()===3 (bekleniyordu): '+totalFloorsN);
const zi = run(`zeminIdx()`);
chk(zi===0, 'kurulum: zeminIdx()===0 (bodrumsuz): '+zi);

/* idx0 = zemin (canlı/aktif, BALKONSUZ)
   idx1 = zeminin klonu AMA balkon eklenmiş + kapı imzası farklılaştırılmış (BALKONLU, AYRI sig)
   idx2 = idx1'in BİREBİR klonu (AYNI sig, AYNI balkon) → idx1 ile ARDIŞIK+AYNI imza → TEK grupta birleşmeli */
run(`
  villaFloors[1]=JSON.parse(JSON.stringify(villaFloors[0]));
  villaFloors[1].balconies=[{ ei:0, t0:4, t1:10, depth:1.5 }];
  villaFloors[1].doors={ ov:{ '__kat-cephe-grup-test__':{h:true,x:0,y:0} }, extra:[], hidden:{} };
  villaFloors[2]=JSON.parse(JSON.stringify(villaFloors[1]));
`);

/* imza doğrulaması: sig(0) sig(1)'den farklı (kapı override farkı); sig(1)===sig(2) (birebir klon) */
const sigs = run(`[floorLayoutSig(0),floorLayoutSig(1),floorLayoutSig(2)]`);
chk(sigs[0]!=null && sigs[1]!=null && sigs[2]!=null, 'kurulum: idx0/1/2 sig!=null: '+JSON.stringify(sigs));
chk(sigs[0]!==sigs[1], 'kurulum: sig(0)!==sig(1) (kapı override farklı → zemin ayrı grupta kalmalı)');
chk(sigs[1]===sigs[2], 'kurulum: sig(1)===sig(2) (birebir klon, aynı düzen)');

/* ---- (i)+(ii) floorFacadeGroupsForTest: yapı doğrulaması ---- */
const groups = run(`window.View3D.floorFacadeGroupsForTest()`);
chk(Array.isArray(groups), 'floorFacadeGroupsForTest() dizi döner');

const totalIdxCovered = groups.reduce(function(s,g){ return s+g.idxs.length; }, 0);
chk(totalIdxCovered===totalFloorsN, 'grupların idxs toplamı totalFloors() ile eşleşir (hiçbir kat kaybolmadı/çoğalmadı): '+totalIdxCovered+' vs '+totalFloorsN);

chk(groups.length===2, 'beklenen 2 grup ([0] balkonsuz zemin · [1,2] balkonlu üst) — bulunan: '+groups.length+' → '+JSON.stringify(groups.map(function(g){return g.idxs;})));

const g0 = groups.find(function(g){ return g.idxs.indexOf(0)>=0; });
chk(!!g0 && g0.idxs.length===1 && g0.idxs[0]===0, '(i) idx0 (zemin, ayrı imza) TEK BAŞINA grupta: '+JSON.stringify(g0&&g0.idxs));
chk(!!g0 && g0.rep===0, '(i) zemin grubunun rep alanı 0 (grubun İLK/tek elemanı)');
chk(!!g0 && g0.sig===sigs[0], '(i) zemin grubunun sig alanı floorLayoutSig(0) ile eşleşir');

const g12 = groups.find(function(g){ return g.idxs.indexOf(1)>=0; });
chk(!!g12 && g12.idxs.length===2 && g12.idxs[0]===1 && g12.idxs[1]===2,
  '(i) idx1+idx2 (aynı imza, ARDIŞIK, balkonlu) TEK grupta birleşti: '+JSON.stringify(g12&&g12.idxs));
chk(!!g12 && g12.rep===1, '(i) birleşen grubun rep alanı 1 (grubun İLK elemanı — buildExterior proto\'yu bu kattan kurar)');
chk(!!g12 && g12.sig===sigs[1], '(i) birleşen grubun sig alanı floorLayoutSig(1) ile eşleşir');

/* idxs her grupta ARTAN + ARDIŞIK olmalı (sözleşme, floorGroupsForTest ile aynı) */
let monotoneOK=true;
groups.forEach(function(g){
  for(let i=1;i<g.idxs.length;i++) if(g.idxs[i]!==g.idxs[i-1]+1) monotoneOK=false;
});
chk(monotoneOK, 'her grubun idxs\'i artan + ardışık (boşluksuz): '+JSON.stringify(groups.map(function(g){return g.idxs;})));

/* ---- (iii) blockFloorplanMap(floorSnapshotAt(k)): zemin balkonsuz / üst katlar balkonlu ---- */
const snap0 = run(`floorSnapshotAt(0)`);
const snap1 = run(`floorSnapshotAt(1)`);
const snap2 = run(`floorSnapshotAt(2)`);
chk(!!snap0 && !!snap0.plan && !!snap0.pts, 'floorSnapshotAt(0) TAM bir snapshot döndürdü (plan+pts)');
chk(!!snap1 && !!snap1.plan && !!snap1.pts, 'floorSnapshotAt(1) TAM bir snapshot döndürdü (plan+pts)');
chk(Array.isArray(snap0.balconies) && snap0.balconies.length===0, 'floorSnapshotAt(0).balconies boş (zemin balkonsuz kuruldu)');
chk(Array.isArray(snap1.balconies) && snap1.balconies.length===1, 'floorSnapshotAt(1).balconies tek kayıt (üst kat balkonlu kuruldu)');

const map0 = run(`blockFloorplanMap(floorSnapshotAt(0))`);
const map1 = run(`blockFloorplanMap(floorSnapshotAt(1))`);
const map2 = run(`blockFloorplanMap(floorSnapshotAt(2))`);
chk(!!map0 && !!map0.units && map0.units.length>0, 'blockFloorplanMap(floorSnapshotAt(0)) geçerli bir map döndürdü');
chk(!!map1 && !!map1.units && map1.units.length>0, 'blockFloorplanMap(floorSnapshotAt(1)) geçerli bir map döndürdü');
chk(!!map2 && !!map2.units && map2.units.length>0, 'blockFloorplanMap(floorSnapshotAt(2)) geçerli bir map döndürdü');
chk(Array.isArray(map0.balconies) && map0.balconies.length===0, '(iii) ZEMİN cephe haritası (blockFloorplanMap) BALKONSUZ: '+(map0.balconies&&map0.balconies.length));
chk(Array.isArray(map1.balconies) && map1.balconies.length===1, '(iii) 1. KAT cephe haritası BALKONLU: '+(map1.balconies&&map1.balconies.length));
chk(Array.isArray(map2.balconies) && map2.balconies.length===1, '(iii) 2. KAT cephe haritası BALKONLU (idx1 ile aynı grup, aynı veri): '+(map2.balconies&&map2.balconies.length));

/* blockFloorplanMap yan-etkisiz olmalı: canlı state (aktif kat=0, zemin) çağrılar arasında bozulmamış —
   blockFloorplanMap SV kaydet→kur→GERİ-koy disipliniyle çalışır (app.js ~960); burada aktif katın
   balconies'i (zemin, boş) hâlâ boş kalmalı (üst katların balkonlu snapshot'ı canlıya SIZMAMIŞ olmalı). */
const liveStillZemin = run(`activeFloor===0 && !!plan && Array.isArray(balconies) && balconies.length===0`);
chk(liveStillZemin, 'blockFloorplanMap çağrıları YAN-ETKİSİZ — canlı state (activeFloor/plan/balconies) bozulmadı');

report();
process.exit(fail?1:0);
