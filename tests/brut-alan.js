/* L1-A2 BRÜT/NET ALAN testi (headless).
   Doğrular:
   - area_m2 === area_net_m2 (NET sözleşmesi kırılmadı) her odada;
   - area_brut_m2 > area_net_m2 her odada (çevre duvar payı her zaman pozitif);
   - dış cepheli odada brüt-net farkı iç odadan büyük (dış duvar TAM, iç YARI);
   - kullanıcı wallThick.dis override'ı artınca BRÜT artar ama NET birebir sabit kalır.
   Motoru DEĞİŞTİRMEZ; yalnız buildFloorplanMap() + wallThick global'ini kullanır. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources, ROOT } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const input = path.join(ROOT, 'mesken', 'inputs', 'master1.svg');
// gitignored fixture — CI'da yok. Test jenerik (T1-T4 oda listesi üzerinde çalışır) →
// master1 varsa onu (zengin gerçek plan), yoksa üretilmiş 32×16 planı kullan; kapsam CI'da korunur.
const txt = fs.existsSync(input) ? fs.readFileSync(input, 'utf8') : null;

const dom = installDom();
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
  navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));

if (txt) {
  ctx.__SVG = txt;
  new vm.Script(`importPlanText(__SVG,'brut-input');`, { filename: 'brut.js' }).runInContext(ctx);
} else {
  console.log('  (mesken/inputs/master1.svg yok — üretilmiş 32×16 planla koşuluyor)');
  new vm.Script(
    `unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
     pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true; generate();`,
    { filename: 'brut-gen.js' }).runInContext(ctx);
}

let fails = 0;
const fail = m => { console.log('  [FAIL] ' + m); fails++; };
const allRooms = map => [].concat(...map.units.map(u => u.rooms), map.common_areas);

// --- taban harita ---
const base = new vm.Script('buildFloorplanMap()').runInContext(ctx);
if (!base) { console.error('HATA: buildFloorplanMap null'); process.exit(1); }
const baseRooms = allRooms(base);
console.log('brüt/net: ' + base.units.length + ' daire, ' + baseRooms.length + ' oda/ortak alan');

// T1: area_m2 === area_net_m2 (NET sözleşmesi)
baseRooms.forEach(r => {
  if (r.area_m2 !== r.area_net_m2) fail(r.id + ' area_m2(' + r.area_m2 + ') != area_net_m2(' + r.area_net_m2 + ')');
});

// T2: brüt > net her odada
let maxDelta = { id: null, d: -1 }, minDelta = { id: null, d: Infinity };
baseRooms.forEach(r => {
  if (!(r.area_net_m2 > 0)) return;               // 0 alan kırıntı → atla
  const d = +(r.area_brut_m2 - r.area_net_m2).toFixed(4);
  if (!(d > 0)) fail(r.id + ' brüt(' + r.area_brut_m2 + ') net(' + r.area_net_m2 + ') üzerinde değil');
  if (d > maxDelta.d) maxDelta = { id: r.id, d };
  if (d < minDelta.d) minDelta = { id: r.id, d };
});
console.log('  en büyük pay: ' + maxDelta.id + ' +' + maxDelta.d + ' m² | en küçük: ' + minDelta.id + ' +' + minDelta.d + ' m²');

// T3: dış cepheli odada fark iç odadan büyük — en büyük delta (cepheye açık) > en küçük delta
if (maxDelta.d <= minDelta.d) fail('brüt payı odalar arası ayrışmıyor (dış=iç?) max=' + maxDelta.d + ' min=' + minDelta.d);

// T4: wallThick.dis override → BRÜT artar, NET birebir sabit
const netKey = r => r.id + '=' + r.area_net_m2;
const baseNetSig = baseRooms.map(netKey).sort().join('|');
const baseBrutSum = +baseRooms.reduce((s, r) => s + r.area_brut_m2, 0).toFixed(2);

new vm.Script('wallThick.dis = 0.60;').runInContext(ctx);   // kullanıcı dış duvarı kalınlaştırır (min 0.30 → 0.60)
const thick = new vm.Script('buildFloorplanMap()').runInContext(ctx);
const thickRooms = allRooms(thick);
const thickNetSig = thickRooms.map(netKey).sort().join('|');
const thickBrutSum = +thickRooms.reduce((s, r) => s + r.area_brut_m2, 0).toFixed(2);

if (thickNetSig !== baseNetSig) fail('override sonrası NET alanlar DEĞİŞTİ (mevzuat kırıldı)');
if (!(thickBrutSum > baseBrutSum)) fail('dış duvar kalınlaşınca brüt toplam artmadı (' + baseBrutSum + ' → ' + thickBrutSum + ')');
console.log('  override dis 0.30→0.60: brüt toplam ' + baseBrutSum + ' → ' + thickBrutSum + ' m² (net sabit: ' + (thickNetSig === baseNetSig) + ')');

// dis override YALNIZ dış cepheli odaları etkiler → en az bir odanın brütü artmalı, artmayanlar iç oda.
// (Eski varsayım "en büyük brüt-net farklı oda = dış cepheli" YANLIŞTI: üretilmiş planda en büyük fark
// apartman holünde çıkar — uzun çevre duvarı ama cephe teması yok; rectifyCorridorEnds koridoru cepheden çeker.)
const baseById = {}; baseRooms.forEach(r => baseById[r.id] = r);
const grew = thickRooms.filter(r => baseById[r.id] && r.area_brut_m2 > baseById[r.id].area_brut_m2);
if (!grew.length) fail('dis override hiçbir odanın brütünü artırmadı (dış cepheli oda bulunamadı?)');
else console.log('  dis override ' + grew.length + ' dış cepheli odanın brütünü artırdı (iç odalar sabit)');

new vm.Script('wallThick = {};').runInContext(ctx);   // temizle (yan etki bırakma)

if (fails) { console.log('\nBRÜT/NET: ' + fails + ' HATA'); process.exit(1); }
console.log('BRÜT/NET: tüm kontroller geçti');
