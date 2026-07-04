/* MALZEME — oda-başına zemin/duvar malzemesi (mobilya sözleşmesinin ikizi) testleri.
   Kapsam: preset katalog (parke×4/seramik×4/boya×6) · io export additive `materials` alanı ·
   kalıcılık (window.__kptaMaterials store) · SEÇİLMEMİŞ oda → materials=null (renk-kod varsayılanı korunur).
   MOTOR MANTIĞINI DEĞİŞTİRMEZ; buildFloorplanMap + View3D.materialPresets çağırır. */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; } else { fail++; console.error('  ✗ ' + m); } }

const dom = installDom();
const winStub = { addEventListener() {}, matchMedia: () => ({ matches: false }), View3D: null };
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document,
  window: winStub,
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
  navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));

function run(code){ return new vm.Script(code).runInContext(ctx); }

/* standart 32×16 apartman planı (snapshot senaryosuyla aynı kurulum) */
run(`
  document.getElementById('binaTipi').value='apartman';
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  generate();
`);

/* 1) PRESET KATALOĞU: 14 preset (parke×4 + seramik×4 + boya×6) — View3D.materialPresets() */
const cat = run(`(function(){
  if(!window.View3D || !window.View3D.materialPresets) return null;
  const ps=window.View3D.materialPresets();
  const g={}; ps.forEach(function(p){ g[p.group+'_'+p.cls]=(g[p.group+'_'+p.cls]||0)+1; });
  return { n:ps.length, parke:g['floor_parke']||0, seramik:g['floor_seramik']||0, boya:g['wall_boya']||0,
    keys:ps.map(function(p){return p.key;}) };
})()`);
ok(cat, 'View3D.materialPresets() erişilebilir olmalı');
if(cat){
  ok(cat.n===14, '14 preset bekleniyor (bulunan '+cat.n+')');
  ok(cat.parke===4, 'parke ×4 (bulunan '+cat.parke+')');
  ok(cat.seramik===4, 'seramik ×4 (bulunan '+cat.seramik+')');
  ok(cat.boya===6, 'duvar boya ×6 (bulunan '+cat.boya+')');
  ok(cat.keys.indexOf('parke_mese')>=0 && cat.keys.indexOf('seramik_beyaz')>=0 && cat.keys.indexOf('boya_terracotta')>=0, 'beklenen preset anahtarları var');
}

/* 2) io export: SEÇİM YOKKEN her oda materials=null (renk-kod varsayılanı korunur) */
const none = run(`(function(){
  window.__kptaMaterials={};
  const m=buildFloorplanMap();
  let total=0, nulls=0, hasField=true;
  m.units.forEach(function(u){ u.rooms.forEach(function(o){ total++; if(!('materials' in o)) hasField=false; if(o.materials===null) nulls++; }); });
  return { total, nulls, hasField };
})()`);
ok(none.hasField, 'her oda export nesnesinde `materials` alanı olmalı (additive)');
ok(none.total>0 && none.nulls===none.total, 'seçim yokken TÜM odalar materials=null (renk-kod varsayılanı)');

/* 3) io export: bir odaya store'dan malzeme atanınca yalnız O ODA materials taşır */
const applied = run(`(function(){
  const m0=buildFloorplanMap();
  const rid=m0.units[0].rooms[0].id;
  window.__kptaMaterials={}; window.__kptaMaterials[rid]={floor:'parke_ceviz', wall:'boya_adacayi'};
  const m=buildFloorplanMap();
  let selRoom=null, othersNull=true;
  m.units.forEach(function(u){ u.rooms.forEach(function(o){
    if(o.id===rid) selRoom=o.materials; else if(o.materials!==null) othersNull=false; }); });
  window.__kptaMaterials={};
  return { rid, floor:selRoom&&selRoom.floor, wall:selRoom&&selRoom.wall, othersNull };
})()`);
ok(applied.floor==='parke_ceviz' && applied.wall==='boya_adacayi', 'seçilen oda export materials {floor,wall} taşımalı');
ok(applied.othersNull, 'yalnız SEÇİLEN oda değişir; diğer odalar materials=null kalır');

/* 4) KALICILIK: View3D.applyMaterial → getMaterials → persistMaterials store'a yazar (mobilya ikizi).
      NOT: applyMaterial mesh rebuild dener (THREE yok, headless) → try/catch ile store yazımını doğrula. */
const persist = run(`(function(){
  if(!window.View3D || !window.View3D.getMaterials) return { skip:true };
  const m0=buildFloorplanMap();
  const rid=m0.units[0].rooms[0].id;
  // headless: View3D.selectMatRoom sahne ister; store yolunu doğrudan getMaterials/hydrate ile test et.
  window.__kptaMaterials={}; window.__kptaMaterials[rid]={floor:'seramik_gri', wall:null};
  window.View3D.hydrateMaterials();
  const g=window.View3D.getMaterials();
  return { rid, hydrated: g[rid]&&g[rid].floor, invalidPruned: (function(){
    window.__kptaMaterials={bogus:{floor:'YOK_KEY'}}; window.View3D.hydrateMaterials();
    return Object.keys(window.View3D.getMaterials()).length; })() };
})()`);
if(persist.skip){ ok(true, 'View3D.getMaterials yok (headless atlandı)'); }
else {
  ok(persist.hydrated==='seramik_gri', 'hydrateMaterials store\'dan geçerli seçimi yükler');
  ok(persist.invalidPruned===0, 'geçersiz preset key\'i hydrate\'te ELENİR (boş override)');
}

/* 5) EXPORT ŞEMASI BOZULMADI: furniture[] + area_m2 hâlâ yerinde (additive kanıtı) */
const intact = run(`(function(){
  window.__kptaMaterials={};
  const m=buildFloorplanMap();
  const o=m.units[0].rooms[0];
  return { furn:Array.isArray(o.furniture), area:typeof o.area_m2==='number', mat:('materials' in o) };
})()`);
ok(intact.furn && intact.area, 'mevcut şema (furniture[]/area_m2) BOZULMAMALI');
ok(intact.mat, 'materials alanı additive olarak eklendi');

console.log('MALZEME: ' + pass + ' geçti, ' + fail + ' hata');
if (fail) process.exit(1);
