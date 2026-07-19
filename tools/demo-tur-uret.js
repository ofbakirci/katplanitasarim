#!/usr/bin/env node
/*
 * demo-tur-uret.js — Demo tur + demo-assets varlik jeneratoru (M4)
 * ------------------------------------------------------------------
 * Bir .mskpkg paketini okur ve onboarding turunun ihtiyac duydugu TUM
 * hedefleri paketten TURETIR. Amac: "yarin demo paket degisirse" tek komut
 * kosup metin rotuslariyla akmasi — hicbir hedef kod icine elle gomulmez.
 *
 * Uretilenler:
 *   (a) Onboarding hedef blobu (JSON): parsel geo + kirpik imar, blok A/B ayak
 *       izleri (pts), daire karmasi (specs), balkonlar (blok basina + toplevel),
 *       imkan poligonlari (amenity {type,x,y,w,h,ang,pts}), slim kameralar.
 *   (b) --assets modu: demo-assets gorsellerini (cam7 + ext1..3 + plan-a/-b),
 *       demo-plan.json'u (render'siz TAM kpState + slim kameralar) ve
 *       amenity pts eklenmis REGEN paketi uretir.
 *
 * Kullanim:
 *   node tools/demo-tur-uret.js [paket.mskpkg]                # blob JSON -> stdout
 *   node tools/demo-tur-uret.js [paket.mskpkg] --out F.json   # blob JSON -> dosya
 *   node tools/demo-tur-uret.js [paket.mskpkg] --assets       # gorsel + demo-plan.json + paket REGEN
 *        [--assets-dir DIR]                                    # varsayilan: paketin klasoru
 *
 * Varsayilan paket: mesken/demo-assets/demo-proje.mskpkg
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_PKG = 'mesken/demo-assets/demo-proje.mskpkg';

// ---- argv ----
function parseArgs(argv) {
  const a = { pkg: null, out: null, assets: false, assetsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--assets') a.assets = true;
    else if (t === '--assets-dir') a.assetsDir = argv[++i];
    else if (!t.startsWith('--') && !a.pkg) a.pkg = t;
  }
  if (!a.pkg) a.pkg = DEFAULT_PKG;
  return a;
}

// ---- amenity {x,y,w,h,ang} -> 4-kose pts (yapi siniri deseni gibi) ----
// ang=0: ekran-saat-yonu TL,TR,BR,BL. ang!=0: SVG rotate(ang cx cy) y-flip'e SADIK.
function amenityPts(a) {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const base = [[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]];
  const ang = a.ang || 0;
  if (!ang) return base.map(([x, y]) => ({ x: +x.toFixed(3), y: +y.toFixed(3) }));
  const rad = ang * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  return base.map(([px, py]) => {
    const dx = px - cx, dy = py - cy;
    return { x: +(cx + dx * cs + dy * sn).toFixed(3), y: +(cy - dx * sn + dy * cs).toFixed(3) };
  });
}
// Her cagride TAZE pts dizisi (M1 tuzagi: pts referansi paylasilmamali).
function withPts(a) { return Object.assign({}, a, { pts: amenityPts(a) }); }

// kpState icindeki TUM amenity dizilerini poligon semasina cevir (yerinde).
// Konumlar: kpState.amenities, kpState.floors[].amenities, kpState.blocks[].amenities,
//           kpState.blocks[].floors[].amenities  (io normalizeFloorParcels damgalari).
function convertAmenitiesEverywhere(ks) {
  let n = 0;
  const conv = (host) => {
    if (host && Array.isArray(host.amenities)) { host.amenities = host.amenities.map(withPts); n += host.amenities.length; }
  };
  conv(ks);
  (ks.floors || []).forEach(conv);
  (ks.blocks || []).forEach((b) => { conv(b); (b.floors || []).forEach(conv); });
  return n;
}

// ---- kameralar: snapshot base64 blobunu AT, slim meta birak ----
function slimInterior(c) {
  const o = { id: c.id, room_id: c.room_id, kind: 'interior', pos: c.pos, target: c.target, lens: c.lens };
  if (c.fov != null) o.fov = c.fov;
  o.height = c.height; o.time_of_day = c.time_of_day; o.render_method = c.render_method;
  o.__floor = c.__floor; o.__block = c.__block; o.__blockIdx = c.__blockIdx; o.__blockName = c.__blockName;
  return o;
}
function slimExterior(c) {
  const o = { id: c.id, kind: 'exterior', pos: c.pos, target: c.target, lens: c.lens };
  if (c.fov != null) o.fov = c.fov;
  o.time_of_day = c.time_of_day; o.render_method = c.render_method; o.render_style = c.render_style;
  o.profile = c.profile; o.aimed = c.aimed; o.facade_signal = c.facade_signal;
  o.__block = c.__block; o.__blockIdx = c.__blockIdx; o.__blockName = c.__blockName; o.__cx = c.__cx; o.__cz = c.__cz;
  if (c.prompt) o.prompt = c.prompt.slice(0, 180) + (c.prompt.length > 180 ? '…' : '');
  return o;
}
function slimCameras(pkg) {
  const cams = pkg.cameras || {};
  return {
    interior: (cams.interior || []).map(slimInterior),
    exterior: (cams.exterior || []).map(slimExterior),
  };
}

// ---- imar: onboarding karti icin kirpik ozet (buyuk scan/lejand bloklari atilir) ----
function cropImar(im) {
  if (!im) return null;
  const keys = ['ada', 'parsel', 'mahalle', 'ilce', 'alan', 'fonksiyon', 'yogunluk',
    'minTaks', 'maksTaks', 'emsal', 'hmax', 'katAdedi', 'planAdi', 'provider'];
  const o = {};
  keys.forEach((k) => { if (im[k] !== undefined) o[k] = im[k]; });
  return o;
}

// ---- (a) onboarding hedef blobu ----
function buildBlob(pkg) {
  const ks = pkg.kpState;
  return {
    meta: { title: (pkg.meta && pkg.meta.title) || null, source: 'demo-tur-uret.js' },
    parsel: {
      parcelPts: (ks.parcelPts || []).map((p) => ({ x: p.x, y: p.y })),
      parcelRot: ks.parcelRot,
      parcelClosed: ks.parcelClosed,
      geo: ks.geo || null,
      imar: cropImar(ks.parcelImar),
    },
    blocks: {
      A: { pts: (ks.blocks && ks.blocks[0] ? ks.blocks[0].pts : ks.pts || []).map((p) => ({ x: p.x, y: p.y })) },
      B: { pts: (ks.blocks && ks.blocks[1] ? ks.blocks[1].pts : []).map((p) => ({ x: p.x, y: p.y })) },
    },
    specs: (ks.specs || []).map((s) => Object.assign({}, s)),
    ui: Object.assign({}, ks.ui),
    site: !!ks.site,
    katAyri: !!ks.katAyri,
    balconies: {
      topLevel: (ks.balconies || []).map((b) => Object.assign({}, b)),
      block0: (ks.blocks && ks.blocks[0] ? ks.blocks[0].balconies || [] : []).map((b) => Object.assign({}, b)),
      block1: (ks.blocks && ks.blocks[1] ? ks.blocks[1].balconies || [] : []).map((b) => Object.assign({}, b)),
    },
    amenities: (ks.amenities || []).map(withPts),
    cameras: slimCameras(pkg),
  };
}

// ---- (b) demo-plan.json: render'siz TAM kpState (amenities pts'li) + slim kameralar ----
function buildPlan(pkg) {
  const ks = JSON.parse(JSON.stringify(pkg.kpState)); // derin kopya (kaynak paketi kirletme)
  convertAmenitiesEverywhere(ks);
  return { kpState: ks, cameras: slimCameras(pkg) };
}

// ---- base64 data-uri -> Buffer ----
function dataUriToBuffer(uri) {
  const i = uri.indexOf(',');
  const b64 = i >= 0 ? uri.slice(i + 1) : uri;
  return Buffer.from(b64, 'base64');
}

// ---- --assets: gorseller + demo-plan.json + REGEN paket ----
function emitAssets(pkg, pkgPath, outDir) {
  const r = pkg.renders || {};
  const written = [];
  // IS 7 — TUM "Uret" gorselleri paketten 1600px q80 UNIFORM. Idempotent: her cagride kaynak
  //   paketin FULL-RES buffer'indan sips -Z 1600 (en uzun kenar 1600'e sigdir; UPSCALE ETMEZ) +
  //   formatOptions 80 -> deterministik cikti (onceki diski dikkate almaz). sips yoksa (darwin disi)
  //   ham buffer + uyari (idempotentlik yalniz macOS'ta garanti; jeneratorun tasarim ortami macOS).
  const IMG_MAX = 1600, IMG_Q = 80;
  const cp = require('child_process');
  const resizeJpeg = (fp) => {
    try {
      cp.execFileSync('sips', ['-Z', String(IMG_MAX), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(IMG_Q), fp], { stdio: 'ignore' });
      return true;
    } catch (e) {
      console.error('UYARI: sips calistirilamadi (ham buffer birakildi) ->', path.basename(fp), (e && e.message) || e);
      return false;
    }
  };
  const writeImg = (render, name) => {
    if (!render || !render.image) { console.error('UYARI: render bulunamadi ->', name); return; }
    const buf = dataUriToBuffer(render.image);
    const fp = path.join(outDir, name);
    fs.writeFileSync(fp, buf);
    resizeJpeg(fp);                                   // 1600px q80 UNIFORM (sips)
    written.push({ name, bytes: fs.statSync(fp).size });
  };
  // IC kameralar: cam1..camN (id'ye gore; id yoksa index+1). Onceden yalniz cam7 yaziliyordu -> artik HEPSI.
  (r.interior || []).forEach((c, i) => {
    const name = (c.id && /^cam\d+$/.test(c.id)) ? c.id + '.jpg' : ('cam' + (i + 1) + '.jpg');
    writeImg(c, name);
  });
  // DIS (drone) renderlari ext1..extN -> ext{N}.jpg (id'ye gore)
  (r.exterior || []).forEach((e, i) => {
    const name = (e.id && /^ext\d+$/.test(e.id)) ? e.id + '.jpg' : ('ext' + (i + 1) + '.jpg');
    writeImg(e, name);
  });
  // PLAN renderlari: block 0 -> plan-a.jpg, block 1 -> plan-b.jpg (block/name'e gore)
  (r.plans || []).forEach((p, i) => {
    let suffix = null;
    if (p.name) suffix = String(p.name).toLowerCase();
    else if (typeof p.block === 'number') suffix = String.fromCharCode(97 + p.block); // 0->a
    else suffix = String.fromCharCode(97 + i);
    writeImg(p, 'plan-' + suffix + '.jpg');
  });
  // TEKIL plan fallback -> plan.jpg (kabuk demoPlanAsset fallback'i: DEMO_ASSETS+'plan.jpg').
  //   renders.plan (tekil) = son bloğun plani; yoksa son plans[] kaydina dus.
  const singlePlan = r.plan || (r.plans || [])[(r.plans || []).length - 1];
  writeImg(singlePlan, 'plan.jpg');

  // demo-plan.json (minified)
  const plan = buildPlan(pkg);
  const planStr = JSON.stringify(plan);
  const planPath = path.join(outDir, 'demo-plan.json');
  fs.writeFileSync(planPath, planStr);
  written.push({ name: 'demo-plan.json', bytes: Buffer.byteLength(planStr) });

  // REGEN paket: amenities pts'li halle (gorsel tabani aynen). Kaynagi bellekte
  // tutup ustune yaziyoruz; pts hesabi idempotent (tekrar kosmak guvenli).
  const regenN = convertAmenitiesEverywhere(pkg.kpState);
  const regenStr = JSON.stringify(pkg);
  const regenPath = path.join(outDir, path.basename(pkgPath));
  fs.writeFileSync(regenPath, regenStr);
  written.push({ name: path.basename(pkgPath) + ' (REGEN, ' + regenN + ' amenity pts)', bytes: Buffer.byteLength(regenStr) });

  return written;
}

// ---- main ----
function main() {
  const a = parseArgs(process.argv.slice(2));
  const pkgPath = path.resolve(a.pkg);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (a.assets) {
    const outDir = a.assetsDir ? path.resolve(a.assetsDir) : path.dirname(pkgPath);
    const written = emitAssets(pkg, pkgPath, outDir);
    written.forEach((w) => console.error('  yazildi: ' + w.name + '  (' + w.bytes + ' bayt)'));
    console.error('TOPLAM ' + written.length + ' dosya -> ' + outDir);
    return;
  }

  const blob = buildBlob(pkg);
  const blobStr = JSON.stringify(blob, null, 2);
  if (a.out) { fs.writeFileSync(path.resolve(a.out), blobStr); console.error('blob yazildi -> ' + a.out + ' (' + Buffer.byteLength(blobStr) + ' bayt)'); }
  else process.stdout.write(blobStr + '\n');
}

if (require.main === module) main();
module.exports = { amenityPts, withPts, convertAmenitiesEverywhere, slimCameras, buildBlob, buildPlan, cropImar };
