/* Oda/Daire haritası + kamera export ÜRETECİ ve DOĞRULAYICI (headless).
   - Bir kpState SVG/JSON yükler (varsayılan: mesken/inputs/master1.svg)
   - buildFloorplanMap() ile floorplan-map.json + floorplan-overlay.svg üretir
   - sol-alt daireye 8 kamera yerleştirip camera-export.json üretir
   - KABUL TESTLERİ: oda bbox'ları kadraj içinde & alanlı & polygon'lu; daire
     bbox'u odaları kapsıyor; her kamera kendi oda polygon_px'i İÇİNDE (pip).
   MOTOR KODUNU DEĞİŞTİRMEZ; yalnız buildFloorplanMap()'i çağırır.

   Kullanım:
     node tests/gen-floorplan-map.js                      # master1 → mesken/
     node tests/gen-floorplan-map.js <svg|json> <outDir>  # özel girdi/çıktı
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources, ROOT } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const input = process.argv[2] || path.join(ROOT, 'mesken', 'inputs', 'master1.svg');
const outDir = process.argv[3] || path.join(ROOT, 'mesken');
const txt = fs.readFileSync(input, 'utf8');

/* ---- motoru headless yükle (measure-plan ile aynı kurulum) ---- */
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

ctx.__SVG = txt;
new vm.Script(`importPlanText(__SVG,'gen-input'); __MAP = buildFloorplanMap();`, { filename: 'gen.js' }).runInContext(ctx);
const map = ctx.__MAP;
if (!map) { console.error('HATA: buildFloorplanMap() null döndü (plan yok?).'); process.exit(1); }

/* ---- geometri yardımcıları (haritadan; motordan bağımsız) ---- */
function pip(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function insidePoint(o) { // polygon içinde garanti bir nokta (önce centroid, olmazsa bbox tarama)
  const poly = o.polygon_px, bb = o.bbox_px, ce = o.centroid_px;
  if (poly && poly.length >= 3 && pip(ce[0], ce[1], poly)) return ce.slice();
  if (poly && poly.length >= 3) for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 12; gx++) {
    const x = bb[0] + (bb[2] - bb[0]) * gx / 12, y = bb[1] + (bb[3] - bb[1]) * gy / 12;
    if (pip(x, y, poly)) return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }
  return ce.slice();
}
function segDist(p, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const L = vx * vx + vy * vy; let t = L ? ((wx * vx + wy * vy) / L) : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]); }
function nearPoly(p, poly) { if (pip(p[0], p[1], poly)) return 0; let d = Infinity; // 0=içerde, yoksa kenara uzaklık
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, poly[j], poly[i])); return d; }
function findRoomPip(x, y, rooms) { for (const r of rooms) if (r.polygon_px && r.polygon_px.length >= 3 && pip(x, y, r.polygon_px)) return r.id; return null; }
function headingTo(from, to) { // 0=yukarı, saat yönü
  const dx = to[0] - from[0], dy = to[1] - from[1];
  let a = Math.atan2(dx, -dy) * 180 / Math.PI; if (a < 0) a += 360;
  return Math.round(a);
}
function aimInto(pos, r) { // odanın İÇİNE bak: tutamaca en uzak köşeye yönel → koni kendi odasını tarar
  let far = r.centroid_px, fd = -1;
  (r.polygon_px || []).forEach(p => { const d = Math.hypot(p[0] - pos[0], p[1] - pos[1]); if (d > fd) { fd = d; far = p; } });
  return headingTo(pos, far);
}
const LENS = { living: 24, living_kitchen: 24, kitchen: 24, hall: 24, bedroom: 35, study: 35, bathroom: 24, wc: 24 };
const lensFor = t => LENS[t] || 28;

/* ---- sol-alt daireyi seç ---- */
function unitCenter(u) { const b = u.bbox_px; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
let target = map.units[0], best = Infinity;
map.units.forEach(u => { const c = unitCenter(u); const score = c[0] + (map.render.height - c[1]); if (score < best) { best = score; target = u; } });
const uc = unitCenter(target);

/* ---- 8 kamerayı dairenin odalarına dağıt (her biri oda polygon'u içinde) ---- */
const shots = [];
const liveRooms = target.rooms.filter(r => r.polygon_px && r.polygon_px.length >= 3);
liveRooms.forEach(r => shots.push({ room: r, view: 'merkez' }));
// 8'e tamamla: en büyük odalara ikinci açı ekle (farklı bakış)
const bigFirst = liveRooms.slice().sort((a, b) => b.area_m2 - a.area_m2);
let bi = 0;
while (shots.length < 8 && bigFirst.length) { shots.push({ room: bigFirst[bi % bigFirst.length], view: 'köşe' }); bi++; }
const placedIds = [];   // her kameranın yerleştirildiği oda (doğrulama; export'a yazılmaz)
const cameras = shots.slice(0, 8).map((s, i) => {
  const r = s.room, p = insidePoint(r);
  // 'köşe' açıları odanın bir köşesine yakın yerleştir, daire merkezine bak
  let pos = p;
  if (s.view === 'köşe') {
    const bb = r.bbox_px, cand = [[bb[0] + (bb[2] - bb[0]) * 0.22, bb[1] + (bb[3] - bb[1]) * 0.22],
    [bb[2] - (bb[2] - bb[0]) * 0.22, bb[3] - (bb[3] - bb[1]) * 0.22]];
    for (const c of cand) if (pip(c[0], c[1], r.polygon_px)) { pos = [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10]; break; }
  }
  placedIds.push(r.id);
  const heading = aimInto(pos, r), lens = lensFor(r.type);   // kendi odasını çerçevele (room_id yine tutamaç-odası)
  const cam = {
    id: 'cam' + (i + 1),
    label: r.name + ' — ' + (s.view === 'köşe' ? 'köşe açısı' : 'genel'),
    room_tr: r.name,
    room_id: null,                       // motor doldurur (koni ağırlığı)
    x_px: pos[0], y_px: pos[1],
    x_norm: Math.round(pos[0] / map.render.width * 1e5) / 1e5,   // 0–1 (render çözünürlüğünden bağımsız)
    y_norm: Math.round(pos[1] / map.render.height * 1e5) / 1e5,
    heading_deg: heading,                // daire merkezine doğru bak (mantıklı varsayılan)
    lens_mm: lens,
    height: 'eye',                        // arayüz: Alçak | Göz hizası | Yüksek
    tod: 'golden', tod_label: 'Altın saat', time: 50,  // arayüz sun-arc (4.adım ile aynı şema)
    room_weights: [], cone_spills: false, cone_polygon_px: null, cone_polygon_norm: null
  };
  // ⛔ room_id'yi tutamaç pip'inden DEĞİL, kameranın görüş konisinin ağırlığından bul (motorla aynı yol)
  const v = ctx.cameraViewInfo(map, { x_px: pos[0], y_px: pos[1], heading_deg: heading, lens_mm: lens });
  if (v) { cam.room_id = v.room_id; cam.room_weights = v.room_weights; cam.cone_spills = v.cone_spills;
    cam.cone_polygon_px = v.cone_polygon_px; cam.cone_polygon_norm = v.cone_polygon_norm; }
  return cam;
});

const camExport = Object.assign({}, map, {
  source_unit: { id: target.id, label: target.label, type: target.type },
  cameras
});

/* ---- yaz ---- */
fs.mkdirSync(outDir, { recursive: true });
const overlay = ctx.buildFloorplanOverlaySVG(map);
fs.writeFileSync(path.join(outDir, 'floorplan-map.json'), JSON.stringify(map, null, 2));
fs.writeFileSync(path.join(outDir, 'floorplan-overlay.svg'), overlay);
fs.writeFileSync(path.join(outDir, 'camera-export.json'), JSON.stringify(camExport, null, 2));

/* ---- KABUL TESTLERİ ---- */
const W = map.render.width, H = map.render.height;
let fails = 0; const fail = m => { console.log('  ✗ ' + m); fails++; };
const allRooms = map.units.flatMap(u => u.rooms);
const aspect = W / H, tgtAspect = map.render.target_aspect;
console.log('render PNG :', W + '×' + H + ' px  | oran:', aspect.toFixed(4), '(hedef ' + tgtAspect + ')  | m/px:', map.scale.metersPerPixel);
console.log('daire      :', map.units.length, '| oda:', allRooms.length, '| ortak alan:', map.common_areas.length);

// kadraj render oranına letterbox'lı mı? (±1 px yuvarlama payı → bağıl <0.2%)
if (!(Math.abs(aspect - tgtAspect) / tgtAspect < 0.002)) fail('kadraj oranı ' + aspect.toFixed(4) + ' render hedefi ' + tgtAspect + ' ile uyuşmuyor');

allRooms.forEach(r => {
  const b = r.bbox_px;
  if (!(b[0] >= -1 && b[1] >= -1 && b[2] <= W + 1 && b[3] <= H + 1)) fail(r.id + ' bbox kadraj dışı: ' + JSON.stringify(b));
  if (!(b[2] > b[0] && b[3] > b[1])) fail(r.id + ' bbox dejenere');
  if (!(r.area_m2 > 0)) fail(r.id + ' alan 0');
  if (!(r.polygon_px && r.polygon_px.length >= 4)) fail(r.id + ' polygon < 4 köşe');
  // normalize alanları: var, 0–1 aralığında, _px ile tutarlı
  const nb = r.bbox_norm;
  if (!(nb && nb.length === 4)) return fail(r.id + ' bbox_norm yok');
  if (!nb.every(v => v >= -0.01 && v <= 1.01)) fail(r.id + ' bbox_norm 0–1 dışı: ' + JSON.stringify(nb));
  if (Math.abs(nb[0] * W - b[0]) > 1.5 || Math.abs(nb[1] * H - b[1]) > 1.5) fail(r.id + ' bbox_norm*render ≠ bbox_px');
  if (!(r.centroid_norm && r.polygon_norm && r.polygon_norm.length === r.polygon_px.length)) fail(r.id + ' centroid/polygon_norm eksik');
});
map.units.forEach(u => u.rooms.forEach(r => {
  const ub = u.bbox_px, rb = r.bbox_px;
  if (!(rb[0] >= ub[0] - 1 && rb[1] >= ub[1] - 1 && rb[2] <= ub[2] + 1 && rb[3] <= ub[3] + 1)) fail(u.id + ' bbox ' + r.id + ' odasını kapsamıyor');
}));
// kamera→oda: hem daire odaları hem ortak alanlar aday (motorla aynı)
const roomById = {}; allRooms.concat(map.common_areas || []).forEach(r => roomById[r.id] = r);
let spilled = 0, minCover = 1;
cameras.forEach((c, i) => {
  // 1) room_id null DEĞİL + bilinen oda (koni hiçbir odayı bulamazsa yedek en-yakın oda → asla null)
  if (!c.room_id) return fail(c.id + ' room_id null (koni hiçbir oda bulamadı)');
  const r = roomById[c.room_id];
  if (!r) return fail(c.id + ' room_id bilinmiyor: ' + c.room_id);
  // 2) norm tutarlılığı
  if (!(c.x_norm >= -0.01 && c.x_norm <= 1.01 && c.y_norm >= -0.01 && c.y_norm <= 1.01)) fail(c.id + ' norm 0–1 dışı');
  if (Math.abs(c.x_norm * W - c.x_px) > 1.5 || Math.abs(c.y_norm * H - c.y_px) > 1.5) fail(c.id + ' norm*render ≠ px');
  // 3) room_weights: dolu, kazanan en başta, oranlar 0–1, toplam ~1 (<%2 filtrelendiği için)
  const ws = c.room_weights || [];
  if (!ws.length) return fail(c.id + ' room_weights boş');
  if (ws[0].room_id !== c.room_id) fail(c.id + ' room_weights[0] kazanan değil');
  if (!ws.every(w => w.coverage_ratio >= 0 && w.coverage_ratio <= 1.001)) fail(c.id + ' coverage_ratio 0–1 dışı');
  const sum = ws.reduce((s, w) => s + w.coverage_ratio, 0);
  if (!(sum > 0.5 && sum < 1.05)) fail(c.id + ' coverage toplamı anormal: ' + sum.toFixed(3));
  minCover = Math.min(minCover, ws[0].coverage_ratio);
  // 4) cone_spills boolean
  if (typeof c.cone_spills !== 'boolean') fail(c.id + ' cone_spills boolean değil');
  if (c.cone_spills) spilled++;
  // 5) cone_polygon kazanan odanın İÇİNDE (komşuya taşmıyor) + kadraj içinde + norm uyumlu
  if (c.cone_polygon_px) {
    if (c.cone_polygon_px.length < 3) fail(c.id + ' cone_polygon <3 köşe');
    if (!c.cone_polygon_px.every(p => nearPoly(p, r.polygon_px) <= 1.0)) fail(c.id + ' cone_polygon kazanan oda (' + r.id + ') dışına taşıyor');
    if (!c.cone_polygon_px.every(p => p[0] >= -1 && p[1] >= -1 && p[0] <= W + 1 && p[1] <= H + 1)) fail(c.id + ' cone_polygon kadraj dışı');
    if (!c.cone_polygon_norm || c.cone_polygon_norm.length !== c.cone_polygon_px.length) fail(c.id + ' cone_polygon_norm eksik/uyumsuz');
  }
  // 6) tutamaç oda içine yerleştiyse room_id = O oda (kanıt tablosu: kamera DURDUĞU odaya etiketlenir)
  const placed = placedIds[i];
  if (placed && c.room_id !== placed) fail(c.id + ' room_id=' + c.room_id + ' ama oda içine yerleşti: ' + placed);
});

console.log('kamera     :', cameras.length, '→ kaynak daire', target.id, '(' + target.label + ')',
  '| koni-taşan:', spilled, '| min kazanan-oran:', minCover.toFixed(2), '| null room_id:', cameras.filter(c => !c.room_id).length);

/* ---- DÜZELTME KANITI: eşik kamerası — tutamaç oda DIŞINA düşse de koni doğru odayı bulur ----
   (FIX1 koni ağırlığı + FIX2 tolerans: pip(tutamaç) null/komşu verirken cameraViewInfo kazanır) */
(function demoThreshold() {
  const big = liveRooms.slice().sort((a, b) => b.area_m2 - a.area_m2)[0];
  if (!big) return;
  const ce = insidePoint(big);
  let apex = null;
  for (let i = 0, j = big.polygon_px.length - 1; i < big.polygon_px.length && !apex; j = i++) {
    const mid = [(big.polygon_px[i][0] + big.polygon_px[j][0]) / 2, (big.polygon_px[i][1] + big.polygon_px[j][1]) / 2];
    const dx = mid[0] - ce[0], dy = mid[1] - ce[1], L = Math.hypot(dx, dy) || 1;
    for (const off of [8, 16, 26, 40]) {
      const a = [Math.round((mid[0] + dx / L * off) * 10) / 10, Math.round((mid[1] + dy / L * off) * 10) / 10];
      if (!pip(a[0], a[1], big.polygon_px)) { apex = a; break; }   // tutamaç odanın DIŞINDA
    }
  }
  if (!apex) { console.log('eşik-demo  : (uygun dış-tutamaç bulunamadı, atlandı)'); return; }
  const heading = headingTo(apex, ce);  // odanın içine bak
  const pipId = findRoomPip(apex[0], apex[1], allRooms.concat(map.common_areas || []));
  const v = ctx.cameraViewInfo(map, { x_px: apex[0], y_px: apex[1], heading_deg: heading, lens_mm: 24 });
  const homePref = big.id.split('-')[0] + '-';
  console.log('eşik-demo  : tutamaç', JSON.stringify(apex), '→ pip(tutamaç)=' + pipId + '  | koni-ağırlık=' + (v && v.room_id) + '  (beklenen ' + homePref + '*, ideal ' + big.id + ')');
  if (!v || !v.room_id) fail('eşik-demo: koni-ağırlık null döndü (FIX2 tolerans başarısız)');
  else if (!v.room_id.startsWith(homePref)) fail('eşik-demo: koni-ağırlık ' + v.room_id + ' verdi, ' + homePref + '* (kameranın dairesi) bekleniyordu');
})();
console.log(fails ? ('\nSONUÇ: ✗ ' + fails + ' BAŞARISIZ') : '\nSONUÇ: ✓ tüm kabul testleri GEÇTİ');
console.log('yazıldı    : floorplan-map.json, floorplan-overlay.svg, camera-export.json →', path.relative(ROOT, outDir) || '.');
process.exit(fails ? 1 : 0);
