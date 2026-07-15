/* MOBILYA-KAT-IZOLASYON (İş 3) — mobilya/malzeme deposunun kat-imzalı bileşik anahtarla
   kat-arası BULAŞMASINI önlediğini doğrular (headless, THREE'siz — io.js buildFloorplanMap
   okuma yolu + view3d'nin sahne-gerektirmeyen View3D.hydrateMaterials/getMaterials'ı kullanılır;
   sahne/mesh gerektiren kısımlar — persistFurniture/persistMaterials/buildScene — burada test
   EDİLMEZ, doğrudan app.js'in floorStoreWrite/floorStoreResolve çiftiyle store yazılır/okunur).

   Senaryo: aynı 'D1-bedroom' room_id'si FARKLI düzenli iki katta (K2/K3) da üretiliyor (unit
   numaralandırması + oda tipi kat düzeninden bağımsız aynı kalıba düşüyor — asıl bulaşma riski).
     (1) K2'de D1-bedroom'a mobilya+malzeme yazılır (floorStoreWrite, persistFurniture/Materials ikizi).
     (2) K3'e geç (FARKLI düzen/imza) → o kayıt UYGULANMAZ (io.js okuması + hydrateMaterials boş döner).
     (3) K2'ye dön → kayıt HÂLÂ DURUYOR.
     (4) K2'nin düzenini değiştir (kapı override eklenir → imza değişir) → mobilya/malzeme HÂLÂ GELİR
         (öncelik-2: aynı kat+blok'un en yeni girişi — furnPruneInvalid/sığma kontrolü ayrı katman).
     (5) legacy DÜZ anahtar (bu fixten önceki kayıt biçimi) → HER İKİ katta da uygulanır (bilinçli
         geri-uyum tradeoff — İş 3 NOT'unda açıkça kabul edilen davranış, İZOLASYON İDDİASI DEĞİL).

   Çalıştır: node tests/mobilya-kat-izolasyon.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) pass++; else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:4, katYuk:2.9 });
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
  console.log('\nMOBILYA-KAT-IZOLASYON (İş 3): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`typeof floorStoreWrite==='function' && typeof floorStoreResolve==='function' && typeof floorLayoutSig==='function'`);
chk(hasApi, 'floorStoreWrite/floorStoreResolve/floorLayoutSig app.js\'te erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ---- kurulum: K2 (idx0=zemin) + K3 (idx1) FARKLI daire programlarıyla — ikisi de D1-bedroom üretir ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='4';
  document.getElementById('bodrumSayisi').value='0';
  bodrumSayisi=0; villaOffset=0;
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:1,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  document.getElementById('katAyri').checked=true;
  katKullanim='konut';
  villaFloors=new Array(totalFloors()).fill(null);
  activeFloor=zeminIdx();
  villaFloors[activeFloor]=stateSnapshot(true);
`);
run(`
  activeFloor=1;
  unitSpecs=[{oda:1,salon:1,ensuite:false,acik:true,adet:3}];
  resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; windowOverrides={}; extraWindows=[]; windowHidden={}; editHistory=[];
  generate();
  villaFloors[1]=stateSnapshot(true);
  switchFloor(0);
`);
chk(run(`activeFloor`)===0, 'kurulum: switchFloor(0) sonrası K2 aktif');
const idsK2 = run(`buildFloorplanMap().units.reduce(function(s,u){return s.concat(u.rooms.map(function(r){return r.id;}));},[])`);
const idsK3check = run(`(function(){ activeFloor=1; try{ restoreState(villaFloors[1],{fit:false,keepFloors:true}); }catch(e){} const ids=buildFloorplanMap().units.reduce(function(s,u){return s.concat(u.rooms.map(function(r){return r.id;}));},[]); activeFloor=0; restoreState(villaFloors[0],{fit:false,keepFloors:true}); return ids; })()`);
chk(idsK2.indexOf('D1-bedroom')>=0, 'kurulum: K2\'de D1-bedroom var — '+JSON.stringify(idsK2));
chk(idsK3check.indexOf('D1-bedroom')>=0, 'kurulum: K3\'te de D1-bedroom var (aynı room_id, FARKLI kat) — '+JSON.stringify(idsK3check));
const sig0=run(`floorLayoutSig(0)`), sig1=run(`floorLayoutSig(1)`);
chk(sig0!=null && sig1!=null && sig0!==sig1, 'kurulum: K2/K3 imzaları farklı (gerçekten FARKLI düzen) — eşitse test anlamsız');
chk(run(`activeFloor`)===0, 'kurulum: prob sonrası tekrar K2 aktif (yan etkisiz doğrulama)');

/* ---- (1) K2 aktifken D1-bedroom'a mobilya + malzeme yaz (floorStoreWrite = persistFurniture/Materials ikizi) ---- */
run(`
  window.__kptaFurniture=window.__kptaFurniture||{};
  window.__kptaMaterials=window.__kptaMaterials||{};
  floorStoreWrite(window.__kptaFurniture, 'D1-bedroom', [{id:'f1',type:'yatak',room_id:'D1-bedroom',pos:{x:1,z:1},rot_deg:0}]);
  floorStoreWrite(window.__kptaMaterials, 'D1-bedroom', {floor:'parke_ceviz', wall:'boya_adacayi'});
`);
function roomById(id){ return `(function(){ const m=buildFloorplanMap(); let found=null; m.units.forEach(function(u){ u.rooms.forEach(function(r){ if(r.id==='${id}') found=r; }); }); return found; })()`; }
const k2Room = run(roomById('D1-bedroom'));
chk(k2Room && Array.isArray(k2Room.furniture) && k2Room.furniture.length===1, '(1) K2: D1-bedroom mobilya export\'ta göründü — '+JSON.stringify(k2Room&&k2Room.furniture));
chk(k2Room && k2Room.materials && k2Room.materials.floor==='parke_ceviz' && k2Room.materials.wall==='boya_adacayi', '(1) K2: D1-bedroom malzeme export\'ta göründü — '+JSON.stringify(k2Room&&k2Room.materials));
const hydr2 = run(`(function(){ window.View3D.hydrateMaterials(); return window.View3D.getMaterials(); })()`);
chk(hydr2['D1-bedroom'] && hydr2['D1-bedroom'].floor==='parke_ceviz', '(1) K2: hydrateMaterials/getMaterials da D1-bedroom\'u taşıyor — '+JSON.stringify(hydr2['D1-bedroom']));

/* ---- (2) K3'e geç (FARKLI düzen) → K2'nin kaydı UYGULANMAZ ---- */
run(`switchFloor(1);`);
chk(run(`activeFloor`)===1, '(2) switchFloor(1) sonrası K3 aktif');
const k3Room = run(roomById('D1-bedroom'));
chk(!!k3Room, '(2) K3\'te de D1-bedroom odası var (isim çakışması gerçek)');
chk(k3Room && (!k3Room.furniture || k3Room.furniture.length===0), '(2) K3: D1-bedroom mobilyası BOŞ (K2\'den bulaşmadı) — '+JSON.stringify(k3Room&&k3Room.furniture));
chk(k3Room && k3Room.materials===null, '(2) K3: D1-bedroom malzemesi null (K2\'den bulaşmadı) — '+JSON.stringify(k3Room&&k3Room.materials));
const hydr3 = run(`(function(){ window.View3D.hydrateMaterials(); return window.View3D.getMaterials(); })()`);
chk(!hydr3['D1-bedroom'], '(2) K3: hydrateMaterials de D1-bedroom\'u YÜKLEMEDİ (izolasyon) — '+JSON.stringify(hydr3['D1-bedroom']));

/* ---- (3) K2'ye dön → kayıt HÂLÂ duruyor ---- */
run(`switchFloor(0);`);
chk(run(`activeFloor`)===0, '(3) switchFloor(0) sonrası K2 aktif');
const k2Room2 = run(roomById('D1-bedroom'));
chk(k2Room2 && k2Room2.furniture && k2Room2.furniture.length===1, '(3) K2: mobilya HÂLÂ duruyor (kat geçişiyle kaybolmadı) — '+JSON.stringify(k2Room2&&k2Room2.furniture));
chk(k2Room2 && k2Room2.materials && k2Room2.materials.floor==='parke_ceviz', '(3) K2: malzeme HÂLÂ duruyor — '+JSON.stringify(k2Room2&&k2Room2.materials));

/* ---- (4) K2'nin düzenini değiştir (kapı override → imza değişir) → mobilya/malzeme HÂLÂ GELİR (öncelik-2) ---- */
const sigBefore = run(`floorLayoutSig(0)`);
run(`doorOverrides['__mobilya-kat-izolasyon-test']={h:true,x:0,y:0};`);
const sigAfter = run(`floorLayoutSig(0)`);
chk(sigBefore!==sigAfter, '(4) kurulum: doorOverrides eklenince K2 imzası GERÇEKTEN değişti');
const k2Room3 = run(roomById('D1-bedroom'));
chk(k2Room3 && k2Room3.furniture && k2Room3.furniture.length===1, '(4) K2: imza değişse de mobilya HÂLÂ geliyor (öncelik-2: aynı kat+blok en yenisi) — '+JSON.stringify(k2Room3&&k2Room3.furniture));
chk(k2Room3 && k2Room3.materials && k2Room3.materials.floor==='parke_ceviz', '(4) K2: imza değişse de malzeme HÂLÂ geliyor — '+JSON.stringify(k2Room3&&k2Room3.materials));
run(`delete doorOverrides['__mobilya-kat-izolasyon-test'];`);   // yan etkisiz bırak

/* ---- K3'e tekrar geç: (4)'teki K2 imza değişikliğinden SONRA da hâlâ bulaşma YOK ---- */
run(`switchFloor(1);`);
const k3Room2 = run(roomById('D1-bedroom'));
chk(k3Room2 && (!k3Room2.furniture || k3Room2.furniture.length===0), '(4) sonrası K3: hâlâ bulaşma yok — '+JSON.stringify(k3Room2&&k3Room2.furniture));
run(`switchFloor(0);`);

/* ---- (5) legacy DÜZ anahtar (bileşik-anahtar ÖNCESİ kayıt biçimi) — bilinçli geri-uyum: HER İKİ katta uygulanır ---- */
run(`window.__kptaFurniture['D2-bathroom']=[{id:'flegacy',type:'lavabo',room_id:'D2-bathroom',pos:{x:0.5,z:0.5},rot_deg:0}];`);
const legK2 = run(roomById('D2-bathroom'));
chk(legK2 && legK2.furniture && legK2.furniture.length===1, '(5) K2: legacy düz-anahtar kaydı uygulanıyor (geri-uyum) — '+JSON.stringify(legK2&&legK2.furniture));
run(`switchFloor(1);`);
const legK3 = run(roomById('D2-bathroom'));
chk(legK3 && legK3.furniture && legK3.furniture.length===1, '(5) K3: legacy düz-anahtar AYNI kayda erişiyor (bilinçli geri-uyum tradeoff, izolasyon iddiası değil) — '+JSON.stringify(legK3&&legK3.furniture));
run(`switchFloor(0);`);

report();
process.exit(fail?1:0);
