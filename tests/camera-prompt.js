/* Kamera render prompt üretici (Opsiyon 1, text-guided) — cameraRenderPrompt() KABUL TESTİ.
   master1 planını headless yükler, oda tipine göre kamera yerleştirir (cameraViewInfo ile
   gerçek room_id/koni), sonra cameraRenderPrompt(map, cam) çıktısını (brief + prompt) doğrular:
   oda adı/tipi, birim etiketi, lens/yükseklik ifadeleri, mobilya listesi, komşu-oda "looking
   toward", çekirdek "no furniture" dalı. MOTOR KODUNU DEĞİŞTİRMEZ; yalnız fonksiyonları çağırır.

   Kullanım: node tests/camera-prompt.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources, ROOT } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const input = path.join(ROOT, 'mesken', 'inputs', 'master1.svg');
if (!fs.existsSync(input)) { // gitignored fixture — CI'da yok; test master1'e özgü → zarif atla
  console.log('  (mesken/inputs/master1.svg yok — camera-prompt atlandı)');
  process.exit(0);
}
const txt = fs.readFileSync(input, 'utf8');

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
if (!map) { console.error('HATA: buildFloorplanMap() null (plan yok?)'); process.exit(1); }
if (typeof ctx.cameraRenderPrompt !== 'function') { console.error('HATA: cameraRenderPrompt tanımlı değil'); process.exit(1); }

let fails = 0; const fail = m => { console.log('  ✗ ' + m); fails++; };
const ok = m => console.log('  ✓ ' + m);

/* ---- geometri yardımcıları (haritadan; gen-floorplan-map.js ile aynı) ---- */
function pip(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function insidePoint(o) {
  const poly = o.polygon_px, bb = o.bbox_px, ce = o.centroid_px;
  if (poly && poly.length >= 3 && pip(ce[0], ce[1], poly)) return ce.slice();
  if (poly && poly.length >= 3) for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 12; gx++) {
    const x = bb[0] + (bb[2] - bb[0]) * gx / 12, y = bb[1] + (bb[3] - bb[1]) * gy / 12;
    if (pip(x, y, poly)) return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }
  return ce.slice();
}
function headingTo(from, to) { const dx = to[0] - from[0], dy = to[1] - from[1]; let a = Math.atan2(dx, -dy) * 180 / Math.PI; if (a < 0) a += 360; return Math.round(a); }
function aimInto(pos, r) { let far = r.centroid_px, fd = -1; (r.polygon_px || []).forEach(p => { const d = Math.hypot(p[0] - pos[0], p[1] - pos[1]); if (d > fd) { fd = d; far = p; } }); return headingTo(pos, far); }
// bir odaya kamera koy (kendi içine bakar) → tam cam objesi (cameraViewInfo ile gerçek room_id/koni)
function camInRoom(r, lens, height) {
  const pos = insidePoint(r), heading = aimInto(pos, r), l = lens || 24;
  const v = ctx.cameraViewInfo(map, { x_px: pos[0], y_px: pos[1], heading_deg: heading, lens_mm: l }) || {};
  return { id: 'camX', x_px: pos[0], y_px: pos[1], heading_deg: heading, lens_mm: l, height: height || 'eye',
    room_id: v.room_id, room_weights: v.room_weights || [], cone_spills: !!v.cone_spills,
    cone_polygon_px: v.cone_polygon_px || null, furniture_seen: v.furniture_seen || [] };
}

/* ---- master1'de tip başına ilk odayı bul ---- */
const allRooms = map.units.flatMap(u => u.rooms);
const cores = (map.common_areas || []);
function firstOfType(pool, types) { for (const r of pool) if (types.indexOf(r.type) >= 0) return r; return null; }
const bedroom = firstOfType(allRooms, ['bedroom']);
const bathroom = firstOfType(allRooms, ['bathroom', 'wc']);
const living = firstOfType(allRooms, ['living', 'living_kitchen', 'studio']);
const kitchen = firstOfType(allRooms, ['kitchen', 'living_kitchen']);
const core = firstOfType(cores, ['stairs', 'fire_stairs', 'elevator', 'shaft']);
console.log('oda tipleri:', 'yatak=' + !!bedroom, 'banyo=' + !!bathroom, 'salon=' + !!living, 'mutfak=' + !!kitchen, 'çekirdek=' + (core ? core.type : 'yok'));

// TÜM prompt'larda olması gereken sabitler
function assertCommon(tag, prompt) {
  if (!/No people, no text\./.test(prompt)) fail(tag + ': "No people, no text." yok');
  if (!/not top-down/.test(prompt)) fail(tag + ': "not top-down" (göz-hizası zorlaması) yok');
  if (!/Photoreal/i.test(prompt)) fail(tag + ': "Photoreal" yok');
}

/* ---- 1) YATAK ODASI ---- */
if (bedroom) {
  const cam = camInRoom(bedroom, 35, 'eye');
  const out = ctx.cameraRenderPrompt(map, cam, { style: 'warm' });
  const p = out.prompt;
  assertCommon('yatak', p);
  if (out.brief.room_type !== 'bedroom') fail('yatak: brief.room_type=' + out.brief.room_type + ' (bedroom bekleniyordu)');
  if (!/inside the (master )?bedroom/i.test(p)) fail('yatak: "inside the bedroom" yok → ' + p.slice(0, 90));
  if (/apartment/.test(p)) fail('yatak: daire tipi/büyüklüğü ("... apartment") prompt\'a SIZMAMALI (kafa karıştırıyor) → ' + p.slice(0, 90));
  if (!/35 mm/.test(p)) fail('yatak: "35 mm" lens ifadesi yok');
  if (!/a bed and a wardrobe/.test(p)) fail('yatak: mobilyasız varsayılan ("a bed and a wardrobe") yok');
  if (fails === 0) ok('yatak odası prompt: ' + p);
} else fail('master1: yatak odası bulunamadı');

/* ---- 2) BANYO ---- */
if (bathroom) {
  const cam = camInRoom(bathroom, 24, 'eye');
  const out = ctx.cameraRenderPrompt(map, cam, {});
  const p = out.prompt;
  assertCommon('banyo', p);
  if (!/inside the (bathroom|wc)/i.test(p)) fail('banyo: oda adı yok → ' + p.slice(0, 90));
  if (bathroom.type === 'bathroom' && !/bathtub/.test(p)) fail('banyo: varsayılan armatür ("bathtub") yok');
  ok('banyo prompt üretildi (' + bathroom.type + ')');
} else fail('master1: banyo/wc bulunamadı');

/* ---- 3) SALON + lens/height varyasyonu ---- */
if (living) {
  const cam = camInRoom(living, 16, 'low');
  const out = ctx.cameraRenderPrompt(map, cam, {});
  const p = out.prompt;
  assertCommon('salon', p);
  if (!/living/i.test(p)) fail('salon: "living" yok → ' + p.slice(0, 90));
  if (!/ultra-wide 16 mm/.test(p)) fail('salon: "ultra-wide 16 mm" yok');
  if (!/low camera height/.test(p)) fail('salon: "low camera height" (alçak) yok');
  ok('salon prompt (16mm/alçak) üretildi');
}

/* ---- 4) MOBİLYA DALI: furniture_seen enjekte → "In view: ..." ---- */
if (bedroom) {
  const cam = camInRoom(bedroom, 24, 'eye');
  cam.furniture_seen = [{ type: 'bed_double' }, { type: 'wardrobe_2' }, { type: 'nightstand' }, { type: 'bed_double' }];
  const p = ctx.cameraRenderPrompt(map, cam, {}).prompt;
  if (!/In view:/.test(p)) fail('mobilya: "In view:" dalı tetiklenmedi');
  if (!/double bed/.test(p)) fail('mobilya: "double bed" yok');
  if (!/wardrobe/.test(p)) fail('mobilya: "wardrobe" yok');
  if (/nightstands.*nightstands/.test(p)) fail('mobilya: tekrar eden tip elenmemiş');
  const br = ctx.cameraRenderPrompt(map, cam, {}).brief;
  if (!(br.furniture_en.length >= 2)) fail('mobilya: brief.furniture_en kısa');
  ok('mobilya dalı (In view) doğru');
}

/* ---- 5) KOMŞU ODA: cone_spills + room_weights → "looking toward the X" ---- */
if (living && kitchen && living.id !== kitchen.id) {
  const cam = camInRoom(living, 24, 'eye');
  cam.cone_spills = true;
  cam.room_weights = [{ room_id: living.id, coverage_ratio: 0.7 }, { room_id: kitchen.id, coverage_ratio: 0.3 }];
  const p = ctx.cameraRenderPrompt(map, cam, {}).prompt;
  if (!/looking toward the /.test(p)) fail('komşu: "looking toward the" yok → ' + p.slice(0, 120));
  ok('komşu-oda dalı (looking toward) doğru');
}

/* ---- 6) ÇEKİRDEK: mobilyasız beton ---- */
if (core) {
  const cam = camInRoom(core, 24, 'eye');
  const out = ctx.cameraRenderPrompt(map, cam, {});
  const p = out.prompt;
  assertCommon('çekirdek', p);
  if (!out.brief.is_core) fail('çekirdek: brief.is_core false (tip=' + out.brief.room_type + ')');
  if (!/no furniture/.test(p)) fail('çekirdek: "no furniture" yok → ' + p.slice(0, 110));
  if ((core.type === 'stairs' || core.type === 'fire_stairs') && !/concrete/.test(p)) fail('çekirdek: "concrete" yok');
  ok('çekirdek prompt (' + core.type + ') mobilyasız/beton doğru');
} else console.log('  (çekirdek odası bulunamadı — atlandı)');

console.log(fails ? ('\nSONUÇ: ✗ ' + fails + ' BAŞARISIZ') : '\nSONUÇ: ✓ tüm kamera-prompt testleri GEÇTİ');
process.exit(fails ? 1 : 0);
